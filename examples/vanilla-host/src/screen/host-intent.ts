import type {
  ScreenCanvasBackground,
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenJsonValue,
} from 'base-screen/contracts';
import {
  isScreenCanvasBackground,
  isScreenCanvasPaletteColor,
  parseScreenDocument,
} from 'base-screen/contracts';
import type { BaseScreenDesignerElement } from 'base-screen/designer';
import type { DesignerChangeProposalInput, DesignerIntentHandler } from 'base-screen/engine';
import type { BaseScreenMaterialCatalog } from 'base-screen/plugin-core';
import {
  type AgentCanvasPatchShape,
  type AgentCatalogShape,
  type AgentComponentPatchShape,
  type AgentEditableComponentShape,
  type AgentScreenDigestShape,
  type AgentWarningShape,
  api,
} from '../lib/api';
import { createLogger } from '../lib/logger';
import { buildAgentCatalog } from './agent-catalog';

const logger = createLogger('host-intent');

/** 引擎公开的提案命令联合：从提案入参上取，避免示例再依赖一份 core 类型副本。 */
type ProposalCommand = DesignerChangeProposalInput['commands'][number];
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type ComponentUpdatePatch = Mutable<
  Extract<ProposalCommand, { readonly type: 'update-components' }>['patch']
>;

export interface HostIntentOptions {
  readonly designer: BaseScreenDesignerElement;
  /** 当前大屏 id：只用于日志与素材范围，提案本身不落库。 */
  readonly screenId: string;
  /**
   * 设计器当前目录的读取函数。
   *
   * 用函数而不是快照：在线物料包发布、下架都会整体替换 `runtime.catalog`，
   * 传值会一直用旧的那份。取不到时返回 `undefined`，此时退回后端的兜底目录。
   */
  readonly catalog?: () => BaseScreenMaterialCatalog | undefined;
}

/**
 * 示例接线：把设计器右栏的「意图书写面」接到示例智能体 `POST /agent/candidate`。
 *
 * 引擎侧只做三件事——把「一句话 + 作用域」结构化后交出来、如实回显结果、把宿主产出的
 * 提案挂成幽灵草案。模型调用、凭证、传输全在这里；`setIntentHandler` 之前输入区是
 * 停用态并写明「当前环境未接入智能体」，本模块就是让它可用起来的那一段。
 *
 * 结果落点走引擎既有通道 `submitChangeProposal`：不直接改文档、不进历史，用户在
 * 草案条/智能体页签的提案区里逐条采纳后才作为一次普通事务写入。候选接口不创建或更新后端大屏，
 * 这里只把候选 document 编译成命令，并拒绝取消、文档已变化或已有待决草案的提交。
 */
export function createHostIntentHandler(options: HostIntentOptions): DesignerIntentHandler {
  return async (request, signal) => {
    if (signal?.aborted) {
      return { ok: false, diagnostics: [], reason: '请求已取消，未生成变更。' };
    }
    const current = options.designer.getDocument();
    if (current === undefined) {
      return { ok: false, diagnostics: [], reason: '设计器尚未加载文档，稍后重试。' };
    }
    if (options.designer.readPendingChange() !== undefined) {
      return { ok: false, diagnostics: [], reason: '请先处理已有待决草案，再生成新的变更。' };
    }

    // 只记长度与实例，不记输入正文：日志不该成为指令内容的第二份存储。
    logger.debug('intent dispatch', options.screenId, request.text.length);
    // 引用检查之外记录 change，覆盖编辑后又撤销回原文档的情况。
    let documentChanged = false;
    const onChange = () => {
      documentChanged = true;
    };
    options.designer.addEventListener('base-screen-change', onChange);
    try {
      const staleReason = (): string | undefined => {
        // 即便传输层忽略取消并成功返回，也不能提交过期结果。
        if (signal?.aborted) return '请求已取消，未生成变更。';
        if (documentChanged || options.designer.getDocument() !== current) {
          return '当前文档已变化，请基于最新文档重新生成。';
        }
        if (options.designer.readPendingChange() !== undefined) {
          return '请先处理已有待决草案，再生成新的变更。';
        }
        return undefined;
      };

      if (request.scope.kind === 'components') {
        const selected = resolveSelectedComponents(current, request.scope.componentIds);
        if (selected === undefined) {
          return { ok: false, diagnostics: [], reason: '选中的组件已不存在，请重新选择。' };
        }
        if (selected.length > 12) {
          return { ok: false, diagnostics: [], reason: '一次最多修改 12 个选中组件。' };
        }
        const generated = await api.generateComponentCandidate(
          request.text,
          selected.map(toAgentEditableComponent),
          signal,
        );
        const reason = staleReason();
        if (reason !== undefined) return { ok: false, diagnostics: [], reason };
        if (!generated.ok) {
          logger.warn('agent component edit failed', generated.error);
          return { ok: false, diagnostics: [], reason: describeFailure(generated.error.message) };
        }
        if (generated.data.patches.length === 0) {
          return {
            ok: false,
            diagnostics: [],
            reason: describeComponentFailure(generated.data.failure),
          };
        }
        const commands = compileComponentCommands(
          current,
          request.scope.componentIds,
          generated.data.patches,
        );
        if (commands === undefined) {
          logger.warn('agent component patches rejected', generated.data.patches);
          return {
            ok: false,
            diagnostics: [],
            reason: '智能体返回的组件修改不安全或不完整，未生成变更。',
          };
        }
        const submitted = options.designer.submitChangeProposal({
          title: `智能体 · ${truncate(request.text, 18)}`,
          rationale: `${generated.data.summary}。${describeMode(generated.data.mode, generated.data.failure)}。仅修改已选中的 ${selected.length} 个组件，候选未写入文档。`,
          scope: selected
            .map((component) => component.name)
            .join('、')
            .slice(0, 40),
          commands,
          origin: { author: '智能体' },
        });
        if (!submitted.ok) {
          logger.warn('change proposal rejected', submitted.diagnostics);
          return {
            ok: false,
            diagnostics: submitted.diagnostics,
            reason: '提案被引擎拒绝（命令或渲染校验未通过），未生成变更。',
          };
        }
        return { ok: true, value: null, diagnostics: [] };
      }

      // 画布级调整：作用域是整屏，但意图不是重做内容。
      // 「把背景颜色改为天蓝色」如果落进下面的整屏生成分支，模型会把组件一起重出一屏——
      // 用户只是想换个底色。画布背景是 canonical 配置（`canvas.backgroundColor`），
      // 直接提交一条 update-canvas 提案：不调模型、不碰任何组件、不进整屏替换。
      const canvasBackground = parseCanvasBackgroundInstruction(request.text);
      if (canvasBackground !== null) {
        // 走同一条编译器：纯色要同步 `background`（否则渐变会盖住新底色），
        // 与后端 set_canvas 落地后的结果保持一致。
        const canvasCommands = compileCanvasCommands(current, {
          backgroundColor: canvasBackground,
        });
        if (!canvasCommands.ok) {
          return {
            ok: false,
            diagnostics: [],
            reason:
              canvasCommands.problem === 'invalid'
                ? '这个底色不是合法的颜色值，未生成变更。'
                : '画布已经是这个底色了，没有需要应用的改动。',
          };
        }
        const submitted = options.designer.submitChangeProposal({
          title: `智能体 · ${truncate(request.text, 18)}`,
          rationale: `只改画布背景色，组件保持不动；候选未写入文档。背景色 ${canvasBackground}。若与现有文字对比不足，可再单独调整文字色。`,
          scope: '画布背景',
          commands: canvasCommands.commands,
          origin: { author: '智能体' },
        });
        if (!submitted.ok) {
          logger.warn('change proposal rejected', submitted.diagnostics);
          return {
            ok: false,
            diagnostics: submitted.diagnostics,
            reason: '提案被引擎拒绝（命令或渲染校验未通过），未生成变更。',
          };
        }
        return { ok: true, value: null, diagnostics: [] };
      }

      // 整屏作用域交给后端统一路由：生成 / 改画布 / 明确不支持，都从这里分派。
      // 以前这里只有 generateScreenCandidate，所以"改个背景色"也会被当成新主题重做一屏。
      // 每次请求都从当前 catalog 同步构造物料摘要；图片由后端按 screenId 查询并校验。
      const catalog = options.catalog === undefined ? undefined : readAgentCatalog(options);
      const acted = await api.actAgent(
        {
          text: request.text,
          scope: 'screen',
          screenId: options.screenId,
          ...(catalog === undefined ? {} : { catalog }),
          ...(request.references === undefined || request.references.length === 0
            ? {}
            : { references: request.references }),
          canvas: {
            backgroundColor: current.canvas.backgroundColor,
            // 带上当前填充：后端据此判断"改成渐变"到底是变更还是空操作。
            ...(current.canvas.background === undefined
              ? {}
              : { background: current.canvas.background }),
            hasBackgroundImage: current.canvas.backgroundImage != null,
          },
          context: buildScreenDigest(current),
        },
        signal,
      );
      const reason = staleReason();
      if (reason !== undefined) return { ok: false, diagnostics: [], reason };
      if (!acted.ok) {
        logger.warn('agent act failed', acted.error);
        return { ok: false, diagnostics: [], reason: describeFailure(acted.error.message) };
      }

      if (acted.data.kind === 'unsupported') {
        logger.debug('agent action unsupported', acted.data.reason);
        return {
          ok: false,
          diagnostics: [],
          reason: acted.data.suggestion ?? describeUnsupported(acted.data.reason),
        };
      }

      if (acted.data.kind === 'set_canvas') {
        const canvasCommands = compileCanvasCommands(current, acted.data.patch);
        if (!canvasCommands.ok) {
          return {
            ok: false,
            diagnostics: [],
            reason:
              canvasCommands.problem === 'invalid'
                ? '智能体返回的画布取值不合法，未生成变更。'
                : '画布已经是你说的样子，没有需要应用的改动。',
          };
        }
        const canvasSubmitted = options.designer.submitChangeProposal({
          title: `智能体 · ${truncate(request.text, 18)}`,
          rationale: '只改画布，组件保持不动；候选未写入文档。',
          scope: '画布',
          commands: canvasCommands.commands,
          origin: { author: '智能体' },
        });
        if (!canvasSubmitted.ok) {
          logger.warn('change proposal rejected', canvasSubmitted.diagnostics);
          return {
            ok: false,
            diagnostics: canvasSubmitted.diagnostics,
            reason: '提案被引擎拒绝（命令或渲染校验未通过），未生成变更。',
          };
        }
        return { ok: true, value: null, diagnostics: [] };
      }

      if (acted.data.kind === 'edit_components') {
        // 整屏作用域不该出现组件编辑：路由与作用域不一致时拒绝，而不是猜"改哪个"。
        return {
          ok: false,
          diagnostics: [],
          reason: '这条指令像是要改组件，请先选中组件再发送。',
        };
      }

      // generate_screen：候选仍须通过 canonical 文档校验，结构不合法的内容永不进草案。
      const parsed = parseScreenDocument(acted.data.document);
      if (!parsed.ok) {
        logger.warn('agent document rejected', parsed.diagnostics);
        return {
          ok: false,
          diagnostics: parsed.diagnostics,
          reason: '智能体返回的大屏文档结构不合法，未生成变更。',
        };
      }
      if (parsed.value.components.length === 0) {
        // 空文档会成为「删光未锁定组件」的整屏提案，比失败更糟：宁可什么都不提交。
        logger.warn('agent document has no usable components');
        return {
          ok: false,
          diagnostics: [],
          reason: '模型这次没有产出可用组件，未生成变更。',
        };
      }

      const commands = compileWholeScreenCommands(current, parsed.value);
      const submitted = options.designer.submitChangeProposal({
        title: `智能体 · ${truncate(request.text, 18)}`,
        rationale: `${describeMode(acted.data.mode, acted.data.failure, acted.data.warnings ?? [])}。布局由后端确定性编译，本轮以整屏替换的形式作为候选，未写入文档。${describeLocked(current)}`,
        scope: '整屏',
        commands,
        origin: { author: '智能体' },
      });
      if (!submitted.ok) {
        logger.warn('change proposal rejected', submitted.diagnostics);
        return {
          ok: false,
          diagnostics: submitted.diagnostics,
          reason: '提案被引擎拒绝（命令或渲染校验未通过），未生成变更。',
        };
      }
      return { ok: true, value: null, diagnostics: [] };
    } finally {
      options.designer.removeEventListener('base-screen-change', onChange);
    }
  };
}

function resolveSelectedComponents(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] | undefined {
  const unique = new Set(componentIds);
  if (unique.size === 0 || unique.size !== componentIds.length) return undefined;
  const selected = document.components.filter((component) => unique.has(component.id));
  return selected.length === unique.size ? selected : undefined;
}

function toAgentEditableComponent(component: ScreenComponentNode): AgentEditableComponentShape {
  const text = componentText(component);
  return {
    id: component.id,
    type: component.type,
    name: component.name,
    props: component.props,
    style: component.style,
    position: component.position,
    size: component.size,
    ...(text === undefined ? {} : { text }),
  };
}

/** 宿主侧再次收窄模型输出：只允许选中 ID，并合并完整 props/style 后再交引擎。 */
function compileComponentCommands(
  document: ScreenDocument,
  componentIds: readonly string[],
  patches: readonly AgentComponentPatchShape[],
): readonly ProposalCommand[] | undefined {
  const selected = new Set(componentIds);
  const components = new Map(document.components.map((component) => [component.id, component]));
  const seen = new Set<string>();
  const commands: ProposalCommand[] = [];
  for (const patch of patches) {
    if (
      !selected.has(patch.componentId) ||
      seen.has(patch.componentId) ||
      components.get(patch.componentId) === undefined
    ) {
      return undefined;
    }
    const component = components.get(patch.componentId)!;
    const next: ComponentUpdatePatch = {};
    if (patch.name !== undefined) {
      if (typeof patch.name !== 'string' || patch.name.trim() === '') return undefined;
      next.name = patch.name.trim();
    }
    if (patch.text !== undefined) {
      if (typeof patch.text !== 'string' || patch.text.trim() === '') return undefined;
      const text = patch.text.trim();
      if (component.dataValue?.kind === 'inline') {
        next.dataValue = { kind: 'inline', value: text };
      } else if (typeof component.props.text === 'string') {
        next.props = { ...component.props, text };
      } else if (component.dataSource?.type === 'static') {
        next.dataSource = { ...component.dataSource, value: text };
      } else {
        return undefined;
      }
    }
    if (patch.props !== undefined) {
      if (!isJsonObject(patch.props)) return undefined;
      next.props = { ...(next.props ?? component.props), ...patch.props };
    }
    if (patch.style !== undefined) {
      if (!isJsonObject(patch.style)) return undefined;
      next.style = { ...component.style, ...patch.style };
    }
    if (patch.position !== undefined) {
      if (!isPoint(patch.position)) return undefined;
      next.position = patch.position;
    }
    if (patch.size !== undefined) {
      if (!isSize(patch.size)) return undefined;
      next.size = patch.size;
    }
    if (Object.keys(next).length === 0) return undefined;
    seen.add(patch.componentId);
    commands.push({ type: 'update-components', componentIds: [patch.componentId], patch: next });
  }
  return commands.length === 0 ? undefined : commands;
}

function componentText(component: ScreenComponentNode): string | undefined {
  if (typeof component.props.text === 'string') return component.props.text;
  const value = component.dataValue;
  if (
    value?.kind === 'inline' &&
    (typeof value.value === 'string' || typeof value.value === 'number')
  ) {
    return String(value.value);
  }
  if (
    component.dataSource?.type === 'static' &&
    (typeof component.dataSource.value === 'string' ||
      typeof component.dataSource.value === 'number')
  ) {
    return String(component.dataSource.value);
  }
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is Readonly<Record<string, ScreenJsonValue>> {
  return isRecord(value);
}

function isPoint(value: unknown): value is { readonly x: number; readonly y: number } {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isSize(value: unknown): value is { readonly width: number; readonly height: number } {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
}

/**
 * 把「整屏候选文档」编译成一次可试算的提案命令。
 *
 * 引擎没有「整份替换文档」的命令：替换必须拆成画布、组件、数据源、变量、蓝图五类。
 * - 锁定组件**不删**：引擎会以 `CORE_COMMAND_TARGET_LOCKED` 拒绝整批删除，而锁定本来就是
 *   宿主给「这段不许动」的表达，智能体不该绕过它——保留原位，候选只覆盖未锁定的部分；
 * - 新组件 zIndex 接在当前最大值之后，生成内容整体落在保留内容之上；
 * - 候选带来的数据源实例要一起换（素材身份、数据集都靠它），否则组件里的
 *   `dataValue.data-source-field` 会指向一个不存在的 id，被引擎以
 *   `VALUE_REF_TARGET_MISSING` 整批拒绝。id 与现有实例冲突时重新编号并回写引用；
 * - 变量与蓝图只在真的不同时才整体替换：这两处被保留的锁定组件可能仍在引用，
 *   无脑写入 `[]` 只会得到一份校验不通过的候选。
 */
function compileWholeScreenCommands(
  current: ScreenDocument,
  next: ScreenDocument,
): readonly ProposalCommand[] {
  const commands: ProposalCommand[] = [
    {
      type: 'update-canvas',
      patch: {
        width: next.canvas.width,
        height: next.canvas.height,
        backgroundColor: next.canvas.backgroundColor,
      },
    },
  ];

  const removable = current.components
    .filter((component) => !component.status.locked)
    .map((component) => component.id);
  if (removable.length > 0) commands.push({ type: 'remove-components', componentIds: removable });

  const { sources, remapped } = adoptDataSources(current, next);
  if (sources !== undefined) {
    commands.push({ type: 'replace-data-sources', dataSources: sources });
  }

  const zIndexBase = current.components.reduce(
    (max, component) => Math.max(max, component.zIndex),
    0,
  );
  for (const component of next.components) {
    commands.push({
      type: 'add-component',
      component: { ...remapValueRef(component, remapped), zIndex: component.zIndex + zIndexBase },
    });
  }

  if (JSON.stringify(current.variables) !== JSON.stringify(next.variables)) {
    commands.push({ type: 'replace-variables', variables: next.variables });
  }
  if (JSON.stringify(current.blueprint) !== JSON.stringify(next.blueprint)) {
    commands.push({ type: 'replace-blueprint', blueprint: next.blueprint });
  }
  return commands;
}

/**
 * 保留现有数据源实例（锁定组件可能还在引用），再把候选带来的实例接上；
 * id 冲突时重新编号，并返回「旧 id → 新 id」的映射供组件引用改写。
 */
function adoptDataSources(
  current: ScreenDocument,
  next: ScreenDocument,
): {
  readonly sources?: readonly ScreenDataSource[];
  readonly remapped: ReadonlyMap<string, string>;
} {
  const incoming = next.dataSources ?? [];
  // 只保留「保留下来的组件（锁定的那些）仍引用」的实例：被删组件的数据源留在文档里
  // 就是一份没人读的孤儿，还会在数据源面板里占位。
  const retained = current.components.filter((component) => component.status.locked);
  const stillReferenced = new Set<string>();
  for (const component of retained) {
    const value = component.dataValue;
    if (value?.kind === 'data-source-field') stillReferenced.add(value.dataSourceId);
  }
  const kept = (current.dataSources ?? []).filter((source) => stillReferenced.has(source.id));
  if (incoming.length === 0) {
    return kept.length === (current.dataSources ?? []).length
      ? { remapped: new Map() }
      : { sources: kept, remapped: new Map() };
  }

  const taken = new Set(kept.map((source) => source.id));
  const remapped = new Map<string, string>();
  const appended: ScreenDataSource[] = [];
  for (const source of incoming) {
    let id = source.id;
    let suffix = 1;
    while (taken.has(id)) {
      id = `${source.id}-${suffix}`;
      suffix += 1;
    }
    taken.add(id);
    if (id !== source.id) remapped.set(source.id, id);
    appended.push(id === source.id ? source : { ...source, id });
  }
  return { sources: [...kept, ...appended], remapped };
}

/** 组件里的取值引用跟着实例 id 走。 */
function remapValueRef(
  component: ScreenComponentNode,
  remapped: ReadonlyMap<string, string>,
): ScreenComponentNode {
  if (remapped.size === 0) return component;
  const value = component.dataValue;
  if (value?.kind !== 'data-source-field') return component;
  const nextId = remapped.get(value.dataSourceId);
  if (nextId === undefined) return component;
  return { ...component, dataValue: { ...value, dataSourceId: nextId } };
}

/** 锁定组件被跳过时如实写进理由：用户在变更卡上要能看见「为什么还留着几个旧组件」。 */
function describeLocked(current: ScreenDocument): string {
  const locked = current.components.filter((component) => component.status.locked);
  if (locked.length === 0) return '';
  const names = locked.map((component) => component.name).join('、');
  return `锁定组件（${names}）按原样保留，未被替换。`;
}

/**
 * 通道说明只陈述事实：模型产出，或兜底且写明没用模型的原因。
 * 原因码来自示例后端（`AGENT_*`），这里翻成用户能看懂、知道下一步怎么办的话。
 */
/**
 * 通道说明只陈述事实：模型产出、模型产出但有降级、或兜底且写明没用模型的原因。
 *
 * `mode === 'llm'` 时不再无视 `failure`：模型出来了但某几块被裁掉，也要让用户看见，
 * 否则"由模型生成"就是一句不完整的话。
 */
function describeMode(
  mode: 'llm' | 'deterministic',
  failure: string | undefined,
  warnings: readonly AgentWarningShape[] = [],
): string {
  if (mode === 'llm') {
    const details = [
      ...(failure === undefined ? [] : [describeAgentFailure(failure)]),
      ...(warnings.length === 0 ? [] : [describeWarnings(warnings)]),
    ];
    return details.length === 0 ? '由模型生成' : `由模型生成（${details.join('；')}）`;
  }
  return `已用确定性结构生成（${describeAgentFailure(failure)}）`;
}

function describeWarnings(warnings: readonly AgentWarningShape[]): string {
  const [first] = warnings;
  if (first === undefined) return '';
  return warnings.length === 1
    ? `有 1 处降级：${first.message}`
    : `有 ${warnings.length} 处降级，例如${first.message}`;
}

function describeAgentFailure(failure: string | undefined): string {
  if (failure === undefined) return '未调用模型';
  if (failure === 'AGENT_NOT_CONFIGURED') return '未配置模型';
  if (failure === 'AGENT_SPEC_INVALID') return '模型输出未通过校验';
  if (failure === 'AGENT_BLOCKS_ALL_INVALID') return '模型给的分块都不可用，已改用确定性布局';
  if (failure === 'AGENT_COMPOSE_FAILED') return '布局编译失败';
  if (failure === 'AGENT_CATALOG_UNUSABLE') return '目录里没有可用的基础物料';
  if (failure === 'AGENT_COMPONENT_INSTRUCTION_UNSUPPORTED') return '没有识别到可安全应用的修改';
  if (failure.startsWith('AGENT_BLOCK_') || failure.startsWith('AGENT_DATASET_')) {
    return '部分模块已降级';
  }
  if (failure === 'AGENT_TIMEOUT') return '模型响应超时';
  if (failure === 'AGENT_UNREACHABLE') return '模型服务不可达';
  if (failure === 'AGENT_EMPTY_RESPONSE') return '模型返回为空';
  if (failure.startsWith('AGENT_HTTP_')) return '模型服务返回错误';
  return '模型调用失败';
}

function describeFailure(message: string): string {
  return message === '' ? '智能体生成失败，未产生变更。' : message;
}

function describeComponentFailure(failure: string | undefined): string {
  if (failure === 'AGENT_COMPONENT_CONTEXT_INVALID') {
    return '选中组件的信息不完整，未生成修改。';
  }
  if (failure === 'AGENT_COMPONENT_INSTRUCTION_EMPTY') {
    return '修改指令为空，未生成修改。';
  }
  return '没有识别到可安全应用到选中组件的修改。可试试“标题改成……”“字号改为 48”“颜色改成蓝色”。';
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/** 构造当前设计器的智能体物料摘要；图片素材由候选接口按 screenId 从后端授权目录读取。 */
function readAgentCatalog(options: HostIntentOptions): AgentCatalogShape | undefined {
  const catalog = options.catalog?.();
  return catalog === undefined ? undefined : buildAgentCatalog(catalog);
}

/**
 * 当前屏摘要：只算结构骨架，供后端判断"在改已有屏还是新建"。
 *
 * 刻意不带几何与正文——那是用户内容，也是 token 大头；路由只需要知道"有几块、什么类型、
 * 画布多大、有没有锁定"。
 */
export function buildScreenDigest(document: ScreenDocument): AgentScreenDigestShape {
  const counts = new Map<string, number>();
  for (const component of document.components) {
    counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
  }
  const types = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
    .slice(0, 8);
  return {
    canvas: {
      width: document.canvas.width,
      height: document.canvas.height,
      backgroundColor: document.canvas.backgroundColor,
      // 填充形态（纯色/渐变）是"改成渐变"这类指令的判断依据，摘要里只说形态不说色标。
      ...(document.canvas.background === undefined
        ? {}
        : { backgroundType: document.canvas.background.type }),
      hasBackgroundImage: document.canvas.backgroundImage != null,
    },
    componentCount: document.components.length,
    types,
    // 整屏作用域本来就没有选中项；留空字段让后端提示词如实写"当前未选中"。
    selection: [],
    lockedCount: document.components.filter((component) => component.status.locked).length,
  };
}

/**
 * 把后端给的画布 patch 编成一条 `update-canvas`。
 *
 * 三件事必须在这里做：只接受契约承认的字段、不合法值直接拒（而不是塞进文档）、
 * 与当前值相同则不提交（否则引擎会以空提案拒绝，用户看到的是莫名其妙的失败）。
 *
 * 字段与取值一律由契约判定（`isScreenCanvasBackground` / `isScreenCanvasPaletteColor`），
 * 这里不再手写"背景只有纯色"的子集——那份子集正是"智能体说渐变不支持"的第二个来源。
 */
/**
 * 编译结果刻意区分"不合法"与"没变化"：两者都不可提交，但用户看到的说法完全不同——
 * 把非法取值说成"已经是这样了"是最容易让人以为功能坏掉的那种提示。
 */
export type CanvasPatchCompileResult =
  | { readonly ok: true; readonly commands: readonly ProposalCommand[] }
  | { readonly ok: false; readonly problem: 'invalid' | 'unchanged' };

export function compileCanvasCommands(
  current: ScreenDocument,
  patch: AgentCanvasPatchShape,
): CanvasPatchCompileResult {
  const next: {
    backgroundColor?: string;
    background?: ScreenCanvasBackground | null;
    backgroundImage?: string | null;
    backgroundImageFit?: 'cover' | 'contain' | null;
  } = {};
  let invalid = false;

  if (patch.background !== undefined) {
    if (patch.background === null) {
      if (current.canvas.background !== undefined) next.background = null;
    } else if (isScreenCanvasBackground(patch.background)) {
      if (!jsonEquals(patch.background, current.canvas.background)) {
        next.background = patch.background;
      }
    } else {
      invalid = true;
    }
  }

  if (patch.backgroundColor !== undefined) {
    if (isScreenCanvasPaletteColor(patch.backgroundColor)) {
      const color = patch.backgroundColor;
      const currentFill = current.canvas.background;
      // 渲染层是渐变优先于 `backgroundColor` 的：只写底色而不同步 `background`，
      // 用户看到的就是"改成纯色没反应"。所以纯色一律连同 `background` 一起落成 solid——
      // 除非这次 patch 自己带了 `background`（那是明确的渐变意图，不能被底色覆盖）。
      if (
        patch.background === undefined &&
        (currentFill?.type !== 'solid' || currentFill.color !== color)
      ) {
        next.background = { type: 'solid', color };
      }
      if (color !== current.canvas.backgroundColor) next.backgroundColor = color;
    } else {
      invalid = true;
    }
  }

  if (patch.backgroundImage === null) {
    if (current.canvas.backgroundImage != null) {
      next.backgroundImage = null;
      next.backgroundImageFit = null;
    }
  } else if (patch.backgroundImage !== undefined) {
    if (!/^https?:\/\//i.test(patch.backgroundImage) || patch.backgroundImage.length > 2048) {
      invalid = true;
    } else {
      next.backgroundImage = patch.backgroundImage;
      if (patch.backgroundImageFit === 'cover' || patch.backgroundImageFit === 'contain') {
        next.backgroundImageFit = patch.backgroundImageFit;
      }
    }
  }

  if (invalid) return { ok: false, problem: 'invalid' };
  return Object.keys(next).length === 0
    ? { ok: false, problem: 'unchanged' }
    : { ok: true, commands: [{ type: 'update-canvas', patch: next }] };
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 路由给出"不支持"时的兜底说明：后端带了 suggestion 就用它，没带按原因给一句。 */
function describeUnsupported(reason: string): string {
  if (reason === 'missing_reference') return '这句话指向的对象不明确，请先选中组件或说清要改哪块。';
  if (reason === 'out_of_domain') {
    return '这个需求超出了当前能改的范围（支持布局、样式、文案与画布）。';
  }
  if (reason === 'unsafe_scope') return '这个改动会影响整屏结构，需要更明确的指令。';
  if (reason === 'model_unavailable') return '暂时无法判断这条指令要做什么，试试更直接的说法。';
  return '还没支持这类修改，未生成变更。';
}

/**
 * 画布背景色指令 → 目标纯色；不是「只换底色」就返回 null，交回整屏生成。
 *
 * 判定刻意收得很窄：整句必须是「(把/将)? [画布/页面/大屏/屏幕] 背景[色] 改/换/设为 + 纯颜色」。
 * 这样「生成一张天蓝色背景的销售大屏」「把背景改蓝一点再加个图表」都不会被拦成画布编辑——
 * 它们确实要动内容。
 *
 * 只处理纯色是刻意的：渐变要派生色标与角度，那套语义在后端 `matchCanvasInstruction` 里，
 * 本地再抄一遍就会出现两份"看起来差不多"的渐变（同一句话两种结果）。渐变句子在这里返回
 * null，落到后端路由——它同样是零模型执行的规则。
 */
export function parseCanvasBackgroundInstruction(instruction: string): string | null {
  const match = instruction
    .trim()
    .match(
      /^(?:把|将)?\s*(?:画布|页面|大屏|屏幕|整屏)?\s*的?\s*(?:背景|底色)(?:颜色|色)?\s*(?:改|换|设|调|变)(?:为|成|到|一下)?\s*(.+)$/,
    );
  if (match === null) return null;
  const value = (match[1] ?? '').trim().replace(/[。.!！?？]+$/g, '');
  if (value === '') return null;
  // 合法 CSS 十六进制长度起步：`#12345` 写进文档不会报错、只会渲染成透明。
  const hex = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex !== null) return hex[0].toLowerCase();
  const normalized = value.replace(/\s+/g, '').replace(/色$/, '');
  return CANVAS_COLOR_VALUES.find(([name]) => name === normalized)?.[1] ?? null;
}

/**
 * 画布背景常用色。只收「名字就是颜色」的说法，避免把「天蓝色条纹」这类描述误判成纯色。
 * 深色系沿用示例画布的深底，浅色系按大屏常见的衬底取值。
 */
const CANVAS_COLOR_VALUES: readonly (readonly [string, string])[] = [
  ['天蓝', '#87ceeb'],
  ['天空蓝', '#87ceeb'],
  ['浅蓝', '#a9c8f5'],
  ['淡蓝', '#a9c8f5'],
  ['深蓝', '#16305c'],
  ['藏青', '#1e293b'],
  ['米', '#f2ead8'],
  ['粉', '#f5c2d1'],
  ['红', '#d64545'],
  ['蓝', '#3b82f6'],
  ['绿', '#3fae6a'],
  ['白', '#ffffff'],
  ['黑', '#0b1020'],
  ['黄', '#f4c542'],
  ['橙', '#ef8a3c'],
  ['紫', '#8b7cf6'],
  ['灰', '#8b97a8'],
];

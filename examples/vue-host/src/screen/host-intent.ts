import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenJsonValue,
} from '@base-screen/contracts';
import { parseScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenDesignerElement } from '@base-screen/sdk/designer';
import type { DesignerChangeProposalInput, DesignerIntentHandler } from '@base-screen/sdk/engine';
import {
  type AgentCatalogShape,
  type AgentComponentPatchShape,
  type AgentEditableComponentShape,
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

      // 目录与素材在每次提交时现取：在线物料包刚发布、素材刚上传，这一句就能用上。
      // 没有目录来源时保持同步进到请求，不额外制造一个 await 点。
      const catalog = options.catalog === undefined ? undefined : await readAgentCatalog(options);
      const generated = await api.generateScreenCandidate(
        request.text,
        catalog,
        request.references,
        signal,
      );
      const reason = staleReason();
      if (reason !== undefined) return { ok: false, diagnostics: [], reason };
      if (!generated.ok) {
        logger.warn('agent generate failed', generated.error);
        return { ok: false, diagnostics: [], reason: describeFailure(generated.error.message) };
      }

      // 候选仍须通过 canonical 文档校验，结构不合法的内容永不进草案。
      const parsed = parseScreenDocument(generated.data.document);
      if (!parsed.ok) {
        logger.warn('agent document rejected', parsed.diagnostics);
        return {
          ok: false,
          diagnostics: parsed.diagnostics,
          reason: '智能体返回的大屏文档结构不合法，未生成变更。',
        };
      }

      const commands = compileWholeScreenCommands(current, parsed.value);
      const submitted = options.designer.submitChangeProposal({
        title: `智能体 · ${truncate(request.text, 18)}`,
        rationale: `${describeMode(generated.data.mode, generated.data.failure)}。布局由后端确定性编译，本轮以整屏替换的形式作为候选，未写入文档。${describeLocked(current)}`,
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
function describeMode(mode: 'llm' | 'deterministic', failure: string | undefined): string {
  if (mode === 'llm') return '由模型生成';
  return `已用确定性结构生成（${describeAgentFailure(failure)}）`;
}

function describeAgentFailure(failure: string | undefined): string {
  if (failure === undefined) return '未调用模型';
  if (failure === 'AGENT_NOT_CONFIGURED') return '未配置模型';
  if (failure === 'AGENT_SPEC_INVALID') return '模型输出未通过校验';
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

/**
 * 现算一份「智能体目录」：设计器当前 catalog（含在线物料包）+ 本屏可见的素材。
 *
 * 取不到目录就返回 `undefined`，让后端退回内置最小目录——宁可少几个组件形态，
 * 也不要把一个空目录发过去（后端会按「目录里没有物料」直接 400）。
 */
async function readAgentCatalog(
  options: HostIntentOptions,
): Promise<AgentCatalogShape | undefined> {
  const catalog = options.catalog?.();
  if (catalog === undefined) return undefined;
  const assets = await api.listAssets({ screenId: options.screenId });
  if (!assets.ok) {
    // 素材接口失败不该让整句话失败：目录照发，图片类组件这次就没有候选素材。
    logger.warn('agent catalog assets unavailable', assets.error.message);
    return buildAgentCatalog(catalog, []);
  }
  return buildAgentCatalog(catalog, assets.data.assets);
}

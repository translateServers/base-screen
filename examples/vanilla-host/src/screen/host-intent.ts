import type {
  ScreenCanvasBackground,
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostDatasetPort,
  ScreenIntentReference,
  ScreenJsonValue,
} from 'base-screen/contracts';
import {
  isScreenCanvasBackground,
  isScreenCanvasPaletteColor,
  parseScreenDocument,
  SCREEN_BLUEPRINT_CAPABILITY_IDS,
} from 'base-screen/contracts';
import { auditScreenLayout, parseCssColor, relativeLuminance } from 'base-screen/core';
import type { BaseScreenDesignerElement } from 'base-screen/designer';
import type {
  DesignerChangeProposalInput,
  DesignerIntentHandler,
  DesignerIntentOutcome,
} from 'base-screen/engine';
import {
  compileScreenIntent,
  createIntentSession,
  createIntentStreamAssembler,
  describeSession,
  editIntent,
  type IntentBehaviorSummary,
  type IntentCatalog,
  type IntentDataContext,
  type IntentDiagnostic,
  type IntentRepairIssue,
  type IntentSession,
  mapDocumentIssues,
  pickSession,
  prepareIntent,
  prepareIntentDataContext,
  repairKey,
  summarizeIntentDataContext,
  validateIntentData,
} from 'base-screen/host-kit';
import type { BaseScreenMaterialCatalog } from 'base-screen/plugin-core';
import {
  type AgentCanvasPatchShape,
  type AgentCatalogShape,
  type AgentComponentPatchShape,
  type AgentEditableComponentShape,
  type AgentIntentShape,
  type AgentScreenDigestShape,
  type AgentScreenEditShape,
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
  /**
   * 设计器用的同一个数据集端口（ADR-0114 S4）：引用了数据集时，先经它 describe 并按默认参数取一份样本，
   * 在前端画像、枚举候选，摘要随引用上送写进提示词。不传则沿用阶段 2 的行为（只有列名与类型）。
   */
  readonly datasetPort?: ScreenHostDatasetPort;
  /**
   * 宿主已授权的蓝图能力（ADR-0115 D7）：联动只编译授权了的，缺能力的不编译并在理由里说明。
   * 用函数读：运行时能力表随插件装配变化。不传则不检查。
   */
  readonly capabilities?: () => readonly string[] | undefined;
}

/**
 * 运行时已授权的蓝图能力（ADR-0115 D7）：联动编译据此跳过宿主没开放的能力。
 * 只要能力判定函数，不依赖运行时的完整类型。
 */
export function readGrantedCapabilities(runtime: {
  readonly runtimeContributions: { hasBlueprintCapability(capability: string): boolean };
}): readonly string[] {
  return SCREEN_BLUEPRINT_CAPABILITY_IDS.filter((id) =>
    runtime.runtimeContributions.hasBlueprintCapability(id),
  );
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
  // 会话（ADR-0113 §2.5）：最近几次整屏生成 / 局部修改留下的 IR。提案没被采纳之前，宿主不知道用户会
  // 采纳还是拒绝，所以每次提交都留一份，下一次请求时按活文档挑出对得上的那份；刷新页面即失效，
  // 不写进文档元数据（设计器重载后没有会话，「把第二块换成环形图」会走别的动作而不是瞎改）。
  const held: IntentSession[] = [];
  const remember = (session: IntentSession | undefined): void => {
    if (session === undefined) return;
    held.unshift(session);
    held.length = Math.min(held.length, MAX_HELD_SESSIONS);
  };
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
    // 整屏生成的流式草案（ADR-0112 §2.5）：它是本次请求自己挂的草案，不算「已有待决草案」。
    let draft: StreamDraft | undefined;
    options.designer.addEventListener('base-screen-change', onChange);
    try {
      const staleReason = (): string | undefined => {
        // 即便传输层忽略取消并成功返回，也不能提交过期结果。
        if (signal?.aborted) return '请求已取消，未生成变更。';
        if (documentChanged || options.designer.getDocument() !== current) {
          return '当前文档已变化，请基于最新文档重新生成。';
        }
        const pending = options.designer.readPendingChange();
        if (pending !== undefined && pending.id !== draft?.id) {
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
      // 有对得上的会话就把可操作的目标清单带上：非「重做」口吻的整屏指令由后端路由成局部修改。
      const session =
        catalog === undefined
          ? undefined
          : pickSession(held, {
              canvas: current.canvas,
              components: current.components,
            });
      // 流式落稿：骨架一到就挂「生成中」草案，内容逐帧填入。用户点「取消生成」时引擎撤掉草案，
      // 这里随即中止请求；引擎传来的 signal 照样转发。
      const streamAbort = new AbortController();
      const forwardAbort = () => streamAbort.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      let cancelled = false;
      const streamDraft = createStreamDraft(
        options.designer,
        current,
        `智能体 · ${truncate(request.text, 18)}`,
        () => {
          cancelled = true;
          streamAbort.abort();
        },
      );
      draft = streamDraft;
      // 流式帧在这里本地编译（ADR-0113 §2.8）：后端推骨架与逐项内容，host-kit 装配并编出每一帧。
      // 素材与数据集引用要等最终结果才知道，所以含它们的块在流里先留占位，最终结果到了再补。
      // 从数据出发（ADR-0114 S4）：引用了数据集就先取样画像、枚举候选；摘要挂在数据集引用上，
      // 首轮与修复轮都随引用上送。取样失败只少了画像，不挡生成。
      // 没有数据集引用时不进 await：请求照旧同步发出（取消 / 过期判断依赖这个顺序）。
      const dataContext =
        catalog === undefined || !wantsDataContext(options, request.references)
          ? undefined
          : await loadDataContext(options, catalog, request.references, streamAbort.signal);
      const agentReferences = enrichReferences(request.references, dataContext);
      const streamCatalog =
        catalog === undefined ? undefined : toIntentCatalog(catalog, [], dataContext);
      const assembler =
        streamCatalog === undefined ? undefined : createIntentStreamAssembler(streamCatalog);
      const frameDocument = (): unknown => {
        const frame = assembler?.frame();
        if (frame === undefined || streamCatalog === undefined) return undefined;
        const outcome = compileScreenIntent({
          intent: frame.intent,
          catalog: streamCatalog,
          mode: 'llm',
          stream: frame.stream,
        });
        return outcome.ok ? outcome.value.document : undefined;
      };
      const acted = await api.actAgentStream(
        {
          text: request.text,
          scope: 'screen',
          screenId: options.screenId,
          ...(catalog === undefined ? {} : { catalog }),
          ...(agentReferences === undefined || agentReferences.length === 0
            ? {}
            : { references: agentReferences }),
          canvas: {
            backgroundColor: current.canvas.backgroundColor,
            // 带上当前填充：后端据此判断"改成渐变"到底是变更还是空操作。
            ...(current.canvas.background === undefined
              ? {}
              : { background: current.canvas.background }),
            hasBackgroundImage: current.canvas.backgroundImage != null,
          },
          context: buildScreenDigest(current),
          ...(session === undefined ? {} : { session: describeSession(session) }),
        },
        {
          onSkeleton: (head) => {
            if (assembler?.skeleton(head) !== true) return;
            const document = frameDocument();
            if (document !== undefined) streamDraft.onSkeleton(document);
          },
          onItem: (path, value) => {
            if (assembler?.item(path, value) !== true) return;
            const document = frameDocument();
            if (document !== undefined) streamDraft.onProgress(document);
          },
        },
        streamAbort.signal,
      );
      signal?.removeEventListener('abort', forwardAbort);
      if (cancelled) {
        return { ok: false, diagnostics: [], reason: '已取消生成，未写入任何改动。' };
      }
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

      if (acted.data.kind === 'edit_screen') {
        draft?.discard();
        if (session === undefined || catalog === undefined) {
          return { ok: false, diagnostics: [], reason: '没有可以局部修改的内容，请先生成一屏。' };
        }
        const edited = submitScreenEdit(
          options,
          current,
          request.text,
          session,
          catalog,
          acted.data,
        );
        remember(edited.session);
        return edited.outcome;
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

      // generate_screen（ADR-0113 §2.7）：后端只给模型原文，解析、编译、审计与修复回环都在这里——
      // 原文 → host-kit 解析并编译 → canonical 文档校验 → 版面审计 → 提交提案；任何一步有值得请模型修的
      // 诊断（解析丢掉的项、版面放不下、审计不过、引擎拒绝），就带着「上一轮原文 + 按模型路径整理的诊断」
      // 回去要一次修复，最多 2 轮，同一组诊断连续两轮不变就提前停（ADR-0112 §2.1）。
      if (catalog === undefined) {
        draft?.discard();
        return { ok: false, diagnostics: [], reason: '读不到设计器的物料目录，未生成变更。' };
      }
      const shape = catalog;
      let data: AgentIntentShape = acted.data;
      let rounds = 0;
      let previousKey: string | undefined;
      // 修复过哪些问题：理由里要说清楚「为什么和你说的不一样」（例如为锁定背景换了风格）。
      const repairedFor = new Set<string>();
      for (;;) {
        const attempt = await attemptWholeScreen(
          options,
          current,
          request.text,
          shape,
          data,
          rounds,
          draft,
          repairedFor,
          dataContext,
          staleReason,
          streamAbort.signal,
        );
        if (attempt.ok) {
          remember(attempt.session);
          return { ok: true, value: null, diagnostics: [] };
        }

        const key = repairKey(attempt.issues);
        const exhausted =
          attempt.issues.length === 0 || rounds >= MAX_REPAIR_ROUNDS || key === previousKey;
        if (exhausted) {
          logger.warn('agent repair exhausted', rounds, key);
          // 问题只在个别指标 / 块上时，去掉那几项、其余照常交出，并如实说明。
          if (attempt.deliver !== undefined) {
            const delivered = attempt.deliver();
            if (delivered.ok) remember(delivered.session);
            return delivered.ok ? { ok: true, value: null, diagnostics: [] } : delivered.outcome;
          }
          return attempt.outcome;
        }
        previousKey = key;
        rounds += 1;
        for (const issue of attempt.issues) repairedFor.add(issue.code);
        logger.debug('agent candidate repair requested', rounds, attempt.issues.length);
        const repaired = await api.generateScreenCandidate(
          request.text,
          options.screenId,
          catalog,
          agentReferences,
          signal,
          { output: data.output, issues: attempt.issues },
        );
        const lateReason = staleReason();
        if (lateReason !== undefined) return { ok: false, diagnostics: [], reason: lateReason };
        if (!repaired.ok) {
          logger.warn('agent repair failed', repaired.error);
          return {
            ok: false,
            diagnostics: attempt.outcome.diagnostics,
            reason: describeFailure(repaired.error.message),
          };
        }
        data = repaired.data;
      }
    } finally {
      options.designer.removeEventListener('base-screen-change', onChange);
      // 没能收尾的流式草案（失败、取消、过期）不留在画布上。
      draft?.discard();
    }
  };
}

type IntentFailureOutcome = Extract<DesignerIntentOutcome, { readonly ok: false }>;

/** 宿主侧的流式落稿草案（ADR-0112 §2.5），见 `createStreamDraft`。 */
interface StreamDraft {
  /** 草案 id；骨架还没挂出时为 undefined。 */
  readonly id: string | undefined;
  readonly onSkeleton: (document: unknown) => void;
  readonly onProgress: (document: unknown) => void;
  /** 用最终候选收尾：接得上就追加最后一段差量、换上最终理由并结束生成，返回 true。 */
  finish(document: ScreenDocument, rationale: string): boolean;
  /** 撤掉仍在生成中的自己的草案，并停止监听；可重复调用。 */
  discard(): void;
}

const STREAMING_RATIONALE = '生成中：版面已按骨架排定，内容逐块填入；完成前不可采纳。';

/** 引擎的待决提案状态事件（`BASE_SCREEN_CHANGE_STATE_EVENT`）。 */
const CHANGE_STATE_EVENT = 'base-screen-change-state';

/**
 * 宿主侧的流式落稿：骨架到了先挂「生成中」草案，之后每一帧只追加差量命令。
 *
 * 任何一帧接不上（文档不合法、差量要改已出现的组件、引擎拒绝）就停止追加，草案停在上一帧，
 * 等最终结果到了由调用方撤掉、整屏提交——宁可最后换一次，也不让画面边生成边挪。
 * 用户点「取消生成」时草案由引擎撤掉，这里收到状态事件后回调 `onCancel`，由调用方中止请求。
 */
function createStreamDraft(
  designer: BaseScreenDesignerElement,
  current: ScreenDocument,
  title: string,
  onCancel: () => void,
): StreamDraft {
  let id: string | undefined;
  let last: ScreenDocument | undefined;
  let broken = false;
  let listening = true;
  const ownStreaming = () => {
    const pending = designer.readPendingChange();
    return id !== undefined && pending?.id === id && pending.streaming === true;
  };
  const stop = () => {
    if (!listening) return;
    listening = false;
    designer.removeEventListener(CHANGE_STATE_EVENT, onState);
  };
  function onState() {
    if (id === undefined || designer.readPendingChange()?.id === id) return;
    stop();
    onCancel();
  }
  designer.addEventListener(CHANGE_STATE_EVENT, onState);
  const read = (raw: unknown): ScreenDocument | undefined => {
    const parsed = parseScreenDocument(raw);
    return parsed.ok && parsed.value.components.length > 0 ? parsed.value : undefined;
  };
  return {
    get id() {
      return id;
    },
    onSkeleton(raw) {
      if (id !== undefined || broken) return;
      const document = read(raw);
      if (document === undefined) {
        broken = true;
        return;
      }
      const begun = designer.beginChangeProposal({
        title,
        rationale: STREAMING_RATIONALE,
        scope: '整屏',
        commands: compileWholeScreenCommands(current, document),
        origin: { author: '智能体' },
      });
      if (!begun.ok) {
        broken = true;
        logger.warn('stream skeleton rejected', begun.diagnostics);
        return;
      }
      id = begun.value.id;
      last = document;
    },
    onProgress(raw) {
      if (id === undefined || last === undefined || broken) return;
      const document = read(raw);
      const delta =
        document === undefined ? undefined : compileStreamDelta(current, last, document);
      if (document === undefined || delta === undefined) {
        broken = true;
        return;
      }
      if (delta.length > 0) {
        const extended = designer.extendChangeProposal(id, delta);
        if (!extended.ok) {
          broken = true;
          logger.warn('stream frame rejected', extended.diagnostics);
          return;
        }
      }
      last = document;
    },
    finish(document, rationale) {
      if (id === undefined || last === undefined || broken || !ownStreaming()) return false;
      const delta = compileStreamDelta(current, last, document, { final: true });
      if (delta === undefined) return false;
      if (delta.length > 0 && !designer.extendChangeProposal(id, delta).ok) return false;
      if (!designer.finishChangeProposal(id, { rationale }).ok) return false;
      stop();
      return true;
    },
    discard() {
      stop();
      if (ownStreaming()) designer.discardPendingChange();
    },
  };
}

/**
 * 流式两帧之间的差量命令（ADR-0112 §2.5）。
 *
 * 上一帧有、这一帧没有的组件（占位框）移除；新出现的组件新增；数据源按新一帧整份替换。
 * 两帧都有的组件必须一字不差，画布、变量、蓝图也不能变——否则就不是「只往格子里填内容」，
 * 返回 undefined，调用方停止追加。
 *
 * 收尾那一次（`final`，最终候选接最后一帧）放宽一处：共有组件的几何（位置、尺寸、旋转、层级、
 * 父级、类型）仍须一字不差，但取值、绑定、状态、显隐、props / style 可以变——流式帧编译时还没有
 * 本轮的数据集画像与行为，绑了数据的指标卡先画成「—」、联动与阈值状态最终稿才有（ADR-0115 评测 G1）。
 * 这些差别编成 `update-components`，变量与蓝图整体换上；几何不动，草案不闪。
 */
export function compileStreamDelta(
  current: ScreenDocument,
  previous: ScreenDocument,
  next: ScreenDocument,
  options: { readonly final?: boolean } = {},
): readonly ProposalCommand[] | undefined {
  const final = options.final === true;
  if (
    JSON.stringify(previous.canvas) !== JSON.stringify(next.canvas) ||
    (!final &&
      (JSON.stringify(previous.variables) !== JSON.stringify(next.variables) ||
        JSON.stringify(previous.blueprint) !== JSON.stringify(next.blueprint)))
  ) {
    return undefined;
  }
  const before = new Map(previous.components.map((component) => [component.id, component]));
  const kept = new Set<string>();
  const updated: ScreenComponentNode[] = [];
  for (const component of next.components) {
    const old = before.get(component.id);
    if (old === undefined) continue;
    if (JSON.stringify(old) !== JSON.stringify(component)) {
      if (!final || !sameGeometry(old, component)) return undefined;
      updated.push(component);
    }
    kept.add(component.id);
  }
  const previousSources = adoptDataSources(current, previous);
  const nextSources = adoptDataSources(current, next);
  for (const [from, to] of previousSources.remapped) {
    if (nextSources.remapped.get(from) !== to) return undefined;
  }
  const commands: ProposalCommand[] = [];
  const removed = previous.components
    .filter((component) => !kept.has(component.id))
    .map((component) => component.id);
  if (removed.length > 0) commands.push({ type: 'remove-components', componentIds: removed });
  // 变量先于数据源（数据源参数引用变量）。
  if (final && JSON.stringify(previous.variables) !== JSON.stringify(next.variables)) {
    commands.push({ type: 'replace-variables', variables: next.variables });
  }
  if (JSON.stringify(previousSources.sources) !== JSON.stringify(nextSources.sources)) {
    // 数据源只会随新块增加；一帧里数据源反而没了，说明这不是同一份输出的续写。
    if (nextSources.sources === undefined) return undefined;
    commands.push({ type: 'replace-data-sources', dataSources: nextSources.sources });
  }
  for (const component of updated) {
    const old = before.get(component.id) as ScreenComponentNode;
    const patch = contentPatch(old, remapValueRef(component, nextSources.remapped));
    if (patch === undefined) return undefined;
    if (Object.keys(patch).length > 0) {
      commands.push({ type: 'update-components', componentIds: [component.id], patch });
    }
  }
  const zIndexBase = layerBase(current);
  for (const component of next.components) {
    if (kept.has(component.id)) continue;
    commands.push({
      type: 'add-component',
      component: {
        ...remapValueRef(component, nextSources.remapped),
        zIndex: component.zIndex + zIndexBase,
      },
    });
  }
  if (final && JSON.stringify(previous.blueprint) !== JSON.stringify(next.blueprint)) {
    commands.push({ type: 'replace-blueprint', blueprint: next.blueprint });
  }
  return commands;
}

/** 收尾时共有组件不许动的部分：几何、层级、父级、类型与所属画布。 */
const GEOMETRY_KEYS = [
  'type',
  'parentId',
  'position',
  'size',
  'rotation',
  'zIndex',
  'canvasId',
] as const;

function sameGeometry(old: ScreenComponentNode, next: ScreenComponentNode): boolean {
  const a = old as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  return GEOMETRY_KEYS.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/** 收尾时共有组件可以换的字段；缺省可省的字段变没了写 `null`（命令里的「去掉」）。 */
const CONTENT_KEYS = ['name', 'status', 'props', 'style'] as const;
const OPTIONAL_CONTENT_KEYS = ['states', 'dataValue', 'dataBinding', 'belowSubCanvas'] as const;
const KNOWN_KEYS = new Set<string>([
  'id',
  ...GEOMETRY_KEYS,
  ...CONTENT_KEYS,
  ...OPTIONAL_CONTENT_KEYS,
]);

function contentPatch(
  old: ScreenComponentNode,
  next: ScreenComponentNode,
): Record<string, unknown> | undefined {
  const a = old as unknown as Record<string, unknown>;
  const b = next as unknown as Record<string, unknown>;
  // 认不得的字段变了（例如 dataSource 旧写法）就不冒险，交给整屏提交。
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!KNOWN_KEYS.has(key) && JSON.stringify(a[key]) !== JSON.stringify(b[key])) return undefined;
  }
  const patch: Record<string, unknown> = {};
  for (const key of CONTENT_KEYS) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key];
  }
  for (const key of OPTIONAL_CONTENT_KEYS) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key] ?? null;
  }
  return patch;
}

/** 候选组件叠在当前文档最上层：层级整体抬到现有最大值之上。 */
function layerBase(current: ScreenDocument): number {
  return current.components.reduce((max, component) => Math.max(max, component.zIndex), 0);
}

/** 修复轮数上限（ADR-0112 §2.1）：总共最多 3 次模型调用。 */
const MAX_REPAIR_ROUNDS = 2;

/** 同时留着的会话份数：当前提案被采纳 / 被拒绝 / 上一份被采纳后再改，三种情形都够用。 */
const MAX_HELD_SESSIONS = 3;

/**
 * 一次整屏尝试的结果。失败时 `issues` 是值得请模型修的诊断（按模型原文路径，可能为空：结构性错误
 * 修不了）；`deliver` 在「只有个别指标 / 块有问题、其余内容可用」时给出，修不好就用它去掉那几项交出。
 */
type WholeScreenAttempt =
  | { readonly ok: true; readonly session?: IntentSession }
  | {
      readonly ok: false;
      readonly issues: readonly IntentRepairIssue[];
      readonly outcome: IntentFailureOutcome;
      readonly deliver?: () => WholeScreenAttempt;
    };

function failedAttempt(
  issues: readonly IntentRepairIssue[],
  diagnostics: readonly ScreenDiagnostic[],
  reason: string,
  deliver?: () => WholeScreenAttempt,
): WholeScreenAttempt {
  return {
    ok: false,
    issues,
    outcome: { ok: false, diagnostics, reason },
    ...(deliver === undefined ? {} : { deliver }),
  };
}

function toIntentCatalog(
  shape: AgentCatalogShape,
  assets: AgentIntentShape['assets'],
  dataContext?: IntentDataContext,
): IntentCatalog {
  return {
    materials: shape.materials,
    assets,
    ...(dataContext === undefined || dataContext.candidates.length === 0
      ? {}
      : { candidates: dataContext.candidates }),
  };
}

/** 编译用的数据集引用：宿主画像过的（带行数、字段名称与单位）优先，其余沿用后端解析出的。 */
function intentDatasets(
  data: AgentIntentShape,
  dataContext: IntentDataContext | undefined,
): NonNullable<Parameters<typeof prepareIntent>[0]['references']>['datasets'] {
  if (dataContext === undefined) return data.datasets;
  const profiled = new Map(dataContext.references.map((item) => [item.datasetId, item]));
  const merged = data.datasets.map((item) => profiled.get(item.datasetId) ?? item);
  for (const item of dataContext.references) {
    if (!data.datasets.some((entry) => entry.datasetId === item.datasetId)) merged.push(item);
  }
  return merged;
}

function wantsDataContext(
  options: HostIntentOptions,
  references: readonly ScreenIntentReference[] | undefined,
): boolean {
  return (
    options.datasetPort !== undefined && (references ?? []).some((item) => item.kind === 'dataset')
  );
}

async function loadDataContext(
  options: HostIntentOptions,
  shape: AgentCatalogShape,
  references: readonly ScreenIntentReference[] | undefined,
  signal: AbortSignal,
): Promise<IntentDataContext | undefined> {
  const datasetIds = (references ?? []).flatMap((item) =>
    item.kind === 'dataset' ? [item.datasetId] : [],
  );
  if (options.datasetPort === undefined || datasetIds.length === 0) return undefined;
  try {
    const context = await prepareIntentDataContext({
      datasetIds,
      port: options.datasetPort,
      catalog: toIntentCatalog(shape, []),
      signal,
    });
    if (context.warnings.length > 0) logger.warn('intent data context degraded', context.warnings);
    return context;
  } catch (error) {
    logger.warn('intent data context unavailable', error);
    return undefined;
  }
}

/** 把画像与候选挂到对应的数据集引用上（只有统计，没有原始行）。 */
function enrichReferences(
  references: readonly ScreenIntentReference[] | undefined,
  dataContext: IntentDataContext | undefined,
): readonly ScreenIntentReference[] | undefined {
  if (references === undefined || dataContext === undefined) return references;
  const summaries = new Map(
    summarizeIntentDataContext(dataContext).map((item) => [item.datasetId, item]),
  );
  return references.map((item) => {
    if (item.kind !== 'dataset') return item;
    const summary = summaries.get(item.datasetId);
    return summary === undefined
      ? item
      : Object.assign({}, item, { profile: summary.profile, candidates: summary.candidates });
  });
}

/**
 * 一轮：模型原文 → 解析 + 编译 → 文档校验 → 版面审计 → 样例验证（引用了数据集时）→ 提交提案。
 *
 * 首轮且无任何问题时，流式草案接得上就原地收尾；修复过的轮次一律撤掉草案、整屏提交——
 * 修复后的输出是整份重来的，不是骨架的续写。
 */
async function attemptWholeScreen(
  options: HostIntentOptions,
  current: ScreenDocument,
  instruction: string,
  shape: AgentCatalogShape,
  data: AgentIntentShape,
  rounds: number,
  draft: StreamDraft | undefined,
  repairedFor: ReadonlySet<string> = new Set(),
  dataContext?: IntentDataContext,
  stale: () => string | undefined = () => undefined,
  signal?: AbortSignal,
): Promise<WholeScreenAttempt> {
  const capabilities = options.capabilities?.();
  const prepared = prepareIntent({
    output: data.output,
    catalog: toIntentCatalog(shape, data.assets, dataContext),
    references: { assets: data.assets, datasets: intentDatasets(data, dataContext) },
    mode: data.mode,
    ...(capabilities === undefined ? {} : { capabilities }),
  });
  if (prepared.compiled === undefined || prepared.intent === undefined) {
    logger.warn('agent intent not compilable', prepared.issues);
    draft?.discard();
    const capacity = prepared.issues.some((issue) => issue.code === 'LAYOUT_CAPACITY_EXCEEDED');
    return failedAttempt(
      prepared.issues,
      [],
      capacity
        ? '智能体给的版面在这块画布上放不下，未生成变更。'
        : '智能体返回的内容无法整理成大屏，未生成变更。',
    );
  }
  const { document, sources } = prepared.compiled;
  const parsed = parseScreenDocument(document);
  if (!parsed.ok) {
    logger.warn('agent document rejected', parsed.diagnostics);
    draft?.discard();
    return failedAttempt([], parsed.diagnostics, '智能体返回的大屏文档结构不合法，未生成变更。');
  }
  if (parsed.value.components.length === 0) {
    // 空文档会成为「删光未锁定组件」的整屏提案，比失败更糟：宁可什么都不提交。
    logger.warn('agent document has no usable components');
    draft?.discard();
    return failedAttempt([], [], '模型这次没有产出可用组件，未生成变更。');
  }
  const audit = auditScreenLayout(parsed.value).filter((item) => item.severity === 'error');
  const auditIssues = mapDocumentIssues(
    audit,
    parsed.value.components.map((component) => component.id),
    sources,
  );
  if (audit.length > 0) {
    logger.warn('agent document failed the layout audit', audit);
    draft?.discard();
    return failedAttempt(
      [...prepared.issues, ...auditIssues],
      audit,
      '智能体产物没有通过版面校验（字号、越界、重叠或对比度），未生成变更。',
    );
  }

  // 锁定组件会原样保留在新内容下面（整屏替换不删它们）：把它们和候选叠在一起再审一次对比度。
  // 只审候选自己的组件；锁定背景与新风格深浅相反时，候选单独审是过的，落到画布上却看不清。
  const backdrop = lockedBackdropConflict(current, parsed.value);
  if (backdrop !== undefined) {
    logger.warn('agent document conflicts with the locked backdrop', backdrop.diagnostics);
    draft?.discard();
    return failedAttempt(
      [{ code: backdrop.code, path: '' }],
      backdrop.diagnostics,
      backdrop.code === 'LAYOUT_LOCKED_BACKDROP_DARK'
        ? '画布上锁定保留的深色背景会让新内容看不清：换深色风格，或先解锁、删除这个背景再生成。未生成变更。'
        : '画布上锁定保留的浅色背景会让新内容看不清：换浅色风格，或先解锁、删除这个背景再生成。未生成变更。',
    );
  }

  // 采纳前的样例验证（ADR-0114 D6）：候选里有数据集实例、宿主接了数据集端口时，提案挂出之前取一次数。
  // 空结果 / 字段不在结果里 / 字段全空进修复回环；查询本身失败不怪模型，只在理由里说「未验证」。
  const dataCheck =
    options.datasetPort === undefined || !hasDatasetSources(parsed.value)
      ? undefined
      : await validateIntentData({
          document: parsed.value,
          sources,
          port: options.datasetPort,
          ...(dataContext === undefined ? {} : { context: dataContext }),
          signal: signal ?? new AbortController().signal,
        });
  if (dataCheck !== undefined) {
    // 取数期间用户可能改了文档、撤销或取消：过期结果不提交。
    const late = stale();
    if (late !== undefined) {
      draft?.discard();
      return failedAttempt([], [], late);
    }
  }
  const dataIssues = dataCheck?.issues ?? [];
  const issues = [...prepared.issues, ...dataIssues];

  const submit = (dropped: boolean): WholeScreenAttempt => {
    // 去项交出时，没修好的那几项照实写进理由：逐条列出被去掉的指标 / 块，块被去掉另加一句总括。
    // 样例验证没过的块没有被去掉（照常交出、采纳后可能显示为空），也逐条写明。
    const droppedNotes: IntentDiagnostic[] = dropped
      ? [
          ...issues.map((issue) => note(issue.code, issue.path)),
          ...(prepared.issues.some((issue) => /blocks\[|main\[|rail\[/.test(issue.path))
            ? [note('AGENT_BLOCKS_DROPPED', '')]
            : []),
        ]
      : [];
    const warnings = describeIntentWarnings(
      [...droppedNotes, ...prepared.warnings],
      data.warnings ?? [],
    );
    const backdropNote = repairedFor.has('LAYOUT_LOCKED_BACKDROP_DARK')
      ? '；画布上锁定保留的深色背景与浅色风格冲突（文字会看不清），已改用深色风格，想要浅色可先解锁或删除这个背景'
      : repairedFor.has('LAYOUT_LOCKED_BACKDROP_LIGHT')
        ? '；画布上锁定保留的浅色背景与深色风格冲突（文字会看不清），已改用浅色风格，想要深色可先解锁或删除这个背景'
        : '';
    const behaviorNote = describeRepairedBehaviors(repairedFor, prepared.compiled?.behaviors ?? []);
    const repairedNote =
      rounds > 0 ? `；宿主校验未通过，已请模型修复 ${rounds} 次${backdropNote}${behaviorNote}` : '';
    const rationale = `${describeMode(data.mode, data.failure, warnings)}${repairedNote}。布局由宿主前端按区域确定性编译，本轮以整屏替换的形式作为候选，未写入文档。${describeIncomingData(document, dataContext)}${describeBehaviors(prepared.compiled?.behaviors ?? [])}${describeDataCheck(dataCheck)}${describeLocked(current)}`;
    // 流式草案接得上就原地收尾；接不上（最终结果与骨架对不上、或已修复过）先撤掉它，再整屏提交。
    // 提案一旦提交就留下它的会话；是否被采纳由下一次请求时对活文档判断。
    const kept = createIntentSession({
      intent: prepared.intent as NonNullable<typeof prepared.intent>,
      compiled: prepared.compiled as NonNullable<typeof prepared.compiled>,
      catalog: toIntentCatalog(shape, data.assets, dataContext),
      references: { assets: data.assets, datasets: intentDatasets(data, dataContext) },
      mode: data.mode,
    });
    if (rounds === 0 && !dropped && draft?.finish(parsed.value, rationale) === true) {
      return { ok: true, session: kept };
    }
    draft?.discard();
    const submitted = options.designer.submitChangeProposal({
      title: `智能体 · ${truncate(instruction, 18)}`,
      rationale,
      scope: '整屏',
      commands: compileWholeScreenCommands(current, parsed.value),
      origin: { author: '智能体' },
    });
    if (!submitted.ok) {
      logger.warn('change proposal rejected', submitted.diagnostics);
      return failedAttempt(
        mapEngineIssues(submitted.diagnostics),
        submitted.diagnostics,
        '提案被引擎拒绝（命令或渲染校验未通过），未生成变更。',
      );
    }
    return { ok: true, session: kept };
  };

  if (issues.length === 0) return submit(false);
  // 有值得修的诊断：先不提交，交给调用方决定修还是去项交出。
  // 只有样例验证没过时内容本身是完整的，修不好也可以照常交出并说明。
  const deliverable = prepared.issues.length === 0 || prepared.deliverable;
  return failedAttempt(
    issues,
    [],
    prepared.issues.length === 0
      ? '样例查询发现有模块取不到数据，未生成变更。'
      : '智能体输出里有不合格的指标或模块，未生成变更。',
    deliverable ? () => submit(true) : undefined,
  );
}

function hasDatasetSources(document: ScreenDocument): boolean {
  return (document.dataSources ?? []).some((source) => source.source.kind === 'dataset');
}

/** 样例验证的结果写进理由：核对了几个实例、哪些没能核对。 */
function describeDataCheck(
  check:
    | {
        readonly verified: readonly string[];
        readonly unverified: readonly string[];
        readonly empty: readonly string[];
      }
    | undefined,
): string {
  if (check === undefined) return '';
  // 按当前条件查不到数据不算错（ADR-0114 §8.7）：照常交出，说清楚采纳后会怎样。
  const empty =
    check.empty.length === 0
      ? ''
      : `「${check.empty.join('」「')}」按当前条件暂无数据，采纳后有数据会自动显示。`;
  const verified =
    check.verified.length === 0 ? '' : `已用样例查询核对 ${check.verified.length} 个数据源。`;
  const unverified =
    check.unverified.length === 0
      ? ''
      : `「${check.unverified.join('」「')}」样例查询失败，未验证，采纳后请留意是否有数据。`;
  return `${verified}${empty}${unverified}`;
}

function note(code: string, path: string): IntentDiagnostic {
  return { severity: 'warning', code, path, message: '' };
}

/** 局部修改失败时，操作 / 编译层的诊断码 → 能念给用户听的一句话。 */
const EDIT_FAILURE_TEXT: Readonly<Record<string, string>> = {
  INTENT_OP_TARGET_UNKNOWN: '要改的位置在当前屏里找不到（可能已被删掉）',
  INTENT_OP_FAILED: '改完之后的内容不可用',
  INTENT_OP_INVALID: '给出的修改不合法',
  INTENT_OP_NOT_SUPPORTED: '暂不支持这种修改',
  LAYOUT_CAPACITY_EXCEEDED: '改完之后这一屏放不下，先删掉一些块再试',
  AGENT_CATALOG_UNUSABLE: '目录里没有可用的基础物料',
};

/**
 * 局部修改（ADR-0113 §2.5）：后端回对会话 IR 的操作列表，宿主应用到 IR、重编译、与上一次产物做差，
 * 只把变化的组件编成提案——没动的组件 id 与几何不动，用户手改过的组件原样保留并在理由里说明。
 * 任何一步失败都如实回原因，不退回整屏重做。
 */
function submitScreenEdit(
  options: HostIntentOptions,
  current: ScreenDocument,
  instruction: string,
  session: IntentSession,
  shape: AgentCatalogShape,
  data: AgentScreenEditShape,
): { readonly outcome: DesignerIntentOutcome; readonly session?: IntentSession } {
  const fail = (reason: string, diagnostics: readonly ScreenDiagnostic[] = []) => ({
    outcome: { ok: false, diagnostics, reason } as const,
  });
  if (data.unsupported !== undefined) return fail(data.unsupported);
  if (data.ops.length === 0) {
    return fail(
      data.failure === undefined
        ? '没有识别到可以应用的修改。可以试试“把第二块换成环形图”“删掉提醒那一块”“把标题改成……”。'
        : `没能局部修改：${describeAgentFailure(data.failure)}。`,
    );
  }
  // 目录可能在生成之后变过（新装的物料包）：换成最新物料，素材沿用生成时授权的那份。
  const refreshed: IntentSession = {
    ...session,
    // 本轮候选（`rebind` 引用的 `c3`）沿用生成时那份，与会话里的引用数据集对得上。
    catalog: { ...session.catalog, materials: shape.materials },
  };
  const edited = editIntent(refreshed, data.ops, {
    canvas: current.canvas,
    components: current.components,
    ...(current.dataSources === undefined
      ? {}
      : { dataSources: current.dataSources as unknown as readonly Record<string, unknown>[] }),
    // 联动变化时只换智能体生成的那部分变量与连线（ADR-0115 D9）。
    variables: current.variables,
    blueprint: current.blueprint,
  });
  if (!edited.ok) {
    logger.warn('agent edit ops not applicable', edited.diagnostics);
    const first = edited.diagnostics[0];
    const why = first === undefined ? '' : (EDIT_FAILURE_TEXT[first.code] ?? '修改没能应用');
    return fail(`智能体给的修改没能应用：${why}。当前屏没有任何变化。`);
  }
  if (edited.commands.length === 0) {
    return fail(
      edited.keptForUser.length > 0
        ? `你手动改过 ${edited.keptForUser.length} 个相关组件，已原样保留，没有需要应用的改动。`
        : '这次修改没有产生任何变化。',
    );
  }
  const kept =
    edited.keptForUser.length === 0
      ? ''
      : `你手动改过的 ${edited.keptForUser.length} 个组件已原样保留，没有被覆盖`;
  const { changed, added, removed } = edited.summary;
  const counts = [
    changed > 0 ? `更新 ${changed} 个组件` : '',
    added > 0 ? `新增 ${added} 个` : '',
    removed > 0 ? `移除 ${removed} 个` : '',
  ].filter((part) => part !== '');
  const submitted = options.designer.submitChangeProposal({
    title: `智能体 · ${truncate(instruction, 18)}`,
    rationale: `${data.summary === '' ? '局部修改' : data.summary}。由模型生成；${counts.length === 0 ? '组件不变' : counts.join('，')}，其余组件保持原样${kept === '' ? '' : `。${kept}`}。${JSON.stringify(refreshed.compiled.behaviors) === JSON.stringify(edited.session.compiled.behaviors) ? '' : describeBehaviors(edited.session.compiled.behaviors)}${describeEditWarnings(edited.warnings)}候选未写入文档。`,
    scope: '局部修改',
    commands: edited.commands as unknown as DesignerChangeProposalInput['commands'],
    // 版面与联动都变了时分两组，评审面上各自采纳（ADR-0115 D5）。
    ...(edited.groups === undefined ? {} : { groups: edited.groups }),
    origin: { author: '智能体' },
  });
  if (!submitted.ok) {
    logger.warn('change proposal rejected', submitted.diagnostics);
    return fail('提案被引擎拒绝（命令或渲染校验未通过），未生成变更。', submitted.diagnostics);
  }
  return { outcome: { ok: true, value: null, diagnostics: [] }, session: edited.session };
}

/**
 * 锁定组件与候选叠在一起后的对比度冲突。没有锁定组件、或叠起来没问题时返回 undefined。
 * 深浅按冲突文字背后那块锁定底色判断：底色离黑近就是深色背景。
 */
function lockedBackdropConflict(
  current: ScreenDocument,
  candidate: ScreenDocument,
):
  | {
      readonly code: 'LAYOUT_LOCKED_BACKDROP_DARK' | 'LAYOUT_LOCKED_BACKDROP_LIGHT';
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | undefined {
  const locked = current.components.filter((component) => component.status.locked);
  if (locked.length === 0) return undefined;
  const base = layerBase(current);
  const merged: ScreenDocument = {
    ...candidate,
    components: [
      ...locked,
      ...candidate.components.map((component) => ({
        ...component,
        zIndex: component.zIndex + base,
      })),
    ],
  };
  const diagnostics = auditScreenLayout(merged, {
    componentIds: candidate.components.map((component) => component.id),
  }).filter((item) => item.severity === 'error' && item.code === 'LAYOUT_CONTRAST_LOW');
  if (diagnostics.length === 0) return undefined;
  const fill = locked
    .map((component) => component.style.fill ?? component.style.backgroundColor)
    .find((value): value is string => typeof value === 'string');
  const color = fill === undefined ? undefined : parseCssColor(fill);
  // 相对亮度 0.179 是黑白两种文字对比度相等的分界点：低于它，白字比黑字更清楚，就是深色背景。
  const dark = color === undefined ? true : relativeLuminance(color) < 0.179;
  return {
    code: dark ? 'LAYOUT_LOCKED_BACKDROP_DARK' : 'LAYOUT_LOCKED_BACKDROP_LIGHT',
    diagnostics,
  };
}

/** 引擎拒绝的诊断翻成修复请求：路径是提案层的，归到整份输出；`CHANGE_*` 是提案状态，模型修不了。 */
function mapEngineIssues(diagnostics: readonly ScreenDiagnostic[]): IntentRepairIssue[] {
  const seen = new Set<string>();
  const issues: IntentRepairIssue[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.code.startsWith('CHANGE_') || seen.has(diagnostic.code)) continue;
    seen.add(diagnostic.code);
    issues.push({ code: diagnostic.code, path: '' });
  }
  return issues;
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
        next.dataSource = null;
      } else if (typeof component.props.text === 'string') {
        next.props = { ...component.props, text };
      } else if (component.dataSource?.type === 'static') {
        next.dataValue = { kind: 'inline', value: text };
        next.dataSource = null;
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
  // 渲染层是渐变 / 背景图优先于 `backgroundColor` 的：只写底色，旧画布上的渐变或背景图会盖住新配色，
  // 浅色风格的深色标题就落在深色渐变上看不清（浏览器核对时发现）。整屏替换是连画布一起换，
  // 所以旧的填充与背景图也跟着清掉，除非新文档自己带了。
  const canvasPatch: {
    width: number;
    height: number;
    backgroundColor: string;
    background?: ScreenCanvasBackground | null;
    backgroundImage?: string | null;
    backgroundImageFit?: 'cover' | 'contain' | null;
  } = {
    width: next.canvas.width,
    height: next.canvas.height,
    backgroundColor: next.canvas.backgroundColor,
  };
  if (current.canvas.background !== undefined || next.canvas.background !== undefined) {
    if (!jsonEquals(current.canvas.background, next.canvas.background)) {
      canvasPatch.background = next.canvas.background ?? null;
    }
  }
  if (current.canvas.backgroundImage != null && next.canvas.backgroundImage == null) {
    canvasPatch.backgroundImage = null;
    canvasPatch.backgroundImageFit = null;
  }
  const commands: ProposalCommand[] = [{ type: 'update-canvas', patch: canvasPatch }];

  // 蓝图节点引用组件：先清空旧蓝图再删组件，否则删除那一步就因悬空引用被拒
  // （COMPONENT_PARENT_MISSING）；新蓝图等组件都加完再换上。
  const blueprintChanged = JSON.stringify(current.blueprint) !== JSON.stringify(next.blueprint);
  const clearedBlueprint = { ...current.blueprint, nodes: [], edges: [] };
  const clearBlueprint = blueprintChanged && current.blueprint.nodes.length > 0;
  if (clearBlueprint) commands.push({ type: 'replace-blueprint', blueprint: clearedBlueprint });

  const removable = current.components
    .filter((component) => !component.status.locked)
    .map((component) => component.id);
  if (removable.length > 0) commands.push({ type: 'remove-components', componentIds: removable });

  // 变量要先于数据源：筛选联动的数据源参数引用变量（ADR-0115），逐条校验时变量必须已经在。
  // 先换成「旧 ∪ 新」（旧数据源此刻可能还引用旧变量），数据源与组件都换好后再收拢到新的。
  const variablesChanged = JSON.stringify(current.variables) !== JSON.stringify(next.variables);
  const incomingIds = new Set(next.variables.map((variable) => variable.id));
  const union = [
    ...next.variables,
    ...current.variables.filter((variable) => !incomingIds.has(variable.id)),
  ];
  if (variablesChanged) {
    commands.push({ type: 'replace-variables', variables: union });
  }

  const { sources, remapped } = adoptDataSources(current, next);
  if (sources !== undefined) {
    commands.push({ type: 'replace-data-sources', dataSources: sources });
  }

  const zIndexBase = layerBase(current);
  for (const component of next.components) {
    commands.push({
      type: 'add-component',
      component: { ...remapValueRef(component, remapped), zIndex: component.zIndex + zIndexBase },
    });
  }

  if (variablesChanged && union.length !== next.variables.length) {
    commands.push({ type: 'replace-variables', variables: next.variables });
  }
  const blueprintBefore = clearBlueprint ? clearedBlueprint : current.blueprint;
  if (JSON.stringify(blueprintBefore) !== JSON.stringify(next.blueprint)) {
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
/**
 * 提案理由里的「将接入的数据」（ADR-0114 D6）：采纳后会新建哪些数据集实例、用什么参数。
 * 生成的实例不写刷新策略，采纳前用户就能看清这屏会去取哪些数。
 */
function describeIncomingData(document: unknown, dataContext?: IntentDataContext): string {
  const sources =
    isRecord(document) && Array.isArray(document.dataSources) ? document.dataSources : [];
  const variables = (
    isRecord(document) && Array.isArray(document.variables) ? document.variables : []
  ).filter(isRecord);
  const items: string[] = [];
  const used = new Set<string>();
  for (const source of sources) {
    if (!isRecord(source) || !isRecord(source.source) || source.source.kind !== 'dataset') continue;
    const params = isRecord(source.params)
      ? Object.entries(source.params)
          .map(([name, value]) => {
            // 联动推出的参数引用变量（ADR-0115）：写「随联动」，不是一个固定值。
            if (isRecord(value) && value.kind === 'variable') {
              const variable = variables.find((item) => item.id === value.variableId);
              return `${name}=随联动（初始 ${String(variable?.initialValue ?? '')}）`;
            }
            return `${name}=${isRecord(value) ? String(value.value) : ''}`;
          })
          .join('，')
      : '';
    items.push(`${String(source.name)}${params === '' ? '' : `（${params}）`}`);
    if (typeof source.source.datasetId === 'string') used.add(source.source.datasetId);
  }
  // 引用了却没接上、原因是缺必填参数的数据集：说清楚要什么、怎么说（编译器不替用户挑取值）。
  const waiting = (dataContext?.references ?? []).flatMap((reference) => {
    if (used.has(reference.datasetId)) return [];
    const missing = (reference.parameters ?? []).filter(
      (parameter) => parameter.required && parameter.defaultValue === undefined,
    );
    if (missing.length === 0) return [];
    const choices = missing
      .map((parameter) =>
        parameter.allowedValues === undefined || parameter.allowedValues.length === 0
          ? parameter.name
          : `${parameter.name}（可选 ${parameter.allowedValues.join(' / ')}）`,
      )
      .join('、');
    const example = missing[0]?.allowedValues?.[0];
    return [
      `「${reference.name}」需要先指定 ${choices}，本轮没有接入${example === undefined ? '' : `，说「用 ${String(example)} 的」即可`}`,
    ];
  });
  const incoming = items.length === 0 ? '' : `将接入的数据：${items.join('；')}。`;
  return `${incoming}${waiting.length === 0 ? '' : `${waiting.join('；')}。`}`;
}

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

/** 解析与编译期的降级码 → 能直接念给用户听的一句话（后端不再维护这份码表）。 */
const INTENT_WARNING_TEXT: Readonly<Record<string, string>> = {
  AGENT_BLOCK_TYPE_UNKNOWN: '有模块用了目录里没有的组件，已跳过',
  AGENT_ASSET_UNKNOWN: '有模块的素材不在授权清单里，已跳过',
  AGENT_BLOCK_ASSET_REQUIRED: '有图片类模块没有给素材，已跳过',
  AGENT_BLOCK_DATA_MISSING: '有模块缺少数据，已跳过',
  AGENT_BLOCK_ROWS_TRIMMED: '表格超过 8 行，已裁剪',
  AGENT_BLOCK_COLUMNS_TRIMMED: '表格超过 4 列，已裁剪',
  AGENT_BLOCK_COLUMN_COERCED: '有列的值与声明类型不符，已按文本处理',
  AGENT_BLOCK_PROPS_DROPPED: '有组件参数不在目录声明里，已忽略',
  AGENT_BLOCK_SPAN_CLAMPED: '有模块宽度越界，已收进 1–4 列',
  AGENT_BLOCK_TEXT_TRIMMED: '有文案超出长度上限，已截断',
  AGENT_BLOCK_INVALID: '有模块结构不完整，已跳过',
  AGENT_BLOCK_BINDING_UNSATISFIED: '有模块的列不满足绑定角色，已退化为无数据',
  AGENT_DATASET_UNKNOWN: '引用的数据集不在本轮上下文里，该模块已跳过',
  AGENT_DATASET_PARAM_REQUIRED: '引用的数据集需要先指定参数，该模块已跳过',
  DATA_FIELD_ABSENT: '有模块绑定的字段不在查询结果里，采纳后可能显示为空',
  DATA_FIELD_ALL_NULL: '有模块绑定的字段在样例结果里全为空',
  AGENT_KPI_MULTI_ROW: '有指标卡对应的数据不止一行，指标卡只能显示单行数据',
  AGENT_BLOCKS_DROPPED: '有模块经修复仍不可用，已去掉，其余照常交出',
  AGENT_KPI_INVALID: '有指标数值不合格，已去掉',
  AGENT_KPI_DELTA_DROPPED: '有指标的增减量不合格，已只保留数值',
  AGENT_ASSET_CATALOG_UNAVAILABLE: '素材目录不可用，本次未使用宿主图片',
  INTENT_PART_NOT_SUPPORTED: '有暂不支持的内容（页面、变量、交互等）已忽略',
  INTENT_ITEMS_TRIMMED: '区域或模块超过上限，已裁剪',
  INTENT_REGION_VALUE_DEFAULTED: '有版面取值不认识，已用默认值',
  INTENT_REGION_INVALID: '有区域结构不完整，已去掉',
  INTENT_SHELL_UNAVAILABLE: '目录里没有可容纳子组件的物料，卡片与模块已平铺，不能整体移动',
  // ADR-0115 行为
  INTENT_KEY_INVALID: '有模块的联动句柄不合格，已忽略',
  INTENT_INTERACTION_INVALID: '有联动结构不完整，已去掉',
  INTENT_STATE_INVALID: '有指标的阈值状态不合格，已去掉',
  AGENT_INTERACTION_SOURCE_UNKNOWN: '有联动找不到来源模块，已去掉',
  AGENT_INTERACTION_TARGET_UNKNOWN: '有联动找不到目标模块，已去掉',
  AGENT_INTERACTION_EVENT_UNKNOWN: '有联动用了来源组件没有的事件，已去掉',
  AGENT_INTERACTION_FIELD_UNKNOWN: '有联动的筛选字段不在来源数据里，已去掉',
  AGENT_INTERACTION_TARGET_INVALID:
    '有联动的目标不读数据集或没有该参数（筛选只经数据集参数生效），已去掉',
  AGENT_INTERACTION_NO_EFFECT: '有联动点了也不会改变目标（来源取值都相同或不在可选值里），已去掉',
  AGENT_STATE_NEEDS_DATA: '阈值状态只对绑了真实数据的指标生效，示例数值的指标未加状态',
  AGENT_STATE_FIELD_TYPE: '有指标的阈值与字段类型不符，未加状态',
  AGENT_STATE_LEVEL_SCALE_UNAVAILABLE:
    '有指标要求按分级表生成状态，但宿主没有为该字段声明分级表，未加状态',
  AGENT_INTERACTION_STATE_UNKNOWN: '有「设状态」联动指向目标没有的状态，已去掉',
  INTENT_FILTER_SHARED_SOURCE: '有模块与筛选目标共用同一数据源，会跟着一起筛选',
};

/**
 * 合并后端说明与 host-kit 的解析 / 编译告警，按码去重。
 * 模型用目录里有的组件替代了用户要的东西时，逐条如实说明——不静默降级。
 */
function describeIntentWarnings(
  diagnostics: readonly IntentDiagnostic[],
  backend: readonly AgentWarningShape[],
): AgentWarningShape[] {
  const seen = new Set<string>();
  const output: AgentWarningShape[] = [];
  const add = (key: string, code: string, message: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ code, message });
  };
  for (const item of diagnostics) {
    if (item.code === 'INTENT_BLOCK_SUBSTITUTED') {
      const wanted = String(item.detail?.wanted ?? '');
      const used = String(item.detail?.used ?? '');
      add(
        `${item.code}:${wanted}`,
        item.code,
        `你要的「${wanted}」目录里没有，已用「${used}」代替`,
      );
      continue;
    }
    if (item.code === 'AGENT_DATASET_PARAM_REQUIRED') {
      const dataset = String(item.detail?.dataset ?? '');
      const params = String(item.detail?.params ?? '');
      const allowed = String(item.detail?.allowed ?? '');
      add(
        `${item.code}:${dataset}`,
        item.code,
        `「${dataset}」需要先指定参数 ${params}${allowed === '' ? '' : `（可选 ${allowed}）`}，该模块已跳过`,
      );
      continue;
    }
    if (item.code === 'AGENT_INTERACTION_CAPABILITY_MISSING') {
      const capability = String(item.detail?.capability ?? '');
      add(
        `${item.code}:${capability}`,
        item.code,
        `宿主没有授权蓝图能力 ${capability}，相关联动未生成`,
      );
      continue;
    }
    if (item.code === 'INTENT_FILTER_INITIAL_FROM_SOURCE') {
      add(
        `${item.code}:${String(item.detail?.target ?? '')}`,
        item.code,
        `「${String(item.detail?.target ?? '')}」的 ${String(item.detail?.param ?? '')} 先按来源第一行（${String(item.detail?.value ?? '')}）显示，点击后切换`,
      );
      continue;
    }
    if (item.code === 'INTENT_BEHAVIOR_GAP') {
      const text = String(item.detail?.text ?? '');
      add(`${item.code}:${text}`, item.code, `做不到的要求：${text}`);
      continue;
    }
    if (item.code === 'INTENT_STATE_SUGGESTED') {
      add(
        `${item.code}:${String(item.detail?.target ?? '')}`,
        item.code,
        `「${String(item.detail?.target ?? '')}」的阈值是模型按常识补的，采纳前请核对`,
      );
      continue;
    }
    add(item.code, item.code, INTENT_WARNING_TEXT[item.code] ?? '部分内容已降级');
  }
  for (const item of backend) add(item.code, item.code, item.message);
  return output;
}

/**
 * 理由里的「生成的行为」（ADR-0115 D5）：整屏替换是一个采纳单元，评审面看不到联动与状态，
 * 所以逐条写进理由——谁驱动谁、按什么参数、阈值是多少。
 */
function describeBehaviors(behaviors: readonly IntentBehaviorSummary[]): string {
  if (behaviors.length === 0) return '';
  const lines = behaviors.slice(0, 8).map((item) => {
    if (item.kind === 'state') {
      return `「${item.from}」状态：${item.detail}${item.suggested === true ? '（阈值为模型建议）' : ''}`;
    }
    return `点「${item.from}」${item.detail}「${item.to.join('」「')}」`;
  });
  return `生成的联动与状态：${lines.join('；')}。`;
}

/**
 * 修复过的联动问题（ADR-0115 D6）：模型修复时可能直接删掉那条联动，最终产物里就没有告警了。
 * 首轮被拦下的原因写进理由，用户才知道自己要的联动为什么没出现。
 */
function describeRepairedBehaviors(
  repairedFor: ReadonlySet<string>,
  behaviors: readonly IntentBehaviorSummary[],
): string {
  const reasons: string[] = [];
  if (repairedFor.has('AGENT_INTERACTION_NO_EFFECT')) {
    reasons.push('首轮写的联动点了也不会改变目标（来源各行取值相同，或不在目标参数的可选值里）');
  }
  if (repairedFor.has('AGENT_INTERACTION_TARGET_INVALID')) {
    reasons.push('首轮写的筛选目标没有对应的数据集参数（筛选只经数据集参数生效）');
  }
  if (reasons.length === 0) return '';
  const filters = behaviors.filter((item) => item.kind === 'filter').length;
  return `；${reasons.join('，')}${filters === 0 ? '，最终没有生成筛选联动' : ''}`;
}

/** 局部修改的降级说明（联动没编进去的原因等），只列行为相关的几条。 */
function describeEditWarnings(warnings: readonly IntentDiagnostic[]): string {
  const notes = describeIntentWarnings(
    warnings.filter(
      (item) =>
        item.code.startsWith('AGENT_INTERACTION_') ||
        item.code.startsWith('AGENT_STATE_') ||
        item.code.startsWith('INTENT_FILTER_') ||
        item.code === 'INTENT_STATE_SUGGESTED',
    ),
    [],
  );
  return notes.length === 0 ? '' : `${notes.map((item) => item.message).join('；')}。`;
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

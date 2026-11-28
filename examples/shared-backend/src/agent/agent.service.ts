import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetsService } from '../assets/assets.service';
import { DatasetCatalogService } from '../datasets/dataset-catalog.service';
import type { ScreenShape } from '../screens/screen.types';
import { ScreensService } from '../screens/screens.service';
import type { AgentCanvasPatch } from './agent-canvas';
import {
  type AgentCatalog,
  type AgentCatalogDiagnostic,
  type AgentCatalogMaterial,
  parseAgentCatalog,
  pickAssetMaterial,
  pickTextMaterial,
} from './agent-catalog';
import {
  type AgentChatMessage,
  type AgentLlmSettings,
  requestAgentCompletion,
  requestAgentCompletionStream,
  resolveAgentLlmSettings,
} from './agent-client';
import {
  AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
  type AgentComponentPatch,
  buildAgentComponentUserPrompt,
  deterministicComponentEdit,
  parseAgentComponentEditSpec,
  readEditableComponents,
} from './agent-component-edit';
import { type ComposeReferences, composeScreenDocument } from './agent-compose';
import { type PromptDataSummary, readDataSummary } from './agent-data-context';
import {
  AGENT_MATERIAL_SYSTEM_PROMPT,
  buildMaterialRepairPrompt,
  buildMaterialUserPrompt,
  readMaterialRepairRequest,
} from './agent-material';
import {
  AGENT_MATERIAL_ISOLATED_SYSTEM_PROMPT,
  buildIsolatedMaterialRepairPrompt,
  buildIsolatedMaterialUserPrompt,
  readIsolatedMaterialRepairRequest,
} from './agent-material-isolated';
import {
  AGENT_MAX_REPAIR_ROUNDS,
  type AgentParseIssues,
  type AgentRepairIssue,
  type AgentRepairRequest,
  blockIssue,
  buildRepairPrompt,
  createParseIssues,
  enrichBindingHints,
  issueBlockIndexes,
  kpiIssue,
  readRepairRequest,
  repairKey,
  rootIssue,
} from './agent-repair';
import {
  type AgentIntentScope,
  type AgentRoutedBy,
  type AgentUnsupportedReason,
  routeAgentAction,
} from './agent-route';
import {
  type AgentEditOp,
  buildEditOpsSystemPrompt,
  buildEditOpsUserPrompt,
  readEditOps,
  readSessionDigest,
} from './agent-session';
import type { AgentPromptReferences } from './agent-spec';
import {
  type AgentBlock,
  type AgentBlockColumn,
  type AgentBlockTable,
  type AgentKpi,
  type AgentKpiDelta,
  type AgentScreenSpec,
  buildAgentUserPrompt,
  buildCatalogSystemPrompt,
  buildIntentSystemPrompt,
} from './agent-spec';
import { scanStreamingPaths } from './agent-stream';
import { resolveStylePreset } from './agent-style';

/** 降级告警：code 供宿主归类，message 是能直接念给用户听的一句话。 */
export interface AgentWarning {
  readonly code: string;
  readonly message: string;
}

export interface AgentCandidateResult {
  readonly name: string;
  readonly document: Record<string, unknown>;
  /** 本次实际走的通道；界面照实标注，不假装一定调了模型。 */
  readonly mode: 'llm' | 'deterministic';
  readonly imageCount: number;
  /** 目录来源：`client` = 宿主带来的真实设计器目录；`fallback` = 没带目录时的最小内置集。 */
  readonly catalogSource: 'client' | 'fallback';
  /** 实际落进文档的物料 type，便于宿主核对「用的确实是目录里的组件」。 */
  readonly materials: readonly string[];
  /** 非阻断降级（裁行、丢块、丢参数），屏仍产出；宿主据此在提案理由里如实说明。 */
  readonly warnings?: readonly AgentWarning[];
  readonly failure?: string;
  /** 修复回环实际用掉的修复轮数（ADR-0112 §2.1）；首轮即通过时省略。 */
  readonly repairRounds?: number;
  /**
   * 修复上下文（ADR-0112 §2.1.6）：模型最后一轮的原文，与「组件 id → IR 路径」来源表。
   * 前端审计或引擎拒绝时，把诊断按来源表翻成 IR 路径，连同原文回传请求一次修复。
   */
  readonly repairContext?: {
    readonly output: string;
    readonly sources: Readonly<Record<string, string>>;
  };
}

export interface AgentGenerateResult extends Omit<AgentCandidateResult, 'name' | 'document'> {
  readonly screen: ScreenShape;
}

/**
 * 整屏生成的结果（ADR-0113 §2.1）：后端只做「模型 ⇄ 意图层 IR」，把模型原文原样交给宿主前端，
 * 由前端用 host-kit 解析、编译、审计；修复回环也由前端驱动，再带着 `repair` 回来要一次修复。
 */
/** 本轮引用并解析出的一个数据集：列类型供角色分配，参数定义供编译器写默认值、判缺参。 */
export interface ReferencedDataset {
  readonly datasetId: string;
  readonly name: string;
  readonly columns: readonly { readonly id: string; readonly type: string }[];
  readonly parameters: readonly {
    readonly name: string;
    readonly required: boolean;
    readonly defaultValue?: string | number | boolean;
    readonly allowedValues?: readonly (string | number | boolean)[];
  }[];
}

export interface AgentIntentResult {
  /** 模型原文（JSON 文本）；未配置模型时是同形的确定性兜底 JSON（指标值为 null 占位）。 */
  readonly output: string;
  /** 本次实际走的通道；界面照实标注，不假装一定调了模型。 */
  readonly mode: 'llm' | 'deterministic';
  readonly catalogSource: 'client' | 'fallback';
  /** 本轮可用素材（按 screenId 向宿主素材库核验）：解析与编译要用。 */
  readonly assets: readonly { readonly id: string; readonly name: string }[];
  /** 本轮引用并解析出的数据集（含列类型，供绑定角色分配）。 */
  readonly datasets: readonly ReferencedDataset[];
  readonly warnings?: readonly AgentWarning[];
  readonly failure?: string;
}

/**
 * 局部修改的结果（ADR-0113 §2.5）：对宿主持有的 IR 的操作列表，不是新 IR。
 * 操作原样交给宿主的 host-kit 应用、重编译、做差；后端只把形状。
 */
export interface AgentScreenEditResult {
  readonly summary: string;
  readonly ops: readonly AgentEditOp[];
  readonly mode: 'llm' | 'deterministic';
  /** 模型认为这句话做不到时的一句原因；此时 `ops` 为空。 */
  readonly unsupported?: string;
  readonly failure?: string;
}

/** 流式落稿的事件：进度态、骨架、逐项内容（位置路径见 `scanStreamingPaths`）。 */
export type AgentStreamEvent =
  | { readonly type: 'status'; readonly phase: 'thinking' | 'writing' }
  | {
      readonly type: 'skeleton';
      readonly title: string;
      readonly subtitle: string;
      readonly style?: string;
      readonly layout: unknown;
    }
  | { readonly type: 'item'; readonly path: string; readonly value: unknown };

/**
 * 组件工坊起草的结果（ADR-0116 D7）：只有模型原文。解析、体检与修复回环在宿主前端做；
 * 结果只进工坊草稿，发布仍由人做。
 */
export interface AgentMaterialDraftResult {
  readonly output: string;
  readonly mode: 'llm';
}

export interface AgentComponentEditResult {
  readonly summary: string;
  readonly patches: readonly AgentComponentPatch[];
  readonly mode: 'llm' | 'deterministic';
  readonly failure?: string;
}

/** 统一动作入口的入参：作用域 + 文本 + 该作用域需要的上下文。 */
export interface AgentActInput {
  readonly text: string;
  readonly scope: AgentIntentScope;
  readonly componentIds?: readonly string[];
  readonly components?: readonly unknown[];
  readonly screenId?: string;
  readonly catalog?: unknown;
  readonly references?: readonly Record<string, unknown>[];
  /** 画布当前值，用于判"改了等于没改"；结构由路由侧做有界读取。 */
  readonly canvas?: unknown;
  /** 当前屏摘要，只用于路由提示词；同样在路由侧收窄。 */
  readonly context?: unknown;
  /** 宿主持有的整屏 IR 摘要（会话）：有它时非「重做」口吻的整屏指令走局部修改。 */
  readonly session?: unknown;
  /** 前端断开即中止上游模型请求。 */
  readonly signal?: AbortSignal;
  /** 流式落稿（ADR-0113 §2.8）：整屏生成时，推进度态、骨架与逐项内容；编译在宿主前端做。 */
  readonly onEvent?: (event: AgentStreamEvent) => void;
}

/**
 * 统一动作结果：判别联合，宿主按 `kind` 分派。
 *
 * `generate_screen` / `edit_components` 直接摊平既有结果，避免宿主再包一层；
 * `set_canvas` 只回 patch，编译成 `update-canvas` 是宿主的职责。
 */
export type AgentActResult =
  | ({ readonly kind: 'generate_screen'; readonly routedBy: AgentRoutedBy } & AgentIntentResult)
  | ({ readonly kind: 'edit_screen'; readonly routedBy: AgentRoutedBy } & AgentScreenEditResult)
  | ({
      readonly kind: 'edit_components';
      readonly routedBy: AgentRoutedBy;
    } & AgentComponentEditResult)
  | {
      readonly kind: 'set_canvas';
      readonly routedBy: AgentRoutedBy;
      readonly patch: AgentCanvasPatch;
    }
  | {
      readonly kind: 'unsupported';
      readonly routedBy: AgentRoutedBy;
      readonly reason: AgentUnsupportedReason;
      readonly suggestion?: string;
    };

@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');

  constructor(
    private readonly screens: ScreensService,
    private readonly config: ConfigService,
    private readonly datasets: DatasetCatalogService,
    private readonly assets: AssetsService,
  ) {}

  async generate(input: {
    topic: string;
    name?: string;
    catalog?: unknown;
    signal?: AbortSignal;
  }): Promise<AgentGenerateResult> {
    const candidate = await this.generateCandidate(input);
    const created = await this.screens.create(input.name?.trim() || candidate.name);
    const saved = await this.screens.update(created.id, candidate.document, created.revision);
    return {
      screen: saved,
      mode: candidate.mode,
      imageCount: candidate.imageCount,
      catalogSource: candidate.catalogSource,
      materials: candidate.materials,
      ...(candidate.warnings === undefined ? {} : { warnings: candidate.warnings }),
      ...(candidate.failure === undefined ? {} : { failure: candidate.failure }),
    };
  }

  /**
   * 把上送的引用核对成两份视图：
   * - `prompt`：给模型看的可读清单（名称 + id + 数据集字段）；
   * - `compose`：给编译器用的列信息（`datasetId` → 字段类型，供角色分配）。
   *
   * 认不出来的引用直接丢掉并记日志——宿主已经按目录过滤过一次，这里只做兜底，
   * 不因为一条失效引用就把整句话打回。
   */
  private async resolveReferences(
    catalog: AgentCatalog,
    raw: readonly Record<string, unknown>[] | undefined,
  ): Promise<{
    prompt: AgentPromptReferences | undefined;
    compose:
      | {
          assets: { id: string; name: string }[];
          datasets: ReferencedDataset[];
        }
      | undefined;
  }> {
    if (raw === undefined || raw.length === 0) return { prompt: undefined, compose: undefined };
    const assets: { id: string; name: string }[] = [];
    const datasets: ReferencedDataset[] = [];
    const summaries = new Map<string, PromptDataSummary>();
    for (const item of raw) {
      const kind = item.kind;
      if (kind === 'asset') {
        const assetId = typeof item.assetId === 'string' ? item.assetId : '';
        const asset = catalog.assets.find((entry) => entry.id === assetId);
        if (asset === undefined) {
          this.logger.warn(`agent reference asset dropped: ${assetId}`);
          continue;
        }
        assets.push({ id: asset.id, name: asset.name });
        continue;
      }
      if (kind === 'dataset') {
        const datasetId = typeof item.datasetId === 'string' ? item.datasetId : '';
        try {
          const definition = await this.datasets.describe(datasetId);
          // 契约里的字段类型是 valueType；编译器只关心 number/其它二分，这里就地归并。
          const columns = (definition.fields ?? []).map((field) => ({
            id: field.id,
            type: field.valueType === 'number' ? 'number' : 'string',
          }));
          // 参数定义原样带上：运行时缺参数回落默认值，必填又没默认值时整次查询失败（ADR-0114 §8.1）。
          const parameters = (definition.parameters ?? []).map((parameter) => ({
            name: parameter.name,
            required: parameter.required,
            ...(parameter.defaultValue === undefined
              ? {}
              : { defaultValue: parameter.defaultValue }),
            ...(parameter.allowedValues === undefined
              ? {}
              : { allowedValues: [...parameter.allowedValues] }),
          }));
          datasets.push({ datasetId, name: definition.name, columns, parameters });
          // 宿主前端算好的画像与候选（ADR-0114 S4）：只读、校验形状后写进提示词，不在这里重算。
          const summary = readDataSummary(item);
          if (summary !== undefined) summaries.set(datasetId, summary);
        } catch {
          this.logger.warn(`agent reference dataset dropped: ${datasetId}`);
        }
      }
    }
    if (assets.length === 0 && datasets.length === 0)
      return { prompt: undefined, compose: undefined };
    return {
      prompt: {
        assets,
        datasets: datasets.map((dataset) => ({
          datasetId: dataset.datasetId,
          name: dataset.name,
          columns: dataset.columns.map((column) => column.id),
          missingParams: dataset.parameters
            .filter((parameter) => parameter.required && parameter.defaultValue === undefined)
            .map((parameter) => parameter.name),
          paramChoices: dataset.parameters
            .filter((parameter) => parameter.required && parameter.defaultValue === undefined)
            .map((parameter) => ({
              name: parameter.name,
              allowed: (parameter.allowedValues ?? []).map((value) => String(value)),
            })),
          ...summaryOf(summaries, dataset.datasetId),
        })),
      },
      compose: { assets, datasets },
    };
  }

  async generateCandidate(input: {
    topic: string;
    screenId?: string;
    catalog?: unknown;
    references?: readonly Record<string, unknown>[];
    signal?: AbortSignal;
    /** 前端校验或引擎拒绝后的一次修复（ADR-0112 §2.1.6）。 */
    repair?: unknown;
  }): Promise<AgentCandidateResult> {
    const topic = input.topic.trim();
    const repair = input.repair === undefined ? undefined : readRepairRequest(input.repair);
    if (repair === null) {
      throw new BadRequestException({
        error: 'AGENT_REPAIR_INVALID',
        message: '修复请求需要上一轮输出与按 IR 路径整理的诊断。',
      });
    }
    const { catalog, references, assetCatalogWarning } = await this.resolveContext(input);
    const settings = resolveAgentLlmSettings(this.config);

    let spec = deterministicSpec(topic, catalog, references.compose);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined;
    // 解析期的降级（裁行、丢块、丢参数）与编译期的降级合并成一份，供宿主如实展示。
    const parseWarnings: string[] = [];
    let repairRounds = 0;
    let lastOutput: string | undefined;

    if (settings !== null) {
      const outcome = await this.generateWithRepair({
        settings,
        // 目录随请求到来，所以提示词也是按目录现生成的：宿主装了新物料，下一句话就能用上。
        system: buildCatalogSystemPrompt(catalog, references.prompt),
        user: buildAgentUserPrompt(topic),
        catalog,
        ...(repair === undefined ? {} : { repair }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      if (outcome.kind === 'transport') {
        // 模型调用失败（超时、HTTP 错误、断连）如实报失败，不退回确定性布局冒充产出（ADR-0112 §2.1.5）：
        // 确定性兜底只留给「没配置模型」。重试已在客户端做过一次（§2.6）。
        throw transportFailure(outcome.failure);
      } else if (outcome.kind === 'exhausted') {
        // 修不好且没有可交的块（或整份 / 文档级出错）：不交候选，也不再退回确定性布局冒充产出
        // （ADR-0112 §2.1.5）。把最后一轮诊断如实交给宿主。
        throw new UnprocessableEntityException({
          error: outcome.issues[0]?.code ?? 'AGENT_SPEC_INVALID',
          message: '模型输出经修复仍未通过校验，本次没有生成候选。',
          diagnostics: outcome.issues,
          repairRounds: outcome.repairRounds,
        });
      } else {
        spec = outcome.spec;
        mode = 'llm';
        parseWarnings.push(...outcome.warnings);
        repairRounds = outcome.repairRounds;
        lastOutput = outcome.output;
      }
    } else {
      failure = 'AGENT_NOT_CONFIGURED';
    }

    // mode 要跟着 spec 一起进编译器：页脚靠它如实标注「模型输出 / 确定性兜底」。
    // 风格在编译前解析成预设：颜色只来自后端色板，模型给的非法风格名回退默认预设。
    const style = resolveStylePreset(spec.style);
    const composed = composeScreenDocument(
      references.compose === undefined
        ? { spec: { ...spec, mode }, catalog, style }
        : { spec: { ...spec, mode }, catalog, references: references.compose, style },
    );
    if (!composed.ok) {
      const [diagnostic] = composed.diagnostics;
      // 编译不出合法文档时不能把空文档交出去：宿主会把它编译成「删光未锁定组件 + 不新增」
      // 的整屏提案，比失败更糟。改成 422，让宿主如实告诉用户这次没有产出。
      throw new UnprocessableEntityException({
        error: diagnostic?.code ?? 'AGENT_COMPOSE_FAILED',
        message: diagnostic?.message ?? '智能体产出无法编译成合法文档。',
      });
    }
    // 同一类降级只保留一条：模型常把三块都写超行，重复念三遍没有信息量。
    const deduped = new Map<string, AgentWarning>();
    for (const warning of [
      ...parseWarnings.map((code) => ({ code, message: describeWarning(code) })),
      ...(assetCatalogWarning === undefined
        ? []
        : [{ code: assetCatalogWarning, message: describeWarning(assetCatalogWarning) }]),
      ...composed.value.warnings.map((item) => ({ code: item.code, message: item.message })),
    ]) {
      if (!deduped.has(warning.code)) deduped.set(warning.code, warning);
    }
    const warnings = [...deduped.values()];
    return {
      name: spec.title,
      document: composed.value.document,
      mode,
      imageCount: composed.value.imageCount,
      catalogSource: catalog.source,
      materials: composed.value.materials,
      ...(warnings.length === 0 ? {} : { warnings }),
      ...(failure === undefined ? {} : { failure }),
      ...(repairRounds === 0 ? {} : { repairRounds }),
      // 只有模型产物才带修复上下文：前端审计或引擎拒绝时凭它请求一次修复（§2.1.6）。
      ...(lastOutput === undefined
        ? {}
        : { repairContext: { output: lastOutput, sources: composed.value.sources } }),
    };
  }

  /**
   * 生成 → 校验 → 修复回环（ADR-0112 §2.1）。
   *
   * 每轮：调用模型 → 宽容解析 IR → 收集诊断。没有诊断就交出；有诊断就把上一轮原文与诊断清单
   * 作为后续对话发回去修，最多修 2 轮；同一组诊断连续两轮不变就提前停。修不完时只有块级问题
   * （坏块已在解析时去掉、其余块可用）就交出其余块并告警；整份不可用或没有任何可用块则交给
   * 调用方报失败。传输层失败（超时、HTTP 错误）不进回环：重试由客户端负责（§2.6）。
   */
  private async generateWithRepair(input: {
    readonly settings: AgentLlmSettings;
    readonly system: string;
    readonly user: string;
    readonly catalog: AgentCatalog;
    readonly signal?: AbortSignal;
    /**
     * 从前端的修复请求起步：首轮就把上一轮原文与诊断作为后续对话发出，并计作一轮修复，
     * 所以这条路径最多再多一次内部修复，总调用次数仍有上限。
     */
    readonly repair?: AgentRepairRequest;
  }): Promise<
    | { readonly kind: 'transport'; readonly failure: string }
    | {
        readonly kind: 'exhausted';
        readonly issues: readonly AgentRepairIssue[];
        readonly repairRounds: number;
      }
    | {
        readonly kind: 'ok';
        readonly spec: AgentScreenSpec;
        readonly warnings: readonly string[];
        readonly repairRounds: number;
        readonly output: string;
      }
  > {
    const followUp: AgentChatMessage[] =
      input.repair === undefined
        ? []
        : [
            { role: 'assistant', content: input.repair.output },
            { role: 'user', content: buildRepairPrompt(input.repair.issues) },
          ];
    let previousKey: string | undefined =
      input.repair === undefined ? undefined : repairKey(input.repair.issues);
    let repairRounds = input.repair === undefined ? 0 : 1;
    for (;;) {
      const options = {
        retry: true,
        followUp,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      };
      const result = await requestAgentCompletion(
        input.settings,
        input.system,
        input.user,
        this.logger,
        options,
      );
      if (!result.ok || result.text === undefined) {
        return { kind: 'transport', failure: result.failure ?? 'AGENT_FAILED' };
      }
      const warnings: string[] = [];
      const collected = createParseIssues();
      const parsed = parseCatalogSpec(result.text, input.catalog, warnings, collected);
      const issues: AgentRepairIssue[] =
        parsed === null
          ? [
              rootIssue(
                'AGENT_SPEC_INVALID',
                '输出必须是一个 JSON 对象，包含非空的 title、subtitle、至少 1 条 kpis 与 blocks 数组。',
              ),
            ]
          : [...collected.issues];
      if (parsed !== null && parsed.blocks.length === 0 && issues.length === 0) {
        issues.push(rootIssue('AGENT_BLOCKS_ALL_INVALID', 'blocks 至少要有一块可用的内容。'));
      }
      if (issues.length === 0 && parsed !== null) {
        return { kind: 'ok', spec: parsed, warnings, repairRounds, output: result.text };
      }

      const key = repairKey(issues);
      const exhausted = repairRounds >= AGENT_MAX_REPAIR_ROUNDS || key === previousKey;
      if (exhausted) {
        const { blocks: droppedBlocks, documentLevel } = issueBlockIndexes(issues);
        if (parsed !== null && !documentLevel && parsed.blocks.length > 0) {
          this.logger.warn(
            `agent repair exhausted; delivering ${parsed.blocks.length} usable blocks`,
          );
          return {
            kind: 'ok',
            spec: parsed,
            // 指标的问题已在解析时记成各自的警告；只有真去掉了块才再报「去块」。
            warnings: droppedBlocks.size > 0 ? [...warnings, 'AGENT_BLOCKS_DROPPED'] : warnings,
            repairRounds,
            output: result.text,
          };
        }
        this.logger.warn(`agent repair exhausted after ${repairRounds} rounds: ${key}`);
        return { kind: 'exhausted', issues, repairRounds };
      }
      previousKey = key;
      repairRounds += 1;
      this.logger.warn(`agent output needs repair (round ${repairRounds}): ${key}`);
      followUp.push(
        { role: 'assistant', content: result.text },
        { role: 'user', content: buildRepairPrompt(issues) },
      );
    }
  }

  /**
   * 一次生成的上下文：宿主目录、本屏授权素材、解析过的引用。
   * 素材按 screenId 向宿主素材库核验；认不出来的引用直接丢掉并记日志。
   */
  private async resolveContext(input: {
    screenId?: string;
    catalog?: unknown;
    references?: readonly Record<string, unknown>[];
  }): Promise<{
    catalog: AgentCatalog;
    references: Awaited<ReturnType<AgentService['resolveReferences']>>;
    assetCatalogWarning: string | undefined;
  }> {
    const clientCatalog = this.resolveCatalog(input.catalog);
    let assetCatalogWarning: string | undefined;
    let availableAssets: AgentCatalog['assets'] = [];
    if (input.screenId !== undefined) {
      try {
        availableAssets = (await this.assets.list({ screenId: input.screenId })).assets.map(
          (asset) => ({ id: asset.id, name: asset.name.slice(0, 60) }),
        );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        assetCatalogWarning = 'AGENT_ASSET_CATALOG_UNAVAILABLE';
        this.logger.warn('agent image catalog unavailable; candidate will omit host images');
      }
    }
    const catalog: AgentCatalog = { ...clientCatalog, assets: availableAssets };
    const references = await this.resolveReferences(catalog, input.references);
    return { catalog, references, assetCatalogWarning };
  }

  /**
   * 整屏生成（设计器路径，ADR-0113 §2.1）：只做「模型 ⇄ IR」。
   *
   * 把模型原文原样交给宿主前端；解析、编译、审计与修复回环都在宿主做（host-kit）。
   * 前端带 `repair`（上一轮原文 + 按模型路径整理的诊断）回来时，把它们作为后续对话发给模型，
   * 返回修复后的整份原文。首次生成可以流式：先推进度态，骨架写完推 `skeleton`，之后每写完一项推 `item`。
   * 模型调用失败（超时、HTTP 错误、断连）如实报错，不退回确定性布局（ADR-0112 §2.1.5）。
   */
  async generateIntent(input: {
    topic: string;
    screenId?: string;
    catalog?: unknown;
    references?: readonly Record<string, unknown>[];
    signal?: AbortSignal;
    repair?: unknown;
    onEvent?: (event: AgentStreamEvent) => void;
  }): Promise<AgentIntentResult> {
    const topic = input.topic.trim();
    const repair = input.repair === undefined ? undefined : readRepairRequest(input.repair);
    if (repair === null) {
      throw new BadRequestException({
        error: 'AGENT_REPAIR_INVALID',
        message: '修复请求需要上一轮输出与按 IR 路径整理的诊断。',
      });
    }
    const { catalog, references, assetCatalogWarning } = await this.resolveContext(input);
    const settings = resolveAgentLlmSettings(this.config);
    const context = {
      catalogSource: catalog.source,
      assets: catalog.assets,
      datasets: references.compose?.datasets ?? [],
      ...(assetCatalogWarning === undefined
        ? {}
        : {
            warnings: [
              { code: assetCatalogWarning, message: describeWarning(assetCatalogWarning) },
            ],
          }),
    } as const;

    if (settings === null) {
      return {
        output: JSON.stringify(deterministicIntent(topic, catalog, references.compose)),
        mode: 'deterministic',
        failure: 'AGENT_NOT_CONFIGURED',
        ...context,
      };
    }

    const followUp: AgentChatMessage[] =
      repair === undefined
        ? []
        : [
            { role: 'assistant', content: repair.output },
            {
              role: 'user',
              content: buildRepairPrompt(
                enrichBindingHints(repair.issues, repair.output, catalog),
                {
                  instruction: topic,
                },
              ),
            },
          ];
    const options = {
      retry: true,
      followUp,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    };
    const system = buildIntentSystemPrompt(catalog, references.prompt);
    const user = buildAgentUserPrompt(topic);
    // 修复轮的输出是整份重来，边写边画只会让画面来回跳：只有首次生成才流式。
    const streaming = input.onEvent !== undefined && repair === undefined;
    input.onEvent?.({ type: 'status', phase: 'thinking' });
    const result = streaming
      ? await requestAgentCompletionStream(settings, system, user, this.logger, {
          ...options,
          onText: this.streamEvents(input.onEvent as (event: AgentStreamEvent) => void),
        })
      : await requestAgentCompletion(settings, system, user, this.logger, options);
    if (!result.ok || result.text === undefined) {
      throw transportFailure(result.failure ?? 'AGENT_FAILED');
    }
    return { output: result.text, mode: 'llm', ...context };
  }

  /**
   * 让智能体起草一个 L2 模板物料（ADR-0116 D7 / S6）：只做「模型 ⇄ 规格」。
   *
   * 没配置模型就如实说做不了（不退回模板「猜」一个组件）；模型调用失败如实报错。
   * 用流式请求读：一份带模板的规格常要写一分多钟，按「两段输出之间」计空闲超时才不会被误杀。
   */
  async draftMaterial(input: {
    instruction: string;
    repair?: unknown;
    signal?: AbortSignal;
  }): Promise<AgentMaterialDraftResult> {
    const instruction = input.instruction.trim();
    const repair = input.repair === undefined ? undefined : readMaterialRepairRequest(input.repair);
    if (repair === null) {
      throw new BadRequestException({
        error: 'AGENT_REPAIR_INVALID',
        message: '修复请求需要上一轮输出与按规格路径整理的体检结论。',
      });
    }
    const settings = resolveAgentLlmSettings(this.config);
    if (settings === null) {
      throw new HttpException(
        {
          error: 'AGENT_NOT_CONFIGURED',
          message:
            '没有配置模型（AGENT_LLM_BASE_URL / AGENT_LLM_API_KEY / AGENT_LLM_MODEL），不能让智能体起草组件。',
        },
        503,
      );
    }
    const followUp: AgentChatMessage[] =
      repair === undefined
        ? []
        : [
            { role: 'assistant', content: repair.output },
            { role: 'user', content: buildMaterialRepairPrompt(repair.issues, instruction) },
          ];
    const result = await requestAgentCompletionStream(
      settings,
      AGENT_MATERIAL_SYSTEM_PROMPT,
      buildMaterialUserPrompt(instruction),
      this.logger,
      {
        retry: true,
        followUp,
        onText: () => undefined,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!result.ok || result.text === undefined) {
      throw transportFailure(result.failure ?? 'AGENT_FAILED');
    }
    return { output: result.text, mode: 'llm' };
  }

  /**
   * 让智能体起草 L3 隔离代码物料（ADR-0117 D12）：只做「模型 ⇄ 规格+代码」。解析、体检、代码词法
   * 检查、沙箱试运行与修复回环都在宿主前端；没配置模型就如实说做不了。
   */
  async draftIsolatedMaterial(input: {
    instruction: string;
    repair?: unknown;
    signal?: AbortSignal;
  }): Promise<AgentMaterialDraftResult> {
    const instruction = input.instruction.trim();
    const repair =
      input.repair === undefined ? undefined : readIsolatedMaterialRepairRequest(input.repair);
    if (repair === null) {
      throw new BadRequestException({
        error: 'AGENT_REPAIR_INVALID',
        message: '修复请求需要上一轮输出与按规格或代码路径整理的体检结论。',
      });
    }
    const settings = resolveAgentLlmSettings(this.config);
    if (settings === null) {
      throw new HttpException(
        {
          error: 'AGENT_NOT_CONFIGURED',
          message:
            '没有配置模型（AGENT_LLM_BASE_URL / AGENT_LLM_API_KEY / AGENT_LLM_MODEL），不能让智能体起草组件。',
        },
        503,
      );
    }
    const followUp: AgentChatMessage[] =
      repair === undefined
        ? []
        : [
            { role: 'assistant', content: repair.output },
            { role: 'user', content: buildIsolatedMaterialRepairPrompt(repair.issues, instruction) },
          ];
    const result = await requestAgentCompletionStream(
      settings,
      AGENT_MATERIAL_ISOLATED_SYSTEM_PROMPT,
      buildIsolatedMaterialUserPrompt(instruction),
      this.logger,
      {
        retry: true,
        followUp,
        onText: () => undefined,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    );
    if (!result.ok || result.text === undefined) {
      throw transportFailure(result.failure ?? 'AGENT_FAILED');
    }
    return { output: result.text, mode: 'llm' };
  }

  /**
   * 流式事件：模型每吐一段正文，就把新写完的部分推给宿主。
   *
   * 骨架（标题、副标题、`layout`）没写齐之前不推任何内容项；同一项只推一次。
   * 推送失败（连接已断）不影响生成本身：断开由 signal 负责中止。
   */
  private streamEvents(emit: (event: AgentStreamEvent) => void): (text: string) => void {
    const sent = new Set<string>();
    let wrote = false;
    let skeleton = false;
    const push = (event: AgentStreamEvent): void => {
      try {
        emit(event);
      } catch (error) {
        this.logger.warn(
          `agent stream event dropped: ${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
    };
    return (text) => {
      if (!wrote) {
        wrote = true;
        push({ type: 'status', phase: 'writing' });
      }
      const found = scanStreamingPaths(text);
      if (!skeleton) {
        const title = parseJson(found.get('title'));
        const subtitle = parseJson(found.get('subtitle'));
        const layout = parseJson(found.get('layout'));
        if (typeof title !== 'string' || typeof subtitle !== 'string' || layout === undefined) {
          return;
        }
        const style = parseJson(found.get('style'));
        skeleton = true;
        push({
          type: 'skeleton',
          title,
          subtitle,
          ...(typeof style === 'string' && style !== '' ? { style } : {}),
          layout,
        });
      }
      for (const [path, raw] of found) {
        if (sent.has(path) || !/\[\d+\]$/.test(path)) continue;
        const value = parseJson(raw);
        if (value === undefined) continue;
        sent.add(path);
        push({ type: 'item', path, value });
      }
    };
  }

  /**
   * 局部修改（ADR-0113 §2.5）：宿主带着会话摘要来，模型输出对 IR 的操作列表。
   * 没配置模型就如实说做不了（不退回任何「猜」）；模型调用失败如实报错。
   */
  async editScreen(input: {
    text: string;
    session: unknown;
    screenId?: string;
    catalog?: unknown;
    references?: readonly Record<string, unknown>[];
    signal?: AbortSignal;
  }): Promise<AgentScreenEditResult> {
    const digest = readSessionDigest(input.session);
    if (digest === null) {
      throw new BadRequestException({
        error: 'AGENT_SESSION_INVALID',
        message: '会话摘要不合法，无法局部修改。',
      });
    }
    const { catalog, references } = await this.resolveContext(input);
    const settings = resolveAgentLlmSettings(this.config);
    if (settings === null) {
      return { summary: '', ops: [], mode: 'deterministic', failure: 'AGENT_NOT_CONFIGURED' };
    }
    const result = await requestAgentCompletion(
      settings,
      buildEditOpsSystemPrompt(catalog, digest, references.prompt),
      buildEditOpsUserPrompt(input.text),
      this.logger,
      { retry: true, ...(input.signal === undefined ? {} : { signal: input.signal }) },
    );
    if (!result.ok || result.text === undefined) {
      throw transportFailure(result.failure ?? 'AGENT_FAILED');
    }
    const edit = readEditOps(result.text);
    if (edit === null) {
      this.logger.warn('agent edit ops rejected by shape validation');
      return { summary: '', ops: [], mode: 'llm', failure: 'AGENT_SPEC_INVALID' };
    }
    return { ...edit, mode: 'llm' };
  }

  /**
   * 目录严格解析；解析不通过直接 400，而不是退化成兜底目录——
   * 目录是宿主自己发的，发错说明集成有 bug，静默降级只会让问题更难查。
   */
  private resolveCatalog(input: unknown): AgentCatalog {
    const parsed = parseAgentCatalog(input);
    if (parsed.ok) return parsed.value;
    const detail = parsed.diagnostics
      .slice(0, 3)
      .map((item: AgentCatalogDiagnostic) => `${item.path || 'catalog'}: ${item.message}`)
      .join('; ');
    throw new BadRequestException({
      error: 'AGENT_CATALOG_INVALID',
      message: detail,
    });
  }

  async editComponents(input: {
    instruction: string;
    components: readonly unknown[];
    signal?: AbortSignal;
  }): Promise<AgentComponentEditResult> {
    const components = readEditableComponents(input.components);
    const instruction = input.instruction.trim();
    if (components === null) {
      return {
        summary: '组件上下文无效，未生成修改。',
        patches: [],
        mode: 'deterministic',
        failure: 'AGENT_COMPONENT_CONTEXT_INVALID',
      };
    }
    if (instruction === '') {
      return {
        summary: '修改指令为空，未生成修改。',
        patches: [],
        mode: 'deterministic',
        failure: 'AGENT_COMPONENT_INSTRUCTION_EMPTY',
      };
    }

    const settings = resolveAgentLlmSettings(this.config);
    let spec = deterministicComponentEdit(instruction, components);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined = spec === null ? undefined : 'AGENT_NOT_CONFIGURED';

    if (settings !== null) {
      const result = await requestAgentCompletion(
        settings,
        AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
        buildAgentComponentUserPrompt(instruction, components),
        this.logger,
        { retry: true, ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );
      if (result.ok && result.text !== undefined) {
        const parsed = parseAgentComponentEditSpec(result.text, components);
        if (parsed === null) {
          failure = 'AGENT_SPEC_INVALID';
          this.logger.warn('component edit spec rejected by validation');
        } else {
          spec = parsed;
          mode = 'llm';
          failure = undefined;
        }
      } else {
        failure = result.failure ?? 'AGENT_FAILED';
      }
    }

    if (spec === null || spec.patches.length === 0) {
      return {
        summary: '没有可安全应用的组件修改。',
        patches: [],
        mode,
        failure: failure ?? 'AGENT_COMPONENT_INSTRUCTION_UNSUPPORTED',
      };
    }
    return {
      summary: spec.summary,
      patches: spec.patches,
      mode,
      ...(failure === undefined ? {} : { failure }),
    };
  }

  /**
   * 统一动作入口：先路由，再分派到既有能力。
   *
   * 这一层存在的唯一理由是"别把修改指令当生成指令"。路由拿不到结论时返回
   * `unsupported`，绝不默认重生成——整屏替换的代价是用户已排好的所有组件。
   */
  async act(input: AgentActInput): Promise<AgentActResult> {
    const text = input.text.trim();
    if (text === '') {
      throw new BadRequestException({
        error: 'AGENT_INSTRUCTION_EMPTY',
        message: '指令为空。',
      });
    }
    const components = input.components ?? [];
    if (input.scope === 'components' && components.length === 0) {
      throw new BadRequestException({
        error: 'AGENT_COMPONENT_CONTEXT_INVALID',
        message: '组件作用域需要携带 components。',
      });
    }
    if (input.scope !== 'components' && components.length > 0) {
      throw new BadRequestException({
        error: 'AGENT_SCOPE_MISMATCH',
        message: '整屏或画布作用域不应携带 components。',
      });
    }

    const decision = await routeAgentAction({
      text,
      scope: input.scope,
      ...(input.context === undefined ? {} : { digest: input.context }),
      ...(input.canvas === undefined ? {} : { canvasState: input.canvas }),
      hasSession: readSessionDigest(input.session) !== null,
      settings: resolveAgentLlmSettings(this.config),
      logger: this.logger,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (decision.action === 'generate_screen') {
      const generated = await this.generateIntent({
        topic: text,
        ...(input.screenId === undefined ? {} : { screenId: input.screenId }),
        ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
        ...(input.references === undefined ? {} : { references: input.references }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
      });
      return { kind: 'generate_screen', routedBy: decision.routedBy, ...generated };
    }

    if (decision.action === 'edit_screen') {
      const edit = await this.editScreen({
        text,
        session: input.session,
        ...(input.screenId === undefined ? {} : { screenId: input.screenId }),
        ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
        ...(input.references === undefined ? {} : { references: input.references }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return { kind: 'edit_screen', routedBy: decision.routedBy, ...edit };
    }

    if (decision.action === 'edit_components') {
      const edit = await this.editComponents({
        instruction: text,
        components,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return { kind: 'edit_components', routedBy: decision.routedBy, ...edit };
    }

    if (decision.action === 'set_canvas') {
      return { kind: 'set_canvas', routedBy: decision.routedBy, patch: decision.patch };
    }

    return {
      kind: 'unsupported',
      routedBy: decision.routedBy,
      reason: decision.reason,
      ...(decision.suggestion === undefined ? {} : { suggestion: decision.suggestion }),
    };
  }
}

/**
 * 没配模型或模型输出不可用时的兜底：只给版式与占位，不给任何数字。
 *
 * 旧实现用主题哈希生成「总量 35.5 万」这类确定但虚构的数，画在主视觉上，与真实经营数据无从区分。
 * 现在数值位统一为占位，图表与清单不再伪造序列；副标题明确写出「未生成数据」。
 */
function deterministicSpec(
  topic: string,
  catalog: AgentCatalog,
  references?: ComposeReferences,
): AgentScreenSpec {
  const subject = topic === '' ? '示例大屏' : topic;
  // 兜底只给版式，不给数字：没有模型产物时，任何数值都是伪造的，哪怕是确定性的。
  // 数值位统一写占位，宿主一眼能看出「还没有数据」，而不是把假数当真数画在主视觉上。
  return {
    title: subject,
    subtitle: '未生成数据 · 等待模型或数据源',
    kpis: [
      // 没有数据：value 为 null，编译器画占位「—」，不是 0，也不是随机数。
      { label: '总量', value: null },
      { label: '周转', value: null },
      { label: '缺货', value: null },
      { label: '在途', value: null },
    ],
    blocks: deterministicBlocks(catalog, references) ?? [],
  };
}

/**
 * 兜底也要用目录里的真实物料：有图表就用图表、有素材就用素材，
 * 目录里没有的形态直接不出现，而不是退回写死的 type。
 */
function deterministicBlocks(
  catalog: AgentCatalog,
  references?: ComposeReferences,
): AgentBlock[] | null {
  const chart = pickTabularMaterial(catalog);
  const text = pickTextMaterial(catalog);
  const asset = pickAssetMaterial(catalog);
  const blocks: AgentBlock[] = [];

  // 兜底也必须用上用户引用：模型不可用时，用户选的图和数据集在产物里不能凭空消失。
  const referencedAsset = references?.assets[0];
  if (asset !== undefined && referencedAsset !== undefined) {
    blocks.push({
      type: asset.type,
      title: referencedAsset.name,
      note: '来自本轮引用',
      span: 2,
      assetId: referencedAsset.id,
    });
  }
  const referencedDataset = references?.datasets[0];
  if (chart !== undefined && referencedDataset !== undefined) {
    blocks.push({
      type: chart.type,
      title: referencedDataset.name,
      note: '来自本轮引用数据集',
      span: 2,
      datasetId: referencedDataset.datasetId,
    });
  }
  if (text !== undefined) {
    blocks.push({
      type: text.type,
      title: '重点事项',
      note: '待生成',
      span: blocks.length === 0 ? 2 : 1,
      text: ['· 等待模型生成或数据源接入', '· 数据未就绪，暂不展示指标'].join('\n'),
    });
  }
  const firstAsset = catalog.assets[0];
  if (asset !== undefined && firstAsset !== undefined && referencedAsset === undefined) {
    blocks.push({
      type: asset.type,
      title: '现场图',
      note: firstAsset.name,
      span: 1,
      assetId: firstAsset.id,
    });
  }
  return blocks.length === 0 ? null : blocks;
}

/** 能承载「维度 + 度量」的表格型物料，优先图表类。 */
function pickTabularMaterial(catalog: AgentCatalog): AgentCatalogMaterial | undefined {
  const tabular = catalog.materials.filter((material) => material.data === 'tabular');
  const withRoles = tabular.filter((material) => material.roles.length > 0);
  return withRoles.find((material) => material.category.includes('数据')) ?? withRoles[0];
}

/** 解析模型输出：只认目录驱动的 `blocks`。 */
export function parseCatalogSpec(
  text: string,
  catalog: AgentCatalog,
  warnings: string[] = [],
  issues?: AgentParseIssues,
): AgentScreenSpec | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const subtitle = typeof record.subtitle === 'string' ? record.subtitle.trim() : '';
  if (title === '' || subtitle === '') return null;
  if (!Array.isArray(record.kpis)) return null;
  const kpis = readKpis(record.kpis, warnings, issues);
  // 从 3 条放宽到 1 条：少一条 KPI 不值得把整屏作废，排版会按实际数量分栏。
  if (kpis.length < 1) return null;

  // `blocks` 是唯一的块形态（ADR-0111 §2.6）：缺它，或同时出现自有 `panels` 键，都是非法 spec。
  if (!Array.isArray(record.blocks) || Object.prototype.hasOwnProperty.call(record, 'panels')) {
    return null;
  }
  // 块全被丢掉时仍返回 spec（blocks 为空）：调用方要区分"文档非法"与"没有可用块"，
  // 后者应该保留标题/KPI 再补确定性布局，而不是整屏作废。
  return {
    title: title.slice(0, 20),
    subtitle: subtitle.slice(0, 40),
    ...(typeof record.style === 'string' ? { style: record.style.trim() } : {}),
    kpis,
    blocks: readBlocks(record.blocks, catalog, warnings, issues),
  };
}

/** 模型调用失败 → HTTP 异常：超时 504、取消 499，其余（不可达、上游 HTTP 错误、空响应）502。 */
function transportFailure(failure: string): HttpException {
  const status = failure === 'AGENT_TIMEOUT' ? 504 : failure === 'AGENT_CANCELLED' ? 499 : 502;
  return new HttpException(
    {
      error: failure,
      message: `${describeTransportFailure(failure)}，本次没有生成候选，可稍后重试。`,
    },
    status,
  );
}

function describeTransportFailure(failure: string): string {
  if (failure === 'AGENT_TIMEOUT') return '模型响应超时';
  if (failure === 'AGENT_UNREACHABLE') return '连不上模型服务';
  if (failure === 'AGENT_EMPTY_RESPONSE') return '模型返回为空';
  if (failure === 'AGENT_CANCELLED') return '请求已取消';
  const status = /^AGENT_HTTP_(\d{3})$/.exec(failure)?.[1];
  return status === undefined ? '模型调用失败' : `模型服务返回错误（HTTP ${status}）`;
}

const KPI_DELTA_UNITS = new Set(['percent', 'point', 'absolute']);
const KPI_DIRECTIONS = new Set(['up-good', 'down-good', 'neutral']);

/**
 * 指标逐条校验（ADR-0112 §2.4）：数值必须是有限数字，单位与格式化交给编译器。
 * 不合格的一条丢掉并记修复诊断；增减量写错只丢增减量，不丢指标本身。
 */
function readKpis(
  value: readonly unknown[],
  warnings: string[],
  issues?: AgentParseIssues,
): AgentKpi[] {
  const kpis: AgentKpi[] = [];
  for (const [index, item] of value.slice(0, 5).entries()) {
    const kpi = asRecord(item);
    const label = typeof kpi?.label === 'string' ? kpi.label.trim() : '';
    const raw = kpi?.value;
    if (kpi === null || label === '' || typeof raw !== 'number' || !Number.isFinite(raw)) {
      warnings.push('AGENT_KPI_INVALID');
      issues?.issues.push(kpiIssue('AGENT_KPI_INVALID', index));
      continue;
    }
    const unit = typeof kpi.unit === 'string' ? kpi.unit.trim().slice(0, 6) : '';
    const precision =
      typeof kpi.precision === 'number' && Number.isInteger(kpi.precision)
        ? Math.min(3, Math.max(0, kpi.precision))
        : undefined;
    const delta = asRecord(kpi.delta);
    const deltaValue = delta?.value;
    const validDelta =
      delta !== null &&
      typeof deltaValue === 'number' &&
      Number.isFinite(deltaValue) &&
      typeof delta.unit === 'string' &&
      KPI_DELTA_UNITS.has(delta.unit) &&
      typeof delta.direction === 'string' &&
      KPI_DIRECTIONS.has(delta.direction);
    if (kpi.delta !== undefined && !validDelta) {
      warnings.push('AGENT_KPI_DELTA_DROPPED');
      issues?.issues.push(kpiIssue('AGENT_KPI_DELTA_DROPPED', index));
    }
    kpis.push({
      label: label.slice(0, 12),
      value: raw,
      ...(unit === '' ? {} : { unit }),
      ...(precision === undefined ? {} : { precision }),
      ...(validDelta
        ? {
            delta: {
              value: deltaValue,
              unit: delta.unit as AgentKpiDelta['unit'],
              direction: delta.direction as AgentKpiDelta['direction'],
            },
          }
        : {}),
    });
  }
  return kpis;
}

/**
 * 块逐项校验。
 *
 * 原则：**单块瑕疵只降级该块**，不做整份拒绝——整份拒绝的代价是整屏掉进模板，
 * 用户已经排好的内容全没了。只有"一条块都用不了"才交给调用方退回确定性布局。
 * 所有降级都记进 `warnings`，由提案理由如实告诉用户。
 */
function readBlocks(
  value: readonly unknown[],
  catalog: AgentCatalog,
  warnings: string[],
  issues?: AgentParseIssues,
): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  // 被丢弃的块记成修复诊断（路径指回模型原文的第几块）；保留下来的块记下原始下标。
  const drop = (code: string, index: number) => {
    warnings.push(code);
    issues?.issues.push(blockIssue(code, index));
  };
  const keep = (block: AgentBlock, index: number) => {
    blocks.push(block);
    issues?.blockIndexes.push(index);
  };
  for (const [index, item] of value.slice(0, 4).entries()) {
    const block = asRecord(item);
    if (block === null) {
      drop('AGENT_BLOCK_INVALID', index);
      continue;
    }
    const type = typeof block.type === 'string' ? block.type.trim() : '';
    const material = catalog.materials.find((candidate) => candidate.type === type);
    if (type === '' || material === undefined || material.children === true) {
      drop('AGENT_BLOCK_TYPE_UNKNOWN', index);
      continue;
    }

    let title = typeof block.title === 'string' ? block.title.trim() : '';
    if (title.length > 24) {
      title = title.slice(0, 24);
      warnings.push('AGENT_BLOCK_TEXT_TRIMMED');
    }
    let note = typeof block.note === 'string' ? block.note.trim() : '';
    if (note.length > 32) {
      note = note.slice(0, 32);
      warnings.push('AGENT_BLOCK_TEXT_TRIMMED');
    }
    const rawSpan = typeof block.span === 'number' ? Math.round(block.span) : 1;
    const span = Math.min(4, Math.max(1, Number.isFinite(rawSpan) ? rawSpan : 1));
    if (span !== rawSpan) warnings.push('AGENT_BLOCK_SPAN_CLAMPED');

    const props = readBlockProps(block.props, material, warnings);
    const base = {
      type,
      title,
      span,
      ...(note === '' ? {} : { note }),
      ...(props === undefined ? {} : { props }),
    };

    if (material.data === 'tabular') {
      // 数据型块二选一：给 `datasetId` 表示用用户引用的真实数据集，给 `table` 才是示例数据。
      // 这里只收下 id，认不认得出这个数据集由编译器按本轮引用判断（认不出会记警告并回落表格）。
      const datasetId = typeof block.datasetId === 'string' ? block.datasetId.trim() : '';
      if (datasetId !== '') {
        keep({ ...base, datasetId }, index);
        continue;
      }
      const table = readBlockTable(block.table, warnings);
      if (table === null) {
        drop('AGENT_BLOCK_DATA_MISSING', index);
        continue;
      }
      keep({ ...base, table }, index);
      continue;
    }
    if (material.data === 'scalar') {
      let text = typeof block.text === 'string' ? block.text.trim() : '';
      const assetId = typeof block.assetId === 'string' ? block.assetId.trim() : '';
      if (assetId !== '') {
        if (!material.asset || !catalog.assets.some((asset) => asset.id === assetId)) {
          drop('AGENT_ASSET_UNKNOWN', index);
          continue;
        }
        keep({ ...base, assetId }, index);
        continue;
      }
      if (text === '') {
        drop('AGENT_BLOCK_DATA_MISSING', index);
        continue;
      }
      if (text.length > 160) {
        text = text.slice(0, 160);
        warnings.push('AGENT_BLOCK_TEXT_TRIMMED');
      }
      keep({ ...base, text }, index);
      continue;
    }
    keep(base, index);
  }
  return blocks;
}

function readBlockProps(
  value: unknown,
  material: AgentCatalogMaterial,
  warnings: string[],
): Record<string, string | number | boolean> | undefined {
  if (value === undefined) return undefined;
  const record = asRecord(value);
  if (record === null) {
    warnings.push('AGENT_BLOCK_PROPS_DROPPED');
    return undefined;
  }
  const keys = Object.keys(record);
  if (keys.length > 8) warnings.push('AGENT_BLOCK_PROPS_DROPPED');
  const output: Record<string, string | number | boolean> = {};
  for (const key of keys.slice(0, 8)) {
    const declared = material.props[key];
    const raw = record[key];
    if (declared === undefined) {
      warnings.push('AGENT_BLOCK_PROPS_DROPPED');
      continue;
    }
    if (declared.kind === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        warnings.push('AGENT_BLOCK_PROPS_DROPPED');
        continue;
      }
      output[key] = raw;
      continue;
    }
    if (declared.kind === 'boolean') {
      if (typeof raw !== 'boolean') {
        warnings.push('AGENT_BLOCK_PROPS_DROPPED');
        continue;
      }
      output[key] = raw;
      continue;
    }
    if (typeof raw !== 'string') {
      warnings.push('AGENT_BLOCK_PROPS_DROPPED');
      continue;
    }
    if (declared.kind === 'enum' && declared.values?.includes(raw) !== true) {
      warnings.push('AGENT_BLOCK_PROPS_DROPPED');
      continue;
    }
    output[key] = raw.slice(0, 80);
  }
  return Object.keys(output).length === 0 ? undefined : output;
}

/**
 * 表格载荷：列与行都裁剪到可渲染范围，列类型与值不符就把该列退化为文本。
 *
 * 早先任何一处不符都 return null，于是模型多写一行、写错一个类型，整屏就作废。
 */
function readBlockTable(value: unknown, warnings: string[]): AgentBlockTable | null {
  const table = asRecord(value);
  if (table === null) return null;
  if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) return null;
  if (table.columns.length < 1 || table.rows.length < 1) return null;

  if (table.columns.length > 4) warnings.push('AGENT_BLOCK_COLUMNS_TRIMMED');
  const columns: AgentBlockColumn[] = [];
  for (const item of table.columns.slice(0, 4)) {
    const column = asRecord(item);
    if (column === null) return null;
    const id = typeof column.id === 'string' ? column.id.trim() : '';
    const rawLabel = typeof column.label === 'string' ? column.label.trim() : '';
    const type = column.type;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(id)) return null;
    if (rawLabel === '') return null;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') return null;
    if (columns.some((existing) => existing.id === id)) return null;
    let label = rawLabel;
    if (label.length > 12) {
      label = label.slice(0, 12);
      warnings.push('AGENT_BLOCK_TEXT_TRIMMED');
    }
    columns.push({ id, label, type });
  }

  if (table.rows.length > 8) warnings.push('AGENT_BLOCK_ROWS_TRIMMED');
  const coerced = new Set<string>();
  const rows: Record<string, string | number | boolean>[] = [];
  for (const item of table.rows.slice(0, 8)) {
    const row = asRecord(item);
    if (row === null) {
      warnings.push('AGENT_BLOCK_INVALID');
      continue;
    }
    const output: Record<string, string | number | boolean> = {};
    for (const column of columns) {
      const raw = row[column.id];
      if (column.type === 'number') {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          output[column.id] = raw;
          continue;
        }
        coerced.add(column.id);
        output[column.id] = raw === undefined || raw === null ? '' : String(raw).slice(0, 24);
        continue;
      }
      if (column.type === 'boolean') {
        if (typeof raw === 'boolean') {
          output[column.id] = raw;
          continue;
        }
        coerced.add(column.id);
        output[column.id] = raw === undefined || raw === null ? '' : String(raw).slice(0, 24);
        continue;
      }
      output[column.id] = raw === undefined || raw === null ? '' : String(raw).slice(0, 24);
    }
    rows.push(output);
  }
  if (rows.length === 0) return null;
  if (coerced.size > 0) warnings.push('AGENT_BLOCK_COLUMN_COERCED');

  return {
    columns: columns.map((column) =>
      coerced.has(column.id) ? { ...column, type: 'string' as const } : column,
    ),
    rows,
  };
}

/** 降级码 → 能直接念给用户的一句话。宿主不再自己维护一份码表。 */
export const WARNING_MESSAGES: Readonly<Record<string, string>> = {
  AGENT_BLOCK_TYPE_UNKNOWN: '有模块用了目录里没有的组件，已跳过',
  AGENT_ASSET_UNKNOWN: '有模块的素材不在授权清单里，已跳过',
  AGENT_BLOCK_DATA_MISSING: '有模块缺少数据，已跳过',
  AGENT_BLOCK_ROWS_TRIMMED: '表格超过 8 行，已裁剪',
  AGENT_BLOCK_COLUMNS_TRIMMED: '表格超过 4 列，已裁剪',
  AGENT_BLOCK_COLUMN_COERCED: '有列的值与声明类型不符，已按文本处理',
  AGENT_BLOCK_PROPS_DROPPED: '有组件参数不在目录声明里，已忽略',
  AGENT_BLOCK_SPAN_CLAMPED: '有模块宽度越界，已收进 1–4 列',
  AGENT_BLOCK_TEXT_TRIMMED: '有文案超出长度上限，已截断',
  AGENT_BLOCK_INVALID: '有模块结构不完整，已跳过',
  AGENT_BLOCK_BINDING_UNSATISFIED: '有模块的列不满足绑定角色，已退化为无数据',
  AGENT_DATASET_UNKNOWN: '引用的数据集不在本轮上下文里，已改用示例数据',
  AGENT_DATASET_PARAM_REQUIRED: '引用的数据集需要先指定参数（例如产线），该模块已跳过',
  AGENT_BLOCKS_ALL_INVALID: '模型给的分块都不可用，已改用确定性布局',
  AGENT_BLOCKS_DROPPED: '有模块经修复仍不可用，已去掉，其余照常交出',
  AGENT_KPI_INVALID: '有指标数值不合格，已去掉',
  AGENT_KPI_DELTA_DROPPED: '有指标的增减量不合格，已只保留数值',
  AGENT_ASSET_CATALOG_UNAVAILABLE: '素材目录不可用，本次未使用宿主图片',
};

function summaryOf(
  summaries: ReadonlyMap<string, PromptDataSummary>,
  datasetId: string,
): { summary?: PromptDataSummary } {
  const summary = summaries.get(datasetId);
  return summary === undefined ? {} : { summary };
}

function describeWarning(code: string): string {
  return WARNING_MESSAGES[code] ?? '部分内容已降级';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 未配置模型时的确定性兜底，写成意图层 IR 的 JSON（平铺写法）：只给版面与占位，不给任何数字——
 * 指标值为 null，宿主编译时画「—」；编译与审计与模型产物走同一条链。
 */
function deterministicIntent(
  topic: string,
  catalog: AgentCatalog,
  references?: ComposeReferences,
): Record<string, unknown> {
  const spec = deterministicSpec(topic, catalog, references);
  return { title: spec.title, subtitle: spec.subtitle, kpis: spec.kpis, blocks: spec.blocks };
}

function parseJson(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

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
import { requestAgentCompletion, resolveAgentLlmSettings } from './agent-client';
import {
  AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
  type AgentComponentPatch,
  buildAgentComponentUserPrompt,
  deterministicComponentEdit,
  parseAgentComponentEditSpec,
  readEditableComponents,
} from './agent-component-edit';
import { type ComposeReferences, composeScreenDocument } from './agent-compose';
import {
  type AgentIntentScope,
  type AgentRoutedBy,
  type AgentUnsupportedReason,
  routeAgentAction,
} from './agent-route';
import type { AgentPromptReferences } from './agent-spec';
import {
  type AgentBlock,
  type AgentBlockColumn,
  type AgentBlockTable,
  type AgentChartPoint,
  type AgentPanel,
  type AgentScreenSpec,
  buildAgentUserPrompt,
  buildCatalogSystemPrompt,
} from './agent-spec';
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
}

export interface AgentGenerateResult extends Omit<AgentCandidateResult, 'name' | 'document'> {
  readonly screen: ScreenShape;
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
}

/**
 * 统一动作结果：判别联合，宿主按 `kind` 分派。
 *
 * `generate_screen` / `edit_components` 直接摊平既有结果，避免宿主再包一层；
 * `set_canvas` 只回 patch，编译成 `update-canvas` 是宿主的职责。
 */
export type AgentActResult =
  | ({ readonly kind: 'generate_screen'; readonly routedBy: AgentRoutedBy } & AgentCandidateResult)
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
          datasets: { datasetId: string; name: string; columns: { id: string; type: string }[] }[];
        }
      | undefined;
  }> {
    if (raw === undefined || raw.length === 0) return { prompt: undefined, compose: undefined };
    const assets: { id: string; name: string }[] = [];
    const datasets: { datasetId: string; name: string; columns: { id: string; type: string }[] }[] =
      [];
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
          datasets.push({ datasetId, name: definition.name, columns });
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
  }): Promise<AgentCandidateResult> {
    const topic = input.topic.trim();
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
    const catalog: AgentCatalog = {
      ...clientCatalog,
      assets: availableAssets,
    };
    const references = await this.resolveReferences(catalog, input.references);
    const settings = resolveAgentLlmSettings(this.config);

    let spec = deterministicSpec(topic, catalog, references.compose);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined;
    // 解析期的降级（裁行、丢块、丢参数）与编译期的降级合并成一份，供宿主如实展示。
    const parseWarnings: string[] = [];

    if (settings !== null) {
      const result = await requestAgentCompletion(
        settings,
        // 目录随请求到来，所以提示词也是按目录现生成的：宿主装了新物料，下一句话就能用上。
        buildCatalogSystemPrompt(catalog, references.prompt),
        buildAgentUserPrompt(topic),
        this.logger,
      );
      if (result.ok && result.text !== undefined) {
        const parsed = parseCatalogSpec(result.text, catalog, parseWarnings);
        if (parsed === null) {
          failure = 'AGENT_SPEC_INVALID';
          this.logger.warn('agent spec rejected by validation');
        } else if ((parsed.blocks ?? []).length === 0) {
          // 文档结构合法但一块都用不了：保留模型给的标题与 KPI，布局退回确定性块。
          // 直接整屏换成模板会把"某一块的错"放大成"整屏都不是你的内容"。
          const fallback = deterministicSpec(topic, catalog, references.compose);
          spec = { ...parsed, blocks: fallback.blocks ?? [] };
          mode = 'deterministic';
          failure = 'AGENT_BLOCKS_ALL_INVALID';
          parseWarnings.push('AGENT_BLOCKS_ALL_INVALID');
          this.logger.warn('agent spec has no usable blocks; fell back to deterministic layout');
        } else {
          spec = parsed;
          mode = 'llm';
        }
      } else {
        failure = result.failure ?? 'AGENT_FAILED';
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
    };
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
      settings: resolveAgentLlmSettings(this.config),
      logger: this.logger,
    });

    if (decision.action === 'generate_screen') {
      const candidate = await this.generateCandidate({
        topic: text,
        ...(input.screenId === undefined ? {} : { screenId: input.screenId }),
        ...(input.catalog === undefined ? {} : { catalog: input.catalog }),
        ...(input.references === undefined ? {} : { references: input.references }),
      });
      return { kind: 'generate_screen', routedBy: decision.routedBy, ...candidate };
    }

    if (decision.action === 'edit_components') {
      const edit = await this.editComponents({ instruction: text, components });
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

/** 兜底数值占位：明确表示「没有数据」，不是 0，也不是随机数。 */
const PENDING_VALUE = '—';

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
      { label: '总量', value: PENDING_VALUE },
      { label: '周转', value: PENDING_VALUE },
      { label: '缺货', value: PENDING_VALUE },
      { label: '在途', value: PENDING_VALUE },
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

/**
 * 解析模型输出。优先读 v2 的 `blocks`（目录驱动）；仍收到 v1 的 `panels` 时按目录折算成块，
 * 保证旧客户端/旧模型的输出不会因为升级而直接报错。
 */
export function parseCatalogSpec(
  text: string,
  catalog: AgentCatalog,
  warnings: string[] = [],
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
  const kpis = record.kpis
    .slice(0, 5)
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const kpi = item as Record<string, unknown>;
      const label = typeof kpi.label === 'string' ? kpi.label.trim() : '';
      const value = typeof kpi.value === 'string' ? kpi.value.trim() : '';
      if (label === '' || value === '') return null;
      const delta = typeof kpi.delta === 'string' ? kpi.delta.trim() : undefined;
      return { label, value, ...(delta === undefined || delta === '' ? {} : { delta }) };
    })
    .filter((item): item is { label: string; value: string; delta?: string } => item !== null);
  // 从 3 条放宽到 1 条：少一条 KPI 不值得把整屏作废，排版会按实际数量分栏。
  if (kpis.length < 1) return null;

  if (Array.isArray(record.blocks)) {
    // 块全被丢掉时仍返回 spec（blocks 为空）：调用方要区分"文档非法"与"没有可用块"，
    // 后者应该保留标题/KPI 再补确定性布局，而不是整屏作废。
    return {
      title: title.slice(0, 20),
      subtitle: subtitle.slice(0, 40),
      ...(typeof record.style === 'string' ? { style: record.style.trim() } : {}),
      kpis,
      blocks: readBlocks(record.blocks, catalog, warnings),
    };
  }

  if (Array.isArray(record.panels)) {
    const panels = readPanels(record.panels);
    if (panels === null) return null;
    const blocks = panelsToBlocks(panels, catalog);
    if (blocks === null) return null;
    return { title: title.slice(0, 20), subtitle: subtitle.slice(0, 40), kpis, blocks };
  }
  return null;
}

/**
 * v2 块逐项校验。
 *
 * 原则：**单块瑕疵只降级该块**，不做整份拒绝——整份拒绝的代价是整屏掉进模板，
 * 用户已经排好的内容全没了。只有"一条块都用不了"才交给调用方退回确定性布局。
 * 所有降级都记进 `warnings`，由提案理由如实告诉用户。
 */
function readBlocks(
  value: readonly unknown[],
  catalog: AgentCatalog,
  warnings: string[],
): AgentBlock[] {
  const blocks: AgentBlock[] = [];
  for (const item of value.slice(0, 4)) {
    const block = asRecord(item);
    if (block === null) {
      warnings.push('AGENT_BLOCK_INVALID');
      continue;
    }
    const type = typeof block.type === 'string' ? block.type.trim() : '';
    const material = catalog.materials.find((candidate) => candidate.type === type);
    if (type === '' || material === undefined) {
      warnings.push('AGENT_BLOCK_TYPE_UNKNOWN');
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
        blocks.push({ ...base, datasetId });
        continue;
      }
      const table = readBlockTable(block.table, warnings);
      if (table === null) {
        warnings.push('AGENT_BLOCK_DATA_MISSING');
        continue;
      }
      blocks.push({ ...base, table });
      continue;
    }
    if (material.data === 'scalar') {
      let text = typeof block.text === 'string' ? block.text.trim() : '';
      const assetId = typeof block.assetId === 'string' ? block.assetId.trim() : '';
      if (assetId !== '') {
        if (!material.asset || !catalog.assets.some((asset) => asset.id === assetId)) {
          warnings.push('AGENT_ASSET_UNKNOWN');
          continue;
        }
        blocks.push({ ...base, assetId });
        continue;
      }
      if (text === '') {
        warnings.push('AGENT_BLOCK_DATA_MISSING');
        continue;
      }
      if (text.length > 160) {
        text = text.slice(0, 160);
        warnings.push('AGENT_BLOCK_TEXT_TRIMMED');
      }
      blocks.push({ ...base, text });
      continue;
    }
    blocks.push(base);
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
  AGENT_BLOCKS_ALL_INVALID: '模型给的分块都不可用，已改用确定性布局',
  AGENT_ASSET_CATALOG_UNAVAILABLE: '素材目录不可用，本次未使用宿主图片',
};

function describeWarning(code: string): string {
  return WARNING_MESSAGES[code] ?? '部分内容已降级';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** v1 面板（chart / list / image）按目录折算成块；目录缺对应物料时该面板不出现。 */
function panelsToBlocks(panels: readonly AgentPanel[], catalog: AgentCatalog): AgentBlock[] | null {
  const chart = pickTabularMaterial(catalog);
  const text = pickTextMaterial(catalog);
  const asset = pickAssetMaterial(catalog);
  const blocks: AgentBlock[] = [];
  for (const panel of panels) {
    if (panel.kind === 'chart' && chart !== undefined) {
      blocks.push({
        type: chart.type,
        title: panel.title,
        ...(panel.note === undefined ? {} : { note: panel.note }),
        span: 2,
        table: {
          columns: [
            { id: 'label', label: '维度', type: 'string' },
            { id: 'value', label: '数值', type: 'number' },
          ],
          rows: panel.points.map((point) => ({ label: point.label, value: point.value })),
        },
      });
      continue;
    }
    if (panel.kind === 'list' && text !== undefined) {
      blocks.push({
        type: text.type,
        title: panel.title,
        ...(panel.note === undefined ? {} : { note: panel.note }),
        span: 1,
        text: panel.items.map((item) => `· ${item}`).join('\n'),
      });
      continue;
    }
    if (panel.kind === 'image' && asset !== undefined) {
      const firstAsset = catalog.assets[0];
      if (firstAsset === undefined) continue;
      blocks.push({
        type: asset.type,
        title: panel.title,
        ...(panel.note === undefined ? {} : { note: panel.note }),
        span: 1,
        assetId: firstAsset.id,
      });
    }
  }
  return blocks.length === 0 ? null : blocks;
}

/** 面板逐项校验：图必须有 5–7 个点，清单必须有 3–5 条，缺一个就整份拒绝。 */
function readPanels(value: readonly unknown[]): readonly AgentPanel[] | null {
  const panels: AgentPanel[] = [];
  for (const item of value.slice(0, 4)) {
    if (typeof item !== 'object' || item === null) return null;
    const panel = item as Record<string, unknown>;
    const kind = panel.kind;
    const title = typeof panel.title === 'string' ? panel.title.trim() : '';
    if (title === '') return null;
    const note = typeof panel.note === 'string' ? panel.note.trim() : '';
    const base = { title: title.slice(0, 20), ...(note === '' ? {} : { note: note.slice(0, 40) }) };
    if (kind === 'chart') {
      const points = readChartPoints(panel.points);
      if (points === null) return null;
      panels.push({ kind, ...base, points });
      continue;
    }
    if (kind === 'list') {
      const items = readListItems(panel.items);
      if (items === null) return null;
      panels.push({ kind, ...base, items });
      continue;
    }
    if (kind === 'image') {
      const imageUrl = typeof panel.imageUrl === 'string' ? panel.imageUrl.trim() : '';
      panels.push({
        kind,
        ...base,
        ...(imageUrl.startsWith('https://') ? { imageUrl } : {}),
      });
      continue;
    }
    return null;
  }
  return panels;
}

function readChartPoints(value: unknown): readonly AgentChartPoint[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value.slice(0, 7).map((item): AgentChartPoint | null => {
    if (typeof item !== 'object' || item === null) return null;
    const point = item as Record<string, unknown>;
    const label = typeof point.label === 'string' ? point.label.trim() : '';
    const raw = point.value;
    if (label === '' || label.length > 8) return null;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
    return { label, value: raw };
  });
  const points = parsed.filter((point): point is AgentChartPoint => point !== null);
  if (points.length !== parsed.length) return null;
  if (points.length < 5) return null;
  // 全零的柱形看不出任何信息，等同于没给数据。
  if (points.every((point) => point.value === 0)) return null;
  return points;
}

function readListItems(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.slice(0, 5).map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (items.some((item) => item === '' || item.length > 24)) return null;
  return items.length >= 3 ? items : null;
}

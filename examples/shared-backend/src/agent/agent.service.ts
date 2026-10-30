import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScreenShape } from '../screens/screen.types';
import { ScreensService } from '../screens/screens.service';
import {
  type AgentCatalog,
  type AgentCatalogDiagnostic,
  type AgentCatalogMaterial,
  parseAgentCatalog,
  pickAssetMaterial,
  pickTextMaterial,
} from './agent-catalog';
import { requestAgentCompletion } from './agent-client';
import {
  AGENT_COMPONENT_EDIT_SYSTEM_PROMPT,
  type AgentComponentPatch,
  buildAgentComponentUserPrompt,
  deterministicComponentEdit,
  parseAgentComponentEditSpec,
  readEditableComponents,
} from './agent-component-edit';
import { composeScreenDocument } from './agent-compose';
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
  /** 非阻断降级（例如某块的列满足不了物料绑定角色），屏仍产出。 */
  readonly warnings?: readonly string[];
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

@Injectable()
export class AgentService {
  private readonly logger = new Logger('AgentService');

  constructor(
    private readonly screens: ScreensService,
    private readonly config: ConfigService,
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

  async generateCandidate(input: {
    topic: string;
    catalog?: unknown;
  }): Promise<AgentCandidateResult> {
    const topic = input.topic.trim();
    const catalog = this.resolveCatalog(input.catalog);
    const baseUrl = this.config.get<string>('AGENT_LLM_BASE_URL') ?? '';
    const apiKey = this.config.get<string>('AGENT_LLM_API_KEY') ?? '';
    const model = this.config.get<string>('AGENT_LLM_MODEL') ?? '';

    let spec = deterministicSpec(topic, catalog);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined;

    if (baseUrl !== '' && apiKey !== '' && model !== '') {
      const result = await requestAgentCompletion(
        { baseUrl, apiKey, model },
        // 目录随请求到来，所以提示词也是按目录现生成的：宿主装了新物料，下一句话就能用上。
        buildCatalogSystemPrompt(catalog),
        buildAgentUserPrompt(topic),
        this.logger,
      );
      if (result.ok && result.text !== undefined) {
        const parsed = parseCatalogSpec(result.text, catalog);
        if (parsed === null) {
          failure = 'AGENT_SPEC_INVALID';
          this.logger.warn('agent spec rejected by validation');
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

    const composed = composeScreenDocument({ spec, catalog });
    if (!composed.ok) {
      const [diagnostic] = composed.diagnostics;
      return {
        name: spec.title,
        document: emptyDocument(),
        mode,
        imageCount: 0,
        catalogSource: catalog.source,
        materials: [],
        failure: diagnostic?.code ?? 'AGENT_COMPOSE_FAILED',
      };
    }
    return {
      name: spec.title,
      document: composed.value.document,
      mode,
      imageCount: composed.value.imageCount,
      catalogSource: catalog.source,
      materials: composed.value.materials,
      ...(composed.value.warnings.length === 0
        ? {}
        : { warnings: composed.value.warnings.map((item) => item.code) }),
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

    const baseUrl = this.config.get<string>('AGENT_LLM_BASE_URL') ?? '';
    const apiKey = this.config.get<string>('AGENT_LLM_API_KEY') ?? '';
    const model = this.config.get<string>('AGENT_LLM_MODEL') ?? '';
    let spec = deterministicComponentEdit(instruction, components);
    let mode: 'llm' | 'deterministic' = 'deterministic';
    let failure: string | undefined = spec === null ? undefined : 'AGENT_NOT_CONFIGURED';

    if (baseUrl !== '' && apiKey !== '' && model !== '') {
      const result = await requestAgentCompletion(
        { baseUrl, apiKey, model },
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
}

/**
 * 没配模型或模型输出不可用时的兜底。
 *
 * 兜底也要给全 `points` / `items`——编译器不接受「只有标题、数据留空」的面板，否则又会
 * 退回预设数字。数值按主题哈希确定（同一主题可复现），页脚与副标题会写明未调用模型。
 */
function deterministicSpec(topic: string, catalog: AgentCatalog): AgentScreenSpec {
  const subject = topic === '' ? '示例大屏' : topic;
  const seed = hash(subject);
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const points: AgentChartPoint[] = days.map((label, index) => ({
    label,
    value: 40 + ((seed >>> (index * 3)) % 60),
  }));
  return {
    title: subject.slice(0, 10),
    subtitle: '示例智能体的确定性兜底 · 未调用模型',
    kpis: [
      {
        label: '总量',
        value: `${20 + (seed % 60)}.${seed % 10} 万`,
        delta: `+${seed % 9}.${(seed >>> 3) % 10}%`,
      },
      {
        label: '周转',
        value: `${20 + ((seed >>> 2) % 20)}.${(seed >>> 1) % 10} 天`,
        delta: `-${seed % 5}.${seed % 10}`,
      },
      { label: '缺货', value: `${seed % 30} 家`, delta: `+${seed % 7}` },
      { label: '在途', value: `${3000 + (seed % 2000)} 万` },
    ],
    blocks: deterministicBlocks(subject, points, catalog) ?? [],
  };
}

/**
 * 兜底也要用目录里的真实物料：有图表就用图表、有素材就用素材，
 * 目录里没有的形态直接不出现，而不是退回写死的 type。
 */
function deterministicBlocks(
  subject: string,
  points: readonly AgentChartPoint[],
  catalog: AgentCatalog,
): AgentBlock[] | null {
  const chart = pickTabularMaterial(catalog);
  const text = pickTextMaterial(catalog);
  const asset = pickAssetMaterial(catalog);
  const blocks: AgentBlock[] = [];
  if (chart !== undefined) {
    blocks.push({
      type: chart.type,
      title: '近 7 日趋势',
      note: '按日汇总 · 相对量',
      span: 2,
      table: {
        columns: [
          { id: 'day', label: '日期', type: 'string' },
          { id: 'value', label: '数值', type: 'number' },
        ],
        rows: points.map((point) => ({ day: point.label, value: point.value })),
      },
    });
  }
  if (text !== undefined) {
    blocks.push({
      type: text.type,
      title: '重点事项',
      note: '口径待确认',
      span: blocks.length === 0 ? 2 : 1,
      text: [`· ${subject.slice(0, 12)} 指标口径待确认`, '· 数据源待接入', '· 明细维度待补齐'].join(
        '\n',
      ),
    });
  }
  const firstAsset = catalog.assets[0];
  if (asset !== undefined && firstAsset !== undefined) {
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

/** 空文档：编译失败时返回它，而不是把半成品当成屏交出去。 */
function emptyDocument(): Record<string, unknown> {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
  };
}

/**
 * 解析模型输出。优先读 v2 的 `blocks`（目录驱动）；仍收到 v1 的 `panels` 时按目录折算成块，
 * 保证旧客户端/旧模型的输出不会因为升级而直接报错。
 */
export function parseCatalogSpec(text: string, catalog: AgentCatalog): AgentScreenSpec | null {
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
  if (kpis.length < 3) return null;

  if (Array.isArray(record.blocks)) {
    const blocks = readBlocks(record.blocks, catalog);
    if (blocks === null || blocks.length === 0) return null;
    return { title: title.slice(0, 20), subtitle: subtitle.slice(0, 40), kpis, blocks };
  }

  if (Array.isArray(record.panels)) {
    const panels = readPanels(record.panels);
    if (panels === null) return null;
    const blocks = panelsToBlocks(panels, catalog);
    if (blocks === null || blocks.length === 0) return null;
    return { title: title.slice(0, 20), subtitle: subtitle.slice(0, 40), kpis, blocks };
  }
  return null;
}

/** v2 块逐项校验：type 必须在目录里，数据形态必须与物料声明对得上。 */
function readBlocks(value: readonly unknown[], catalog: AgentCatalog): AgentBlock[] | null {
  const blocks: AgentBlock[] = [];
  for (const item of value.slice(0, 4)) {
    if (typeof item !== 'object' || item === null) return null;
    const block = item as Record<string, unknown>;
    const type = typeof block.type === 'string' ? block.type.trim() : '';
    const material = catalog.materials.find((candidate) => candidate.type === type);
    if (type === '' || material === undefined) return null;
    const title = typeof block.title === 'string' ? block.title.trim() : '';
    if (title.length > 24) return null;
    const note = typeof block.note === 'string' ? block.note.trim() : '';
    if (note.length > 32) return null;
    const span = typeof block.span === 'number' ? Math.round(block.span) : 1;
    if (span < 1 || span > 4) return null;
    const props = readBlockProps(block.props, material);
    if (props === null) return null;

    const base = {
      type,
      title,
      span,
      ...(note === '' ? {} : { note }),
      ...(props === undefined ? {} : { props }),
    };

    if (material.data === 'tabular') {
      const table = readBlockTable(block.table);
      if (table === null) return null;
      blocks.push({ ...base, table });
      continue;
    }
    if (material.data === 'scalar') {
      const text = typeof block.text === 'string' ? block.text.trim() : '';
      const assetId = typeof block.assetId === 'string' ? block.assetId.trim() : '';
      if (assetId !== '') {
        if (!material.asset || !catalog.assets.some((asset) => asset.id === assetId)) return null;
        blocks.push({ ...base, assetId });
        continue;
      }
      if (text === '' || text.length > 160) return null;
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
): Record<string, string | number | boolean> | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 8) return null;
  const output: Record<string, string | number | boolean> = {};
  for (const key of keys) {
    const declared = material.props[key];
    const raw = record[key];
    if (declared === undefined) return null;
    if (declared.kind === 'number') {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
      output[key] = raw;
      continue;
    }
    if (declared.kind === 'boolean') {
      if (typeof raw !== 'boolean') return null;
      output[key] = raw;
      continue;
    }
    if (typeof raw !== 'string') return null;
    if (declared.kind === 'enum' && declared.values?.includes(raw) !== true) return null;
    output[key] = raw.slice(0, 80);
  }
  return output;
}

function readBlockTable(value: unknown): AgentBlockTable | null {
  if (typeof value !== 'object' || value === null) return null;
  const table = value as Record<string, unknown>;
  if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) return null;
  if (table.columns.length < 1 || table.columns.length > 4) return null;
  if (table.rows.length < 3 || table.rows.length > 12) return null;
  const columns: AgentBlockColumn[] = [];
  for (const item of table.columns) {
    if (typeof item !== 'object' || item === null) return null;
    const column = item as Record<string, unknown>;
    const id = typeof column.id === 'string' ? column.id.trim() : '';
    const label = typeof column.label === 'string' ? column.label.trim() : '';
    const type = column.type;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(id)) return null;
    if (label === '' || label.length > 12) return null;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') return null;
    if (columns.some((existing) => existing.id === id)) return null;
    columns.push({ id, label, type });
  }
  const rows: Record<string, string | number | boolean>[] = [];
  for (const item of table.rows) {
    if (typeof item !== 'object' || item === null) return null;
    const row = item as Record<string, unknown>;
    const output: Record<string, string | number | boolean> = {};
    for (const column of columns) {
      const raw = row[column.id];
      if (column.type === 'number') {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
        output[column.id] = raw;
        continue;
      }
      if (column.type === 'boolean') {
        if (typeof raw !== 'boolean') return null;
        output[column.id] = raw;
        continue;
      }
      if (typeof raw !== 'string' && typeof raw !== 'number') return null;
      output[column.id] = String(raw).slice(0, 24);
    }
    rows.push(output);
  }
  return { columns, rows };
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

/** FNV-1a：兜底数值只求稳定可复现，不承担任何业务含义。 */
function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

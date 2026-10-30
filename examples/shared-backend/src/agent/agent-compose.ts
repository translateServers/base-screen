import {
  type AgentCatalog,
  type AgentCatalogMaterial,
  type JsonValue,
  pickAssetMaterial,
  pickSurfaceMaterial,
  pickTextMaterial,
} from './agent-catalog';
import type { AgentBlock, AgentBlockTable, AgentScreenSpec } from './agent-spec';

const WIDTH = 1920;
const HEIGHT = 1080;
const MARGIN = 64;
const GAP = 24;
const CANVAS_BACKGROUND = '#0b1020';

/** 四列栅格：块的 `span` 表示占几列。 */
const COLUMNS = 4;
const TITLE_Y = 44;
const TITLE_HEIGHT = 62;
const SUBTITLE_Y = 112;
const SUBTITLE_HEIGHT = 30;
const KPI_Y = 172;
const KPI_HEIGHT = 148;
const BLOCK_TOP = 348;
const FOOTER_Y = 1020;
const FOOTER_HEIGHT = 26;
const CONTENT_BOTTOM = 996;

const MUTED = '#93a0b0';
const BODY = '#c7d2e0';
const DELTA = '#4fcb6f';
const FOOTER_COLOR = '#8a97a8';

export interface ComposeDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ComposeResult {
  readonly document: Record<string, unknown>;
  /** 用素材身份赋值的组件数。 */
  readonly imageCount: number;
  /** 实际落进文档的物料 type，按首次出现排序去重。 */
  readonly materials: readonly string[];
  /** 降级发生的块（例如列满足不了物料的绑定角色），屏仍然产出，但要如实说明。 */
  readonly warnings: readonly ComposeDiagnostic[];
}

export type ComposeOutcome =
  | { readonly ok: true; readonly value: ComposeResult }
  | { readonly ok: false; readonly diagnostics: readonly ComposeDiagnostic[] };

interface Component {
  id: string;
  type: string;
  name: string;
  parentId: null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  zIndex: number;
  status: { locked: boolean; hidden: boolean };
  props: Record<string, JsonValue>;
  style: Record<string, JsonValue>;
  dataSource: Record<string, unknown> | null;
  dataValue: Record<string, unknown> | null;
  dataBinding?: Record<string, unknown>;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface TextToken {
  readonly fontSize?: number;
  readonly fontWeight?: string;
  readonly color?: string;
}

interface Sink {
  /** 阻断性诊断：出现任意一条就整份失败。 */
  readonly diagnostics: ComposeDiagnostic[];
  /** 非阻断诊断：块降级但屏仍然产出。 */
  readonly warnings: ComposeDiagnostic[];
  readonly dataSources: Record<string, unknown>[];
}

/**
 * 目录驱动编译：模型挑组件与数据，编译器负责把它变成合法文档。
 *
 * 与升级前的三处根本变化：
 * 1. type 不再写死——一律来自 `catalog.materials`，目录里没有的 type 直接判整份 spec 失败；
 * 2. 样式不再猜——起点是物料 manifest 的 `defaultStyle`，只叠加一层设计令牌
 *    （字号 / 字重 / 文字色），且仅在物料声明过该键时才写，避免把不支持的样式塞给渲染器；
 * 3. 数据按物料声明的 `staticData.kind` 编——表格写 `dataValue: inline` + `dataBinding`
 *    （与迁移后的 canonical 形态一致，不再产出 legacy `dataSource`），
 *    素材写 `dataSources` 实例 + `data-source-field` 引用，文档里只留资源身份。
 */
export function composeScreenDocument(input: {
  readonly spec: AgentScreenSpec;
  readonly catalog: AgentCatalog;
}): ComposeOutcome {
  const { spec, catalog } = input;
  const sink: Sink = { diagnostics: [], warnings: [], dataSources: [] };
  const components: Component[] = [];
  const used = new Set<string>();
  let z = 1;
  let imageCount = 0;

  const textMaterial = pickTextMaterial(catalog);
  const surfaceMaterial = pickSurfaceMaterial(catalog);
  const assetMaterial = pickAssetMaterial(catalog);

  const push = (
    material: AgentCatalogMaterial,
    name: string,
    box: Box,
    extra: {
      props?: Record<string, JsonValue>;
      style?: Record<string, JsonValue>;
      dataValue?: Record<string, unknown> | null;
      dataBinding?: Record<string, unknown>;
    } = {},
  ): void => {
    components.push({
      id: `agent-${slug(name)}-${components.length}`,
      type: material.type,
      name,
      parentId: null,
      position: { x: Math.round(box.x), y: Math.round(box.y) },
      size: {
        width: Math.max(1, Math.round(box.width)),
        height: Math.max(1, Math.round(box.height)),
      },
      rotation: 0,
      zIndex: z++,
      status: { locked: false, hidden: false },
      props: { ...material.defaults.props, ...extra.props },
      style: { ...material.defaults.style, ...extra.style },
      dataSource: null,
      dataValue: extra.dataValue ?? null,
      ...(extra.dataBinding === undefined ? {} : { dataBinding: extra.dataBinding }),
    });
    used.add(material.type);
  };

  const pushText = (name: string, value: string, box: Box, token: TextToken = {}): void => {
    if (textMaterial === undefined || value === '') return;
    push(textMaterial, name, box, {
      style: tokenStyle(textMaterial, token),
      dataValue: { kind: 'inline', value },
    });
  };

  const pushSurface = (name: string, box: Box, style?: Record<string, JsonValue>): void => {
    if (surfaceMaterial === undefined) return;
    push(surfaceMaterial, name, box, { style: style ?? {} });
  };

  // 画布背景：不依赖任何业务物料，始终铺一层；是否圆角/描边按物料默认值走。
  pushSurface(
    '背景',
    { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    {
      ...(surfaceMaterial?.defaults.style.borderRadius === undefined ? {} : { borderRadius: 0 }),
      ...(surfaceMaterial?.defaults.style.borderWidth === undefined ? {} : { borderWidth: 0 }),
    },
  );

  pushText(
    '标题',
    spec.title,
    { x: MARGIN, y: TITLE_Y, width: 1200, height: TITLE_HEIGHT },
    {
      fontSize: 46,
      fontWeight: '700',
    },
  );
  pushText(
    '副标题',
    spec.subtitle,
    { x: MARGIN, y: SUBTITLE_Y, width: 1400, height: SUBTITLE_HEIGHT },
    { fontSize: 20, color: MUTED },
  );

  composeKpis(spec, { pushSurface, pushText });

  const blocks = spec.blocks ?? [];
  const rows = packRows(blocks);
  if (rows.length > 0) {
    const columnWidth = Math.floor((WIDTH - MARGIN * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
    const rowHeight = Math.max(
      150,
      Math.floor((CONTENT_BOTTOM - BLOCK_TOP - GAP * (rows.length - 1)) / rows.length),
    );
    rows.forEach((row, rowIndex) => {
      const y = BLOCK_TOP + rowIndex * (rowHeight + GAP);
      let offset = 0;
      for (const block of row) {
        const span = clamp(block.span, 1, COLUMNS);
        compileBlock(
          block,
          {
            x: MARGIN + offset * (columnWidth + GAP),
            y,
            width: columnWidth * span + GAP * (span - 1),
            height: rowHeight,
          },
          { catalog, textMaterial, assetMaterial, push, pushText },
          { sink, onAsset: () => (imageCount += 1) },
        );
        offset += span;
      }
    });
  }

  const modeLabel =
    spec.mode === 'llm'
      ? '模型输出'
      : spec.mode === 'deterministic'
        ? '确定性兜底 · 未调用模型'
        : '';
  pushText(
    '页脚',
    `生成自示例智能体${modeLabel === '' ? '' : ` · ${modeLabel}`} · 组件目录来自宿主设计器（${catalog.materials.length} 种可用物料）`,
    { x: MARGIN, y: FOOTER_Y, width: 1600, height: FOOTER_HEIGHT },
    { fontSize: 14, color: FOOTER_COLOR },
  );

  if (sink.diagnostics.length > 0) return { ok: false, diagnostics: sink.diagnostics };
  if (components.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'AGENT_CATALOG_UNUSABLE',
          path: 'catalog',
          message: '目录里没有可用于排版的基础物料（文本 / 底板 / 素材）。',
        },
      ],
    };
  }

  return {
    ok: true,
    value: {
      imageCount,
      materials: [...used],
      warnings: sink.warnings,
      document: {
        canvas: { width: WIDTH, height: HEIGHT, backgroundColor: CANVAS_BACKGROUND },
        components,
        variables: [],
        ...(sink.dataSources.length === 0 ? {} : { dataSources: sink.dataSources }),
        blueprint: { relations: [] },
      },
    },
  };
}

function composeKpis(
  spec: AgentScreenSpec,
  context: {
    pushSurface: (name: string, box: Box, style?: Record<string, JsonValue>) => void;
    pushText: (name: string, value: string, box: Box, token?: TextToken) => void;
  },
): void {
  const kpis = spec.kpis.slice(0, 5);
  if (kpis.length === 0) return;
  const width = Math.floor((WIDTH - MARGIN * 2 - GAP * (kpis.length - 1)) / kpis.length);
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * (width + GAP);
    context.pushSurface('指标卡', { x, y: KPI_Y, width, height: KPI_HEIGHT });
    context.pushText(
      '指标名',
      kpi.label,
      { x: x + 20, y: KPI_Y + 18, width: width - 40, height: 26 },
      { fontSize: 18, color: MUTED },
    );
    context.pushText(
      '指标值',
      kpi.value,
      { x: x + 20, y: KPI_Y + 50, width: width - 40, height: 54 },
      { fontSize: 42, fontWeight: '700' },
    );
    if (kpi.delta !== undefined && kpi.delta !== '') {
      context.pushText(
        '同比',
        kpi.delta,
        { x: x + 20, y: KPI_Y + 108, width: width - 40, height: 24 },
        { fontSize: 16, color: DELTA },
      );
    }
  });
}

function compileBlock(
  block: AgentBlock,
  box: Box,
  context: {
    catalog: AgentCatalog;
    textMaterial: AgentCatalogMaterial | undefined;
    assetMaterial: AgentCatalogMaterial | undefined;
    push: (
      material: AgentCatalogMaterial,
      name: string,
      box: Box,
      extra?: {
        props?: Record<string, JsonValue>;
        style?: Record<string, JsonValue>;
        dataValue?: Record<string, unknown> | null;
        dataBinding?: Record<string, unknown>;
      },
    ) => void;
    pushText: (name: string, value: string, box: Box, token?: TextToken) => void;
  },
  target: { sink: Sink; onAsset: () => void },
): void {
  const material = context.catalog.materials.find((item) => item.type === block.type);
  if (material === undefined) {
    target.sink.diagnostics.push({
      code: 'AGENT_MATERIAL_UNKNOWN',
      path: `blocks.${block.title}`,
      message: `目录里没有物料 ${block.type}。`,
    });
    return;
  }

  // 先算出这一块到底能不能产出内容，再决定要不要画标题——否则被跳过的块会在画布上
  // 留下一个只有标题的空洞。
  const payload = resolveBlockPayload(material, block, context, target);
  if (payload === null) return;

  const isTextBlock =
    context.textMaterial !== undefined && material.type === context.textMaterial.type;
  const hasTitle = block.title.trim() !== '' && !isTextBlock;
  const hasNote = hasTitle && (block.note ?? '').trim() !== '';
  const headerHeight = hasTitle ? (hasNote ? 62 : 36) : 0;

  if (hasTitle) {
    context.pushText(
      '块标题',
      block.title,
      { x: box.x + 4, y: box.y, width: box.width - 8, height: 28 },
      { fontSize: 21, fontWeight: '700' },
    );
    if (hasNote) {
      context.pushText(
        '块说明',
        block.note ?? '',
        { x: box.x + 4, y: box.y + 30, width: box.width - 8, height: 22 },
        { fontSize: 14, color: MUTED },
      );
    }
  }

  const body: Box = {
    x: box.x,
    y: box.y + headerHeight,
    width: box.width,
    height: box.height - headerHeight,
  };
  const name = block.title.trim() === '' ? material.name : block.title;
  context.push(material, name, isTextBlock ? body : inset(body), {
    props: sanitizeProps(material, block.props),
    ...payload,
  });
}

interface BlockPayload {
  readonly style?: Record<string, JsonValue>;
  readonly dataValue?: Record<string, unknown> | null;
  readonly dataBinding?: Record<string, unknown>;
}

/**
 * 按物料声明的数据形态校验并构造这一块的数据：产不出来就返回 null（调用方据此整块跳过）。
 * 素材身份在这里落成 `dataSources` 实例，组件只留 `data-source-field` 引用。
 */
function resolveBlockPayload(
  material: AgentCatalogMaterial,
  block: AgentBlock,
  context: {
    catalog: AgentCatalog;
    textMaterial: AgentCatalogMaterial | undefined;
  },
  target: { sink: Sink; onAsset: () => void },
): BlockPayload | null {
  if (material.data === 'tabular') {
    const table = block.table;
    if (table === undefined) {
      target.sink.diagnostics.push({
        code: 'AGENT_BLOCK_DATA_MISSING',
        path: `blocks.${block.title}`,
        message: `${material.type} 是数据型组件，但没有给 table。`,
      });
      return null;
    }
    const binding = assignRoles(material, table);
    if (binding === null) {
      // 列满足不了物料的绑定角色时不整屏失败：把这块退成「无数据」的组件，
      // 让物料自己渲染空态，同时把降级原因记进 warnings。
      target.sink.warnings.push({
        code: 'AGENT_BLOCK_BINDING_UNSATISFIED',
        path: `blocks.${block.title}`,
        message: `${material.type} 的绑定角色无法由这 ${table.columns.length} 列满足，该块已退化为无数据。`,
      });
      return {};
    }
    return {
      dataValue: { kind: 'inline', value: toDataSet(table) },
      dataBinding: { fields: binding },
    };
  }

  if (material.data === 'scalar') {
    const assetId = block.assetId ?? '';
    if (assetId !== '') {
      const asset = context.catalog.assets.find((item) => item.id === assetId);
      if (asset === undefined) {
        target.sink.diagnostics.push({
          code: 'AGENT_ASSET_UNKNOWN',
          path: `blocks.${block.title}`,
          message: `素材 ${assetId} 不在宿主素材清单里。`,
        });
        return null;
      }
      const dataSourceId = `agent-ds-${target.sink.dataSources.length + 1}`;
      target.sink.dataSources.push({
        id: dataSourceId,
        name: asset.name,
        source: { kind: 'host-resource', resourceType: 'host_image', resourceId: asset.id },
        params: {},
      });
      target.onAsset();
      return {
        // 配图要铺满它占的那块地方：manifest 默认 contain，整块配图会留一圈黑边。
        ...(typeof material.defaults.style.objectFit === 'string'
          ? { style: { objectFit: 'cover' } }
          : {}),
        dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
      };
    }
    if (material.asset) {
      // 素材型物料只认素材身份。模型偶尔会写 text（"拣选作业现场"）——那会变成一个
      // 不是地址的字符串塞进 img.src，渲染器只能报"图片地址无效"。宁可少这一块。
      target.sink.warnings.push({
        code: 'AGENT_BLOCK_ASSET_REQUIRED',
        path: `blocks.${block.title}`,
        message: `${material.type} 需要 assetId，本次只给了 text，该块已跳过。`,
      });
      return null;
    }
    const text = block.text ?? '';
    if (text === '') {
      target.sink.diagnostics.push({
        code: 'AGENT_BLOCK_DATA_MISSING',
        path: `blocks.${block.title}`,
        message: `${material.type} 是值型组件，但没有给 text。`,
      });
      return null;
    }
    const isTextBlock =
      context.textMaterial !== undefined && material.type === context.textMaterial.type;
    return {
      ...(isTextBlock ? { style: tokenStyle(material, { fontSize: 18, color: BODY }) } : {}),
      dataValue: { kind: 'inline', value: text },
    };
  }

  return {};
}

/** `span` 之和超过四列就换行，保持模型给的顺序。 */
export function packRows(blocks: readonly AgentBlock[]): AgentBlock[][] {
  const rows: AgentBlock[][] = [];
  let current: AgentBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    const span = clamp(block.span, 1, COLUMNS);
    if (used + span > COLUMNS && current.length > 0) {
      rows.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += span;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

/**
 * 把表格列分配到物料的绑定角色。
 *
 * 角色 id 与上下限来自目录（`dataBinding.roles`），这里只按列的值类型匹配：
 * - `columns`：全部列；
 * - `dimension`：第一个非数值列（没有就退回第一列）；
 * - `value` / `measures` / 其它：所有数值列。
 */
function assignRoles(
  material: AgentCatalogMaterial,
  table: AgentBlockTable,
): Record<string, string[]> | null {
  if (material.roles.length === 0) return null;
  const all = table.columns.map((column) => column.id);
  const numeric = table.columns
    .filter((column) => column.type === 'number')
    .map((column) => column.id);
  const nonNumeric = table.columns
    .filter((column) => column.type !== 'number')
    .map((column) => column.id);
  const binding: Record<string, string[]> = {};
  for (const role of material.roles) {
    const id = role.id.toLowerCase();
    let picked: string[];
    if (id === 'columns') picked = all;
    else if (id === 'dimension') picked = nonNumeric.length > 0 ? nonNumeric : all;
    else picked = numeric.length > 0 ? numeric : all;
    const bounded = picked.slice(0, role.max);
    if (bounded.length < role.min) return null;
    binding[role.id] = bounded;
  }
  return binding;
}

function toDataSet(table: AgentBlockTable): JsonValue {
  return {
    fields: table.columns.map((column) => ({
      id: column.id,
      label: column.label,
      valueType: column.type,
      nullable: false,
    })),
    rows: table.rows.map((row) => {
      const output: Record<string, JsonValue> = {};
      for (const column of table.columns) {
        output[column.id] = row[column.id] ?? null;
      }
      return output;
    }),
  };
}

/** 模型给的参数只保留目录声明过的键，并按声明类型收敛。 */
function sanitizeProps(
  material: AgentCatalogMaterial,
  props: Readonly<Record<string, string | number | boolean>> | undefined,
): Record<string, JsonValue> {
  if (props === undefined) return {};
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(props)) {
    const declared = material.props[key];
    if (declared === undefined) continue;
    if (declared.kind === 'enum') {
      if (typeof value === 'string' && declared.values?.includes(value) === true)
        output[key] = value;
      continue;
    }
    if (declared.kind === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
      continue;
    }
    if (declared.kind === 'boolean') {
      if (typeof value === 'boolean') output[key] = value;
      continue;
    }
    if (typeof value === 'string') output[key] = value.slice(0, 160);
  }
  return output;
}

/** 令牌只写物料本来就有的样式键：没有 `fontSize` 的物料不会被塞进字号。 */
function tokenStyle(material: AgentCatalogMaterial, token: TextToken): Record<string, JsonValue> {
  const style = material.defaults.style;
  const output: Record<string, JsonValue> = {};
  if (token.fontSize !== undefined && 'fontSize' in style) output.fontSize = token.fontSize;
  if (token.fontWeight !== undefined && 'fontWeight' in style) output.fontWeight = token.fontWeight;
  if (token.color !== undefined && 'color' in style) output.color = token.color;
  return output;
}

/** 数据组件四周留 16px，避免贴到块标题与块边缘。 */
function inset(box: Box): Box {
  const padding = 16;
  return {
    x: box.x + padding,
    y: box.y + padding,
    width: Math.max(1, box.width - padding * 2),
    height: Math.max(1, box.height - padding * 2),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function slug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return ascii === '' ? 'block' : ascii.slice(0, 24);
}

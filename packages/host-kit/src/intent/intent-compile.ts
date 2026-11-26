import type { ScreenJsonValue } from '@base-screen/contracts';
import { resolveScreenFontFloorPx } from '@base-screen/core';
import { type CompileSink, compileBlock, tokenStyle } from './intent-block.js';
import {
  type IntentCatalog,
  type IntentCatalogMaterial,
  pickSurfaceMaterial,
  pickTextMaterial,
} from './intent-catalog.js';
import type {
  Box,
  CompiledComponent,
  IntentCompileOutcome,
  IntentReferences,
  IntentStreamFrame,
  PushExtra,
  TextToken,
} from './intent-compile-types.js';
import { deltaColor, formatKpiDelta, formatKpiValue } from './intent-format.js';
import {
  BLOCK_TOP,
  COLUMNS,
  CONTENT_BOTTOM,
  clamp,
  distributeRowHeights,
  FOOTER_HEIGHT,
  FOOTER_Y,
  GAP,
  HEIGHT,
  KPI_HEIGHT,
  KPI_Y,
  MARGIN,
  packRows,
  SUBTITLE_HEIGHT,
  SUBTITLE_Y,
  stretchSpans,
  TITLE_HEIGHT,
  TITLE_Y,
  WIDTH,
} from './intent-grid.js';
import { type IntentStylePalette, resolveIntentStyle } from './intent-style.js';
import type { IntentBlock, IntentDiagnostic, IntentKpi, ScreenIntent } from './intent-types.js';

export interface CompileScreenIntentInput {
  readonly intent: ScreenIntent;
  readonly catalog: IntentCatalog;
  readonly references?: IntentReferences;
  /**
   * 产物来源：`llm` 是模型输出（指标值标为示例数据、页脚写「模型输出」），
   * `deterministic` 是确定性兜底（页脚写明未调用模型）。缺省不标注。
   */
  readonly mode?: 'llm' | 'deterministic';
  /**
   * 流式落稿的一帧：给了就按骨架排版，忽略 `intent.regions`（标题 / 副标题 / 风格仍取自 `intent`）。
   * 骨架与内容对不上时以骨架为准——几何从第一帧起不变；对不上的整屏差异由宿主比对后整屏替换。
   */
  readonly stream?: IntentStreamFrame;
}

/** 块的格子：`index` 是它在骨架 / 平铺块列表里的下标，`block` 为空表示内容还没到。 */
interface BlockSlot {
  readonly span: number;
  readonly data: boolean;
  readonly index: number;
  readonly block: IntentBlock | undefined;
}

/** 最多 5 张指标卡。 */
const MAX_KPIS = 5;

/**
 * 目录驱动编译：模型挑组件与数据，编译器负责把它变成合法文档。
 *
 * 1. type 一律来自 `catalog.materials`，目录里没有的 type 只丢该块（降级告警，不整份失败）；
 * 2. 样式起点是物料 manifest 的 `defaultStyle`，只叠加一层设计令牌（字号 / 字重 / 文字色），
 *    且仅在物料声明过该键时才写，避免把不支持的样式塞给渲染器；
 * 3. 数据按物料声明的 `staticData.kind` 编——表格写 `dataValue: inline` + `dataBinding`，
 *    素材写 `dataSources` 实例 + `data-source-field` 引用，文档里只留资源身份。
 *
 * 当前只编译「一条指标带 + 一条栅格」的形态（S2，与迁移前逐字等价）；`split` 与其他区域顺序
 * 返回 `INTENT_LAYOUT_UNSUPPORTED`，等布局求解器（S3）接手。
 */
export function compileScreenIntent(input: CompileScreenIntentInput): IntentCompileOutcome {
  const { intent, catalog, references, stream } = input;
  const palette = resolveIntentStyle(intent.style).palette;
  const sink: CompileSink = { diagnostics: [], warnings: [], dataSources: [] };

  const flat = stream === undefined ? flattenRegions(intent) : undefined;
  if (flat !== undefined && !flat.ok) return { ok: false, diagnostics: flat.diagnostics };
  const kpis = flat?.ok === true ? flat.kpis : [];
  const blocks = flat?.ok === true ? flat.blocks : [];

  const components: CompiledComponent[] = [];
  // 来源表（ADR-0112 §2.1）：组件 id → IR 路径。修复回环靠它把文档诊断翻译回模型能看懂的位置。
  const sources: Record<string, string> = {};
  // `scope` 决定 id 与层级（按「属于 IR 的哪一处 + 在该处的第几个」），`origin` 才是写进来源表的路径：
  // 丢弃坏项后下标会前移，id 仍按位置分段（流式帧之间不漂移，ADR-0112 §2.5），来源表指回模型原文。
  let scope = '';
  let origin = '';
  const at = (path: string, from: string = path): void => {
    scope = path;
    origin = from;
  };
  const used = new Set<string>();
  // 每个来源各自计数：流式落稿时某一处先到、后到，都不会让别处组件的 id 或层级漂移。
  const counters = new Map<string, number>();
  let imageCount = 0;

  const textMaterial = pickTextMaterial(catalog);
  const surfaceMaterial = pickSurfaceMaterial(catalog);

  const push = (
    material: IntentCatalogMaterial,
    name: string,
    box: Box,
    extra: PushExtra = {},
  ): void => {
    const pending = extra.pending === true;
    const local = pending ? PENDING_LAYER : (counters.get(scope) ?? 0);
    if (!pending) counters.set(scope, local + 1);
    const key = scopeKey(scope);
    const id = pending ? `agent-${key}-pending` : `agent-${key}-${local}`;
    sources[id] = origin;
    components.push({
      id,
      type: material.type,
      name,
      parentId: null,
      position: { x: Math.round(box.x), y: Math.round(box.y) },
      size: {
        width: Math.max(1, Math.round(box.width)),
        height: Math.max(1, Math.round(box.height)),
      },
      rotation: 0,
      zIndex: scopeLayer(scope) + local,
      status: { locked: false, hidden: false },
      props: { ...material.defaults.props, ...extra.props },
      style: legibleStyle({ ...material.defaults.style, ...extra.style }),
      dataSource: null,
      dataValue: extra.dataValue ?? null,
      ...(extra.dataBinding === undefined ? {} : { dataBinding: extra.dataBinding }),
    });
    used.add(material.type);
  };

  const pushText = (
    name: string,
    value: string,
    box: Box,
    token: TextToken = {},
    sample = false,
  ): void => {
    if (textMaterial === undefined || value === '') return;
    // 未指定颜色的文字用预设主文字色；否则会落回目录物料的写死默认值，整屏文字色就不随风格变了。
    push(textMaterial, name, box, {
      style: tokenStyle(textMaterial, { color: palette.text, ...token }),
      dataValue: sample ? { kind: 'inline', value, sample: true } : { kind: 'inline', value },
    });
  };

  /**
   * 卡片底板：只给指标卡这类需要视觉承载的块用。
   *
   * 画布背景不铺组件——`canvas.backgroundColor` / `backgroundImage` 本身就是 canonical 配置
   * （设计器「画布 › 背景填充 / 背景图片」直接改它），再铺一块 1920×1080 的矩形等于同一件事
   * 做两遍：多一个挡在最底层、容易误选的假组件，导出体积也白涨。
   */
  const pushSurface = (
    name: string,
    box: Box,
    style?: Record<string, ScreenJsonValue>,
    pending = false,
  ): void => {
    if (surfaceMaterial === undefined) return;
    // 卡片底色来自预设；目录物料的默认填充只是兜底的占位，不能盖过风格。
    push(surfaceMaterial, name, box, {
      style: { fill: palette.card, ...(style ?? {}) },
      ...(pending ? { pending: true } : {}),
    });
  };

  at('title');
  pushText(
    '标题',
    intent.title,
    { x: MARGIN, y: TITLE_Y, width: 1200, height: TITLE_HEIGHT },
    { fontSize: 46, fontWeight: '700' },
  );
  at('subtitle');
  pushText(
    '副标题',
    intent.subtitle,
    { x: MARGIN, y: SUBTITLE_Y, width: 1400, height: SUBTITLE_HEIGHT },
    { fontSize: 20, color: palette.muted },
  );

  const kpiItems: readonly (IntentKpi | undefined)[] = stream?.kpis ?? kpis.slice(0, MAX_KPIS);
  composeKpis(
    kpiItems,
    Math.min(MAX_KPIS, stream?.skeleton.kpis ?? kpiItems.length),
    input.mode,
    { pushSurface, pushText, at },
    palette,
    tintedSurfaceStyle(palette.card),
  );

  // 版面只由骨架决定：普通生成时骨架就是意图自己的块；流式落稿时是模型先给的骨架，
  // 内容按格子落位，还没到的格子画占位框。
  const slots: BlockSlot[] =
    stream === undefined
      ? blocks.map((block, index) => ({
          span: block.span,
          data: block.bind.kind === 'table' || block.bind.kind === 'dataset',
          index,
          block,
        }))
      : stream.skeleton.blocks.map((slot, index) => ({
          span: slot.span,
          data: slot.data,
          index,
          block: stream.blocks[index],
        }));
  const rows = packRows(slots);
  if (rows.length > 0) {
    const columnWidth = Math.floor((WIDTH - MARGIN * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
    // 行高不再平均切：数据块（表格/图表）比文本块更吃纵向空间，按内容权重分配总高。
    const heights = distributeRowHeights(
      rows,
      CONTENT_BOTTOM - BLOCK_TOP - GAP * (rows.length - 1),
    );
    let y = BLOCK_TOP;
    rows.forEach((row, rowIndex) => {
      // 行内 span 补齐到 4 列：单块独占一行时铺满整行，而不是只占半屏、右边留一片空。
      const spans = stretchSpans(row);
      const rowHeight = heights[rowIndex] ?? 240;
      let offset = 0;
      row.forEach((slot, blockIndex) => {
        const span = spans[blockIndex] ?? clamp(slot.span, 1, COLUMNS);
        const box: Box = {
          x: MARGIN + offset * (columnWidth + GAP),
          y,
          width: columnWidth * span + GAP * (span - 1),
          height: rowHeight,
        };
        const path = `blocks[${slot.index}]`;
        at(path, slot.block?.origin ?? path);
        if (slot.block === undefined) {
          pushSurface('占位', box, tintedSurfaceStyle(palette.card), true);
        } else {
          compileBlock(
            slot.block,
            box,
            { catalog, textMaterial, push, pushText, references, palette },
            { sink, onAsset: () => (imageCount += 1) },
          );
        }
        offset += span;
      });
      y += rowHeight + GAP;
    });
  }

  const modeLabel =
    input.mode === 'llm'
      ? '模型输出'
      : input.mode === 'deterministic'
        ? '确定性兜底 · 未调用模型'
        : '';
  // 页脚是编译器自己的内容，不属于 IR 的任何位置。
  at('');
  pushText(
    '页脚',
    `生成自示例智能体${modeLabel === '' ? '' : ` · ${modeLabel}`} · 组件目录来自宿主设计器（${catalog.materials.length} 种可用物料）`,
    { x: MARGIN, y: FOOTER_Y, width: 1600, height: FOOTER_HEIGHT },
    { fontSize: FONT_FLOOR_PX, color: palette.footer },
  );

  if (sink.diagnostics.length > 0) return { ok: false, diagnostics: sink.diagnostics };
  if (components.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
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
      sources,
      document: {
        canvas: { width: WIDTH, height: HEIGHT, backgroundColor: palette.canvas },
        components,
        variables: [],
        ...(sink.dataSources.length === 0 ? {} : { dataSources: sink.dataSources }),
        blueprint: { nodes: [], edges: [] },
      },
    },
  };
}

type Flat =
  | {
      readonly ok: true;
      readonly kpis: readonly IntentKpi[];
      readonly blocks: readonly IntentBlock[];
    }
  | { readonly ok: false; readonly diagnostics: readonly IntentDiagnostic[] };

/** 把区域序列压成「指标带 + 栅格」；其它形态在 S3 之前不编译，如实报出来。 */
function flattenRegions(intent: ScreenIntent): Flat {
  const kpis: IntentKpi[] = [];
  const blocks: IntentBlock[] = [];
  const diagnostics: IntentDiagnostic[] = [];
  let sawBand = false;
  let sawGrid = false;
  for (const [index, region] of intent.regions.entries()) {
    if (region.kind === 'band' && !sawBand && !sawGrid) {
      sawBand = true;
      kpis.push(...region.items);
    } else if (region.kind === 'grid' && !sawGrid) {
      sawGrid = true;
      blocks.push(...region.blocks);
    } else {
      diagnostics.push({
        severity: 'error',
        code: 'INTENT_LAYOUT_UNSUPPORTED',
        path: `regions[${index}]`,
        message: '目前只能编译「一条指标带 + 一条栅格」的版面，这个区域暂不支持。',
      });
    }
  }
  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, kpis, blocks };
}

function composeKpis(
  items: readonly (IntentKpi | undefined)[],
  count: number,
  mode: CompileScreenIntentInput['mode'],
  context: {
    pushSurface: (name: string, box: Box, style?: Record<string, ScreenJsonValue>) => void;
    pushText: (name: string, value: string, box: Box, token?: TextToken, sample?: boolean) => void;
    at: (path: string, from?: string) => void;
  },
  palette: IntentStylePalette,
  cardStyle: Record<string, ScreenJsonValue>,
): void {
  if (count === 0) return;
  const width = Math.floor((WIDTH - MARGIN * 2 - GAP * (count - 1)) / count);
  for (let index = 0; index < count; index += 1) {
    const kpi = items[index];
    const x = MARGIN + index * (width + GAP);
    const path = `kpis[${index}]`;
    context.at(path, kpi?.origin ?? path);
    context.pushSurface('指标卡', { x, y: KPI_Y, width, height: KPI_HEIGHT }, cardStyle);
    // 流式落稿时这一项还没到：只画卡片底板。数值到了在同一张卡上填字，底板 id 与层级不变。
    if (kpi === undefined) continue;
    context.pushText(
      '指标名',
      kpi.label,
      { x: x + 20, y: KPI_Y + 18, width: width - 40, height: 26 },
      { fontSize: 18, color: palette.muted },
    );
    // 模型给的指标值是示例数据；兜底的占位（value 为 null）不是数，不打标记。
    context.pushText(
      '指标值',
      formatKpiValue(kpi),
      { x: x + 20, y: KPI_Y + 50, width: width - 40, height: 54 },
      { fontSize: 42, fontWeight: '700', color: palette.text },
      mode === 'llm' && kpi.value !== null,
    );
    if (kpi.delta !== undefined) {
      context.pushText(
        '同比',
        formatKpiDelta(kpi),
        { x: x + 20, y: KPI_Y + 108, width: width - 40, height: 24 },
        { fontSize: 16, color: deltaColor(kpi.delta, palette) },
      );
    }
  }
}

/**
 * 指标卡的高饱和品牌色降成浅淡的品牌底。
 *
 * 四张纯品牌蓝卡铺在深色画布上会把整屏的视觉重量全抢走；降透明度后保留色相，
 * 又退回到「卡片」的层级。只对高饱和色生效：深灰底板、浅色卡片保持原样。
 */
function tintedSurfaceStyle(fill: string | undefined): Record<string, ScreenJsonValue> {
  const channels = fill === undefined ? null : parseHexColor(fill);
  if (channels === null) return {};
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  if (max === 0) return {};
  const lightness = (max + min) / 510;
  const saturation = (max - min) / (max + min === 0 ? 1 : 255 - Math.abs(max + min - 255));
  if (saturation < 0.45 || lightness > 0.6) return {};
  return { opacity: 0.3 };
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (match === null) return null;
  const hex = match[1] as string;
  const full = hex.length === 3 ? [...hex].map((char) => char + char).join('') : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** 画布宽度对应的可读字号下限（core `resolveScreenFontFloorPx`，1920 宽为 16px）。 */
const FONT_FLOOR_PX = resolveScreenFontFloorPx(WIDTH);

/**
 * 字号兜底到可读下限（ADR-0112 §2.2）：物料默认字号是「随手拖一个」的尺度（表格 13px），
 * 编进 1920 宽的大屏就低于下限。模型不写样式，修复回环也修不了它，只能由编译器抬上来。
 */
function legibleStyle(style: Record<string, ScreenJsonValue>): Record<string, ScreenJsonValue> {
  const size = style.fontSize;
  return typeof size === 'number' && size < FONT_FLOOR_PX
    ? { ...style, fontSize: FONT_FLOOR_PX }
    : style;
}

/** 占位框的层级偏移：落在该块的层级区间末尾，不与块内组件冲突。 */
const PENDING_LAYER = 19;

/** IR 路径 → id 片段：`kpis[1]` → `kpi-1`，`blocks[2]` → `block-2`，编译器自有内容（页脚）→ `footer`。 */
function scopeKey(path: string): string {
  const match = /^(kpis|blocks)\[(\d+)\]$/.exec(path);
  if (match !== null) return `${match[1] === 'kpis' ? 'kpi' : 'block'}-${match[2]}`;
  return path === '' ? 'footer' : path;
}

/**
 * 每个来源的层级区间：标题 1、副标题 2、第 i 张指标卡 10+10i、第 i 块 100+20i、页脚 1000。
 * 区间内按该来源里的先后叠放；区间之间互不重叠，所以哪一处先到都不影响别处的层级。
 */
function scopeLayer(path: string): number {
  if (path === 'title') return 1;
  if (path === 'subtitle') return 2;
  const match = /^(kpis|blocks)\[(\d+)\]$/.exec(path);
  if (match !== null) {
    const index = Number(match[2]);
    return match[1] === 'kpis' ? 10 + index * 10 : 100 + index * 20;
  }
  return 1000;
}

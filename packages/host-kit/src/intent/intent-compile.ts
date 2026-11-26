import type { ScreenJsonValue } from '@base-screen/contracts';
import { resolveScreenFontFloorPx } from '@base-screen/core';
import { type CompileSink, compileBlock, tokenStyle } from './intent-block.js';
import {
  type IntentCatalog,
  type IntentCatalogMaterial,
  pickShellMaterial,
  pickSurfaceMaterial,
  pickTextMaterial,
} from './intent-catalog.js';
import type {
  Box,
  CompiledComponent,
  IntentCompileOutcome,
  IntentReferences,
  IntentSkeleton,
  IntentSkeletonRegion,
  IntentStreamFrame,
  PushExtra,
  TextToken,
} from './intent-compile-types.js';
import {
  deltaColor,
  detectIntentLanguage,
  formatKpiDelta,
  formatKpiValue,
  type IntentLanguage,
} from './intent-format.js';
import {
  FOOTER_HEIGHT,
  FOOTER_Y,
  HEIGHT,
  type LayoutCapacityIssue,
  type LayoutRegion,
  MARGIN,
  type SolvedRegion,
  SUBTITLE_HEIGHT,
  SUBTITLE_Y,
  solveLayout,
  TITLE_HEIGHT,
  TITLE_Y,
  WIDTH,
} from './intent-layout.js';
import { type IntentStylePalette, resolveIntentStyle } from './intent-style.js';
import type {
  IntentBlock,
  IntentDiagnostic,
  IntentKpi,
  IntentRegion,
  ScreenIntent,
} from './intent-types.js';

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

/** 最多 5 张指标卡（平铺写法）；区域写法的上限由求解器的最小卡宽决定。 */
const FLAT_MAX_KPIS = 5;

/** 指标卡内的排版相对卡片左上角。 */
const KPI_CARD_PADDING = 20;

/** 一个格子：位置路径（决定 id 与层级）、模型原文路径（来源表）、已到达的内容。 */
interface KpiSlot {
  readonly path: string;
  readonly kpi: IntentKpi | undefined;
}
interface BlockSlot {
  readonly path: string;
  readonly block: IntentBlock | undefined;
}

/** 编译用的区域：求解器输入（`layout`）+ 每个格子的内容。 */
type CompileRegion =
  | {
      readonly kind: 'band';
      readonly path: string;
      readonly origin: string;
      readonly layout: LayoutRegion;
      readonly kpis: readonly KpiSlot[];
    }
  | {
      readonly kind: 'grid';
      readonly path: string;
      readonly origin: string;
      readonly layout: LayoutRegion;
      readonly blocks: readonly BlockSlot[];
    }
  | {
      readonly kind: 'split';
      readonly path: string;
      readonly origin: string;
      readonly layout: LayoutRegion;
      readonly main: readonly BlockSlot[];
      readonly rail: readonly BlockSlot[];
    };

/**
 * 目录驱动编译：模型挑组件与数据，编译器负责把它变成合法文档。
 *
 * 1. type 一律来自 `catalog.materials`，目录里没有的 type 只丢该块（降级告警，不整份失败）；
 * 2. 样式起点是物料 manifest 的 `defaultStyle`，只叠加一层设计令牌（字号 / 字重 / 文字色），
 *    且仅在物料声明过该键时才写，避免把不支持的样式塞给渲染器；
 * 3. 数据按物料声明的 `staticData.kind` 编——表格写 `dataValue: inline` + `dataBinding`，
 *    素材写 `dataSources` 实例 + `data-source-field` 引用，文档里只留资源身份；
 * 4. 几何由布局求解器（`solveLayout`）按区域序列一次算定，装不下返回 `LAYOUT_CAPACITY_EXCEEDED`。
 */
export function compileScreenIntent(input: CompileScreenIntentInput): IntentCompileOutcome {
  const { intent, catalog, references, stream } = input;
  const palette = resolveIntentStyle(intent.style).palette;
  const language = detectIntentLanguage(intent.title, intent.subtitle);
  const sink: CompileSink = { diagnostics: [], warnings: [], dataSources: [] };

  const regions = stream === undefined ? regionsOf(intent) : regionsOfSkeleton(stream);
  const solved = solveLayout(regions.map((region) => region.layout));
  if (!solved.ok) {
    return {
      ok: false,
      diagnostics: solved.issues.map((issue) => capacityDiagnostic(issue, regions)),
    };
  }

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
  const shellMaterial = pickShellMaterial(catalog);
  // 当前打开的外壳：其后落的组件以它为父级（组合，ADR-0113 §2.4）。
  let shellId: string | null = null;
  // 需要外壳却没有可用外壳：平铺，并在产物里如实说明。
  let flattened = false;

  const push = (
    material: IntentCatalogMaterial,
    name: string,
    box: Box,
    extra: PushExtra = {},
  ): string => {
    const pending = extra.pending === true;
    const where = scopeOf(scope);
    const local = pending ? where.pendingOffset : (counters.get(scope) ?? 0);
    if (!pending) counters.set(scope, local + 1);
    const id = pending ? `agent-${where.key}-pending` : `agent-${where.key}-${local}`;
    sources[id] = origin;
    components.push({
      id,
      type: material.type,
      name,
      parentId: extra.parentId === undefined ? shellId : extra.parentId,
      position: { x: Math.round(box.x), y: Math.round(box.y) },
      size: {
        width: Math.max(1, Math.round(box.width)),
        height: Math.max(1, Math.round(box.height)),
      },
      rotation: 0,
      zIndex: where.layer + local,
      status: { locked: false, hidden: false },
      props: { ...material.defaults.props, ...extra.props },
      style: legibleStyle({ ...material.defaults.style, ...extra.style }),
      dataSource: null,
      dataValue: extra.dataValue ?? null,
      ...(extra.dataBinding === undefined ? {} : { dataBinding: extra.dataBinding }),
    });
    used.add(material.type);
    return id;
  };

  /**
   * 外壳：目录里的容器物料（默认样式，透明无边框），框住它所属的一组组件。
   * 卡片的外观（底板、圆角）仍由里面的底板组件承担，外壳只是「整体」的把手。
   */
  const beginShell = (name: string, box: Box): void => {
    if (shellMaterial === undefined) {
      flattened = true;
      return;
    }
    shellId = push(shellMaterial, name, box, { parentId: null });
  };
  const endShell = (): void => {
    shellId = null;
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

  const cardStyle = tintedSurfaceStyle(palette.card);
  const blockContext = {
    catalog,
    textMaterial,
    push,
    pushText,
    references,
    palette,
    beginShell,
    endShell,
  };
  const blockTarget = { sink, onAsset: () => (imageCount += 1) };
  const drawBlock = (slot: BlockSlot, box: Box): void => {
    at(slot.path, slot.block?.origin ?? slot.path);
    // 流式落稿时这一格还没到：画占位框，内容到了换成真内容。
    if (slot.block === undefined) pushSurface('占位', box, cardStyle, true);
    else compileBlock(slot.block, box, blockContext, blockTarget);
  };

  for (const [index, region] of regions.entries()) {
    const placed = solved.regions[index] as SolvedRegion;
    if (region.kind === 'band' && placed.kind === 'band') {
      region.kpis.forEach((slot, slotIndex) => {
        const box = placed.boxes[slotIndex] as Box;
        at(slot.path, slot.kpi?.origin ?? slot.path);
        // 一张指标卡 = 一个外壳 + 底板 + 文字：整体移动、复制、删除。
        beginShell('指标卡', box);
        pushSurface(shellMaterial === undefined ? '指标卡' : '底板', box, cardStyle);
        // 流式落稿时这一项还没到：只画外壳与底板。数值到了在同一张卡上填字，外壳与底板的 id、层级不变。
        if (slot.kpi !== undefined) drawKpi(slot.kpi, box, palette, input.mode, language, pushText);
        endShell();
      });
    } else if (region.kind === 'grid' && placed.kind === 'grid') {
      region.blocks.forEach((slot, slotIndex) => drawBlock(slot, placed.boxes[slotIndex] as Box));
    } else if (region.kind === 'split' && placed.kind === 'split') {
      region.main.forEach((slot, slotIndex) => drawBlock(slot, placed.main[slotIndex] as Box));
      region.rail.forEach((slot, slotIndex) => drawBlock(slot, placed.rail[slotIndex] as Box));
    }
  }

  const modeLabel =
    input.mode === 'llm'
      ? language === 'en'
        ? 'model output'
        : '模型输出'
      : input.mode === 'deterministic'
        ? language === 'en'
          ? 'deterministic fallback · model not called'
          : '确定性兜底 · 未调用模型'
        : '';
  // 页脚是编译器自己的内容，不属于 IR 的任何位置。
  at('');
  pushText(
    '页脚',
    language === 'en'
      ? `Generated by the sample agent${modeLabel === '' ? '' : ` · ${modeLabel}`} · component catalog from the host designer (${catalog.materials.length} materials)`
      : `生成自示例智能体${modeLabel === '' ? '' : ` · ${modeLabel}`} · 组件目录来自宿主设计器（${catalog.materials.length} 种可用物料）`,
    { x: MARGIN, y: FOOTER_Y, width: 1600, height: FOOTER_HEIGHT },
    { fontSize: FONT_FLOOR_PX, color: palette.footer },
  );

  if (flattened) {
    sink.warnings.push({
      severity: 'warning',
      code: 'INTENT_SHELL_UNAVAILABLE',
      path: '',
      message:
        'The catalog has no material that can hold child components, so cards and blocks were laid out flat instead of as movable groups.',
    });
  }
  if (sink.diagnostics.length > 0) return { ok: false, diagnostics: sink.diagnostics };
  if (components.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'AGENT_CATALOG_UNUSABLE',
          path: 'catalog',
          message: 'The catalog has no basic material to lay out with (text / surface / asset).',
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

// ---------------------------------------------------------------------------
// 区域：意图 / 骨架 → 编译用区域
// ---------------------------------------------------------------------------

/** 平铺写法的区域沿用 `kpis` / `blocks` 路径；区域写法按位置记 `regions[i]`。 */
function regionPath(region: { readonly origin: string }, position: number): string {
  return region.origin === 'kpis' || region.origin === 'blocks'
    ? region.origin
    : `regions[${position}]`;
}

/** 格子的位置路径：决定组件 id 与层级。 */
function slotPath(path: string, part: 'items' | 'blocks' | 'main' | 'rail', index: number): string {
  if (path === 'kpis' || path === 'blocks') return `${path}[${index}]`;
  return `${path}.${part}[${index}]`;
}

const isData = (block: IntentBlock): boolean =>
  block.bind.kind === 'table' || block.bind.kind === 'dataset';

function regionsOf(intent: ScreenIntent): CompileRegion[] {
  return intent.regions.map((region: IntentRegion, position): CompileRegion => {
    const path = regionPath(region, position);
    const slots = (items: readonly IntentBlock[], part: 'blocks' | 'main' | 'rail') =>
      items.map(
        (block, index): BlockSlot => ({ path: block.ident ?? slotPath(path, part, index), block }),
      );
    if (region.kind === 'band') {
      const flat = path === 'kpis';
      const items = flat ? region.items.slice(0, FLAT_MAX_KPIS) : region.items;
      return {
        kind: 'band',
        path,
        origin: region.origin,
        layout: { kind: 'band', count: items.length },
        kpis: items.map(
          (kpi, index): KpiSlot => ({ path: kpi.ident ?? slotPath(path, 'items', index), kpi }),
        ),
      };
    }
    if (region.kind === 'grid') {
      return {
        kind: 'grid',
        path,
        origin: region.origin,
        layout: {
          kind: 'grid',
          slots: region.blocks.map((block) => ({ span: block.span, data: isData(block) })),
        },
        blocks: slots(region.blocks, 'blocks'),
      };
    }
    return {
      kind: 'split',
      path,
      origin: region.origin,
      layout: {
        kind: 'split',
        ratio: region.ratio,
        railSide: region.railSide,
        main: region.main.map((block) => ({ data: isData(block) })),
        rail: region.rail.map((block) => ({ data: isData(block) })),
      },
      main: slots(region.main, 'main'),
      rail: slots(region.rail, 'rail'),
    };
  });
}

function regionsOfSkeleton(frame: IntentStreamFrame): CompileRegion[] {
  const { skeleton } = frame;
  return skeleton.regions.map((region: IntentSkeletonRegion, position): CompileRegion => {
    const path = skeletonRegionPath(skeleton, region, position);
    const slots = (count: number, part: 'blocks' | 'main' | 'rail'): BlockSlot[] =>
      Array.from({ length: count }, (_, index) => {
        const where = slotPath(path, part, index);
        return { path: where, block: frame.blocks[where] };
      });
    if (region.kind === 'band') {
      const count = skeleton.flat === true ? Math.min(region.count, FLAT_MAX_KPIS) : region.count;
      return {
        kind: 'band',
        path,
        origin: path,
        layout: { kind: 'band', count },
        kpis: Array.from({ length: count }, (_, index): KpiSlot => {
          const where = slotPath(path, 'items', index);
          return { path: where, kpi: frame.kpis[where] };
        }),
      };
    }
    if (region.kind === 'grid') {
      return {
        kind: 'grid',
        path,
        origin: path,
        layout: { kind: 'grid', slots: region.slots },
        blocks: slots(region.slots.length, 'blocks'),
      };
    }
    return {
      kind: 'split',
      path,
      origin: path,
      layout: region,
      main: slots(region.main.length, 'main'),
      rail: slots(region.rail.length, 'rail'),
    };
  });
}

function skeletonRegionPath(
  skeleton: IntentSkeleton,
  region: IntentSkeletonRegion,
  position: number,
): string {
  if (skeleton.flat === true) return region.kind === 'band' ? 'kpis' : 'blocks';
  return `regions[${position}]`;
}

function capacityDiagnostic(
  issue: LayoutCapacityIssue,
  regions: readonly CompileRegion[],
): IntentDiagnostic {
  const region = regions[issue.regionIndex];
  const path = region?.origin ?? '';
  const message =
    issue.reason === 'width'
      ? `The band needs ${issue.requiredPx}px to keep every card at least 240px wide, but only ${issue.availablePx}px is available; use fewer cards.`
      : `The regions need ${issue.requiredPx}px of height but only ${issue.availablePx}px is available (short by ${issue.requiredPx - issue.availablePx}px); use fewer blocks.`;
  return { severity: 'error', code: 'LAYOUT_CAPACITY_EXCEEDED', path, message };
}

// ---------------------------------------------------------------------------
// 指标卡
// ---------------------------------------------------------------------------

function drawKpi(
  kpi: IntentKpi,
  box: Box,
  palette: IntentStylePalette,
  mode: CompileScreenIntentInput['mode'],
  language: IntentLanguage,
  pushText: (name: string, value: string, box: Box, token?: TextToken, sample?: boolean) => void,
): void {
  const innerWidth = box.width - KPI_CARD_PADDING * 2;
  const x = box.x + KPI_CARD_PADDING;
  pushText(
    '指标名',
    kpi.label,
    { x, y: box.y + 18, width: innerWidth, height: 26 },
    { fontSize: 18, color: palette.muted },
  );
  // 模型给的指标值是示例数据；兜底的占位（value 为 null）不是数，不打标记。
  pushText(
    '指标值',
    formatKpiValue(kpi, language),
    { x, y: box.y + 50, width: innerWidth, height: 54 },
    { fontSize: 42, fontWeight: '700', color: palette.text },
    mode === 'llm' && kpi.value !== null,
  );
  if (kpi.delta !== undefined) {
    pushText(
      '同比',
      formatKpiDelta(kpi, language),
      { x, y: box.y + 108, width: innerWidth, height: 24 },
      { fontSize: 16, color: deltaColor(kpi.delta, palette) },
    );
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

// ---------------------------------------------------------------------------
// id 与层级：位置路径 → 片段
// ---------------------------------------------------------------------------

interface Scope {
  readonly key: string;
  /** 该来源的层级起点；来源内按先后叠放。 */
  readonly layer: number;
  /** 占位框的层级偏移：落在该来源区间的末尾，不与格内组件冲突。 */
  readonly pendingOffset: number;
}

const REGION_PART_KEY = { items: 'k', blocks: 'b', main: 'm', rail: 's' } as const;
const REGION_PART_LAYER = { items: 0, blocks: 0, main: 0, rail: 64 } as const;

/**
 * 位置路径 → id 片段与层级区间：
 * - 平铺写法：`kpis[1]` → `kpi-1`（层级 10+10i）、`blocks[2]` → `block-2`（层级 100+20i）；
 * - 区域写法：`regions[1].blocks[2]` → `r1-b2`，层级 100 + 140r 起，格内 8 层；
 * - 标题 1、副标题 2、编译器自有内容（页脚）→ `footer`，层级 1000。
 * 区间互不重叠于同一屏的可见内容，所以哪一处先到都不影响别处的层级。
 */
function scopeOf(path: string): Scope {
  if (path === 'title') return { key: 'title', layer: 1, pendingOffset: 19 };
  if (path === 'subtitle') return { key: 'subtitle', layer: 2, pendingOffset: 19 };
  if (path === '') return { key: 'footer', layer: 1000, pendingOffset: 19 };
  const flat = /^(kpis|blocks)\[(\d+)\]$/.exec(path);
  if (flat !== null) {
    const index = Number(flat[2]);
    return flat[1] === 'kpis'
      ? { key: `kpi-${index}`, layer: 10 + index * 10, pendingOffset: 19 }
      : { key: `block-${index}`, layer: 100 + index * 20, pendingOffset: 19 };
  }
  const region = /^regions\[(\d+)\]\.(items|blocks|main|rail)\[(\d+)\]$/.exec(path);
  if (region !== null) {
    const part = region[2] as keyof typeof REGION_PART_KEY;
    const r = Number(region[1]);
    const index = Number(region[3]);
    return {
      key: `r${r}-${REGION_PART_KEY[part]}${index}`,
      layer: 100 + r * 140 + REGION_PART_LAYER[part] + index * 8,
      pendingOffset: 7,
    };
  }
  return { key: path, layer: 1000, pendingOffset: 19 };
}

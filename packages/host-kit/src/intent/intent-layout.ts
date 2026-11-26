import type { Box } from './intent-compile-types.js';

/**
 * 布局求解器（ADR-0113 §2.3）：区域序列 + 每格的内容量 → 像素矩形，或容量冲突。
 *
 * 一个纯函数，只读骨架里已有的量（指标个数、每块占几列、是不是数据型），不测字体、不依赖异步资源
 * （AGENTS.md「无抖动」）。骨架不变，几何就不变——流式落稿靠这条把全部位置一次算定（ADR-0112 §2.5）。
 *
 * 装不下就报 `LAYOUT_CAPACITY_EXCEEDED`（带哪个区域、差多少像素），不硬塞：否则「5 块 + 指标带」在
 * 1080 高里会被压成 20px 行高的表格，而不是请模型减块。
 */

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const MARGIN = 64;
export const GAP = 24;

export const TITLE_Y = 44;
export const TITLE_HEIGHT = 62;
export const SUBTITLE_Y = 112;
export const SUBTITLE_HEIGHT = 30;
export const FOOTER_Y = 1026;
export const FOOTER_HEIGHT = 26;

/** 区域从标题区下方开始，到页脚上方结束。 */
export const REGION_TOP = 172;
export const REGION_BOTTOM = 1010;

/** 指标带：一排等宽小卡，固定高度。 */
export const BAND_HEIGHT = 148;
/** 指标卡的最小宽度：再窄，42px 的数值放不下。 */
export const BAND_MIN_CARD_WIDTH = 240;
/** 栅格 / 主侧栏里一行（一格）的最小高度：再矮，表格行高会被压到不可读。 */
export const MIN_ROW_HEIGHT = 120;
/** 数据型块（表格 / 数据集）比文本块更吃纵向空间。 */
const DATA_WEIGHT = 1.35;

/** 四列栅格：块的 `span` 表示占几列。 */
export const COLUMNS = 4;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const COLUMN_WIDTH = Math.floor((CONTENT_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS);

export interface LayoutSlot {
  /** 四列栅格里占几列，1–4；只在 `grid` 区域里有意义。 */
  readonly span: number;
  /** 数据型块行高权重更大。 */
  readonly data: boolean;
}

export type LayoutRegion =
  | { readonly kind: 'band'; readonly count: number }
  | { readonly kind: 'grid'; readonly slots: readonly LayoutSlot[] }
  | {
      readonly kind: 'split';
      readonly ratio: 'wide-narrow' | 'even';
      readonly railSide: 'left' | 'right';
      readonly main: readonly { readonly data: boolean }[];
      readonly rail: readonly { readonly data: boolean }[];
    };

/** 每个区域按其格子的顺序给出矩形（`grid` 按 `slots` 顺序，`split` 分主区与侧栏）。 */
export type SolvedRegion =
  | { readonly kind: 'band'; readonly boxes: readonly Box[] }
  | { readonly kind: 'grid'; readonly boxes: readonly Box[] }
  | {
      readonly kind: 'split';
      readonly main: readonly Box[];
      readonly rail: readonly Box[];
    };

export interface LayoutCapacityIssue {
  readonly regionIndex: number;
  /** `height`：纵向装不下；`width`：指标带里的卡片太多、每张低于最小宽度。 */
  readonly reason: 'height' | 'width';
  readonly requiredPx: number;
  readonly availablePx: number;
}

export type SolveOutcome =
  | { readonly ok: true; readonly regions: readonly SolvedRegion[] }
  | { readonly ok: false; readonly issues: readonly LayoutCapacityIssue[] };

export function solveLayout(regions: readonly LayoutRegion[]): SolveOutcome {
  const issues: LayoutCapacityIssue[] = [];
  const gaps = GAP * Math.max(0, regions.length - 1);

  const plans = regions.map(planRegion);
  for (const [index, plan] of plans.entries()) {
    if (plan.kind === 'band') {
      const width = bandCardWidth(plan.count);
      if (plan.count > 0 && width < BAND_MIN_CARD_WIDTH) {
        issues.push({
          regionIndex: index,
          reason: 'width',
          requiredPx: BAND_MIN_CARD_WIDTH * plan.count + GAP * (plan.count - 1),
          availablePx: CONTENT_WIDTH,
        });
      }
    }
  }

  const fixed = plans.reduce((sum, plan) => sum + (plan.kind === 'band' ? plan.height : 0), 0);
  const flexible = plans.flatMap((plan, index) => (plan.kind === 'band' ? [] : [{ plan, index }]));
  const available = REGION_BOTTOM - REGION_TOP - gaps - fixed;
  const minimum = flexible.reduce((sum, item) => sum + item.plan.minHeight, 0);
  if (flexible.length > 0 && minimum > available) {
    // 指出最吃空间的那个区域：请模型先从它那里减块。
    const biggest = flexible.reduce((best, item) =>
      item.plan.minHeight > best.plan.minHeight ? item : best,
    );
    issues.push({
      regionIndex: biggest.index,
      reason: 'height',
      requiredPx: minimum,
      availablePx: available,
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  // 纵向：指标带固定高，其余区域按内容权重分剩余高度，不低于各自最小高度。
  const heights = new Map<number, number>();
  if (flexible.length > 0) {
    const totalWeight = flexible.reduce((sum, item) => sum + item.plan.weight, 0) || 1;
    const shares = flexible.map((item) =>
      Math.max(item.plan.minHeight, Math.floor((available * item.plan.weight) / totalWeight)),
    );
    let overflow = shares.reduce((sum, share) => sum + share, 0) - available;
    while (overflow > 0) {
      let tallest = 0;
      shares.forEach((share, i) => {
        if (share > (shares[tallest] ?? 0)) tallest = i;
      });
      const reducible = (shares[tallest] ?? 0) - (flexible[tallest]?.plan.minHeight ?? 0);
      if (reducible <= 0) break;
      const cut = Math.min(reducible, overflow);
      shares[tallest] = (shares[tallest] ?? 0) - cut;
      overflow -= cut;
    }
    flexible.forEach((item, i) => heights.set(item.index, shares[i] ?? item.plan.minHeight));
  }

  const solved: SolvedRegion[] = [];
  let y = REGION_TOP;
  for (const [index, plan] of plans.entries()) {
    const height = plan.kind === 'band' ? plan.height : (heights.get(index) ?? plan.minHeight);
    solved.push(placeRegion(plan, y, height));
    y += height + GAP;
  }
  return { ok: true, regions: solved };
}

// ---------------------------------------------------------------------------
// 规划：每个区域需要多少高度
// ---------------------------------------------------------------------------

interface Cell {
  readonly data: boolean;
  readonly index: number;
}

type Plan =
  | { readonly kind: 'band'; readonly count: number; readonly height: number }
  | {
      readonly kind: 'grid';
      readonly rows: readonly (readonly (LayoutSlot & { readonly index: number })[])[];
      readonly weight: number;
      readonly minHeight: number;
    }
  | {
      readonly kind: 'split';
      readonly region: Extract<LayoutRegion, { kind: 'split' }>;
      readonly weight: number;
      readonly minHeight: number;
    };

function planRegion(region: LayoutRegion): Plan {
  if (region.kind === 'band') return { kind: 'band', count: region.count, height: BAND_HEIGHT };
  if (region.kind === 'grid') {
    const rows = packRows(region.slots.map((slot, index) => ({ ...slot, index })));
    return {
      kind: 'grid',
      rows,
      weight: rows.reduce((sum, row) => sum + rowWeight(row), 0),
      minHeight: stackMinimum(rows.length),
    };
  }
  const weight = (cells: readonly { readonly data: boolean }[]) =>
    cells.reduce((sum, cell) => sum + (cell.data ? DATA_WEIGHT : 1), 0);
  return {
    kind: 'split',
    region,
    weight: Math.max(weight(region.main), weight(region.rail)),
    minHeight: stackMinimum(Math.max(region.main.length, region.rail.length)),
  };
}

function rowWeight(row: readonly { readonly data: boolean }[]): number {
  return row.some((cell) => cell.data) ? DATA_WEIGHT : 1;
}

function stackMinimum(rows: number): number {
  return rows === 0 ? 0 : MIN_ROW_HEIGHT * rows + GAP * (rows - 1);
}

// ---------------------------------------------------------------------------
// 落位
// ---------------------------------------------------------------------------

function placeRegion(plan: Plan, y: number, height: number): SolvedRegion {
  if (plan.kind === 'band') {
    const width = bandCardWidth(plan.count);
    const boxes: Box[] = [];
    for (let index = 0; index < plan.count; index += 1) {
      boxes.push({ x: MARGIN + index * (width + GAP), y, width, height });
    }
    return { kind: 'band', boxes };
  }

  if (plan.kind === 'grid') {
    // 行高按内容权重分配：数据块（表格 / 图表）比文本块更吃纵向空间，纯文本与素材块让位。
    const heights = distributeRowHeights(plan.rows, height - GAP * (plan.rows.length - 1));
    const boxes: Box[] = new Array(plan.rows.reduce((sum, row) => sum + row.length, 0));
    let rowY = y;
    plan.rows.forEach((row, rowIndex) => {
      // 行内 span 补齐到 4 列：单块独占一行时铺满整行，而不是只占半屏、右边留一片空。
      const spans = stretchSpans(row);
      const rowHeight = heights[rowIndex] ?? MIN_ROW_HEIGHT;
      let offset = 0;
      row.forEach((slot, slotIndex) => {
        const span = spans[slotIndex] ?? 1;
        boxes[slot.index] = {
          x: MARGIN + offset * (COLUMN_WIDTH + GAP),
          y: rowY,
          width: COLUMN_WIDTH * span + GAP * (span - 1),
          height: rowHeight,
        };
        offset += span;
      });
      rowY += rowHeight + GAP;
    });
    return { kind: 'grid', boxes };
  }

  const { region } = plan;
  const railWidth = region.ratio === 'even' ? Math.floor((CONTENT_WIDTH - GAP) / 2) : COLUMN_WIDTH;
  const mainWidth = region.ratio === 'even' ? railWidth : CONTENT_WIDTH - GAP - railWidth;
  const mainX = region.railSide === 'left' ? MARGIN + railWidth + GAP : MARGIN;
  const railX = region.railSide === 'left' ? MARGIN : MARGIN + mainWidth + GAP;
  return {
    kind: 'split',
    main: stack(region.main, mainX, y, mainWidth, height),
    rail: stack(region.rail, railX, y, railWidth, height),
  };
}

/** 一列纵向堆叠：每格一行，行高按内容权重分。 */
function stack(
  cells: readonly { readonly data: boolean }[],
  x: number,
  y: number,
  width: number,
  height: number,
): Box[] {
  const rows = cells.map((cell, index): readonly Cell[] => [{ data: cell.data, index }]);
  const heights = distributeRowHeights(rows, height - GAP * (rows.length - 1));
  const boxes: Box[] = [];
  let cursor = y;
  for (const [index, rowHeight] of heights.entries()) {
    boxes[index] = { x, y: cursor, width, height: rowHeight };
    cursor += rowHeight + GAP;
  }
  return boxes;
}

function bandCardWidth(count: number): number {
  return count <= 0 ? 0 : Math.floor((CONTENT_WIDTH - GAP * (count - 1)) / count);
}

// ---------------------------------------------------------------------------
// 栅格算术（自 `agent-compose.ts` 原样迁入）
// ---------------------------------------------------------------------------

function clampSpan(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(COLUMNS, Math.max(1, Math.round(value)));
}

/** `span` 之和超过四列就换行，保持模型给的顺序。 */
export function packRows<T extends { readonly span: number }>(blocks: readonly T[]): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const block of blocks) {
    const span = clampSpan(block.span);
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
 * 行内 span 补齐到四列。
 *
 * 模型经常给「一块 span 2 独占一行」，按原样排就只占半屏、右侧留一大片空。
 * 补齐按 span 从大到小逐列分配：单块直接铺满，两块 1+1 变成 2+2，不改相对宽度关系。
 */
export function stretchSpans(row: readonly { readonly span: number }[]): number[] {
  const spans = row.map((block) => clampSpan(block.span));
  let remaining = COLUMNS - spans.reduce((sum, span) => sum + span, 0);
  if (remaining <= 0 || spans.length === 0) return spans;
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort((left, right) => right.span - left.span || left.index - right.index)
    .map((item) => item.index);
  let cursor = 0;
  while (remaining > 0) {
    const index = order[cursor % order.length] as number;
    spans[index] = (spans[index] ?? 1) + 1;
    remaining -= 1;
    cursor += 1;
  }
  return spans;
}

/**
 * 行高按内容权重分配：带 table / 数据集的块更吃纵向空间（表格要放下整表不滚动），
 * 纯文本与素材块让位。分配后再做最小高度兜底，超出总高时从最高的行里回收。
 */
export function distributeRowHeights(
  rows: readonly (readonly { readonly data: boolean }[])[],
  available: number,
): number[] {
  if (rows.length === 0) return [];
  const minHeight = Math.max(MIN_ROW_HEIGHT, Math.min(200, Math.floor(available / rows.length)));
  const weights = rows.map(rowWeight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const heights = weights.map((weight) =>
    Math.max(minHeight, Math.floor((available * weight) / totalWeight)),
  );
  let overflow = heights.reduce((sum, height) => sum + height, 0) - available;
  while (overflow > 0) {
    let tallest = 0;
    heights.forEach((height, index) => {
      if (height > (heights[tallest] ?? 0)) tallest = index;
    });
    const reducible = (heights[tallest] ?? 0) - minHeight;
    if (reducible <= 0) break;
    const cut = Math.min(reducible, overflow);
    heights[tallest] = (heights[tallest] ?? 0) - cut;
    overflow -= cut;
  }
  return heights;
}

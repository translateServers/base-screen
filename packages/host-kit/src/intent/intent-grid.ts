/**
 * 栅格几何（ADR-0113 §2.3，S2 阶段）。
 *
 * S2 要求编译器迁移后行为等价，所以这里把原先写死在 `agent-compose.ts` 的常量与三个纯函数
 * 原样搬来。S3 的布局求解器会取代它们：届时 `COLUMNS`、`KPI_Y`、`BLOCK_TOP`、`CONTENT_BOTTOM`
 * 与 `distributeRowHeights` 一并删除。
 */

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const MARGIN = 64;
export const GAP = 24;

/** 四列栅格：块的 `span` 表示占几列。 */
export const COLUMNS = 4;
export const TITLE_Y = 44;
export const TITLE_HEIGHT = 62;
export const SUBTITLE_Y = 112;
export const SUBTITLE_HEIGHT = 30;
export const KPI_Y = 172;
export const KPI_HEIGHT = 148;
export const BLOCK_TOP = 344;
export const FOOTER_Y = 1026;
export const FOOTER_HEIGHT = 26;
export const CONTENT_BOTTOM = 1010;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** `span` 之和超过四列就换行，保持模型给的顺序。 */
export function packRows<T extends { readonly span: number }>(blocks: readonly T[]): T[][] {
  const rows: T[][] = [];
  let current: T[] = [];
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
 * 行内 span 补齐到四列。
 *
 * 模型经常给「一块 span 2 独占一行」，按原样排就只占半屏、右侧留一大片空。
 * 补齐按 span 从大到小逐列分配：单块直接铺满，两块 1+1 变成 2+2，不改相对宽度关系。
 */
export function stretchSpans(row: readonly { readonly span: number }[]): number[] {
  const spans = row.map((block) => clamp(block.span, 1, COLUMNS));
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
  const minHeight = Math.max(120, Math.min(200, Math.floor(available / rows.length)));
  const weights = rows.map((row) => (row.some((cell) => cell.data) ? 1.35 : 1));
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

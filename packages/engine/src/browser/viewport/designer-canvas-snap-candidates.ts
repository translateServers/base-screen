// 吸附候选派生：从 canonical document 收集画布边、用户 guide 与可见组件的
// 边/中心线候选（对齐坐标 + 参考线局部几何），供 vendored Moveable checkSnapPoses
// 做最近吸附竞争。候选不携带 DOM 引用，是纯数据投影。

import type { ScreenDocument } from '@base-screen/contracts';
import {
  collectDesignerSnapComponentBounds,
  type DesignerSnapComponentBounds,
} from './designer-canvas-snap-geometry.js';

/** 单个吸附候选：对齐坐标 + 参考线几何（起点与长度，参考 Moveable element guidelines 的局部线语义）。 */
export interface DesignerSnapCandidate {
  /** 对齐坐标（x 轴为 value，y 轴为 value）。 */
  readonly value: number;
  /** 参考线起点（正交方向，画布坐标）：组件边为其 top/left，画布/guide 为 0。 */
  readonly start: number;
  /** 参考线长度：组件边为其正交尺寸（height/width），画布/guide 为画布正交尺寸。 */
  readonly size: number;
}

export interface DesignerSnapCandidates {
  readonly x: readonly DesignerSnapCandidate[];
  readonly y: readonly DesignerSnapCandidate[];
}

export function collectDesignerSnapCandidates(
  document: ScreenDocument,
  guides: { readonly x: readonly number[]; readonly y: readonly number[] },
  excludedComponentIds: readonly string[] = [],
): DesignerSnapCandidates {
  return createDesignerSnapCandidates(
    document.canvas,
    guides,
    collectDesignerSnapComponentBounds(document, new Set(excludedComponentIds)),
  );
}

export function createDesignerSnapCandidates(
  canvas: ScreenDocument['canvas'] | undefined,
  guides: { readonly x: readonly number[]; readonly y: readonly number[] },
  components: readonly DesignerSnapComponentBounds[],
): DesignerSnapCandidates {
  if (canvas === undefined) {
    return {
      x: guides.x.map((value) => ({ value, start: 0, size: 0 })),
      y: guides.y.map((value) => ({ value, start: 0, size: 0 })),
    };
  }
  // x 轴候选：画布边（0/宽）+ 用户 guide + 组件边（不含画布中心点候选）。
  const x: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: canvas.height },
    { value: canvas.width, start: 0, size: canvas.height },
    ...guides.x.map((value) => ({ value, start: 0, size: canvas.height })),
  ];
  const y: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: canvas.width },
    { value: canvas.height, start: 0, size: canvas.width },
    ...guides.y.map((value) => ({ value, start: 0, size: canvas.width })),
  ];
  for (const bounds of components) {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    x.push(
      { value: bounds.left, start: bounds.top, size: height },
      { value: bounds.centerX, start: bounds.top, size: height },
      { value: bounds.right, start: bounds.top, size: height },
    );
    y.push(
      { value: bounds.top, start: bounds.left, size: width },
      { value: bounds.centerY, start: bounds.left, size: width },
      { value: bounds.bottom, start: bounds.left, size: width },
    );
  }
  return { x: sortedUniqueCandidates(x), y: sortedUniqueCandidates(y) };
}

// 同值候选合并（长度取更长者），按 value 升序；过滤非有限值。
function sortedUniqueCandidates(
  candidates: readonly DesignerSnapCandidate[],
): readonly DesignerSnapCandidate[] {
  const byValue = new Map<number, DesignerSnapCandidate>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.value)) continue;
    const existing = byValue.get(candidate.value);
    if (existing === undefined || candidate.size > existing.size) {
      byValue.set(candidate.value, candidate);
    }
  }
  return [...byValue.values()].sort((left, right) => left.value - right.value);
}

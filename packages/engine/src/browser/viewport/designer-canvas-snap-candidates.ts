// 吸附候选派生：从 canonical document 收集画布边、用户 guide 与可见组件的
// 边/中心线候选（对齐坐标 + 参考线局部几何），供 vendored Moveable checkSnapPoses
// 做最近吸附竞争。候选不携带 DOM 引用，是纯数据投影。

import type { ScreenDocument } from '@base-screen/contracts';
import { getScreenComponentBounds, isScreenComponentEffectivelyHidden } from '@base-screen/core';

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
  const excluded = new Set(excludedComponentIds);
  // x 轴候选：画布边（0/宽）+ 用户 guide + 组件边（不含画布中心点候选）。
  const x: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.height },
    { value: document.canvas.width, start: 0, size: document.canvas.height },
    ...guides.x.map((value) => ({ value, start: 0, size: document.canvas.height })),
  ];
  const y: DesignerSnapCandidate[] = [
    { value: 0, start: 0, size: document.canvas.width },
    { value: document.canvas.height, start: 0, size: document.canvas.width },
    ...guides.y.map((value) => ({ value, start: 0, size: document.canvas.width })),
  ];
  for (const component of document.components) {
    if (excluded.has(component.id) || isScreenComponentEffectivelyHidden(document, component.id)) {
      continue;
    }
    const bounds = componentSnapBounds(component);
    x.push(
      { value: bounds.left, start: bounds.top, size: bounds.height },
      { value: bounds.centerX, start: bounds.top, size: bounds.height },
      { value: bounds.right, start: bounds.top, size: bounds.height },
    );
    y.push(
      { value: bounds.top, start: bounds.left, size: bounds.width },
      { value: bounds.centerY, start: bounds.left, size: bounds.width },
      { value: bounds.bottom, start: bounds.left, size: bounds.width },
    );
  }
  return { x: sortedUniqueCandidates(x), y: sortedUniqueCandidates(y) };
}

function componentSnapBounds(component: ScreenDocument['components'][number]): {
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
} {
  // Selection rendering and snapping must use the same Core geometry. Keeping a second
  // rotation formula here caused sub-pixel drift between the outline and the snap anchors.
  const visual = getScreenComponentBounds(component);
  const centerX = component.position.x + component.size.width / 2;
  const centerY = component.position.y + component.size.height / 2;
  const left = visual.left;
  const right = visual.right;
  const top = visual.top;
  const bottom = visual.bottom;
  return {
    bottom,
    centerX,
    centerY,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
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

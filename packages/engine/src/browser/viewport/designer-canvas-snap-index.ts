import type { SnapGuideline } from '../../common/vendor/moveable/types.js';
import type {
  DesignerSnapCandidate,
  DesignerSnapCandidates,
} from './designer-canvas-snap-candidates.js';

interface DesignerIndexedSnapGuideline {
  readonly value: number;
  readonly order: number;
  readonly guideline: SnapGuideline;
}

/** Prepared once per gesture; window queries preserve Moveable's original tie-breaking order. */
export class DesignerSnapIndex {
  readonly #x: readonly DesignerIndexedSnapGuideline[];
  readonly #y: readonly DesignerIndexedSnapGuideline[];

  constructor(candidates: DesignerSnapCandidates) {
    this.#x = indexAxis(candidates.x, 'vertical');
    this.#y = indexAxis(candidates.y, 'horizontal');
  }

  query(
    posesX: readonly number[],
    posesY: readonly number[],
    threshold: number,
  ): readonly SnapGuideline[] {
    return [...queryAxis(this.#x, posesX, threshold), ...queryAxis(this.#y, posesY, threshold)];
  }
}

function indexAxis(
  candidates: readonly DesignerSnapCandidate[],
  type: SnapGuideline['type'],
): readonly DesignerIndexedSnapGuideline[] {
  return candidates
    .map((candidate, order) => ({
      value: candidate.value,
      order,
      guideline: {
        type,
        direction: '',
        pos:
          type === 'vertical'
            ? [candidate.value, candidate.start]
            : [candidate.start, candidate.value],
        size: candidate.size,
      },
    }))
    .filter((entry) => !Number.isNaN(entry.value))
    .sort((left, right) => left.value - right.value);
}

function queryAxis(
  entries: readonly DesignerIndexedSnapGuideline[],
  poses: readonly number[],
  threshold: number,
): readonly SnapGuideline[] {
  if (threshold < 0 || Number.isNaN(threshold)) return [];
  const matches = new Set<DesignerIndexedSnapGuideline>();
  for (const pose of poses) {
    if (Number.isNaN(pose)) continue;
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      // Compare the same subtraction as Moveable, avoiding rounding differences at pose ± threshold.
      if (pose - entries[middle]!.value > threshold) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < entries.length; index++) {
      const entry = entries[index]!;
      if (pose - entry.value < -threshold) break;
      matches.add(entry);
    }
  }
  return [...matches]
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.guideline);
}

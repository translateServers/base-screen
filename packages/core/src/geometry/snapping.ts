import { assertFinite } from '../internal/preconditions.js';
import type { ScreenAxis } from './types.js';

export interface ScreenSnapCandidate {
  readonly axis: ScreenAxis;
  readonly movingValue: number;
  readonly targetValue: number;
  readonly sourceComponentId: string;
  readonly targetComponentId: string | null;
}

export function chooseScreenSnapCandidate(
  candidates: readonly ScreenSnapCandidate[],
  threshold: number,
): ScreenSnapCandidate | null {
  assertFinite(threshold, 'threshold');
  if (threshold < 0) {
    throw new RangeError('Snap threshold must not be negative.');
  }
  let best: ScreenSnapCandidate | null = null;
  for (const candidate of candidates) {
    assertCandidate(candidate);
    if (Math.abs(candidate.targetValue - candidate.movingValue) > threshold) {
      continue;
    }
    if (best === null || compareCandidate(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best === null ? null : { ...best };
}

function compareCandidate(left: ScreenSnapCandidate, right: ScreenSnapCandidate): number {
  const byDistance =
    Math.abs(left.targetValue - left.movingValue) - Math.abs(right.targetValue - right.movingValue);
  if (byDistance !== 0) {
    return byDistance;
  }
  if (left.axis !== right.axis) {
    return left.axis === 'x' ? -1 : 1;
  }
  const bySource = compareStrings(left.sourceComponentId, right.sourceComponentId);
  if (bySource !== 0) {
    return bySource;
  }
  const byTarget = compareNullableStrings(left.targetComponentId, right.targetComponentId);
  if (byTarget !== 0) {
    return byTarget;
  }
  if (left.movingValue !== right.movingValue) {
    return left.movingValue - right.movingValue;
  }
  return left.targetValue - right.targetValue;
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return compareStrings(left, right);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCandidate(candidate: ScreenSnapCandidate): void {
  if (candidate === null || typeof candidate !== 'object') {
    throw new RangeError('Snap candidate must be an object.');
  }
  if (candidate.axis !== 'x' && candidate.axis !== 'y') {
    throw new RangeError('Snap candidate axis must be x or y.');
  }
  if (
    typeof candidate.sourceComponentId !== 'string' ||
    (typeof candidate.targetComponentId !== 'string' && candidate.targetComponentId !== null)
  ) {
    throw new RangeError('Snap candidate component ids must be strings or null.');
  }
  assertFinite(candidate.movingValue, 'candidate.movingValue');
  assertFinite(candidate.targetValue, 'candidate.targetValue');
}

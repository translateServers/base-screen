import type { ScreenJsonValue } from '@base-screen/contracts';

export function areEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => areEqual(value, right[index]));
  }

  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && areEqual(leftObject[key], rightObject[key]),
  );
}

export function areEqualJson(left: ScreenJsonValue, right: ScreenJsonValue): boolean {
  return areEqual(left, right);
}

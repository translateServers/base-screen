import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, isEffectiveHidden, isEffectiveLocked } from './hierarchy.js';

export function isScreenComponentEffectivelyHidden(
  document: ScreenDocument,
  componentId: string,
): boolean {
  return isEffectiveHidden(buildComponentIndex(document), componentId);
}

export function isScreenComponentEffectivelyLocked(
  document: ScreenDocument,
  componentId: string,
): boolean {
  return isEffectiveLocked(buildComponentIndex(document), componentId);
}

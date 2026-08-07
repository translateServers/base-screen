import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, isEffectiveHidden, isEffectiveLocked } from './hierarchy.js';

const componentIndexCache = new WeakMap<ScreenDocument, ReturnType<typeof buildComponentIndex>>();

export function isScreenComponentEffectivelyHidden(
  document: ScreenDocument,
  componentId: string,
): boolean {
  return isEffectiveHidden(componentIndexFor(document), componentId);
}

export function isScreenComponentEffectivelyLocked(
  document: ScreenDocument,
  componentId: string,
): boolean {
  return isEffectiveLocked(componentIndexFor(document), componentId);
}

function componentIndexFor(document: ScreenDocument): ReturnType<typeof buildComponentIndex> {
  const cached = componentIndexCache.get(document);
  if (cached !== undefined) return cached;
  const index = buildComponentIndex(document);
  componentIndexCache.set(document, index);
  return index;
}

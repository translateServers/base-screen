import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, isEffectiveHidden } from '../hierarchy/hierarchy.js';
import { assertCoreValidDocument } from '../internal/document.js';

export interface ScreenInteractionState {
  readonly selectedComponentIds: readonly string[];
  readonly focusedComponentId: string | null;
}

export type ScreenInteractionAction =
  | {
      readonly type: 'replace-selection';
      readonly componentIds: readonly string[];
      readonly focusedComponentId: string | null;
    }
  | { readonly type: 'toggle-selection'; readonly componentId: string }
  | { readonly type: 'clear-selection' }
  | { readonly type: 'reconcile-document' };

export function reduceScreenInteraction(
  state: ScreenInteractionState,
  action: ScreenInteractionAction,
  document: ScreenDocument,
): ScreenInteractionState {
  assertCoreValidDocument(document);
  const selection = canonicalSelection(state.selectedComponentIds, document);
  if (action === null || typeof action !== 'object') {
    return normalize(state, selection, state.focusedComponentId);
  }
  switch (action.type) {
    case 'replace-selection':
      return normalize(
        state,
        Array.isArray(action.componentIds)
          ? canonicalSelection(action.componentIds, document)
          : selection,
        action.focusedComponentId,
      );
    case 'toggle-selection': {
      if (typeof action.componentId !== 'string') {
        return normalize(state, selection, state.focusedComponentId);
      }
      const id = canonicalSelection([action.componentId], document)[0];
      if (id === undefined) {
        return normalize(state, selection, state.focusedComponentId);
      }
      const next = selection.includes(id)
        ? selection.filter((selected) => selected !== id)
        : canonicalSelection([...selection, id], document);
      return normalize(state, next, next.includes(id) ? id : state.focusedComponentId);
    }
    case 'clear-selection':
      return normalize(state, [], null);
    case 'reconcile-document':
      return normalize(state, selection, state.focusedComponentId);
    default:
      return normalize(state, selection, state.focusedComponentId);
  }
}

function canonicalSelection(ids: readonly string[], document: ScreenDocument): readonly string[] {
  const requested = new Set(ids.filter((id) => typeof id === 'string'));
  const index = buildComponentIndex(document);
  return document.components
    .filter((component) => requested.has(component.id) && !isEffectiveHidden(index, component.id))
    .map(({ id }) => id);
}

function normalize(
  original: ScreenInteractionState,
  selectedComponentIds: readonly string[],
  focusedComponentId: string | null,
): ScreenInteractionState {
  const focus =
    typeof focusedComponentId === 'string' && selectedComponentIds.includes(focusedComponentId)
      ? focusedComponentId
      : null;
  if (
    original.focusedComponentId === focus &&
    original.selectedComponentIds.length === selectedComponentIds.length &&
    original.selectedComponentIds.every((id, index) => id === selectedComponentIds[index])
  ) {
    return original;
  }
  return { selectedComponentIds, focusedComponentId: focus };
}

import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentCommand, ScreenDocumentTransaction } from '@base-screen/core';

export interface BaseScreenClipboard {
  readonly components: readonly ScreenComponentNode[];
}

export function createClipboard(
  document: ScreenDocument,
  componentIds: readonly string[],
): BaseScreenClipboard | null {
  const selected = new Set(componentIds);
  const copiedRoots = document.components.filter(
    (component) =>
      selected.has(component.id) && !hasSelectedAncestor(document, selected, component),
  );
  if (copiedRoots.length === 0) {
    return null;
  }
  const copiedIds = new Set<string>();
  const queue = copiedRoots.map((component) => component.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (copiedIds.has(id)) {
      continue;
    }
    copiedIds.add(id);
    for (const child of document.components) {
      if (child.parentId === id) {
        queue.push(child.id);
      }
    }
  }
  return { components: document.components.filter((component) => copiedIds.has(component.id)) };
}

export function createPasteTransaction(
  document: ScreenDocument,
  clipboard: BaseScreenClipboard,
  offset: { readonly x: number; readonly y: number },
): ScreenDocumentTransaction {
  const existingIds = new Set(document.components.map((component) => component.id));
  const copiedIds = new Set(clipboard.components.map((component) => component.id));
  const idMap = new Map<string, string>();
  for (const component of clipboard.components) {
    const id = nextCopiedId(existingIds, component.id);
    existingIds.add(id);
    idMap.set(component.id, id);
  }
  const pending = new Map(clipboard.components.map((component) => [component.id, component]));
  const commands: ScreenDocumentCommand[] = [];
  while (pending.size > 0) {
    let progressed = false;
    for (const [id, component] of pending) {
      if (
        component.parentId !== null &&
        copiedIds.has(component.parentId) &&
        pending.has(component.parentId)
      ) {
        continue;
      }
      commands.push({
        type: 'add-component',
        component: {
          ...component,
          id: idMap.get(id)!,
          parentId:
            component.parentId === null || !copiedIds.has(component.parentId)
              ? null
              : idMap.get(component.parentId)!,
          position: offsetPosition(component, copiedIds, offset),
        },
      });
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) {
      return { commands: [] };
    }
  }
  return { commands };
}

function offsetPosition(
  component: ScreenComponentNode,
  copiedIds: ReadonlySet<string>,
  offset: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const isCopiedRoot = component.parentId === null || !copiedIds.has(component.parentId);
  return {
    x: clampCoordinate(component.position.x + (isCopiedRoot ? offset.x : 0)),
    y: clampCoordinate(component.position.y + (isCopiedRoot ? offset.y : 0)),
  };
}

function hasSelectedAncestor(
  document: ScreenDocument,
  selected: ReadonlySet<string>,
  component: ScreenComponentNode,
): boolean {
  let parentId = component.parentId;
  const byId = new Map(document.components.map((candidate) => [candidate.id, candidate]));
  while (parentId !== null) {
    if (selected.has(parentId)) {
      return true;
    }
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

function nextCopiedId(existingIds: ReadonlySet<string>, sourceId: string): string {
  const base = sourceId.replace(/[^A-Za-z0-9]+/g, '-');
  let index = 1;
  while (existingIds.has(`${base}-copy-${index}`)) {
    index++;
  }
  return `${base}-copy-${index}`;
}

function clampCoordinate(value: number): number {
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

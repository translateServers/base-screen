import type { ScreenComponentNode, ScreenDocument, ScreenSize } from '@base-screen/contracts';
import {
  applyScreenDocumentCommand,
  applyScreenDocumentTransaction,
  getScreenSelectionBounds,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import {
  clampScreenCoordinate,
  clampScreenSize,
  roundScreenGeometry,
} from './designer-geometry.js';

export function createGroupSizeTransaction(
  document: ScreenDocument,
  groupId: string,
  size: ScreenSize,
): ScreenDocumentTransaction | undefined {
  const group = document.components.find((component) => component.id === groupId);
  if (
    group === undefined ||
    isScreenComponentEffectivelyLocked(document, groupId) ||
    !isValidSize(size) ||
    group.size.width <= 0 ||
    group.size.height <= 0
  ) {
    return undefined;
  }
  const scaleX = size.width / group.size.width;
  const scaleY = size.height / group.size.height;
  const descendants = getDescendants(document, groupId);
  const anchor = group.position;
  const mutable = [group, ...descendants].filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
  const commands = mutable.map((component) => ({
    type: 'update-components' as const,
    componentIds: [component.id],
    patch: {
      position: {
        x: roundScreenGeometry(
          clampScreenCoordinate(anchor.x + (component.position.x - anchor.x) * scaleX),
        ),
        y: roundScreenGeometry(
          clampScreenCoordinate(anchor.y + (component.position.y - anchor.y) * scaleY),
        ),
      },
      size: {
        width: roundScreenGeometry(clampScreenSize(component.size.width * scaleX)),
        height: roundScreenGeometry(clampScreenSize(component.size.height * scaleY)),
      },
    },
  }));
  return commands.length === 0 ? undefined : { commands };
}

export function createGroupRotationTransaction(
  document: ScreenDocument,
  groupId: string,
  rotation: number,
): ScreenDocumentTransaction | undefined {
  const group = document.components.find((component) => component.id === groupId);
  if (
    group === undefined ||
    isScreenComponentEffectivelyLocked(document, groupId) ||
    !Number.isFinite(rotation) ||
    rotation < -180 ||
    rotation >= 180
  ) {
    return undefined;
  }
  const delta = rotation - group.rotation;
  if (delta === 0) return undefined;
  const mutable = [group, ...getDescendants(document, groupId)].filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
  const bounds = getScreenSelectionBounds(mutable);
  if (bounds === null) return undefined;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    commands: mutable.map((component) => {
      const componentCenter = {
        x: component.position.x + component.size.width / 2,
        y: component.position.y + component.size.height / 2,
      };
      const offsetX = componentCenter.x - center.x;
      const offsetY = componentCenter.y - center.y;
      const nextCenter = {
        x: center.x + offsetX * cos - offsetY * sin,
        y: center.y + offsetX * sin + offsetY * cos,
      };
      return {
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: {
          position: {
            x: roundScreenGeometry(clampScreenCoordinate(nextCenter.x - component.size.width / 2)),
            y: roundScreenGeometry(clampScreenCoordinate(nextCenter.y - component.size.height / 2)),
          },
          rotation:
            component.id === groupId ? rotation : normalizeRotation(component.rotation + delta),
        },
      };
    }),
  };
}

/**
 * Keeps configured group shells aligned with their descendants after child edits.
 * Explicit group geometry in the same transaction remains authoritative, which lets
 * resize/rotate operations express an intentional group transform without being
 * immediately overwritten by the derived-bound pass.
 */
export function withDerivedDesignerGroupBounds(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
  groupMaterialType: string | undefined,
): ScreenDocumentTransaction {
  if (
    groupMaterialType === undefined ||
    document.components.every((component) => component.type !== groupMaterialType)
  ) {
    return transaction;
  }
  const projected = applyScreenDocumentTransaction(document, transaction);
  if (!projected.ok) return transaction;

  const explicitGeometry = new Set<string>();
  for (const command of transaction.commands) {
    if (command.type === 'add-component') {
      explicitGeometry.add(command.component.id);
    } else if (
      command.type === 'update-components' &&
      (command.patch.position !== undefined ||
        command.patch.size !== undefined ||
        command.patch.rotation !== undefined)
    ) {
      command.componentIds.forEach((componentId) => explicitGeometry.add(componentId));
    }
  }

  let current = projected.document;
  const commands: ScreenDocumentCommand[] = [];
  const groups = current.components
    .filter((component) => component.type === groupMaterialType)
    .sort((left, right) => componentDepth(current, right.id) - componentDepth(current, left.id));
  for (const group of groups) {
    if (explicitGeometry.has(group.id) || isScreenComponentEffectivelyLocked(current, group.id)) {
      continue;
    }
    const descendants = getDescendants(current, group.id);
    const bounds = getScreenSelectionBounds(descendants);
    if (bounds === null) continue;
    const position = { x: bounds.left, y: bounds.top };
    const size = { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
    if (samePosition(group.position, position) && sameSize(group.size, size)) continue;
    const command: ScreenDocumentCommand = {
      type: 'update-components',
      componentIds: [group.id],
      patch: { position, size },
    };
    const applied = applyScreenDocumentCommand(current, command);
    if (!applied.ok) continue;
    current = applied.document;
    commands.push(command);
  }
  return commands.length === 0 ? transaction : { commands: [...transaction.commands, ...commands] };
}

function getDescendants(
  document: ScreenDocument,
  componentId: string,
): readonly ScreenComponentNode[] {
  const childrenByParent = new Map<string | null, string[]>();
  const byId = new Map(document.components.map((component) => [component.id, component]));
  for (const component of document.components) {
    const children = childrenByParent.get(component.parentId) ?? [];
    children.push(component.id);
    childrenByParent.set(component.parentId, children);
  }
  const descendants: ScreenComponentNode[] = [];
  const pending = [...(childrenByParent.get(componentId) ?? [])];
  while (pending.length > 0) {
    const id = pending.shift()!;
    const component = byId.get(id);
    if (component === undefined) continue;
    descendants.push(component);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}

function componentDepth(document: ScreenDocument, componentId: string): number {
  const byId = new Map(document.components.map((component) => [component.id, component]));
  let depth = 0;
  let parentId = byId.get(componentId)?.parentId ?? null;
  while (parentId !== null) {
    depth++;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

function isValidSize(size: ScreenSize): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

function samePosition(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameSize(left: ScreenSize, right: ScreenSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function clampSize(value: number): number {
  return Math.max(1, Math.min(1_000_000, value));
}

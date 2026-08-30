import type {
  ScreenComponentNode,
  ScreenDocument,
  ScreenJsonObject,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  calculateScreenAlignment,
  calculateScreenDistribution,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import {
  type BaseScreenMaterialObjectSchema,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { removeComponentCommands } from '../selection/designer-remove-operations.js';
import { selectedComponents } from '../selection/designer-selection.js';
import { roundScreenGeometry } from './designer-geometry.js';

export type BaseScreenAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type BaseScreenDistribution = 'horizontal' | 'vertical';

export function createGroupTransaction(
  group: ScreenComponentNode,
  componentIds: readonly string[],
): ScreenDocumentTransaction {
  return {
    commands: [
      { type: 'add-component', component: group },
      { type: 'reparent-components', componentIds, parentId: group.id },
    ],
  };
}

export function createUngroupTransaction(
  document: ScreenDocument,
  groupId: string,
): ScreenDocumentTransaction {
  const group = document.components.find((component) => component.id === groupId);
  const childIds = document.components
    .filter((component) => component.parentId === groupId)
    .map((component) => component.id);
  const reparent =
    childIds.length === 0
      ? []
      : [
          {
            type: 'reparent-components' as const,
            componentIds: childIds,
            parentId: group?.parentId ?? null,
          },
        ];
  return { commands: [...reparent, ...removeComponentCommands(document, [groupId])] };
}

export function createReparentTransaction(
  componentIds: readonly string[],
  parentId: string | null,
): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'reparent-components', componentIds, parentId }],
  };
}

export function createZOrderTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  edge: 'front' | 'back',
): ScreenDocumentTransaction | undefined {
  const selected = new Set(componentIds);
  const targets = selectedComponents(document, componentIds);
  if (targets.length === 0) return undefined;
  if (targets.some((component) => isScreenComponentEffectivelyLocked(document, component.id)))
    return undefined;
  const parentIds = new Set(targets.map((component) => component.parentId));
  if (parentIds.size !== 1) return undefined;
  const parentId = targets[0]!.parentId;
  const siblings = document.components
    .filter((component) => component.parentId === parentId)
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex ||
        document.components.indexOf(left) - document.components.indexOf(right),
    );
  const ordered =
    edge === 'front'
      ? [
          ...siblings.filter((item) => !selected.has(item.id)),
          ...siblings.filter((item) => selected.has(item.id)),
        ]
      : [
          ...siblings.filter((item) => selected.has(item.id)),
          ...siblings.filter((item) => !selected.has(item.id)),
        ];
  const zIndexes = siblings.map((item) => item.zIndex);
  const orderedIndexes = zIndexes.every(
    (value, position) => position === 0 || zIndexes[position - 1]! < value,
  )
    ? zIndexes
    : siblings.map((_, position) => position);
  const commands = ordered.flatMap((item, position) => {
    const zIndex = orderedIndexes[position]!;
    return item.zIndex === zIndex
      ? []
      : [{ type: 'update-components' as const, componentIds: [item.id], patch: { zIndex } }];
  });
  return commands.length === 0 ? undefined : { commands };
}

export function createSiblingReorderTransaction(
  document: ScreenDocument,
  componentId: string,
  direction: 'up' | 'down',
): ScreenDocumentTransaction | undefined {
  return createSiblingSelectionReorderTransaction(document, [componentId], direction);
}

/**
 * 按图层面板的视觉顺序移动同级选区：列表顶部是最前层，因此 up 增大绘制层级，
 * down 减小绘制层级。多选项各跨过一个未选中兄弟，并保持选区内部相对顺序。
 */
export function createSiblingSelectionReorderTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  direction: 'up' | 'down',
): ScreenDocumentTransaction | undefined {
  const selected = new Set(componentIds);
  const targets = selectedComponents(document, componentIds);
  if (selected.size === 0 || targets.length !== selected.size) return undefined;
  if (targets.some((component) => isScreenComponentEffectivelyLocked(document, component.id)))
    return undefined;
  const parentIds = new Set(targets.map((component) => component.parentId));
  if (parentIds.size !== 1) return undefined;
  const parentId = targets[0]!.parentId;
  const siblings = document.components
    .filter((item) => item.parentId === parentId)
    .sort(
      (left, right) =>
        right.zIndex - left.zIndex ||
        document.components.indexOf(right) - document.components.indexOf(left),
    );
  const reordered = [...siblings];
  let moved = false;
  if (direction === 'up') {
    for (let index = 1; index < reordered.length; index++) {
      const item = reordered[index]!;
      const previous = reordered[index - 1]!;
      if (!selected.has(item.id) || selected.has(previous.id)) continue;
      if (isScreenComponentEffectivelyLocked(document, previous.id)) return undefined;
      reordered[index - 1] = item;
      reordered[index] = previous;
      moved = true;
    }
  } else {
    for (let index = reordered.length - 2; index >= 0; index--) {
      const item = reordered[index]!;
      const next = reordered[index + 1]!;
      if (!selected.has(item.id) || selected.has(next.id)) continue;
      if (isScreenComponentEffectivelyLocked(document, next.id)) return undefined;
      reordered[index] = next;
      reordered[index + 1] = item;
      moved = true;
    }
  }
  if (!moved) return undefined;
  const zIndexes = siblings.map((item) => item.zIndex);
  const orderedIndexes = zIndexes.every(
    (value, position) => position === 0 || zIndexes[position - 1]! > value,
  )
    ? zIndexes
    : siblings.map((_, position) => siblings.length - position - 1);
  const commands = reordered.flatMap((item, position) => {
    const zIndex = orderedIndexes[position]!;
    return item.zIndex === zIndex
      ? []
      : [{ type: 'update-components' as const, componentIds: [item.id], patch: { zIndex } }];
  });
  return commands.length === 0 ? undefined : { commands };
}

export function createAlignmentTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  alignment: BaseScreenAlignment,
): ScreenDocumentTransaction {
  const components = withEffectiveLockedStatus(document, componentIds);
  const [axis, mode] = alignmentAxisMode(alignment);
  const deltas = calculateScreenAlignment(components, axis, mode);
  return { commands: subtreePositionCommands(document, deltas) };
}

export function createDistributionTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  distribution: BaseScreenDistribution,
): ScreenDocumentTransaction {
  const components = withEffectiveLockedStatus(document, componentIds);
  const deltas = calculateScreenDistribution(components, distribution === 'horizontal' ? 'x' : 'y');
  return { commands: subtreePositionCommands(document, deltas) };
}

export function createValidatedPropsTransaction(
  componentId: string,
  props: ScreenJsonObject,
  schema: BaseScreenMaterialObjectSchema,
): ScreenParseResult<ScreenDocumentTransaction> {
  const validated = validateBaseScreenMaterialProps(props, schema);
  if (!validated.ok) {
    return validated;
  }
  return {
    ok: true,
    value: {
      commands: [
        {
          type: 'update-components',
          componentIds: [componentId],
          patch: { props: validated.value },
        },
      ],
    },
    diagnostics: [],
  };
}

export function createValidatedStyleTransaction(
  componentId: string,
  style: ScreenJsonObject,
  schema: BaseScreenMaterialObjectSchema,
): ScreenParseResult<ScreenDocumentTransaction> {
  const validated = validateBaseScreenMaterialStyle(style, schema);
  if (!validated.ok) {
    return validated;
  }
  return {
    ok: true,
    value: {
      commands: [
        {
          type: 'update-components',
          componentIds: [componentId],
          patch: { style: validated.value },
        },
      ],
    },
    diagnostics: [],
  };
}

function withEffectiveLockedStatus(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  return selectedComponents(document, componentIds).map((component) => ({
    ...component,
    status: {
      ...component.status,
      locked: isScreenComponentEffectivelyLocked(document, component.id),
    },
  }));
}

function alignmentAxisMode(
  alignment: BaseScreenAlignment,
): readonly ['x' | 'y', 'start' | 'center' | 'end'] {
  switch (alignment) {
    case 'left':
      return ['x', 'start'];
    case 'center':
      return ['x', 'center'];
    case 'right':
      return ['x', 'end'];
    case 'top':
      return ['y', 'start'];
    case 'middle':
      return ['y', 'center'];
    case 'bottom':
      return ['y', 'end'];
  }
}

// 对齐/分布的位移按子树应用：每个被计算的根组件连同其全部后代一起移动，
// 编组内的子组件保持相对位置，直接 locked 的后代不参与。
function subtreePositionCommands(
  document: ScreenDocument,
  deltas: readonly {
    readonly componentId: string;
    readonly delta: { readonly x: number; readonly y: number };
  }[],
): readonly ScreenDocumentCommand[] {
  const index = new Map(document.components.map((component) => [component.id, component]));
  const childrenByParent = new Map<string | null, readonly string[]>();
  for (const component of document.components) {
    const children = childrenByParent.get(component.parentId);
    childrenByParent.set(
      component.parentId,
      children === undefined ? [component.id] : [...children, component.id],
    );
  }
  const commands: ScreenDocumentCommand[] = [];
  for (const { componentId, delta } of deltas) {
    if (delta.x === 0 && delta.y === 0) continue;
    const pending = [componentId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      const component = index.get(id);
      if (component === undefined || component.status.locked) {
        continue;
      }
      commands.push({
        type: 'update-components' as const,
        componentIds: [id],
        patch: {
          position: {
            x: roundScreenGeometry(component.position.x + delta.x),
            y: roundScreenGeometry(component.position.y + delta.y),
          },
        },
      });
      pending.push(...(childrenByParent.get(id) ?? []));
    }
  }
  return commands;
}

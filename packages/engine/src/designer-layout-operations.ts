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
} from '@base-screen/plugin-core';
import { selectedComponents } from './designer-selection.js';

export type BaseScreenAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type BaseScreenDistribution = 'horizontal' | 'vertical';

export function createGroupTransaction(
  document: ScreenDocument,
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
  return {
    commands: [
      ...(childIds.length === 0
        ? []
        : [
            {
              type: 'reparent-components' as const,
              componentIds: childIds,
              parentId: group?.parentId ?? null,
            },
          ]),
      { type: 'remove-components', componentIds: [groupId] },
    ],
  };
}

export function createReparentTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  parentId: string | null,
): ScreenDocumentTransaction {
  return {
    commands: [{ type: 'reparent-components', componentIds, parentId }],
  };
}

export function createAlignmentTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  alignment: BaseScreenAlignment,
): ScreenDocumentTransaction {
  const components = withEffectiveLockedStatus(document, componentIds);
  const [axis, mode] = alignmentAxisMode(alignment);
  const deltas = calculateScreenAlignment(components, axis, mode);
  return { commands: positionCommands(components, deltas) };
}

export function createDistributionTransaction(
  document: ScreenDocument,
  componentIds: readonly string[],
  distribution: BaseScreenDistribution,
): ScreenDocumentTransaction {
  const components = withEffectiveLockedStatus(document, componentIds);
  const deltas = calculateScreenDistribution(components, distribution === 'horizontal' ? 'x' : 'y');
  return { commands: positionCommands(components, deltas) };
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

function positionCommands(
  components: readonly ScreenComponentNode[],
  deltas: readonly {
    readonly componentId: string;
    readonly delta: { readonly x: number; readonly y: number };
  }[],
): readonly ScreenDocumentCommand[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  return deltas.flatMap(({ componentId, delta }) => {
    const component = byId.get(componentId);
    return component === undefined
      ? []
      : [
          {
            type: 'update-components' as const,
            componentIds: [componentId],
            patch: {
              position: {
                x: component.position.x + delta.x,
                y: component.position.y + delta.y,
              },
            },
          },
        ];
  });
}

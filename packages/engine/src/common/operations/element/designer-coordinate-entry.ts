import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import { isScreenComponentEffectivelyLocked } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createGroupSizeTransaction } from '../selection/designer-group.js';
import {
  createGroupPositionTransaction,
  getDesignerInspectorContext,
} from '../style/designer-inspector.js';
import {
  clampScreenCoordinate,
  clampScreenSize,
  roundScreenGeometry,
} from './designer-geometry.js';

export type DesignerCoordinateAxis = 'x' | 'y';

export type DesignerCoordinateEntryParseResult =
  | {
      readonly ok: true;
      readonly value: { readonly x: number; readonly y: number };
    }
  | {
      readonly ok: false;
      readonly invalidAxes: readonly DesignerCoordinateAxis[];
    };

export type DesignerSizeAxis = 'width' | 'height';

export type DesignerSizeEntryParseResult =
  | {
      readonly ok: true;
      readonly value: { readonly width: number; readonly height: number };
    }
  | {
      readonly ok: false;
      readonly invalidAxes: readonly DesignerSizeAxis[];
    };

export function parseDesignerCoordinateEntry(
  draft: Readonly<Record<DesignerCoordinateAxis, string>>,
): DesignerCoordinateEntryParseResult {
  const x = parseCoordinate(draft.x);
  const y = parseCoordinate(draft.y);
  const invalidAxes = [
    ...(x === undefined ? (['x'] as const) : []),
    ...(y === undefined ? (['y'] as const) : []),
  ];
  if (invalidAxes.length > 0) return { ok: false, invalidAxes };
  return { ok: true, value: { x: x!, y: y! } };
}

export function parseDesignerSizeEntry(
  draft: Readonly<Record<DesignerSizeAxis, string>>,
): DesignerSizeEntryParseResult {
  const width = parseSize(draft.width);
  const height = parseSize(draft.height);
  const invalidAxes = [
    ...(width === undefined ? (['width'] as const) : []),
    ...(height === undefined ? (['height'] as const) : []),
  ];
  if (invalidAxes.length > 0) return { ok: false, invalidAxes };
  return { ok: true, value: { width: width!, height: height! } };
}

export function getDesignerCoordinateEntryTarget(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenComponentNode | undefined {
  if (document === undefined || interaction.selectedComponentIds.length !== 1) return undefined;
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' && context.kind !== 'single-group') return undefined;
  return isScreenComponentEffectivelyLocked(document, context.component.id)
    ? undefined
    : context.component;
}

export function getDesignerSizeEntryTarget(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenComponentNode | undefined {
  return getDesignerCoordinateEntryTarget(document, interaction, catalog);
}

export function createDesignerCoordinateEntryTransaction(
  document: ScreenDocument,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  position: { readonly x: number; readonly y: number },
): ScreenDocumentTransaction | undefined {
  const target = getDesignerCoordinateEntryTarget(document, interaction, catalog);
  if (target === undefined || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return undefined;
  }
  const normalized = {
    x: roundScreenGeometry(clampScreenCoordinate(position.x)),
    y: roundScreenGeometry(clampScreenCoordinate(position.y)),
  };
  if (target.position.x === normalized.x && target.position.y === normalized.y) return undefined;
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'single-group') {
    return createGroupPositionTransaction(document, target.id, normalized);
  }
  return {
    commands: [
      {
        type: 'update-components',
        componentIds: [target.id],
        patch: { position: normalized },
      },
    ],
  };
}

export function createDesignerSizeEntryTransaction(
  document: ScreenDocument,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
  size: { readonly width: number; readonly height: number },
): ScreenDocumentTransaction | undefined {
  const target = getDesignerSizeEntryTarget(document, interaction, catalog);
  if (
    target === undefined ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    return undefined;
  }
  const normalized = {
    width: roundScreenGeometry(clampScreenSize(size.width)),
    height: roundScreenGeometry(clampScreenSize(size.height)),
  };
  if (target.size.width === normalized.width && target.size.height === normalized.height) {
    return undefined;
  }
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind === 'single-group') {
    return createGroupSizeTransaction(document, target.id, normalized);
  }
  return {
    commands: [
      {
        type: 'update-components',
        componentIds: [target.id],
        patch: { size: normalized },
      },
    ],
  };
}

function parseCoordinate(input: string): number | undefined {
  if (input.trim() === '') return undefined;
  const value = Number(input);
  return Number.isFinite(value) ? roundScreenGeometry(clampScreenCoordinate(value)) : undefined;
}

function parseSize(input: string): number | undefined {
  if (input.trim() === '') return undefined;
  const value = Number(input);
  return Number.isFinite(value) && value > 0
    ? roundScreenGeometry(clampScreenSize(value))
    : undefined;
}

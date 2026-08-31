import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerCoordinateEntryTransaction,
  type DesignerCoordinateAxis,
  getDesignerCoordinateEntryTarget,
  parseDesignerCoordinateEntry,
} from '../../common/operations/element/designer-coordinate-entry.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  DesignerPairEntryController,
  type DesignerPairEntryPlacement,
} from './designer-pair-entry-controller.js';

export interface DesignerCoordinateEntryControllerCallbacks {
  readonly getRoot: () => ShadowRoot | null;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly report: (result: ScreenParseResult<ScreenDocument>) => void;
  readonly focusViewport: () => void;
}

export type DesignerCoordinateEntryPlacement = DesignerPairEntryPlacement;

export class DesignerCoordinateEntryController extends DesignerPairEntryController<
  DesignerCoordinateAxis,
  { readonly x: number; readonly y: number }
> {
  constructor(callbacks: DesignerCoordinateEntryControllerCallbacks) {
    super({
      ...callbacks,
      axes: ['x', 'y'],
      entrySelector: '[data-coordinate-entry]',
      inputSelector: (axis) => `[data-coordinate-entry-${axis}]`,
      errorSelector: '[data-coordinate-entry-error]',
      axisDataKey: 'coordinateEntryAxis',
      placementDataKey: 'coordinateEntryPlacement',
      invalidText: DESIGNER_UI_TEXT.coordinateEntry.invalid,
      submitFailedText: DESIGNER_UI_TEXT.coordinateEntry.submitFailed,
      getTarget: (document, interaction, catalog) => {
        const target = getDesignerCoordinateEntryTarget(document, interaction, catalog);
        return target === undefined ? undefined : { id: target.id, values: target.position };
      },
      parse: parseDesignerCoordinateEntry,
      createTransaction: createDesignerCoordinateEntryTransaction,
    });
  }
}

export { placeDesignerPairEntry as placeDesignerCoordinateEntry } from './designer-pair-entry-controller.js';

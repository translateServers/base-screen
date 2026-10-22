import {
  createDesignerCoordinateEntryTransaction,
  type DesignerCoordinateAxis,
  getDesignerCoordinateEntryTarget,
  parseDesignerCoordinateEntry,
} from '../../../common/operations/element/designer-coordinate-entry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerEntryHostCallbacks } from './designer-entry-host-callbacks.js';
import {
  DesignerPairEntryController,
  type DesignerPairEntryPlacement,
} from './designer-pair-entry-controller.js';

export type DesignerCoordinateEntryControllerCallbacks = DesignerEntryHostCallbacks;

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

import {
  createDesignerSizeEntryTransaction,
  type DesignerSizeAxis,
  getDesignerSizeEntryTarget,
  parseDesignerSizeEntry,
} from '../../../common/operations/element/designer-coordinate-entry.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerEntryHostCallbacks } from './designer-entry-host-callbacks.js';
import { DesignerPairEntryController } from './designer-pair-entry-controller.js';

export type DesignerSizeEntryControllerCallbacks = DesignerEntryHostCallbacks;

export class DesignerSizeEntryController extends DesignerPairEntryController<
  DesignerSizeAxis,
  { readonly width: number; readonly height: number }
> {
  constructor(callbacks: DesignerSizeEntryControllerCallbacks) {
    super({
      ...callbacks,
      axes: ['width', 'height'],
      entrySelector: '[data-size-entry]',
      inputSelector: (axis) => `[data-size-entry-${axis}]`,
      errorSelector: '[data-size-entry-error]',
      axisDataKey: 'sizeEntryAxis',
      placementDataKey: 'sizeEntryPlacement',
      invalidText: DESIGNER_UI_TEXT.sizeEntry.invalid,
      submitFailedText: DESIGNER_UI_TEXT.sizeEntry.submitFailed,
      getTarget: (document, interaction, catalog) => {
        const target = getDesignerSizeEntryTarget(document, interaction, catalog);
        return target === undefined ? undefined : { id: target.id, values: target.size };
      },
      parse: parseDesignerSizeEntry,
      createTransaction: createDesignerSizeEntryTransaction,
    });
  }
}

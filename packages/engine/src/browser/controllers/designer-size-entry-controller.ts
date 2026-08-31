import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerSizeEntryTransaction,
  type DesignerSizeAxis,
  getDesignerSizeEntryTarget,
  parseDesignerSizeEntry,
} from '../../common/operations/element/designer-coordinate-entry.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { DesignerPairEntryController } from './designer-pair-entry-controller.js';

export interface DesignerSizeEntryControllerCallbacks {
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

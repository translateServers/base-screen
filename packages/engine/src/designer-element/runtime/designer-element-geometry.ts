import type { ScreenDocument } from '@base-screen/contracts';
import { DesignerAutoWidthController } from '../../browser/controllers/designer-auto-width-controller.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function getDesignerGeometryDocument(
  state: DesignerElementState,
): ScreenDocument | undefined {
  return state.autoWidthController.project(state.session.document);
}

export function createDesignerAutoWidthController(
  element: DesignerElementHost,
  state: DesignerElementState,
): DesignerAutoWidthController {
  return new DesignerAutoWidthController({
    getCanvas: () => state.canvas,
    onGeometryChange: () => {
      state.workbenchController.invalidateGeometry();
      state.runtime.renderSelection(element);
      state.coordinateEntryController.sync();
      state.sizeEntryController.refreshGeometry();
      const document = getDesignerGeometryDocument(state);
      const interaction = state.session.interaction;
      const id = interaction.focusedComponentId ?? interaction.selectedComponentIds[0];
      const component = document?.components.find((item) => item.id === id);
      if (component === undefined) return;
      // Do not rebuild the inspector or overwrite an active numeric draft on data refresh.
      const controls = state.properties?.querySelectorAll<HTMLInputElement>(
        '[data-property="width"], [data-multi-property="width"]',
      );
      for (const control of controls ?? []) {
        if (element.shadowRoot?.activeElement !== control) {
          if (control.dataset.multiProperty === 'width') {
            const selected =
              document?.components.filter((item) =>
                interaction.selectedComponentIds.includes(item.id),
              ) ?? [];
            const mixed = selected.some((item) => item.size.width !== component.size.width);
            control.value = mixed ? '' : String(component.size.width);
            control.placeholder = mixed ? DESIGNER_UI_TEXT.inspectorUi.mixed : '';
            if (mixed) control.dataset.mixed = 'true';
            else delete control.dataset.mixed;
            continue;
          }
          control.value = String(component.size.width);
        }
      }
    },
  });
}

import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { renderDesignerEventsPanel } from '../dom/designer-blueprint-dom.js';

export interface DesignerIntegrationCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly getRuntimeContributions: () => BaseScreenRuntimeContributionIndex | undefined;
  readonly requestBlueprintEdit: () => boolean;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerIntegrationController {
  #eventsPanel: HTMLElement | undefined;

  constructor(private readonly callbacks: DesignerIntegrationCallbacks) {}

  connect(eventsPanel: HTMLElement): void {
    this.#eventsPanel = eventsPanel;
    this.render();
  }

  render(): void {
    renderDesignerEventsPanel(
      this.#eventsPanel,
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
      this.callbacks.getRuntimeContributions(),
    );
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action !== 'open-blueprint') return false;
    const document = this.callbacks.getDocument();
    if (document === undefined || this.callbacks.getInteraction().focusedComponentId === null) {
      this.emitBlueprintDiagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE');
      return true;
    }
    if (!this.callbacks.requestBlueprintEdit()) {
      this.emitBlueprintDiagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE');
    }
    return true;
  }

  clear(): void {
    if (this.#eventsPanel !== undefined) this.#eventsPanel.replaceChildren();
  }

  private emitBlueprintDiagnostic(code: ScreenDiagnostic['code']): void {
    this.callbacks.emitDiagnostics([
      { severity: 'error', code, path: [], message: DESIGNER_UI_TEXT.blueprint.requestFailed },
    ]);
  }
}

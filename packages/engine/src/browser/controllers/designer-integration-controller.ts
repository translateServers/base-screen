import type {
  ScreenBlueprintEditOptions,
  ScreenDiagnostic,
  ScreenDocument,
} from '@base-screen/contracts';
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
  readonly requestBlueprintEdit: (options?: ScreenBlueprintEditOptions) => boolean;
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
    if (action !== 'open-blueprint' && action !== 'locate-blueprint') return false;
    const document = this.callbacks.getDocument();
    const focusedComponentId = this.callbacks.getInteraction().focusedComponentId;
    if (document === undefined || (action === 'locate-blueprint' && focusedComponentId === null)) {
      this.emitBlueprintDiagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE');
      return true;
    }
    const requested =
      action === 'locate-blueprint'
        ? this.callbacks.requestBlueprintEdit({ initialComponentId: focusedComponentId })
        : this.callbacks.requestBlueprintEdit();
    if (!requested) {
      this.emitBlueprintDiagnostic('BLUEPRINT_CAPABILITY_UNAVAILABLE');
    }
    return true;
  }

  clear(): void {
    if (this.#eventsPanel !== undefined) this.#eventsPanel.replaceChildren();
  }

  /** 释放面板引用（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。 */
  release(): void {
    this.#eventsPanel = undefined;
  }

  private emitBlueprintDiagnostic(code: ScreenDiagnostic['code']): void {
    this.callbacks.emitDiagnostics([
      { severity: 'error', code, path: [], message: DESIGNER_UI_TEXT.blueprint.requestFailed },
    ]);
  }
}

import type {
  ScreenBlueprint,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  type ScreenDocumentCommand,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerBlueprintRule,
  renderDesignerBlueprintWorkspace,
  renderDesignerEventsPanel,
} from './designer-blueprint-dom.js';

export interface DesignerIntegrationCallbacks {
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getInteraction: () => ScreenInteractionState;
  readonly executeCommand: (command: ScreenDocumentCommand) => ScreenParseResult<ScreenDocument>;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerIntegrationController {
  #eventsPanel: HTMLDivElement | undefined;
  #workspace: HTMLElement | undefined;
  #blueprintOpen = false;

  constructor(private readonly callbacks: DesignerIntegrationCallbacks) {}

  connect(eventsPanel: HTMLDivElement, workspace: HTMLElement): void {
    this.#eventsPanel = eventsPanel;
    this.#workspace = workspace;
    this.render();
  }

  render(): void {
    renderDesignerEventsPanel(
      this.#eventsPanel,
      this.callbacks.getDocument(),
      this.callbacks.getInteraction(),
      this.callbacks.getCatalog(),
    );
    if (this.#workspace === undefined) return;
    this.#workspace.hidden = !this.#blueprintOpen;
    if (this.#blueprintOpen) {
      renderDesignerBlueprintWorkspace(
        this.#workspace,
        this.callbacks.getDocument(),
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
      );
    }
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'open-blueprint') {
      this.#blueprintOpen = true;
      this.render();
      return true;
    }
    if (action === 'close-blueprint') {
      this.#blueprintOpen = false;
      this.render();
      return true;
    }
    const document = this.callbacks.getDocument();
    if (document === undefined) return false;
    if (action === 'blueprint-add-rule') {
      const blueprint = createDesignerBlueprintRule(
        document,
        this.callbacks.getInteraction(),
        this.callbacks.getCatalog(),
      );
      if (blueprint !== undefined) {
        this.commitBlueprint(document, blueprint);
      }
      return true;
    }
    const id = target.closest<HTMLButtonElement>('[data-blueprint-remove-rule]')?.dataset
      .blueprintRemoveRule;
    if (id === undefined) return false;
    this.commitBlueprint(document, {
      rules: document.blueprint.rules.filter((rule) => rule.id !== id),
    });
    return true;
  }

  clear(): void {
    this.#blueprintOpen = false;
    if (this.#workspace !== undefined) this.#workspace.hidden = true;
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) this.callbacks.emitDiagnostics(result.diagnostics);
  }

  private commitBlueprint(document: ScreenDocument, blueprint: ScreenBlueprint): void {
    const compiled = compileScreenBlueprint({ ...document, blueprint });
    if (!compiled.ok) {
      this.callbacks.emitDiagnostics(compiled.diagnostics);
      return;
    }
    this.report(this.callbacks.executeCommand({ type: 'replace-blueprint', blueprint }));
  }
}

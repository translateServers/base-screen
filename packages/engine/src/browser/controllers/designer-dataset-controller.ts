import type { ScreenDatasetDescriptor } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDataSourcePanelOptions,
  DesignerDatasetAuthoringView,
} from '../dom/designer-dataset-dom.js';
import {
  type DesignerDatasetControllerCallbacks,
  type DesignerDatasetControllerContext,
  DesignerDatasetControllerState,
} from './dataset/designer-dataset-controller-context.js';
import {
  applyDatasetDraft,
  describeDataset,
  restoreDatasetDraft,
  syncDraftToFocusedComponent,
} from './dataset/designer-dataset-draft-controller.js';
import {
  handleDatasetChange,
  handleDatasetClick,
  handleDatasetInput,
  handleDatasetKeyDown,
} from './dataset/designer-dataset-events.js';
import {
  cancelDatasetPreview,
  copyPreviewData,
  testDatasetDraft,
} from './dataset/designer-dataset-preview-controller.js';
import {
  clearDatasetSurface,
  createDatasetPanelOptions,
  focusDataWorkbench,
  focusWorkbenchSection,
  renderDatasetSurface,
  restoreBindingFieldFocus,
  restoreFullscreenActionFocus,
  setDatasetFeedback,
  syncDataFlowProgress,
} from './dataset/designer-dataset-surface-controller.js';
import { restoreStaticExample } from './dataset/designer-static-table-controller.js';
import { DesignerDataFlowScrollSync } from './designer-data-flow-scroll-sync.js';
import { DesignerDatasetCatalogController } from './designer-dataset-catalog-controller.js';

export type { DesignerDatasetControllerCallbacks } from './dataset/designer-dataset-controller-context.js';

export class DesignerDatasetController {
  readonly #state = new DesignerDatasetControllerState();
  readonly #catalogController: DesignerDatasetCatalogController;
  readonly #context: DesignerDatasetControllerContext;

  constructor(callbacks: DesignerDatasetControllerCallbacks) {
    const dataFlowScrollSync = new DesignerDataFlowScrollSync((step) =>
      syncDataFlowProgress(this.#context, step),
    );
    this.#catalogController = new DesignerDatasetCatalogController({
      getPort: callbacks.getCatalogPort,
      report: callbacks.report,
      setFeedback: (message) => setDatasetFeedback(this.#context, message),
      render: () => this.renderSurface(),
    });
    this.#context = {
      callbacks,
      state: this.#state,
      catalogController: this.#catalogController,
      dataFlowScrollSync,
      currentComponent: () => {
        const id = callbacks.getInteraction().focusedComponentId;
        return callbacks.getDocument()?.components.find((item) => item.id === id);
      },
      currentEntry: () => {
        const id = callbacks.getInteraction().focusedComponentId;
        const component = callbacks.getDocument()?.components.find((item) => item.id === id);
        return component === undefined ? undefined : callbacks.getCatalog()?.get(component.type);
      },
      renderSurface: () => this.renderSurface(),
      setFeedback: (message) => setDatasetFeedback(this.#context, message),
      cancelPreview: () => cancelDatasetPreview(this.#context),
      restoreStaticExample: (render) => restoreStaticExample(this.#context, render),
      apply: () => applyDatasetDraft(this.#context),
      restoreDatasetDraft: () => restoreDatasetDraft(this.#context),
      focusWorkbenchSection: (step) => focusWorkbenchSection(this.#context, step),
      testDatasetDraft: () => testDatasetDraft(this.#context),
      copyPreviewData: () => copyPreviewData(this.#context),
      focusDataWorkbench: () => focusDataWorkbench(this.#context),
      restoreFullscreenActionFocus: () => restoreFullscreenActionFocus(this.#context),
      restoreBindingFieldFocus: (kind, roleId, fieldId) =>
        restoreBindingFieldFocus(this.#context, kind, roleId, fieldId),
    };
  }

  render(panel: HTMLElement | undefined): void {
    clearDatasetSurface(this.#context);
    const component = this.#context.currentComponent();
    if (component === undefined) {
      if (panel !== undefined) panel.replaceChildren(DESIGNER_UI_TEXT.dataPanelEmpty);
      return;
    }
    const describeTarget = syncDraftToFocusedComponent(this.#context);
    if (panel === undefined) return;
    this.#state.panel = panel;
    this.renderSurface();
    if (this.#state.mode !== 'dataset') return;
    this.#catalogController.ensureList();
    if (describeTarget !== undefined) {
      void describeDataset(this.#context, describeTarget.resourceType, describeTarget.resourceId);
    }
  }

  getFocusedDatasetFields(): readonly { readonly id: string; readonly label: string }[] {
    return (
      this.#state.descriptor?.fields.map((field) => ({ id: field.id, label: field.label })) ?? []
    );
  }

  clear(): void {
    this.#catalogController.clear();
    clearDatasetSurface(this.#context);
    cancelDatasetPreview(this.#context);
    this.#state.reset();
  }

  onInput(target: EventTarget | null): boolean {
    return handleDatasetInput(this.#context, target);
  }

  onClick(target: Element): boolean {
    return handleDatasetClick(this.#context, target);
  }

  onChange(target: EventTarget | null): boolean {
    return handleDatasetChange(this.#context, target);
  }

  onKeyDown(event: KeyboardEvent): boolean {
    return handleDatasetKeyDown(this.#context, event);
  }

  get descriptor(): ScreenDatasetDescriptor | undefined {
    return this.#state.descriptor;
  }

  get authoring(): DesignerDatasetAuthoringView {
    return this.#state.authoring;
  }

  private renderSurface(): void {
    renderDatasetSurface(this.#context);
  }

  private panelOptions(panel: HTMLElement): DesignerDataSourcePanelOptions {
    return createDatasetPanelOptions(this.#context, panel);
  }
}

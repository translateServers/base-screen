import type { ScreenDatasetDefinition, ScreenValueRef } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDataSourceMode,
  DesignerDatasetAuthoringView,
} from '../../dom/dataset/designer-dataset-dom.js';
import { DesignerDataFlowScrollSync } from './designer-data-flow-scroll-sync.js';
import { designerDataSourceModes } from './designer-data-source-authoring.js';
import { DesignerDatasetCatalogController } from './designer-dataset-catalog-controller.js';
import {
  type DesignerDatasetControllerCallbacks,
  type DesignerDatasetControllerContext,
  DesignerDatasetControllerState,
} from './designer-dataset-controller-context.js';
import {
  applyDatasetDraft,
  describeDataset,
  restoreDatasetDraft,
  setDatasetParameterValueRef,
  syncDraftToFocusedComponent,
} from './designer-dataset-draft-controller.js';
import {
  handleDatasetChange,
  handleDatasetClick,
  handleDatasetInput,
  handleDatasetKeyDown,
} from './designer-dataset-events.js';
import {
  cancelDatasetPreview,
  copyPreviewData,
  testDatasetDraft,
} from './designer-dataset-preview-controller.js';
import {
  clearDatasetSurface,
  focusDataWorkbench,
  focusWorkbenchSection,
  renderDatasetSurface,
  restoreBindingFieldFocus,
  restoreFullscreenActionFocus,
  setDatasetFeedback,
  syncDataFlowProgress,
  updateDatasetCatalogResults,
} from './designer-dataset-surface-controller.js';
import { restoreStaticExample } from './designer-static-table-controller.js';

export type { DesignerDatasetControllerCallbacks } from './designer-dataset-controller-context.js';

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
      renderResults: () => updateDatasetCatalogResults(this.#context),
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
      setParameterValueRef: (name, ref) => setDatasetParameterValueRef(this.#context, name, ref),
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
    if (!designerDataSourceModes(this.#context.currentEntry()).includes('dataset')) {
      this.#catalogController.clear();
    }
    if (panel === undefined) return;
    this.#state.panel = panel;
    this.renderSurface();
    if (this.#state.mode !== 'dataset') return;
    this.#catalogController.ensureList();
    if (describeTarget !== undefined) {
      void describeDataset(this.#context, describeTarget.datasetId);
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

  /**
   * 参数位选中一个取值引用（常量 / 变量）。
   *
   * 取值选择器的浮层挂在段外，选中回调要跨过 DOM 层回到草稿模型；同时这也是宿主/自动化
   * 唯一可以不经鼠标就设置参数的入口（`name` 是参数名，不是控件地址）。
   */
  setParameterValueRef(name: string, ref: ScreenValueRef): void {
    setDatasetParameterValueRef(this.#context, name, ref);
  }

  get descriptor(): ScreenDatasetDefinition | undefined {
    return this.#state.descriptor;
  }

  /** 当前面板所处的数据源模式（含宿主未接入 dataset 通道时仍然保留的 'dataset'）。 */
  get mode(): DesignerDataSourceMode {
    return this.#state.mode;
  }

  get authoring(): DesignerDatasetAuthoringView {
    return this.#state.authoring;
  }

  private renderSurface(): void {
    renderDatasetSurface(this.#context);
  }
}

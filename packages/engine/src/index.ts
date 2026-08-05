export {
  ScreenProjectController,
  type ScreenProjectControllerChange,
  type ScreenProjectControllerOptions,
  type ScreenProjectPhase,
  type ScreenProjectScheduler,
} from './common/project/project-controller.js';

import type {
  ScreenAssetCatalogPort,
  ScreenAssetSummary,
  ScreenDesignerHostAdapter,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectCatalogPort,
  ScreenProjectEnvelope,
  ScreenProjectPreviewPort,
  ScreenProjectSnapshot,
  ScreenProjectSnapshotPort,
  ScreenProjectSummary,
} from '@base-screen/contracts';
import {
  parseScreenDocument,
  serializeScreenDocument,
  validateScreenDesignerHostAdapter,
} from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenInteractionAction,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { type BaseScreenRenderer, createBaseScreenRenderer } from '@base-screen/renderer';
import { DesignerAssetController } from './browser/controllers/designer-asset-controller.js';
import { DesignerGestureController } from './browser/controllers/designer-gesture-controller.js';
import { DesignerImportController } from './browser/controllers/designer-import-controller.js';
import { DesignerIntegrationController } from './browser/controllers/designer-integration-controller.js';
import { DesignerLayersController } from './browser/controllers/designer-layers-controller.js';
import { DesignerNotificationController } from './browser/controllers/designer-notification-controller.js';
import { DesignerPanelController } from './browser/controllers/designer-panel-controller.js';
import { DesignerPreviewController } from './browser/controllers/designer-preview-controller.js';
import { DesignerProjectFeedbackController } from './browser/controllers/designer-project-feedback-controller.js';
import { DesignerProjectWorkspaceController } from './browser/controllers/designer-project-workspace-controller.js';
import { DesignerViewportController } from './browser/controllers/designer-viewport-controller.js';
import { DesignerWorkbenchController } from './browser/controllers/designer-workbench-controller.js';
import { renderDesignerInteractionPanel } from './browser/dom/designer-interaction-dom.js';
import { renderDesignerSelection } from './browser/dom/designer-selection-dom.js';
import {
  contextMenuHtml,
  createDesignerWorkspace,
  type DesignerContextMenuAction,
} from './browser/dom/designer-workspace.js';
import { createDesignerStyle } from './browser/styles/designer-style.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createReparentTransaction,
  createZOrderTransaction,
} from './common/operations/designer-layout-operations.js';
import {
  DESIGNER_OPERATION_TEXT,
  DesignerOperationRegistry,
  shortcutFromKeyboardEvent,
} from './common/operations/designer-operation-registry.js';
import { selectedComponents } from './common/operations/designer-selection.js';
import type { ScreenProjectPhase } from './common/project/project-controller.js';
import { DesignerSession } from './common/session/designer-session.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolId,
  type DesignerToolMaterialTypes,
  getDesignerToolShortcut,
  isDesignerToolConfigured,
} from './common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT } from './common/ui-text/designer-ui-text.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

interface DesignerOperationContext {
  readonly command?: ScreenDocumentCommand;
  readonly transaction?: ScreenDocumentTransaction;
  readonly runCommand?: () => ScreenParseResult<ScreenDocument>;
  readonly runTransaction?: () => ScreenParseResult<ScreenDocument>;
}

// 画布右键菜单按右键目标动态组合：空白画布与组件上显示不同菜单。
const DESIGNER_CONTEXT_MENU = {
  canvas: [
    'undo',
    'redo',
    'separator',
    'select-all',
    'paste',
    'separator',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
    'zoom-fit',
    'separator',
    'toggle-grid',
    'toggle-snap',
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
  component: [
    'undo',
    'redo',
    'separator',
    'copy',
    'paste',
    'delete',
    'separator',
    'group',
    'ungroup',
  ] as const satisfies ReadonlyArray<DesignerContextMenuAction>,
};

export class BaseScreenDesignerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #designerHostAdapter: ScreenDesignerHostAdapter | undefined;
  #assetCatalogPort: ScreenAssetCatalogPort | undefined;
  #projectCatalogPort: ScreenProjectCatalogPort | undefined;
  #projectPreviewPort: ScreenProjectPreviewPort | undefined;
  #projectSnapshotPort: ScreenProjectSnapshotPort | undefined;
  #groupMaterialType: string | undefined;
  #toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #canvas: HTMLDivElement | undefined;
  #viewportElement: HTMLDivElement | undefined;
  #selection: HTMLDivElement | undefined;
  #properties: HTMLDivElement | undefined;
  #dataPanel: HTMLDivElement | undefined;
  #interactionPanel: HTMLDivElement | undefined;
  #statusFeedback: HTMLElement | undefined;
  #contextMenu: HTMLElement | undefined;
  readonly #notificationController = new DesignerNotificationController();
  #layers: HTMLDivElement | undefined;
  readonly #session = new DesignerSession({
    renderDocument: (document) => this.renderDocument(document),
    renderInteraction: () => this.renderInteraction(),
    emitChange: (document) => this.emitChange(document),
    emitSelectionChange: (interaction) =>
      this.dispatchEvent(new CustomEvent('base-screen-selection-change', { detail: interaction })),
    onProjectChange: (_project, phase) => {
      this.toggleAttribute('data-project-busy', phase === 'saving' || phase === 'publishing');
      this.#projectFeedbackController.render(phase);
      this.renderControls();
    },
    onDirtyChange: (dirty, revision) => {
      this.renderControls();
      this.dispatchEvent(
        new CustomEvent('base-screen-dirty-change', { detail: { dirty, revision } }),
      );
    },
    onConflict: () => this.dispatchEvent(new CustomEvent('base-screen-project-conflict')),
    onReady: ({ projectId, revision }) => {
      this.resetSessionSurfaces();
      this.dispatchEvent(new CustomEvent('base-screen-ready', { detail: { projectId, revision } }));
    },
  });
  readonly #gestureController = new DesignerGestureController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getViewport: () => this.#viewportController.state,
    panBy: (delta) => this.#viewportController.panBy(delta),
    zoomBy: (factor) =>
      this.#viewportController.setZoom(this.#viewportController.state.zoom * factor),
    isHandActive: () => this.#viewportController.activeTool === 'hand',
    getActiveTool: () => this.#viewportController.activeTool,
    getToolMaterialTypes: () => this.#toolMaterialTypes,
    snapCanvasPoint: (point, excludedComponentIds) =>
      this.#workbenchController.snapPoint(point, excludedComponentIds),
    snapCanvasSelection: (bounds, offset, excludedComponentIds) =>
      this.#workbenchController.snapSelectionOffset(bounds, offset, excludedComponentIds),
    renderSnapPreview: (point) => this.#workbenchController.renderSnapPreview(point),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    reportTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    renderSelection: () => this.renderSelection(),
    focusViewport: () => this.#viewportController.focus(),
  });
  readonly #layersController = new DesignerLayersController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #integrationController = new DesignerIntegrationController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getRuntimeContributions: () => this.#runtimeContributions,
    executeCommand: (command) => this.executeDesignerCommand(command),
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #projectFeedbackController = new DesignerProjectFeedbackController({
    continueEditing: () => this.#session.continueEditing(),
    isDirty: () => this.#session.dirty,
    reloadRemote: (discardChanges) => this.#session.reloadRemote(discardChanges),
    report: (result) => this.reportProject(result),
  });
  readonly #previewController = new DesignerPreviewController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getResourcePort: () => this.#resourcePort,
    isViewerRegistered: () =>
      this.ownerDocument.defaultView?.customElements.get('base-screen-viewer') !== undefined,
  });
  readonly #projectWorkspaceController = new DesignerProjectWorkspaceController({
    createProject: (name) => this.createProject(name),
    deleteProject: (projectId, revision) => this.deleteProject(projectId, revision),
    getCapabilities: () => ({
      directory: this.#projectCatalogPort !== undefined,
      preview: this.#projectPreviewPort !== undefined,
      snapshots: this.#projectSnapshotPort !== undefined,
    }),
    getProject: () => this.#session.project,
    listProjects: () => this.listProjects(),
    listSnapshots: () => this.listSnapshots(),
    loadProject: (projectId) => this.load(projectId),
    previewProject: (published) => this.previewProject(published),
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
    restoreSnapshot: (snapshotId) => this.restoreSnapshot(snapshotId),
  });
  readonly #assetController = new DesignerAssetController({
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getPort: () => this.#assetCatalogPort,
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #importController = new DesignerImportController({
    replaceDocument: (document) => this.replaceDocument(document),
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #panelController = new DesignerPanelController({
    getCatalog: () => this.#catalog,
    getDocument: () => this.#session.document,
    getGroupMaterialType: () => this.#groupMaterialType,
    getInteraction: () => this.#session.interaction,
    getResourcePort: () => this.#resourcePort,
    getRuntimeContributions: () => this.#runtimeContributions,
    executeCommand: (command) => this.executeDesignerCommand(command),
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    redo: () => this.#session.redo(),
    setZoom: (zoom) => this.#viewportController.setZoomCentered(zoom),
    undo: () => this.#session.undo(),
    getZoom: () => this.#viewportController.state.zoom,
    emitDiagnostics: (diagnostics) => this.emitDiagnostics(diagnostics),
  });
  readonly #viewportController = new DesignerViewportController({
    getDocument: () => this.#session.document,
    onBlur: () => {
      this.cancelGesture();
      this.#workbenchController.cancelTransientState();
    },
    onToolChange: () => {
      this.#workbenchController.cancelTransientState();
      this.renderControls();
    },
    onViewportChange: () => this.#workbenchController.renderCanvasPrecision(),
  });
  readonly #workbenchController = new DesignerWorkbenchController({
    getCanvas: () => this.#canvas,
    getDocument: () => this.#session.document,
    getRoot: () => this.shadowRoot,
    getZoom: () => this.#viewportController.state.zoom,
  });
  readonly #operations = new DesignerOperationRegistry<DesignerOperationContext | undefined>([
    ...DESIGNER_TOOLS.map((tool) => this.toolOperation(tool.id)),
    {
      id: 'document.commit',
      scope: 'canvas',
      label: '提交编辑',
      tooltip: '提交编辑',
      isAvailable: () => true,
      isEnabled: (context) =>
        ((context?.transaction !== undefined && context.runTransaction !== undefined) ||
          (context?.command !== undefined && context.runCommand !== undefined)) &&
        this.#session.document !== undefined,
      execute: (context) => {
        context?.runTransaction?.() ?? context?.runCommand?.();
      },
    },
    this.operation(
      'undo',
      () => this.#session.canUndo,
      () => this.report(this.undo()),
    ),
    this.operation(
      'redo',
      () => this.#session.canRedo,
      () => this.report(this.redo()),
    ),
    this.operation(
      'select-all',
      () => (this.#session.document?.components.length ?? 0) > 0,
      () => {
        const document = this.#session.document;
        if (document === undefined) return;
        const componentIds = document.components.map((component) => component.id);
        this.#session.reduceSelection({
          type: 'replace-selection',
          componentIds,
          focusedComponentId: componentIds.at(-1) ?? null,
        });
      },
      'canvas',
    ),
    this.operation(
      'delete',
      () => this.canMutateSelection(),
      () => this.deleteSelection(),
      'canvas',
    ),
    this.operation(
      'escape',
      () => this.#session.interaction.selectedComponentIds.length > 0,
      () => {
        this.cancelGesture();
        this.#session.reduceSelection({ type: 'clear-selection' });
      },
      'canvas',
    ),
    this.operation(
      'nudge-left',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(-1, 0),
    ),
    this.operation(
      'nudge-right',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(1, 0),
    ),
    this.operation(
      'nudge-up',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(0, -1),
    ),
    this.operation(
      'nudge-down',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(0, 1),
    ),
    this.operation(
      'copy',
      () => this.#session.interaction.selectedComponentIds.length > 0,
      () => this.copy(),
      'canvas',
    ),
    this.operation(
      'paste',
      () => this.#panelController.hasClipboard,
      () => this.report(this.paste()),
      'canvas',
    ),
    this.operation(
      'group',
      () => this.#panelController.canGroup,
      () => this.report(this.group()),
      'canvas',
    ),
    this.operation(
      'ungroup',
      () => this.#panelController.canUngroup,
      () => this.report(this.ungroup()),
      'canvas',
    ),
    this.operation(
      'align-left',
      () => this.#panelController.canAlign,
      () => this.report(this.align('left')),
      'canvas',
    ),
    this.operation(
      'align-center',
      () => this.#panelController.canAlign,
      () => this.report(this.align('center')),
      'canvas',
    ),
    this.operation(
      'align-right',
      () => this.#panelController.canAlign,
      () => this.report(this.align('right')),
      'canvas',
    ),
    this.operation(
      'align-top',
      () => this.#panelController.canAlign,
      () => this.report(this.align('top')),
      'canvas',
    ),
    this.operation(
      'align-middle',
      () => this.#panelController.canAlign,
      () => this.report(this.align('middle')),
      'canvas',
    ),
    this.operation(
      'align-bottom',
      () => this.#panelController.canAlign,
      () => this.report(this.align('bottom')),
      'canvas',
    ),
    this.operation(
      'distribute-horizontal',
      () => this.#panelController.canDistribute,
      () => this.report(this.distribute('horizontal')),
      'canvas',
    ),
    this.operation(
      'distribute-vertical',
      () => this.#panelController.canDistribute,
      () => this.report(this.distribute('vertical')),
      'canvas',
    ),
    this.operation(
      'zoom-in',
      () => true,
      () => this.#viewportController.setZoomCentered(this.#viewportController.state.zoom * 1.2),
      'canvas',
    ),
    this.operation(
      'zoom-out',
      () => true,
      () => this.#viewportController.setZoomCentered(this.#viewportController.state.zoom / 1.2),
      'canvas',
    ),
    this.operation(
      'zoom-reset',
      () => true,
      () => this.#viewportController.reset(),
      'canvas',
    ),
    this.operation(
      'zoom-fit',
      () => this.#session.document !== undefined,
      () => this.fitViewportToSelectionOrCanvas(),
      'canvas',
    ),
    this.operation(
      'preview',
      () => this.#session.document !== undefined && this.#session.project === undefined,
      () => this.reportPreview(this.togglePreview()),
    ),
    this.operation(
      'project-workspace',
      () =>
        this.#projectCatalogPort !== undefined ||
        this.#projectPreviewPort !== undefined ||
        this.#projectSnapshotPort !== undefined,
      () => this.#projectWorkspaceController.open(),
      'global',
      () =>
        this.#projectCatalogPort !== undefined ||
        this.#projectPreviewPort !== undefined ||
        this.#projectSnapshotPort !== undefined,
    ),
    this.operation(
      'export',
      () => this.#session.document !== undefined,
      () => this.exportFromOperation(),
    ),
    this.operation(
      'import',
      () => true,
      () => this.openImportPicker(),
    ),
    this.operation(
      'project-save',
      () =>
        this.#session.project !== undefined &&
        !this.isProjectBusy() &&
        this.#session.projectPhase !== 'conflict',
      () => void this.save().then((result) => this.reportProject(result)),
    ),
    this.operation(
      'project-publish',
      () =>
        this.#session.project !== undefined &&
        !this.isProjectBusy() &&
        this.#session.projectPhase === 'ready' &&
        !this.#session.dirty,
      () => void this.publish().then((result) => this.reportProject(result)),
      'global',
      () => this.#session.adapter?.capabilities.publish === true,
    ),
    this.operation(
      'project-retry',
      () => this.#session.projectPhase === 'error',
      () => void this.retryLastProjectOperation().then((result) => this.reportProject(result)),
    ),
    this.operation(
      'project-cancel',
      () => this.isProjectBusy(),
      () => this.cancelProjectOperation(),
    ),
    this.operation(
      'toggle-grid',
      () => true,
      () => this.#workbenchController.toggleCanvasAid('gridEnabled'),
      'canvas',
    ),
    this.operation(
      'toggle-snap',
      () => true,
      () => this.#workbenchController.toggleCanvasAid('gridSnapEnabled'),
      'canvas',
    ),
    this.operation(
      'toggle-workbench',
      () => true,
      () => this.#workbenchController.cycleMode(),
    ),
    this.operation(
      'duplicate',
      () => this.canMutateSelection(),
      () => this.report(this.#panelController.duplicate()),
      'canvas',
    ),
    this.operation(
      'lock',
      () => this.canSetSelectionStatus(),
      () => this.toggleSelectionStatus('locked', true),
      'canvas',
    ),
    this.operation(
      'unlock',
      () => this.canSetSelectionStatus(),
      () => this.toggleSelectionStatus('locked', false),
      'canvas',
    ),
    this.operation(
      'hide',
      () => this.canSetSelectionStatus(),
      () => this.toggleSelectionStatus('hidden', true),
      'canvas',
    ),
    this.operation(
      'bring-to-front',
      () => this.canMutateSelection(),
      () => this.reorderSelection('front'),
      'canvas',
    ),
    this.operation(
      'send-to-back',
      () => this.canMutateSelection(),
      () => this.reorderSelection('back'),
      'canvas',
    ),
    this.operation(
      'toggle-guides',
      () => true,
      () => this.#workbenchController.toggleGuides(),
      'canvas',
    ),
    this.operation(
      'toggle-border-guides',
      () => true,
      () => this.#workbenchController.toggleBorderGuides(),
      'canvas',
    ),
    this.operation(
      'show-help',
      () => true,
      () => this.toggleHelpPanel(),
    ),
    this.operation(
      'nudge-10-left',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(-10, 0),
    ),
    this.operation(
      'nudge-10-right',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(10, 0),
    ),
    this.operation(
      'nudge-10-up',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(0, -10),
    ),
    this.operation(
      'nudge-10-down',
      () => this.canMutateSelection(),
      () => this.nudgeSelection(0, 10),
    ),
  ]);

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Catalog cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    this.#catalog = value;
    this.initialize();
  }

  get runtimeContributions(): BaseScreenRuntimeContributionIndex | undefined {
    return this.#runtimeContributions;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    this.#runtimeContributions = value;
    if (this.#renderer !== undefined) {
      this.#renderer.dispose();
      this.#renderer = undefined;
      this.createRenderer();
      if (this.#session.document !== undefined) this.renderDocument(this.#session.document);
    }
    this.renderInteraction();
  }

  get projectAdapter(): ScreenProjectAdapter | undefined {
    return this.#session.adapter;
  }

  set projectAdapter(value: ScreenProjectAdapter | undefined) {
    const bound = this.#session.bindProjectAdapter(value);
    if (!bound.ok) {
      this.emitDiagnostics(bound.diagnostics);
    }
  }

  get toolMaterialTypes(): DesignerToolMaterialTypes | undefined {
    return this.#toolMaterialTypes;
  }

  set toolMaterialTypes(value: DesignerToolMaterialTypes | undefined) {
    this.#toolMaterialTypes = value;
    this.renderControls();
  }

  get groupMaterialType(): string | undefined {
    return this.#groupMaterialType;
  }

  set groupMaterialType(value: string | undefined) {
    this.#groupMaterialType = value;
    this.renderControls();
  }

  get resourcePort(): ScreenHostResourcePort | undefined {
    return this.#resourcePort;
  }

  get designerHostAdapter(): ScreenDesignerHostAdapter | undefined {
    return this.#designerHostAdapter;
  }

  set designerHostAdapter(value: ScreenDesignerHostAdapter | undefined) {
    if (value === undefined) {
      this.#designerHostAdapter = undefined;
      this.assetCatalogPort = undefined;
      this.projectCatalogPort = undefined;
      this.projectPreviewPort = undefined;
      this.projectSnapshotPort = undefined;
      this.resourcePort = undefined;
      return;
    }
    const parsed = validateScreenDesignerHostAdapter(value);
    if (!parsed.ok) {
      this.emitDiagnostics(parsed.diagnostics);
      return;
    }
    if (this.#renderer !== undefined && parsed.value.resources !== this.#resourcePort) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    this.#designerHostAdapter = parsed.value;
    this.assetCatalogPort = parsed.value.assets;
    this.projectCatalogPort = parsed.value.projectCatalog;
    this.projectPreviewPort = parsed.value.projectPreview;
    this.projectSnapshotPort = parsed.value.projectSnapshots;
    this.resourcePort = parsed.value.resources;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    this.#resourcePort = value;
    this.initialize();
  }

  get assetCatalogPort(): ScreenAssetCatalogPort | undefined {
    return this.#assetCatalogPort;
  }

  set assetCatalogPort(value: ScreenAssetCatalogPort | undefined) {
    this.#assetCatalogPort = value;
    this.renderProperties();
  }

  get projectCatalogPort(): ScreenProjectCatalogPort | undefined {
    return this.#projectCatalogPort;
  }

  set projectCatalogPort(value: ScreenProjectCatalogPort | undefined) {
    this.#projectCatalogPort = value;
  }

  get projectPreviewPort(): ScreenProjectPreviewPort | undefined {
    return this.#projectPreviewPort;
  }

  set projectPreviewPort(value: ScreenProjectPreviewPort | undefined) {
    this.#projectPreviewPort = value;
  }

  get projectSnapshotPort(): ScreenProjectSnapshotPort | undefined {
    return this.#projectSnapshotPort;
  }

  set projectSnapshotPort(value: ScreenProjectSnapshotPort | undefined) {
    this.#projectSnapshotPort = value;
  }

  get document(): ScreenDocument | undefined {
    return this.#session.document;
  }

  set document(value: ScreenDocument | undefined) {
    if (value === undefined) {
      this.unload();
      return;
    }
    this.report(this.replaceDocument(value));
  }

  connectedCallback(): void {
    this.initialize();
    if (this.#renderer !== undefined && this.#session.document !== undefined) {
      this.renderDocument(this.#session.document);
      this.renderInteraction();
    }
  }

  disconnectedCallback(): void {
    this.cancelGesture();
    this.#assetController.clear();
    this.resetSessionSurfaces();
    this.#session.cancelProjectOperation();
    this.#renderer?.clear();
  }

  getDocument(): ScreenDocument | undefined {
    return this.#session.document;
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.cancelGesture();
    const result = this.#session.replaceDocument(document);
    if (result.ok) this.resetSessionSurfaces();
    return result;
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.#session.executeCommand(command);
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    return this.#session.executeTransaction(transaction);
  }

  group(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.group();
  }

  ungroup(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.ungroup();
  }

  reparent(
    componentIds: readonly string[],
    parentId: string | null,
  ): ScreenParseResult<ScreenDocument> {
    const document = this.#session.document;
    if (document === undefined) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('No document is available to reparent.')],
      };
    }
    if (
      parentId !== null &&
      this.#catalog?.get(
        document.components.find((component) => component.id === parentId)?.type ?? '',
      )?.manifest.designCapabilities.children !== true
    ) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('The selected parent does not accept children.')],
      };
    }
    return this.#session.executeTransaction(
      createReparentTransaction(document, componentIds, parentId),
    );
  }

  align(alignment: BaseScreenAlignment): ScreenParseResult<ScreenDocument> {
    return this.#panelController.align(alignment);
  }

  distribute(distribution: BaseScreenDistribution): ScreenParseResult<ScreenDocument> {
    return this.#panelController.distribute(distribution);
  }

  copy(): void {
    this.#panelController.copy();
    this.renderControls();
  }

  paste(): ScreenParseResult<ScreenDocument> {
    return this.#panelController.paste();
  }

  undo(): ScreenParseResult<ScreenDocument> {
    return this.#session.undo();
  }

  redo(): ScreenParseResult<ScreenDocument> {
    return this.#session.redo();
  }

  exportDocument(): ScreenParseResult<string> {
    const document = this.#session.document;
    if (document === undefined)
      return { ok: false, diagnostics: [lifecycleDiagnostic('No document to export.')] };
    try {
      return { ok: true, value: serializeScreenDocument(document), diagnostics: [] };
    } catch (error) {
      const diagnostics =
        error instanceof Error && 'diagnostics' in error
          ? (error as { readonly diagnostics: readonly ScreenDiagnostic[] }).diagnostics
          : [lifecycleDiagnostic('Document export failed.')];
      return { ok: false, diagnostics };
    }
  }

  importDocument(document: unknown): ScreenParseResult<ScreenDocument> {
    const parsed = parseScreenDocument(document);
    if (!parsed.ok) return parsed;
    return this.replaceDocument(parsed.value);
  }

  togglePreview(): ScreenParseResult<void> {
    if (this.#session.document === undefined) {
      return { ok: false, diagnostics: [lifecycleDiagnostic('No document to preview.')] };
    }
    if (this.#session.project !== undefined) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Project preview requires a host preview capability.')],
      };
    }
    return this.#previewController.toggle()
      ? { ok: true, value: undefined, diagnostics: [] }
      : {
          ok: false,
          diagnostics: [
            lifecycleDiagnostic('Direct preview requires base-screen-viewer to be registered.'),
          ],
        };
  }

  load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.load(projectId);
  }

  listProjects(
    query = '',
    published: boolean | undefined = undefined,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>> {
    if (this.#projectCatalogPort === undefined) {
      return Promise.resolve({
        ok: false,
        diagnostics: [lifecycleDiagnostic('Project catalog capability is unavailable.')],
      });
    }
    return this.#projectCatalogPort.list({
      query,
      published,
      signal: new AbortController().signal,
    });
  }

  createProject(name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#projectCatalogPort === undefined) return Promise.resolve(projectPortUnavailable());
    return this.#projectCatalogPort.create({ name, signal: new AbortController().signal });
  }

  cloneProject(projectId: string, name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#projectCatalogPort === undefined) return Promise.resolve(projectPortUnavailable());
    return this.#projectCatalogPort.clone({
      projectId,
      name,
      signal: new AbortController().signal,
    });
  }

  deleteProject(projectId: string, revision: string): Promise<ScreenParseResult<void>> {
    if (this.#projectCatalogPort === undefined) return Promise.resolve(projectPortUnavailable());
    return this.#projectCatalogPort.delete({
      projectId,
      revision,
      signal: new AbortController().signal,
    });
  }

  importProject(
    name: string,
    document: ScreenDocument,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#projectCatalogPort === undefined) return Promise.resolve(projectPortUnavailable());
    return this.#projectCatalogPort.import({
      name,
      document,
      signal: new AbortController().signal,
    });
  }

  exportProject(projectId: string, revision: string): Promise<ScreenParseResult<ScreenDocument>> {
    if (this.#projectCatalogPort === undefined) {
      return Promise.resolve({
        ok: false,
        diagnostics: [projectPortUnavailable().diagnostics[0]!],
      });
    }
    return this.#projectCatalogPort.export({
      projectId,
      revision,
      signal: new AbortController().signal,
    });
  }

  previewProject(published: boolean): Promise<ScreenParseResult<ScreenDocument>> {
    const project = this.#session.project;
    if (project === undefined || this.#projectPreviewPort === undefined) {
      return Promise.resolve({
        ok: false,
        diagnostics: [lifecycleDiagnostic('Project preview capability is unavailable.')],
      });
    }
    return this.#projectPreviewPort
      .load({
        projectId: project.projectId,
        revision: project.revision,
        published,
        signal: new AbortController().signal,
      })
      .then((result) =>
        result.ok
          ? { ok: true, value: result.value.document, diagnostics: [] }
          : { ok: false, diagnostics: result.diagnostics },
      );
  }

  listSnapshots(): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>> {
    const project = this.#session.project;
    if (project === undefined || this.#projectSnapshotPort === undefined) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return this.#projectSnapshotPort.list(project.projectId, new AbortController().signal);
  }

  createSnapshot(name: string): Promise<ScreenParseResult<ScreenProjectSnapshot>> {
    const project = this.#session.project;
    const document = this.#session.document;
    if (
      project === undefined ||
      document === undefined ||
      this.#projectSnapshotPort === undefined
    ) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return this.#projectSnapshotPort.create({
      projectId: project.projectId,
      revision: project.revision,
      name,
      document,
      signal: new AbortController().signal,
    });
  }

  restoreSnapshot(snapshotId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const project = this.#session.project;
    if (project === undefined || this.#projectSnapshotPort === undefined) {
      return Promise.resolve(snapshotPortUnavailable());
    }
    return this.#projectSnapshotPort
      .restore(project.projectId, snapshotId, new AbortController().signal)
      .then((result) => {
        if (!result.ok) return result;
        const replaced = this.replaceDocument(result.value.document);
        return replaced.ok
          ? this.#session.load(result.value.projectId)
          : { ok: false, diagnostics: replaced.diagnostics };
      });
  }

  listAssets(query = ''): Promise<ScreenParseResult<readonly ScreenAssetSummary[]>> {
    if (this.#assetCatalogPort === undefined) {
      return Promise.resolve({
        ok: false,
        diagnostics: [lifecycleDiagnostic('Asset catalog capability is unavailable.')],
      });
    }
    return this.#assetCatalogPort.list({ query, signal: new AbortController().signal });
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.save();
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.publish();
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.retryLastProjectOperation();
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.reloadRemote(discardChanges);
  }

  continueEditing(): ScreenParseResult<void> {
    return this.#session.continueEditing();
  }

  cancelProjectOperation(): void {
    this.#session.cancelProjectOperation();
  }

  unload(): void {
    this.#session.unload();
    this.resetSessionSurfaces();
    this.#renderer?.dispose();
    this.#renderer = undefined;
    this.renderInteraction();
  }

  private initialize(): void {
    if (!this.isConnected || this.#catalog === undefined || this.#renderer !== undefined) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.replaceChildren(
      createDesignerStyle(this.ownerDocument),
      createDesignerWorkspace(this.ownerDocument, this.#catalog.list(), this.#toolMaterialTypes),
    );
    this.#viewportElement = shadow.querySelector<HTMLDivElement>('[data-viewport]')!;
    this.#canvas = shadow.querySelector<HTMLDivElement>('[data-canvas]')!;
    this.#selection = shadow.querySelector<HTMLDivElement>('[data-selection]')!;
    this.#properties = shadow.querySelector<HTMLDivElement>('[data-properties]')!;
    this.#dataPanel = shadow.querySelector<HTMLDivElement>('[data-inspector-pane="data"]')!;
    this.#interactionPanel = shadow.querySelector<HTMLDivElement>(
      '[data-inspector-pane="interaction"]',
    )!;
    this.#statusFeedback = shadow.querySelector<HTMLElement>('[data-status-feedback]')!;
    this.#contextMenu = shadow.querySelector<HTMLElement>('[data-context-menu]')!;
    this.#notificationController.connect(
      shadow.querySelector<HTMLElement>('[data-notifications]')!,
    );
    this.#integrationController.connect(
      shadow.querySelector<HTMLDivElement>('[data-events-panel]')!,
      shadow.querySelector<HTMLElement>('[data-blueprint-workspace]')!,
    );
    this.#importController.connect(
      shadow.querySelector<HTMLElement>('[data-import-confirmation]')!,
    );
    this.#previewController.connect(shadow);
    this.#projectWorkspaceController.connect(
      shadow.querySelector<HTMLElement>('[data-project-workspace]')!,
    );
    this.#layers = shadow.querySelector<HTMLDivElement>('[data-layers]')!;
    this.#projectFeedbackController.connect(
      shadow.querySelector<HTMLElement>('[data-project-conflict]')!,
    );
    this.#workbenchController.initialize();
    this.createRenderer();
    this.#gestureController.connect(this.#canvas);
    this.#viewportController.connect(this.#viewportElement, this.#canvas);
    shadow.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (this.#notificationController.dismiss(target)) return;
      if (this.toggleMenuFromTarget(target)) return;
      this.closeMenus();
      this.closeContextMenu();
      if (this.executeToolFromTarget(target)) return;
      if (this.executeOperationFromTarget(target)) return;
      if (this.#importController.onClick(target)) return;
      if (this.#projectFeedbackController.onClick(target)) return;
      if (this.#projectWorkspaceController.onClick(target)) return;
      if (this.#assetController.onClick(target)) return;
      if (this.#integrationController.onClick(target)) return;
      if (this.#workbenchController.onClick(target)) return;
      if (this.#layersController.onClick(event)) return;
      this.#panelController.onClick(event);
    });
    shadow.addEventListener('contextmenu', (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-viewport]')) return;
      event.preventDefault();
      this.openContextMenu(event as MouseEvent);
    });
    shadow.addEventListener('change', (event) => {
      if (this.onImportChange(event)) return;
      if (this.#integrationController.onChange(event)) return;
      if (this.#layersController.onChange(event)) return;
      this.#panelController.onPropertyChange(event);
    });
    shadow.addEventListener('input', (event) => {
      if (this.#assetController.onInput(event.target)) return;
      if (this.#panelController.onInput(event)) return;
      this.#layersController.onInput(event);
    });
    shadow.addEventListener('dragstart', (event) => {
      const dragEvent = event as DragEvent;
      if (this.#panelController.onDragStart(dragEvent)) return;
      this.#layersController.onDragStart(dragEvent);
    });
    shadow.addEventListener('dragover', (event) =>
      this.#layersController.onDragOver(event as DragEvent),
    );
    shadow.addEventListener('drop', (event) => this.#layersController.onDrop(event as DragEvent));
    shadow.addEventListener('dragend', () => this.#layersController.clearDrag());
    shadow.addEventListener('pointerdown', (event) =>
      this.#workbenchController.onPointerDown(event as PointerEvent),
    );
    shadow.addEventListener('pointermove', (event) =>
      this.#workbenchController.onPointerMove(event as PointerEvent),
    );
    shadow.addEventListener('pointerup', (event) =>
      this.#workbenchController.onPointerUp(event as PointerEvent),
    );
    shadow.addEventListener('dblclick', (event) =>
      this.#workbenchController.onDoubleClick(event as MouseEvent),
    );
    shadow.addEventListener('pointercancel', () =>
      this.#workbenchController.cancelTransientState(),
    );
    shadow.addEventListener('lostpointercapture', () =>
      this.#workbenchController.cancelTransientState(),
    );
    shadow.addEventListener('keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      const inspectorDraft = getInspectorDraftTarget(keyboardEvent);
      if (
        keyboardEvent.key === 'Enter' &&
        !keyboardEvent.isComposing &&
        inspectorDraft !== undefined &&
        !isTextAreaDraft(inspectorDraft)
      ) {
        keyboardEvent.preventDefault();
        this.#panelController.onPropertyChange({ target: inspectorDraft } as Event);
        return;
      }
      if (this.#layersController.onKeyDown(keyboardEvent)) return;
      if (this.#integrationController.onKeyDown(keyboardEvent)) return;
      if (!this.#panelController.onKeyDown(keyboardEvent)) {
        this.onKeyDown(keyboardEvent);
      }
    });
    shadow.addEventListener('keyup', (event) =>
      this.#viewportController.onKeyUp(event as KeyboardEvent),
    );
    if (this.#session.document !== undefined) {
      this.renderDocument(this.#session.document);
      this.renderInteraction();
    }
  }

  private renderDocument(document: ScreenDocument): ScreenParseResult<void> {
    this.initialize();
    if (this.#renderer === undefined) {
      return { ok: true, value: undefined, diagnostics: [] };
    }
    const rendered = this.#renderer.render(document);
    return rendered.ok
      ? { ok: true, value: undefined, diagnostics: [] }
      : { ok: false, diagnostics: rendered.diagnostics };
  }

  private renderInteraction(): void {
    this.renderSelection();
    this.renderProperties();
    this.renderInspectorInteraction();
    this.renderLayers();
    this.renderControls();
    this.#integrationController.render();
  }

  private renderSelection(): void {
    renderDesignerSelection(
      this.#selection,
      this.ownerDocument,
      this.#session.document,
      this.#session.interaction.selectedComponentIds,
      this.#catalog,
    );
  }

  private renderControls(): void {
    this.#panelController.render(undefined, this.#dataPanel);
    this.renderToolControls();
    this.renderOperationControls();
    this.renderProjectStatus();
  }

  private renderLayers(): void {
    this.#layersController.render(this.#layers);
  }

  private renderProperties(): void {
    this.#panelController.render(this.#properties, this.#dataPanel);
    this.#assetController.render(this.#properties);
  }

  private renderInspectorInteraction(): void {
    const available = renderDesignerInteractionPanel(
      this.#interactionPanel,
      this.#session.document,
      this.#session.interaction,
      this.#catalog,
      this.#runtimeContributions,
    );
    this.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-inspector-tab="interaction"]')
      ?.toggleAttribute('disabled', !available);
  }

  private createRenderer(): void {
    if (this.#canvas === undefined || this.#catalog === undefined) return;
    this.#renderer = createBaseScreenRenderer({
      root: this.#canvas,
      catalog: this.#catalog,
      mode: 'design',
      interactive: false,
      onMaterialEvent: () => undefined,
      resourcePort: this.#resourcePort,
      ...(this.#runtimeContributions === undefined
        ? {}
        : { contributionIndex: this.#runtimeContributions }),
    });
  }

  private executeOperationFromTarget(target: Element): boolean {
    const control = target.closest<HTMLButtonElement>('[data-action], [data-menu-action]');
    const id = control?.dataset.action ?? control?.dataset.menuAction;
    if (id === undefined || this.#operations.get(id) === undefined) return false;
    this.closeContextMenu();
    return this.#operations.execute(id, undefined);
  }

  private executeDesignerTransaction(
    transaction: ScreenDocumentTransaction,
  ): ScreenParseResult<ScreenDocument> {
    let result: ScreenParseResult<ScreenDocument> | undefined;
    const executed = this.#operations.execute('document.commit', {
      transaction,
      runTransaction: () => {
        result = this.#session.executeTransaction(transaction);
        return result;
      },
    });
    return (
      result ?? {
        ok: false,
        diagnostics: [lifecycleDiagnostic(executed ? '编辑操作未完成。' : '编辑操作不可用。')],
      }
    );
  }

  private executeDesignerCommand(
    command: ScreenDocumentCommand,
  ): ScreenParseResult<ScreenDocument> {
    let result: ScreenParseResult<ScreenDocument> | undefined;
    const executed = this.#operations.execute('document.commit', {
      command,
      runCommand: () => {
        result = this.#session.executeCommand(command);
        return result;
      },
    });
    return (
      result ?? {
        ok: false,
        diagnostics: [lifecycleDiagnostic(executed ? '编辑操作未完成。' : '编辑操作不可用。')],
      }
    );
  }

  private executeToolFromTarget(target: Element): boolean {
    const tool = target.closest<HTMLButtonElement>('[data-tool]')?.dataset.tool as
      | DesignerToolId
      | undefined;
    if (tool === undefined || this.#operations.get(`tool.${tool}`) === undefined) return false;
    this.#operations.execute(`tool.${tool}`, undefined);
    return true;
  }

  private fitViewportToSelectionOrCanvas(): void {
    const document = this.#session.document;
    if (document === undefined) return;
    const bounds = getScreenSelectionBounds(
      selectedComponents(document, this.#session.interaction.selectedComponentIds),
    );
    if (bounds === null) {
      this.#viewportController.fit();
      return;
    }
    this.#viewportController.fitSelection({
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    });
  }

  private toggleMenuFromTarget(target: Element): boolean {
    const toggle = target.closest<HTMLButtonElement>('[data-menu-toggle]');
    if (toggle === null) return false;
    const menuId = toggle.dataset.menuToggle;
    if (menuId === undefined || this.shadowRoot === null) return true;
    for (const menu of this.shadowRoot.querySelectorAll<HTMLElement>('[data-menu]')) {
      const open = menu.dataset.menu === menuId && menu.hidden;
      menu.hidden = !open;
    }
    for (const control of this.shadowRoot.querySelectorAll<HTMLButtonElement>(
      '[data-menu-toggle]',
    )) {
      control.ariaExpanded = String(
        control === toggle &&
          !this.shadowRoot.querySelector<HTMLElement>(`[data-menu="${menuId}"]`)?.hidden,
      );
    }
    return true;
  }

  private onImportChange(event: Event): boolean {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.dataset.importDocument === undefined)
      return false;
    const file = input.files?.[0];
    if (file === undefined) return true;
    this.#importController.request(file);
    input.value = '';
    return true;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.#workbenchController.onKeyDown(event)) return;
    if (event.key === 'Escape' && (this.closeContextMenu() || this.closeMenus())) {
      event.preventDefault();
      return;
    }
    if (!isEditable(event.target) && (!event.altKey || event.ctrlKey || event.metaKey)) {
      const operation = this.#operations.findByShortcut(shortcutFromKeyboardEvent(event) ?? '');
      if (operation !== undefined && this.#operations.execute(operation.id, undefined)) {
        event.preventDefault();
        return;
      }
    }
    if (!event.defaultPrevented) this.#viewportController.onKeyDown(event);
  }

  private closeMenus(): boolean {
    if (this.shadowRoot === null) return false;
    let closed = false;
    for (const menu of this.shadowRoot.querySelectorAll<HTMLElement>('[data-menu]')) {
      if (!menu.hidden) {
        menu.hidden = true;
        closed = true;
      }
    }
    for (const control of this.shadowRoot.querySelectorAll<HTMLButtonElement>(
      '[data-menu-toggle]',
    )) {
      control.ariaExpanded = 'false';
    }
    return closed;
  }

  private openContextMenu(event: MouseEvent): void {
    const menu = this.#contextMenu;
    if (menu === undefined) return;
    const workspace = this.shadowRoot?.querySelector<HTMLElement>('.workspace');
    if (workspace === null || workspace === undefined) return;
    const target = event.target;
    const onComponent =
      target instanceof Element && target.closest('[data-base-screen-component-id]') !== null;
    menu.innerHTML = contextMenuHtml(
      onComponent ? DESIGNER_CONTEXT_MENU.component : DESIGNER_CONTEXT_MENU.canvas,
    );
    this.renderContextMenuState();
    menu.hidden = false;
    const bounds = workspace.getBoundingClientRect();
    const left = event.clientX - bounds.left;
    const top = event.clientY - bounds.top;
    menu.style.left = `${Math.max(0, Math.min(left, bounds.width - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(top, bounds.height - menu.offsetHeight))}px`;
    menu.focus();
  }

  private renderContextMenuState(): void {
    const menu = this.#contextMenu;
    if (menu === undefined) return;
    for (const control of menu.querySelectorAll<HTMLButtonElement>('[data-menu-action]')) {
      const id = control.dataset.menuAction;
      if (id === undefined) continue;
      const state = this.#operations.getState(id, undefined);
      if (state !== undefined) {
        control.hidden = !state.available;
        control.disabled = !state.enabled;
      }
    }
  }

  private closeContextMenu(): boolean {
    const menu = this.#contextMenu;
    if (menu === undefined || menu.hidden) return false;
    menu.hidden = true;
    return true;
  }

  private canMutateSelection(): boolean {
    const document = this.#session.document;
    if (document === undefined) return false;
    const selected = selectedComponents(document, this.#session.interaction.selectedComponentIds);
    return (
      selected.length > 0 &&
      new Set(selected.map((component) => component.parentId)).size === 1 &&
      selected.every((component) => !isScreenComponentEffectivelyLocked(document, component.id))
    );
  }

  private deleteSelection(): void {
    if (!this.canMutateSelection()) return;
    const componentIds = this.#session.interaction.selectedComponentIds;
    const result = this.executeDesignerCommand({ type: 'remove-components', componentIds });
    if (result.ok) this.#session.reduceSelection({ type: 'clear-selection' });
    else this.report(result);
  }

  private nudgeSelection(x: number, y: number): void {
    const document = this.#session.document;
    if (document === undefined || !this.canMutateSelection()) return;
    const selected = selectedComponents(document, this.#session.interaction.selectedComponentIds);
    this.report(
      this.executeDesignerTransaction({
        commands: selected.map((component) => ({
          type: 'update-components' as const,
          componentIds: [component.id],
          patch: {
            position: { x: component.position.x + x, y: component.position.y + y },
          },
        })),
      }),
    );
  }

  private canSetSelectionStatus(): boolean {
    const document = this.#session.document;
    if (document === undefined) return false;
    return document.components.length > 0;
  }

  private toggleSelectionStatus(property: 'locked' | 'hidden', value: boolean): void {
    const document = this.#session.document;
    if (document === undefined) return;
    const selected = selectedComponents(document, this.#session.interaction.selectedComponentIds);
    if (selected.length === 0) return;
    this.report(
      this.executeDesignerTransaction({
        commands: selected.map((component) => ({
          type: 'update-components' as const,
          componentIds: [component.id],
          patch: { status: { ...component.status, [property]: value } },
        })),
      }),
    );
  }

  private reorderSelection(edge: 'front' | 'back'): void {
    const document = this.#session.document;
    if (document === undefined || !this.canMutateSelection()) return;
    const transaction = createZOrderTransaction(
      document,
      this.#session.interaction.selectedComponentIds,
      edge,
    );
    if (transaction !== undefined) this.report(this.executeDesignerTransaction(transaction));
  }

  private toggleHelpPanel(): void {
    if (this.shadowRoot === null) return;
    const help = this.shadowRoot.querySelector<HTMLElement>('[data-menu="help"]');
    if (help === null || help === undefined) return;
    const open = help.hidden;
    this.closeMenus();
    help.hidden = !open;
    const toggle = this.shadowRoot.querySelector<HTMLElement>('[data-menu-toggle="help"]');
    if (toggle !== null) toggle.ariaExpanded = String(open);
  }

  private renderProjectStatus(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const phase = this.#session.projectPhase;
    const project = this.#session.project;
    const status = root.querySelector<HTMLElement>('[data-project-status]');
    if (status !== null) {
      status.textContent =
        project === undefined
          ? DESIGNER_UI_TEXT.directDocument
          : `${projectPhaseLabel(phase)}${this.#session.dirty ? ' *' : ''}`;
    }
    const revision = root.querySelector<HTMLElement>('[data-project-revision]');
    if (revision !== null) revision.textContent = project?.revision ?? '';
  }

  private renderOperationControls(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    for (const control of root.querySelectorAll<HTMLButtonElement>(
      '[data-action], [data-menu-action]',
    )) {
      const id = control.dataset.action ?? control.dataset.menuAction;
      if (id === undefined) continue;
      const state = this.#operations.getState(id, undefined);
      if (state !== undefined) {
        control.hidden = !state.available;
        control.disabled = !state.enabled;
      }
    }
  }

  private renderToolControls(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    for (const tool of DESIGNER_TOOLS) {
      const control = root.querySelector<HTMLButtonElement>(`[data-tool="${tool.id}"]`);
      if (control === null) continue;
      const state = this.#operations.getState(`tool.${tool.id}`, undefined);
      control.hidden = state?.available !== true;
      control.disabled = state?.enabled !== true;
      control.ariaPressed = String(this.#viewportController.activeTool === tool.id);
    }
  }

  private operation(
    id: keyof typeof DESIGNER_OPERATION_TEXT,
    isEnabled: () => boolean,
    execute: () => void,
    scope: 'global' | 'canvas' = 'global',
    isAvailable: () => boolean = () => true,
  ) {
    const text = DESIGNER_OPERATION_TEXT[id];
    return {
      id,
      scope,
      label: text.label,
      tooltip: text.tooltip,
      ...('shortcut' in text ? { shortcut: text.shortcut } : {}),
      ...(id === 'redo' ? { aliases: ['Ctrl+Y'] } : {}),
      ...(id === 'zoom-in' ? { aliases: ['Ctrl+Shift+='] } : {}),
      isAvailable: () => isAvailable(),
      isEnabled: () => isEnabled(),
      execute: () => execute(),
    };
  }

  private toolOperation(tool: DesignerToolId) {
    const definition = DESIGNER_TOOLS.find((candidate) => candidate.id === tool)!;
    return {
      id: `tool.${tool}`,
      scope: 'canvas' as const,
      label: definition.label,
      tooltip: definition.label,
      shortcut: getDesignerToolShortcut(tool),
      isAvailable: () =>
        isDesignerToolConfigured(definition, this.#toolMaterialTypes, this.#catalog),
      isEnabled: () => isDesignerToolConfigured(definition, this.#toolMaterialTypes, this.#catalog),
      execute: () => {
        this.cancelGesture();
        this.#viewportController.setActiveTool(tool);
      },
    };
  }

  private isProjectBusy(): boolean {
    return this.#session.projectPhase === 'saving' || this.#session.projectPhase === 'publishing';
  }

  private exportFromOperation(): void {
    const exported = this.exportDocument();
    if (exported.ok) {
      this.dispatchEvent(
        new CustomEvent('base-screen-export', { detail: { document: exported.value } }),
      );
    } else {
      this.emitDiagnostics(exported.diagnostics);
    }
  }

  private openImportPicker(): void {
    this.shadowRoot?.querySelector<HTMLInputElement>('[data-import-document]')?.click();
  }

  private cancelGesture(): void {
    this.#gestureController.cancel();
  }

  private resetSessionSurfaces(): void {
    this.cancelGesture();
    this.#workbenchController.clearGuides();
    this.#layersController.clearSessionState();
    this.#panelController.clearClipboard();
    this.#integrationController.clear();
    this.#projectFeedbackController.clear();
    this.#previewController.clear();
    this.#projectWorkspaceController.clear();
    this.#importController.clear();
    this.#notificationController.clear();
  }

  private report(result: ScreenParseResult<ScreenDocument>): void {
    if (!result.ok) {
      this.emitDiagnostics(result.diagnostics);
    }
  }

  private reportProject(result: ScreenParseResult<unknown>): void {
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  private reportPreview(result: ScreenParseResult<void>): void {
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  private emitDiagnostics(diagnostics: readonly ScreenDiagnostic[]): void {
    const diagnostic = diagnostics[0];
    if (diagnostic !== undefined && this.#statusFeedback !== undefined) {
      this.#statusFeedback.textContent = diagnosticSummary(diagnostic.code);
      this.#notificationController.notify(diagnosticSummary(diagnostic.code), 'error');
    }
    this.dispatchEvent(new CustomEvent('base-screen-diagnostic', { detail: { diagnostics } }));
  }

  private emitChange(document: ScreenDocument | undefined): void {
    this.dispatchEvent(new CustomEvent('base-screen-change', { detail: { document } }));
  }
}

function lifecycleDiagnostic(message: string): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_LIFECYCLE_INVALID', path: [], message };
}

function projectPhaseLabel(phase: ScreenProjectPhase): string {
  return DESIGNER_UI_TEXT.projectPhases[phase];
}

function diagnosticSummary(code: ScreenDiagnostic['code']): string {
  switch (code) {
    case 'PROJECT_CONFLICT':
      return '项目存在远端冲突。';
    case 'PROJECT_UNAVAILABLE':
      return '项目服务暂时不可用。';
    case 'PROJECT_ABORTED':
      return '项目操作已取消。';
    case 'PROJECT_DIRTY':
      return '请先保存项目。';
    case 'PROJECT_PUBLISH_UNAVAILABLE':
      return '当前项目不能发布。';
    case 'BLUEPRINT_CAPABILITY_UNAVAILABLE':
      return '当前物料不支持蓝图。';
    case 'HOST_RESOURCE_TIMEOUT':
    case 'HOST_RESOURCE_FAILED':
    case 'HOST_RESOURCE_INVALID':
      return '资源数据不可用。';
    case 'CORE_COMMAND_TARGET_LOCKED':
      return '选中组件已锁定。';
    case 'CORE_COMMAND_TARGET_HIDDEN':
      return '选中组件已隐藏。';
    case 'PLUGIN_CORE_LIFECYCLE_INVALID':
      return '当前操作无法执行。';
    default:
      return '操作未完成，请检查输入后重试。';
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isInspectorDraft(target: EventTarget | null): boolean {
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  return (
    dataset !== undefined &&
    (dataset.property !== undefined ||
      dataset.prop !== undefined ||
      dataset.canvasProperty !== undefined ||
      dataset.dataSourceType !== undefined ||
      dataset.dataSourceField !== undefined)
  );
}

function getInspectorDraftTarget(event: KeyboardEvent): EventTarget | undefined {
  return event.composedPath().find((target) => isInspectorDraft(target));
}

function isTextAreaDraft(target: EventTarget | null): boolean {
  return (target as { readonly tagName?: string } | null)?.tagName === 'TEXTAREA';
}

function projectPortUnavailable<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [lifecycleDiagnostic('Project catalog capability is unavailable.')],
  };
}

function snapshotPortUnavailable<T>(): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [lifecycleDiagnostic('Project snapshot capability is unavailable.')],
  };
}

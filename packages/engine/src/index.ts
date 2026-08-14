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
  ScreenAuthoringEditorContext,
  ScreenBlueprint,
  ScreenBlueprintCommitRequest,
  ScreenComponentTextCommitRequest,
  ScreenComponentTextTarget,
  ScreenDesignerHostAdapter,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostDatasetCatalogPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenJsonObject,
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
  MAX_AUTHORING_SOURCE_BYTES,
  parseScreenDocument,
  parseScreenJsonValue,
  SCREEN_AUTHORING_REQUEST_EVENT,
  serializeScreenDocument,
  validateScreenDesignerHostAdapter,
} from '@base-screen/contracts';
import {
  compileScreenBlueprint,
  getScreenSelectionBounds,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import {
  type BaseScreenMaterialEvent,
  type BaseScreenRenderer,
  createBaseScreenRenderer,
} from '@base-screen/renderer';
import { DesignerAssetController } from './browser/controllers/designer-asset-controller.js';
import { DesignerDatasetController } from './browser/controllers/designer-dataset-controller.js';
import { DesignerErrorConsoleController } from './browser/controllers/designer-error-console-controller.js';
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
import { DesignerEventSystem } from './browser/dom/designer-event-system.js';
import { renderDesignerInteractionPanel } from './browser/dom/designer-interaction-dom.js';
import { DesignerMenuController } from './browser/dom/designer-menu.js';
import { renderDesignerSelection } from './browser/dom/designer-selection-dom.js';
import {
  type DesignerSurfaceBindings,
  DesignerSurfaceRouter,
  getInspectorDraftTarget,
  isEditableTarget,
  isTextAreaDraft,
} from './browser/dom/designer-surface-router.js';
import {
  createDesignerWorkspace,
  downloadDesignerDocument,
  populateMaterialLibrary,
  renderMaterialLibraryState,
} from './browser/dom/designer-workspace.js';
import {
  type BaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryGrouping,
  validateBaseScreenMaterialLibraryGroupingForCatalog,
} from './material-library-grouping.js';
import {
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
  type BaseScreenMaterialLibraryState,
  parseBaseScreenMaterialLibraryState,
} from './material-library-state.js';

export {
  type BaseScreenMaterialLibraryGroup,
  type BaseScreenMaterialLibraryGrouping,
  parseBaseScreenMaterialLibraryGrouping,
} from './material-library-grouping.js';

export {
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
  type BaseScreenMaterialLibraryState,
  type BaseScreenMaterialLibraryStatus,
  parseBaseScreenMaterialLibraryState,
} from './material-library-state.js';

import { createDesignerStyle } from './browser/styles/designer-style.js';
import {
  buildScreenAuthoringEditorContext,
  createScreenAuthoringInstanceId,
  createScreenAuthoringRequestId,
  parseScreenAuthoringBlueprintCandidate,
  parseScreenComponentTextSource,
  validateScreenAuthoringCommitGuards,
} from './common/operations/designer-authoring-bridge.js';
import {
  createDesignerElementOperations,
  type DesignerElementOperationsHost,
  type DesignerOperationContext,
} from './common/operations/designer-element-operations.js';
import { withDerivedDesignerGroupBounds } from './common/operations/designer-group.js';
import {
  type BaseScreenAlignment,
  type BaseScreenDistribution,
  createReparentTransaction,
} from './common/operations/designer-layout-operations.js';
import { DesignerOperationRegistry } from './common/operations/designer-operation-registry.js';
import { selectedComponents } from './common/operations/designer-selection.js';
import { DesignerSelectionActions } from './common/operations/designer-selection-actions.js';
import { DesignerProjectGateway } from './common/project/designer-project-gateway.js';
import type { ScreenProjectPhase } from './common/project/project-controller.js';
import { DesignerSession } from './common/session/designer-session.js';
import {
  DESIGNER_TOOLS,
  type DesignerToolId,
  type DesignerToolMaterialTypes,
} from './common/tools/designer-tools.js';
import { DESIGNER_UI_TEXT, designerDiagnosticSummary } from './common/ui-text/designer-ui-text.js';

const ElementBase =
  (globalThis as { readonly HTMLElement?: typeof HTMLElement }).HTMLElement ??
  (class {} as unknown as typeof HTMLElement);

export interface BaseScreenDesignerConfiguration {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly materialLibraryState?: BaseScreenMaterialLibraryState;
  readonly materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping;
  readonly runtimeContributions?: BaseScreenRuntimeContributionIndex;
  readonly projectAdapter?: ScreenProjectAdapter;
  readonly toolMaterialTypes?: DesignerToolMaterialTypes;
  readonly groupMaterialType?: string;
  readonly designerHostAdapter?: ScreenDesignerHostAdapter;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly variablePort?: ScreenHostVariablePort;
  readonly datasetCatalogPort?: ScreenHostDatasetCatalogPort;
  readonly assetCatalogPort?: ScreenAssetCatalogPort;
  readonly projectCatalogPort?: ScreenProjectCatalogPort;
  readonly projectPreviewPort?: ScreenProjectPreviewPort;
  readonly projectSnapshotPort?: ScreenProjectSnapshotPort;
  /** 宿主预览接管：返回 true 表示宿主已接管预览，引擎不再打开内置预览浮层。 */
  readonly previewHandler?: (document: ScreenDocument) => boolean;
}

export class BaseScreenDesignerElement extends ElementBase {
  #catalog: BaseScreenMaterialCatalog | undefined;
  #materialLibraryState: BaseScreenMaterialLibraryState | undefined;
  #materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
  #runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
  #resourcePort: ScreenHostResourcePort | undefined;
  #variablePort: ScreenHostVariablePort | undefined;
  #datasetCatalogPort: ScreenHostDatasetCatalogPort | undefined;
  #designerHostAdapter: ScreenDesignerHostAdapter | undefined;
  #assetCatalogPort: ScreenAssetCatalogPort | undefined;
  #projectCatalogPort: ScreenProjectCatalogPort | undefined;
  #projectPreviewPort: ScreenProjectPreviewPort | undefined;
  #projectSnapshotPort: ScreenProjectSnapshotPort | undefined;
  #groupMaterialType: string | undefined;
  #toolMaterialTypes: DesignerToolMaterialTypes | undefined;
  #previewHandler: ((document: ScreenDocument) => boolean) | undefined;
  #renderer: BaseScreenRenderer | undefined;
  #canvas: HTMLDivElement | undefined;
  #viewportElement: HTMLDivElement | undefined;
  #selection: HTMLDivElement | undefined;
  #properties: HTMLDivElement | undefined;
  #dataPanel: HTMLDivElement | undefined;
  #interactionPanel: HTMLDivElement | undefined;
  #statusFeedback: HTMLElement | undefined;
  #contextMenu: HTMLElement | undefined;
  #lastSavedAt: number | undefined;
  readonly #instanceId = createScreenAuthoringInstanceId();
  readonly #pendingAuthoringRequests = new Map<string, { readonly kind: string }>();
  #authoringGeneration = 0;
  readonly #notificationController = new DesignerNotificationController();
  readonly #errorConsoleController = new DesignerErrorConsoleController();
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
      this.#lastSavedAt = Date.now();
      this.renderTopbarSaveStatus();
      this.dispatchEvent(new CustomEvent('base-screen-ready', { detail: { projectId, revision } }));
    },
  });
  readonly #projectGateway = new DesignerProjectGateway({
    getAssetCatalogPort: () => this.#assetCatalogPort,
    getProjectCatalogPort: () => this.#projectCatalogPort,
    getProjectPreviewPort: () => this.#projectPreviewPort,
    getProjectSnapshotPort: () => this.#projectSnapshotPort,
    getDocument: () => this.#session.document,
    getProject: () => this.#session.project,
    replaceDocument: (document) => this.replaceDocument(document),
    loadProject: (projectId) => this.#session.load(projectId),
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
    setSnapSessionActive: (active) => this.#workbenchController.setSnapSessionActive(active),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    reportTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    renderSelection: () => this.renderSelection(),
    focusViewport: () => this.#viewportController.focus(),
    setPanning: (panning) => this.#viewportController.setPanning(panning),
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
    requestBlueprintEdit: () => this.requestBlueprintEdit(),
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
    getVariablePort: () => this.#variablePort,
    getRuntimeContributions: () => this.#runtimeContributions,
    isViewerRegistered: () =>
      this.ownerDocument.defaultView?.customElements.get('base-screen-viewer') !== undefined,
  });
  readonly #projectWorkspaceController = new DesignerProjectWorkspaceController({
    createProject: (name) => this.createProject(name),
    deleteProject: (projectId, revision) => this.deleteProject(projectId, revision),
    getCapabilities: () => this.#projectGateway.capabilities,
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
  readonly #datasetController = new DesignerDatasetController({
    getCatalogPort: () => this.#datasetCatalogPort,
    getDocument: () => this.#session.document,
    getInteraction: () => this.#session.interaction,
    getCatalog: () => this.#catalog,
    getResourcePort: () => this.#resourcePort,
    getRuntimeContributions: () => this.#runtimeContributions,
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
    refresh: (componentId) => this.refreshData(componentId),
  });
  readonly #importController = new DesignerImportController({
    replaceDocument: (document) => this.replaceDocument(document),
    report: (diagnostics) => this.emitDiagnostics(diagnostics),
    notify: (message) => this.#notificationController.notify(message, 'success'),
  });
  readonly #panelController = new DesignerPanelController({
    getCatalog: () => this.#catalog,
    getMaterialLibraryGrouping: () => this.#materialLibraryGrouping,
    getDocument: () => this.#session.document,
    getDatasetFields: () => this.#datasetController.getFocusedDatasetFields(),
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
    isMaterialAvailable: (type) => !this.#materialLibraryState?.unavailableTypes?.includes(type),
    requestMaterialLibraryAction: (action) => this.requestMaterialLibraryAction(action),
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
    getInteraction: () => this.#session.interaction,
    getCatalog: () => this.#catalog,
    getRoot: () => this.shadowRoot,
    getZoom: () => this.#viewportController.state.zoom,
    // 状态栏「事件」开关：把设计态画布交互模式应用到渲染器（原地重渲染，不重建）。
    onNativeEventsChange: (enabled) => this.applyNativeEvents(enabled),
  });
  readonly #operationHost: DesignerElementOperationsHost = {
    getDocument: () => this.#session.document,
    canUndo: () => this.#session.canUndo,
    canRedo: () => this.#session.canRedo,
    getSelection: () => this.#session.interaction,
    getProject: () => this.#session.project,
    getProjectPhase: () => this.#session.projectPhase,
    hasPreviewHandler: () => this.#previewHandler !== undefined,
    isDirty: () => this.#session.dirty,
    canPublish: () => this.#session.adapter?.capabilities.publish === true,
    hasProjectWorkspace: () =>
      this.#projectCatalogPort !== undefined ||
      this.#projectPreviewPort !== undefined ||
      this.#projectSnapshotPort !== undefined,
    hasClipboard: () => this.#panelController.hasClipboard,
    canGroup: () => this.#panelController.canGroup,
    canUngroup: () => this.#panelController.canUngroup,
    canAlign: () => this.#panelController.canAlign,
    canDistribute: () => this.#panelController.canDistribute,
    canEnterGroupEditing: () => this.#gestureController.canEnterGroupEditingContext(),
    canExitGroupEditing: () => this.#gestureController.canExitGroupEditingContext(),
    getToolMaterialTypes: () => this.#toolMaterialTypes,
    getCatalog: () => this.#catalog,
    getZoom: () => this.#viewportController.state.zoom,
    undo: () => this.undo(),
    redo: () => this.redo(),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    executeCommand: (command) => this.executeDesignerCommand(command),
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    copy: () => this.copy(),
    paste: () => this.paste(),
    group: () => this.group(),
    ungroup: () => this.ungroup(),
    enterGroupEditing: () => this.#gestureController.enterGroupEditingContext(),
    exitGroupEditing: () => this.#gestureController.exitGroupEditingContext(),
    align: (alignment) => this.align(alignment),
    distribute: (distribution) => this.distribute(distribution),
    duplicate: () => this.#panelController.duplicate(),
    setZoomCentered: (zoom) => this.#viewportController.setZoomCentered(zoom),
    resetViewport: () => this.#viewportController.reset(),
    toggleCanvasAid: (aid) => this.#workbenchController.toggleCanvasAid(aid),
    isCanvasAidEnabled: (aid) => this.#workbenchController.isCanvasAidEnabled(aid),
    toggleGuides: () => this.#workbenchController.toggleGuides(),
    isGuidesVisible: () => this.#workbenchController.guidesVisible,
    toggleBorderGuides: () => this.#workbenchController.toggleBorderGuides(),
    isBorderGuidesEnabled: () => this.#workbenchController.borderGuidesEnabled,
    cycleWorkbenchMode: () => this.#workbenchController.cycleMode(),
    openProjectWorkspace: () => this.#projectWorkspaceController.open(),
    save: () => this.save(),
    publish: () => this.publish(),
    retryLastProjectOperation: () => this.retryLastProjectOperation(),
    cancelProjectOperation: () => this.cancelProjectOperation(),
    setActiveTool: (tool) => this.#viewportController.setActiveTool(tool),
    cancelGesture: () => this.cancelGesture(),
    canMutateSelection: () => this.#selectionActions.canMutate(),
    canSetSelectionStatus: () => this.#selectionActions.canSetStatus(),
    deleteSelection: () => this.#selectionActions.delete(),
    nudgeSelection: (x, y) => this.#selectionActions.nudge(x, y),
    toggleSelectionStatus: (property, value) =>
      this.#selectionActions.toggleStatus(property, value),
    reorderSelection: (edge) => this.#selectionActions.reorder(edge),
    toggleHelpPanel: () => this.#menuController.toggleHelpPanel(),
    fitViewportToSelectionOrCanvas: () => this.fitViewportToSelectionOrCanvas(),
    exportFromOperation: () => this.exportFromOperation(),
    openImportPicker: () => this.openImportPicker(),
    togglePreview: () => this.togglePreview(),
    isProjectBusy: () => this.isProjectBusy(),
    report: (result) => this.report(result),
    reportProject: (result) => this.reportProject(result),
    reportPreview: (result) => this.reportPreview(result),
  };
  readonly #operations = new DesignerOperationRegistry<DesignerOperationContext | undefined>(
    createDesignerElementOperations(this.#operationHost),
  );
  readonly #eventSystem = new DesignerEventSystem({
    isGestureActive: () => this.#gestureController.active,
    findOperation: (chord) => this.#operations.findByShortcut(chord),
    onWindowBlur: () => {
      // 窗口失焦统一复位设计器内部状态（不触达宿主）。
      this.cancelGesture();
      this.#workbenchController.cancelTransientState();
      this.#menuController.closeMenus();
      this.#menuController.closeContextMenu();
      this.#menuController.closeHelpPanel();
    },
    // 空格抓手与键盘焦点解耦：鼠标悬停视窗即可激活临时抓手（无需先点击聚焦）。
    onWindowKeyDown: (event) => this.#viewportController.onWindowKeyDown(event),
    onWindowKeyUp: (event) => this.#viewportController.onWindowKeyUp(event),
  });
  readonly #selectionActions = new DesignerSelectionActions({
    getDocument: () => this.#session.document,
    getSelectedComponentIds: () => this.#session.interaction.selectedComponentIds,
    executeCommand: (command) => this.executeDesignerCommand(command),
    executeTransaction: (transaction) => this.executeDesignerTransaction(transaction),
    reduceSelection: (action) => this.#session.reduceSelection(action),
    report: (result) => this.report(result),
  });
  readonly #menuController = new DesignerMenuController({
    getRoot: () => this.shadowRoot,
    getContextMenu: () => this.#contextMenu,
    getSelectedComponentIds: () => this.#session.interaction.selectedComponentIds,
    getOperationState: (id) => this.#operations.getState(id, undefined),
  });
  readonly #surfaceRouter = new DesignerSurfaceRouter();
  readonly #surfaceBindings: DesignerSurfaceBindings = {
    click: [
      (target) => this.#notificationController.dismiss(target as Element),
      (target) => this.#errorConsoleController.onClick(target as Element),
      (target) => this.#menuController.onHelpClick(target as Element),
      (target) => this.#menuController.toggleMenuFromTarget(target as Element),
      () => {
        this.#menuController.closeMenus();
        this.#menuController.closeContextMenu();
        return false;
      },
      (target) => this.executeToolFromTarget(target as Element),
      (target) => this.executeOperationFromTarget(target as Element),
      (target) => this.onStatusZoomPreset(target as Element),
      (target) => this.#importController.onClick(target as Element),
      (target) => this.#projectFeedbackController.onClick(target as Element),
      (target) => this.#projectWorkspaceController.onClick(target as Element),
      (target) => this.#assetController.onClick(target as Element),
      (target) => this.#datasetController.onClick(target as Element),
      (target) => this.#integrationController.onClick(target as Element),
      (target) => this.#workbenchController.onClick(target as Element),
      (target, event) => this.#layersController.onClick(event as MouseEvent),
      (target, event) => {
        this.#panelController.onClick(event as MouseEvent);
        return true;
      },
    ],
    contextMenu: (target, event) => {
      // 手势激活期间阻止浏览器右键菜单（R3）。
      if (this.#gestureController.active) {
        event.preventDefault();
        return true;
      }
      const targetElement = target as Element;
      if (targetElement.closest('[data-viewport]')) {
        event.preventDefault();
        this.#menuController.openContextMenu(event as MouseEvent);
        return true;
      }
      // 全 shadow 表面阻止浏览器默认菜单；面板不新增菜单（R4）。
      event.preventDefault();
      return true;
    },
    selectStart: (target, event) => {
      // 手势激活期全 shadow 禁选；可编辑目标放行（画布表面常禁选由手势控制器负责）。
      if (!isEditableTarget(target) && this.#gestureController.active) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    copy: (target, event) => {
      // 剪贴板事件旁路（右键/系统组合）：非可编辑目标路由到应用剪贴板操作。
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      this.#operations.execute('copy', undefined);
      return true;
    },
    cut: (target, event) => {
      // 未注册 cut 操作：仅阻止默认，防止设计器内容进入系统剪贴板。
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      return true;
    },
    paste: (target, event) => {
      if (isEditableTarget(target)) return false;
      event.preventDefault();
      this.#operations.execute('paste', undefined);
      return true;
    },
    gesture: (target, event) => {
      // Safari 触控板双指手势（与 ctrl+wheel 等价）：非可编辑目标阻止默认。
      if (!isEditableTarget(target)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    change: [
      (target, event) => this.onImportChange(event),
      (target, event) => this.#layersController.onChange(event),
      (target) => this.#datasetController.onChange(target),
      (target, event) => {
        this.#panelController.onPropertyChange(event);
        return true;
      },
    ],
    input: [
      (target) => this.#assetController.onInput(target),
      (target) => this.#datasetController.onInput(target),
      (target, event) => this.#panelController.onInput(event),
      (target, event) => {
        this.#layersController.onInput(event);
        return true;
      },
    ],
    dragStart: [
      (target, event) => {
        // 标记本设计器发起的拖拽，供 window DnD 防线识别（零宿主干预）。
        this.#eventSystem.markDragStart();
        return false;
      },
      (target, event) => this.#panelController.onDragStart(event as DragEvent),
      (target, event) => this.#layersController.onDragStart(event as DragEvent),
    ],
    dragOver: (target, event) => this.#layersController.onDragOver(event as DragEvent),
    drop: (target, event) => this.#layersController.onDrop(event as DragEvent),
    dragEnd: () => {
      this.#layersController.clearDrag();
      return true;
    },
    pointerDown: (target, event) => {
      this.#workbenchController.onPointerDown(event as PointerEvent);
      return true;
    },
    pointerMove: (target, event) => {
      this.#workbenchController.onPointerMove(event as PointerEvent);
      return true;
    },
    mouseOver: (target, event) => {
      const element = target as Element | null;
      const wrapper = element?.closest<HTMLElement>('.designer-menu-submenu-wrap');
      if (wrapper !== null && wrapper !== undefined) {
        const toggle = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
        if (toggle !== null && toggle !== undefined) this.#menuController.onSubmenuEnter(toggle);
        return true;
      }
      return false;
    },
    mouseOut: (target, event) => {
      const element = target as Element | null;
      const wrapper = element?.closest<HTMLElement>('.designer-menu-submenu-wrap');
      if (wrapper !== null && wrapper !== undefined) {
        const toggle = wrapper.querySelector<HTMLButtonElement>('[data-submenu-toggle]');
        if (toggle !== null && toggle !== undefined) {
          this.#menuController.onSubmenuPointerOut(toggle, (event as MouseEvent).relatedTarget);
        }
        return true;
      }
      return false;
    },
    pointerUp: (target, event) => {
      this.#workbenchController.onPointerUp(event as PointerEvent);
      return true;
    },
    pointerCancel: (target, event) => {
      this.#workbenchController.onPointerCancel(event as PointerEvent);
      return true;
    },
    doubleClick: (target, event) => {
      const mouseEvent = event as MouseEvent;
      if (this.#layersController.onDoubleClick(mouseEvent)) return true;
      this.#workbenchController.onDoubleClick(mouseEvent);
      return true;
    },
    focusOut: (target, event) => this.#layersController.onFocusOut(event as FocusEvent),
    keyDownCapture: (target, event) => this.#eventSystem.swallow(event as KeyboardEvent),
    keyUpCapture: (target, event) => {
      // 手势激活期间 keyup 同样全吞；但 Space 必须放行到 viewport 的 keyup，
      // 否则抓手状态（spacePressed）无法在拖拽中松开复位。
      const keyboardEvent = event as KeyboardEvent;
      if (this.#gestureController.active && keyboardEvent.code !== 'Space') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
      return false;
    },
    keyDown: [
      (target, event) => this.#errorConsoleController.onKeyDown(event as KeyboardEvent),
      (target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key !== 'Escape' || !this.#menuController.closeHelpPanel()) return false;
        keyboardEvent.preventDefault();
        return true;
      },
      (target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        const inspectorDraft = getInspectorDraftTarget(keyboardEvent);
        if (
          keyboardEvent.key !== 'Enter' ||
          keyboardEvent.isComposing ||
          inspectorDraft === undefined ||
          isTextAreaDraft(inspectorDraft)
        ) {
          return false;
        }
        keyboardEvent.preventDefault();
        this.#panelController.onPropertyChange({ target: inspectorDraft } as Event);
        return true;
      },
      (target, event) => this.#layersController.onKeyDown(event as KeyboardEvent),
      (target, event) => this.#datasetController.onKeyDown(event as KeyboardEvent),
      (target, event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (!this.#panelController.onKeyDown(keyboardEvent)) {
          this.onKeyDown(keyboardEvent);
        }
        return true;
      },
    ],
    keyUp: (target, event) => this.#viewportController.onKeyUp(event as KeyboardEvent),
  };

  get catalog(): BaseScreenMaterialCatalog | undefined {
    return this.#catalog;
  }

  /**
   * 权威原子配置入口（DRH-R8）：先校验全部运行时依赖（catalog、resource/variable
   * 端口、runtime contributions、host adapter）后再做任何字段变更、再创建
   * Renderer（validate before mutate）。校验失败零副作用：既有字段与 session
   * 保持原样。配置后运行时依赖 setter 不再独立初始化。
   */
  configure(configuration: BaseScreenDesignerConfiguration): ScreenParseResult<null> {
    if (this.#renderer !== undefined) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Designer 已初始化，请先 unload 再重新配置。')],
      };
    }
    if (!isBaseScreenMaterialCatalog(configuration.catalog)) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Designer catalog 必须是合法的物料目录。')],
      };
    }
    let materialLibraryState: BaseScreenMaterialLibraryState | undefined;
    if (configuration.materialLibraryState !== undefined) {
      const parsed = parseBaseScreenMaterialLibraryState(configuration.materialLibraryState);
      if (!parsed.ok) return parsed;
      materialLibraryState = parsed.value;
    }
    let materialLibraryGrouping: BaseScreenMaterialLibraryGrouping | undefined;
    if (configuration.materialLibraryGrouping !== undefined) {
      const parsed = parseBaseScreenMaterialLibraryGrouping(configuration.materialLibraryGrouping);
      if (!parsed.ok) return parsed;
      const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
        parsed.value,
        configuration.catalog,
      );
      if (!validated.ok) return validated;
      materialLibraryGrouping = validated.value;
    }
    if (
      configuration.previewHandler !== undefined &&
      typeof configuration.previewHandler !== 'function'
    ) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Designer previewHandler 必须是函数。')],
      };
    }
    if (
      configuration.resourcePort !== undefined &&
      !isScreenHostResourcePort(configuration.resourcePort)
    ) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Designer resource port 必须是含 resolve 的对象。')],
      };
    }
    if (
      configuration.variablePort !== undefined &&
      !isScreenHostVariablePort(configuration.variablePort)
    ) {
      return {
        ok: false,
        diagnostics: [lifecycleDiagnostic('Designer variable port 必须是含 resolve 的对象。')],
      };
    }
    if (
      configuration.runtimeContributions !== undefined &&
      !isBaseScreenRuntimeContributionIndex(configuration.runtimeContributions)
    ) {
      return {
        ok: false,
        diagnostics: [
          lifecycleDiagnostic('Designer runtime contributions 必须是含 getResourceType 的对象。'),
        ],
      };
    }
    let adapter: ScreenDesignerHostAdapter | undefined;
    if (configuration.designerHostAdapter !== undefined) {
      const parsed = validateScreenDesignerHostAdapter(configuration.designerHostAdapter);
      if (!parsed.ok) {
        return { ok: false, diagnostics: parsed.diagnostics };
      }
      adapter = parsed.value;
    }
    // 在提交任何字段之前绑定 project adapter：绑定失败时既有字段与 session
    // 保持原样（failed configure leaves prior fields/session untouched）。
    if (configuration.projectAdapter !== undefined) {
      const bound = this.#session.bindProjectAdapter(configuration.projectAdapter);
      if (!bound.ok) {
        return { ok: false, diagnostics: bound.diagnostics };
      }
    }
    if (adapter !== undefined) {
      this.#designerHostAdapter = adapter;
      this.#assetCatalogPort = adapter.assets;
      this.#projectCatalogPort = adapter.projectCatalog;
      this.#projectPreviewPort = adapter.projectPreview;
      this.#projectSnapshotPort = adapter.projectSnapshots;
      this.#resourcePort = adapter.resources;
      this.#variablePort = adapter.variables;
      this.#datasetCatalogPort = adapter.datasetCatalog;
    } else {
      this.#designerHostAdapter = undefined;
      this.#assetCatalogPort = configuration.assetCatalogPort;
      this.#projectCatalogPort = configuration.projectCatalogPort;
      this.#projectPreviewPort = configuration.projectPreviewPort;
      this.#projectSnapshotPort = configuration.projectSnapshotPort;
      this.#resourcePort = configuration.resourcePort;
      this.#variablePort = configuration.variablePort;
      this.#datasetCatalogPort = configuration.datasetCatalogPort;
    }
    this.#catalog = configuration.catalog;
    this.#materialLibraryState = materialLibraryState;
    this.#materialLibraryGrouping = materialLibraryGrouping;
    this.#runtimeContributions = configuration.runtimeContributions;
    this.#toolMaterialTypes = configuration.toolMaterialTypes;
    this.#groupMaterialType = configuration.groupMaterialType;
    this.#previewHandler = configuration.previewHandler;
    this.initialize();
    return { ok: true, value: null, diagnostics: [] };
  }

  /**
   * 运行时依赖 setter 只保留值、不独立初始化（RB3）：初始化由 configure /
   * document 赋值 / connect 控制。
   */
  set catalog(value: BaseScreenMaterialCatalog | undefined) {
    if (this.#renderer !== undefined && value !== this.#catalog) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Catalog cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    if (value !== undefined && this.#materialLibraryGrouping !== undefined) {
      const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
        this.#materialLibraryGrouping,
        value,
      );
      if (!validated.ok) {
        this.emitDiagnostics(validated.diagnostics);
        return;
      }
    }
    this.#catalog = value;
  }

  get materialLibraryState(): BaseScreenMaterialLibraryState | undefined {
    return this.#materialLibraryState;
  }

  set materialLibraryState(value: BaseScreenMaterialLibraryState | undefined) {
    if (value === undefined) {
      this.#materialLibraryState = undefined;
      this.renderMaterialLibraryState();
      return;
    }
    const parsed = parseBaseScreenMaterialLibraryState(value);
    if (!parsed.ok) {
      this.emitDiagnostics(parsed.diagnostics);
      return;
    }
    this.#materialLibraryState = parsed.value;
    this.renderMaterialLibraryState();
  }

  get materialLibraryGrouping(): BaseScreenMaterialLibraryGrouping | undefined {
    return this.#materialLibraryGrouping;
  }

  set materialLibraryGrouping(value: BaseScreenMaterialLibraryGrouping | undefined) {
    if (value === undefined) {
      this.#materialLibraryGrouping = undefined;
      this.renderMaterialLibraryGrouping();
      return;
    }
    const parsed = parseBaseScreenMaterialLibraryGrouping(value);
    if (!parsed.ok) {
      this.emitDiagnostics(parsed.diagnostics);
      return;
    }
    if (this.#catalog === undefined) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Material library grouping requires a configured catalog.'),
      ]);
      return;
    }
    const validated = validateBaseScreenMaterialLibraryGroupingForCatalog(
      parsed.value,
      this.#catalog,
    );
    if (!validated.ok) {
      this.emitDiagnostics(validated.diagnostics);
      return;
    }
    this.#materialLibraryGrouping = validated.value;
    this.renderMaterialLibraryGrouping();
  }

  get runtimeContributions(): BaseScreenRuntimeContributionIndex | undefined {
    return this.#runtimeContributions;
  }

  get previewHandler(): ((document: ScreenDocument) => boolean) | undefined {
    return this.#previewHandler;
  }

  set runtimeContributions(value: BaseScreenRuntimeContributionIndex | undefined) {
    if (this.#renderer !== undefined && value !== this.#runtimeContributions) {
      this.emitDiagnostics([
        lifecycleDiagnostic(
          'Runtime contributions cannot change after initialization. Call unload first.',
        ),
      ]);
      return;
    }
    this.#runtimeContributions = value;
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
      this.variablePort = undefined;
      this.datasetCatalogPort = undefined;
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
    this.variablePort = parsed.value.variables;
    this.datasetCatalogPort = parsed.value.datasetCatalog;
  }

  set resourcePort(value: ScreenHostResourcePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#resourcePort) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Resource port cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    this.#resourcePort = value;
  }

  get variablePort(): ScreenHostVariablePort | undefined {
    return this.#variablePort;
  }

  set variablePort(value: ScreenHostVariablePort | undefined) {
    if (this.#renderer !== undefined && value !== this.#variablePort) {
      this.emitDiagnostics([
        lifecycleDiagnostic('Variable port cannot change after initialization. Call unload first.'),
      ]);
      return;
    }
    this.#variablePort = value;
  }

  get datasetCatalogPort(): ScreenHostDatasetCatalogPort | undefined {
    return this.#datasetCatalogPort;
  }

  set datasetCatalogPort(value: ScreenHostDatasetCatalogPort | undefined) {
    this.#datasetCatalogPort = value;
    this.renderInteraction();
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
    this.connectWindowGuards();
  }

  disconnectedCallback(): void {
    this.#eventSystem.disconnectWindowGuards();
    this.cancelGesture();
    this.invalidateAuthoringRequests();
    this.#assetController.clear();
    this.#datasetController.clear();
    this.resetSessionSurfaces();
    this.#session.cancelProjectOperation();
    this.#renderer?.clear();
  }

  // window 级守卫随 shadow 表面就绪而注册：upgrade 时 initialize 可能因 catalog 未注入而
  // 早退（shadowRoot 尚未创建），catalog 注入后 initialize 再次进入并注册；重连场景由
  // connectedCallback 兜底。connectWindowGuards 本身按实例幂等。
  private connectWindowGuards(): void {
    const ownerWindow = this.ownerDocument.defaultView;
    const root = this.shadowRoot;
    if (ownerWindow !== null && root !== null) {
      this.#eventSystem.connectWindowGuards(ownerWindow, root);
    }
  }

  getDocument(): ScreenDocument | undefined {
    return this.#session.document;
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.cancelGesture();
    this.invalidateAuthoringRequests();
    const result = this.#session.replaceDocument(document);
    if (result.ok) this.resetSessionSurfaces();
    return result;
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.executeTransaction({ commands: [command] });
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    const document = this.#session.document;
    return this.#session.executeTransaction(
      document === undefined
        ? transaction
        : withDerivedDesignerGroupBounds(document, transaction, this.#groupMaterialType),
    );
  }

  get instanceId(): string {
    return this.#instanceId;
  }

  getAuthoringEditorContext(): ScreenAuthoringEditorContext {
    const manifest = this.#catalog?.get(this.focusedComponentType())?.manifest;
    return buildScreenAuthoringEditorContext({
      instanceId: this.#instanceId,
      requestId: undefined,
      document: this.#session.document,
      documentRevision: this.#session.project?.revision,
      focusedComponentId: this.#session.interaction.focusedComponentId,
      manifest,
    });
  }

  requestComponentTextEdit(target: ScreenComponentTextTarget): string | null {
    const document = this.#session.document;
    const componentId = this.#session.interaction.focusedComponentId;
    if (document === undefined || componentId === null) return null;
    const requestId = createScreenAuthoringRequestId();
    const component = document.components.find((item) => item.id === componentId);
    if (component === undefined) return null;
    this.#pendingAuthoringRequests.set(requestId, { kind: 'component-text' });
    this.dispatchEvent(
      new CustomEvent(SCREEN_AUTHORING_REQUEST_EVENT, {
        detail: {
          request: {
            kind: 'component-text',
            requestId,
            componentId,
            documentRevision: this.#session.project?.revision ?? null,
            target,
            source: JSON.stringify(component[target === 'style' ? 'style' : 'props']),
            format: 'json',
            maxBytes: MAX_AUTHORING_SOURCE_BYTES,
          },
        },
      }),
    );
    return requestId;
  }

  requestBlueprintEdit(): boolean {
    const document = this.#session.document;
    const componentId = this.#session.interaction.focusedComponentId;
    if (document === undefined || componentId === null) return false;
    const requestId = createScreenAuthoringRequestId();
    this.#pendingAuthoringRequests.set(requestId, { kind: 'blueprint' });
    this.dispatchEvent(
      new CustomEvent(SCREEN_AUTHORING_REQUEST_EVENT, {
        detail: {
          request: {
            kind: 'blueprint',
            requestId,
            componentId,
            documentRevision: this.#session.project?.revision ?? null,
            blueprint: document.blueprint as unknown as ScreenJsonObject,
            maxBytes: MAX_AUTHORING_SOURCE_BYTES,
          },
        },
      }),
    );
    return true;
  }

  commitComponentTextEdit(
    request: ScreenComponentTextCommitRequest,
  ): ScreenParseResult<ScreenDocument> {
    const document = this.#session.document;
    if (document === undefined) return this.commitGuardFailure('AUTHORING_EXPIRED');
    const pending = this.#pendingAuthoringRequests.get(request.requestId);
    if (pending?.kind !== 'component-text') {
      return this.commitGuardFailure('AUTHORING_REQUEST_INVALID');
    }
    const guards = validateScreenAuthoringCommitGuards({
      requestId: request.requestId,
      expectedRevision: request.expectedRevision ?? null,
      currentRevision: this.#session.project?.revision ?? null,
      componentId: request.componentId,
      componentExists: document.components.some((item) => item.id === request.componentId),
      disposed: this.#authoringGeneration > 0,
    });
    if (!guards.ok) {
      this.#pendingAuthoringRequests.delete(request.requestId);
      return { ok: false, diagnostics: guards.diagnostics };
    }
    const component = document.components.find((item) => item.id === request.componentId);
    const manifest = this.#catalog?.get(component?.type ?? '')?.manifest;
    if (component === undefined || manifest === undefined) {
      return this.commitGuardFailure('AUTHORING_COMPONENT_MISSING');
    }
    const source = parseScreenComponentTextSource(request.source, MAX_AUTHORING_SOURCE_BYTES);
    if (!source.ok) return { ok: false, diagnostics: source.diagnostics };
    if (source.value === null || typeof source.value !== 'object' || Array.isArray(source.value)) {
      return this.commitGuardFailure('AUTHORING_SOURCE_INVALID');
    }
    if (request.target === 'props' || request.target === 'style') {
      const schema = request.target === 'props' ? manifest.propsSchema : manifest.styleSchema;
      const candidate = source.value as ScreenJsonObject;
      const validator =
        request.target === 'props'
          ? validateBaseScreenMaterialProps
          : validateBaseScreenMaterialStyle;
      const validated = validator(candidate, schema);
      if (!validated.ok) return { ok: false, diagnostics: validated.diagnostics };
      const result = this.executeCommand({
        type: 'update-components',
        componentIds: [request.componentId],
        patch: { [request.target]: validated.value },
      });
      if (result.ok) this.#pendingAuthoringRequests.delete(request.requestId);
      return result;
    }
    const currentSource = component.dataSource;
    if (currentSource?.type !== 'host-resource') {
      return this.commitGuardFailure('AUTHORING_PAYLOAD_INVALID');
    }
    const params = source.value as ScreenJsonObject;
    const parameters = Object.fromEntries(
      Object.entries(params).map(([name, value]) => [name, { kind: 'literal' as const, value }]),
    );
    const result = this.executeCommand({
      type: 'update-components',
      componentIds: [request.componentId],
      patch: { dataSource: { ...currentSource, params: parameters } },
    });
    if (result.ok) this.#pendingAuthoringRequests.delete(request.requestId);
    return result;
  }

  commitBlueprintEdit(request: ScreenBlueprintCommitRequest): ScreenParseResult<ScreenDocument> {
    const document = this.#session.document;
    if (document === undefined) return this.commitGuardFailure('AUTHORING_EXPIRED');
    const pending = this.#pendingAuthoringRequests.get(request.requestId);
    if (pending?.kind !== 'blueprint') {
      return this.commitGuardFailure('AUTHORING_REQUEST_INVALID');
    }
    const guards = validateScreenAuthoringCommitGuards({
      requestId: request.requestId,
      expectedRevision: request.expectedRevision ?? null,
      currentRevision: this.#session.project?.revision ?? null,
      componentId: request.componentId ?? undefined,
      componentExists:
        request.componentId === null ||
        document.components.some((item) => item.id === request.componentId),
      disposed: this.#authoringGeneration > 0,
    });
    if (!guards.ok) {
      this.#pendingAuthoringRequests.delete(request.requestId);
      return { ok: false, diagnostics: guards.diagnostics };
    }
    const candidate = parseScreenAuthoringBlueprintCandidate(
      request.blueprint,
      MAX_AUTHORING_SOURCE_BYTES,
    );
    if (!candidate.ok) return { ok: false, diagnostics: candidate.diagnostics };
    if (candidate.value === null || typeof candidate.value !== 'object') {
      return this.commitGuardFailure('AUTHORING_PAYLOAD_INVALID');
    }
    const blueprint = candidate.value as unknown as ScreenBlueprint;
    const compiled = compileScreenBlueprint(
      { ...document, blueprint },
      this.#runtimeContributions ?? { hasBlueprintCapability: () => false },
    );
    if (!compiled.ok) {
      return { ok: false, diagnostics: compiled.diagnostics };
    }
    const result = this.executeCommand({ type: 'replace-blueprint', blueprint });
    if (result.ok) this.#pendingAuthoringRequests.delete(request.requestId);
    return result;
  }

  private commitGuardFailure(code: ScreenDiagnostic['code']): ScreenParseResult<ScreenDocument> {
    const message =
      code === 'AUTHORING_EXPIRED'
        ? DESIGNER_UI_TEXT.lifecycle.unloaded
        : code === 'AUTHORING_REQUEST_INVALID'
          ? DESIGNER_UI_TEXT.lifecycle.commitUnavailable
          : DESIGNER_UI_TEXT.propertiesPanel.dataSourceInvalid;
    return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
  }

  private focusedComponentType(): string {
    const componentId = this.#session.interaction.focusedComponentId;
    return this.#session.document?.components.find((item) => item.id === componentId)?.type ?? '';
  }

  private invalidateAuthoringRequests(): void {
    this.#authoringGeneration++;
    this.#pendingAuthoringRequests.clear();
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
    return this.executeTransaction(createReparentTransaction(document, componentIds, parentId));
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
    const document = this.#session.document;
    if (document === undefined) {
      return { ok: false, diagnostics: [lifecycleDiagnostic('No document to preview.')] };
    }
    if (this.#previewHandler !== undefined) {
      let handled = false;
      try {
        handled = this.#previewHandler(document);
      } catch {
        handled = false;
      }
      if (handled) return { ok: true, value: undefined, diagnostics: [] };
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
    return this.#projectGateway.listProjects(query, published);
  }

  createProject(name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectGateway.createProject(name);
  }

  cloneProject(projectId: string, name: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectGateway.cloneProject(projectId, name);
  }

  deleteProject(projectId: string, revision: string): Promise<ScreenParseResult<void>> {
    return this.#projectGateway.deleteProject(projectId, revision);
  }

  importProject(
    name: string,
    document: ScreenDocument,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectGateway.importProject(name, document);
  }

  exportProject(projectId: string, revision: string): Promise<ScreenParseResult<ScreenDocument>> {
    return this.#projectGateway.exportProject(projectId, revision);
  }

  previewProject(published: boolean): Promise<ScreenParseResult<ScreenDocument>> {
    return this.#projectGateway.previewProject(published);
  }

  listSnapshots(): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>> {
    return this.#projectGateway.listSnapshots();
  }

  createSnapshot(name: string): Promise<ScreenParseResult<ScreenProjectSnapshot>> {
    return this.#projectGateway.createSnapshot(name);
  }

  restoreSnapshot(snapshotId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectGateway.restoreSnapshot(snapshotId);
  }

  listAssets(query = ''): Promise<ScreenParseResult<readonly ScreenAssetSummary[]>> {
    return this.#projectGateway.listAssets(query);
  }

  refreshData(componentId?: string): void {
    this.#renderer?.refreshData(componentId);
    this.#previewController.refreshData(componentId);
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#session.save().then((result) => {
      if (result.ok) {
        this.#lastSavedAt = Date.now();
        this.renderTopbarSaveStatus();
      }
      return result;
    });
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
    this.invalidateAuthoringRequests();
    this.#session.unload();
    this.#lastSavedAt = undefined;
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
      createDesignerWorkspace(
        this.ownerDocument,
        this.#catalog.list(),
        this.#toolMaterialTypes,
        this.#materialLibraryState,
        this.#materialLibraryGrouping,
      ),
    );
    this.#panelController.refreshMaterialLibrary(shadow.querySelector<HTMLElement>('.designer'));
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
    this.#errorConsoleController.connect(
      shadow.querySelector<HTMLElement>('[data-error-console]')!,
      shadow.querySelector<HTMLButtonElement>('[data-error-console-toggle]')!,
    );
    this.renderMaterialLibraryState();
    this.#integrationController.connect(
      shadow.querySelector<HTMLDivElement>('[data-events-panel]')!,
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
    this.#gestureController.connectViewport(this.#viewportElement);
    this.#viewportController.connect(this.#viewportElement, this.#canvas);
    this.#surfaceRouter.connect(shadow, this.#surfaceBindings);
    this.connectWindowGuards();
    if (this.#session.document !== undefined) {
      this.renderDocument(this.#session.document);
      this.renderInteraction();
    }
  }

  private renderDocument(document: ScreenDocument): ScreenParseResult<void> {
    this.initialize();
    // 画布覆盖层（参考线/选区）的 z-index 由组件数派生（token 中 calc），
    // 保证始终高于组件的 painter order z-index（0..N-1）。
    this.style.setProperty('--designer-canvas-component-count', String(document.components.length));
    if (this.#renderer === undefined) {
      return { ok: true, value: undefined, diagnostics: [] };
    }
    const rendered = this.#renderer.render(document);
    if (rendered.ok) this.#previewController.sync(document);
    return rendered.ok
      ? { ok: true, value: undefined, diagnostics: rendered.diagnostics }
      : { ok: false, diagnostics: rendered.diagnostics };
  }

  private renderInteraction(): void {
    this.renderSelection();
    this.renderProperties();
    this.renderInspectorInteraction();
    this.renderLayers();
    this.renderControls();
    this.#integrationController.render();
    this.#workbenchController.renderInspectorTabs();
  }

  private renderMaterialLibraryState(): void {
    const shadow = this.shadowRoot;
    if (shadow === null || shadow === undefined) return;
    renderMaterialLibraryState(shadow, this.#materialLibraryState);
    this.#errorConsoleController.recordMaterialLibraryState(this.#materialLibraryState);
  }

  private renderMaterialLibraryGrouping(): void {
    const shadow = this.shadowRoot;
    if (shadow === null || shadow === undefined || this.#catalog === undefined) return;
    const layout = shadow.querySelector<HTMLElement>('.designer');
    if (layout === null) return;
    populateMaterialLibrary(
      layout,
      this.#catalog.list(),
      this.#materialLibraryState,
      this.#materialLibraryGrouping,
    );
    this.#panelController.refreshMaterialLibrary(layout);
  }

  private requestMaterialLibraryAction(action: BaseScreenMaterialLibraryAction): void {
    this.dispatchEvent(
      new CustomEvent<BaseScreenMaterialLibraryActionEventDetail>(
        BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
        { detail: { action }, bubbles: true, composed: true },
      ),
    );
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
    this.#panelController.render(
      undefined,
      this.#datasetCatalogPort === undefined ? this.#dataPanel : undefined,
    );
    if (this.#datasetCatalogPort !== undefined) this.#datasetController.render(this.#dataPanel);
    this.renderToolControls();
    this.renderOperationControls();
    this.renderProjectStatus();
  }

  private renderLayers(): void {
    this.#layersController.render(this.#layers);
  }

  private renderProperties(): void {
    this.#panelController.render(
      this.#properties,
      this.#datasetCatalogPort === undefined ? this.#dataPanel : undefined,
    );
    if (this.#datasetCatalogPort !== undefined) this.#datasetController.render(this.#dataPanel);
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
      // 设计态不裁剪画布边界：画布外的组件保持可见、可点击/拖拽（渲染器在 design
      // 模式不设置 overflow；查看器/最终屏幕才按画布尺寸裁剪）。
      root: this.#canvas,
      catalog: this.#catalog,
      mode: 'design',
      // 状态栏「事件」开关是交互模式的唯一来源：渲染器重建后开关状态保持。
      interactive: this.#workbenchController.nativeEventsEnabled,
      // 设计态原生事件（interactive 开启时）转发给宿主，与 Viewer 的
      // base-screen-material-event 同形同语义。
      onMaterialEvent: (event) => this.forwardNativeMaterialEvent(event),
      resourcePort: this.#resourcePort,
      // 设计态渲染器获得设计执行上下文（RB2）：design mode，不绑定项目。
      executionMode: 'design',
      ...(this.#runtimeContributions === undefined
        ? {}
        : { contributionIndex: this.#runtimeContributions }),
    });
  }

  /** 应用「事件」开关：渲染器原地切换 interactive；失败（如已释放）经诊断通道上报。 */
  private applyNativeEvents(enabled: boolean): void {
    const renderer = this.#renderer;
    if (renderer === undefined) return;
    const result = renderer.setInteractive(enabled);
    if (!result.ok) this.emitDiagnostics(result.diagnostics);
  }

  /** 把设计态画布物料事件转发为 designer 元素上的 composed 事件（与 Viewer 同形）。 */
  private forwardNativeMaterialEvent(event: BaseScreenMaterialEvent): void {
    this.dispatchEvent(
      new CustomEvent<BaseScreenMaterialEvent>('base-screen-material-event', {
        bubbles: true,
        composed: true,
        detail: event,
      }),
    );
  }

  private executeOperationFromTarget(target: Element): boolean {
    const control = target.closest<HTMLButtonElement>('[data-action], [data-menu-action]');
    const id = control?.dataset.action ?? control?.dataset.menuAction;
    if (id === undefined || this.#operations.get(id) === undefined) return false;
    this.#menuController.closeContextMenu();
    this.#menuController.closeMenus();
    return this.#operations.execute(id, undefined);
  }

  // 状态栏缩放下拉预设（Nebula 语义：25%–200% 预设，居中缩放）。
  private onStatusZoomPreset(target: Element): boolean {
    const preset = target.closest<HTMLButtonElement>('[data-status-zoom-preset]')?.dataset
      .statusZoomPreset;
    if (preset === undefined) return false;
    this.#viewportController.setZoomCentered(Number(preset) / 100);
    return true;
  }

  private executeDesignerTransaction(
    transaction: ScreenDocumentTransaction,
  ): ScreenParseResult<ScreenDocument> {
    return this.executeDesignerCommit({ transaction });
  }

  private executeDesignerCommand(
    command: ScreenDocumentCommand,
  ): ScreenParseResult<ScreenDocument> {
    return this.executeDesignerCommit({ command });
  }

  private executeDesignerCommit(
    commit:
      | { readonly transaction: ScreenDocumentTransaction }
      | { readonly command: ScreenDocumentCommand },
  ): ScreenParseResult<ScreenDocument> {
    let result: ScreenParseResult<ScreenDocument> | undefined;
    const executed = this.#operations.execute('document.commit', {
      ...('transaction' in commit ? { transaction: commit.transaction } : {}),
      ...('command' in commit ? { command: commit.command } : {}),
      ...('transaction' in commit
        ? {
            runTransaction: () => {
              result = this.executeTransaction(commit.transaction);
              return result;
            },
          }
        : {}),
      ...('command' in commit
        ? {
            runCommand: () => {
              result = this.executeCommand(commit.command);
              return result;
            },
          }
        : {}),
    });
    return (
      result ?? {
        ok: false,
        diagnostics: [
          lifecycleDiagnostic(
            executed
              ? DESIGNER_UI_TEXT.lifecycle.commitIncomplete
              : DESIGNER_UI_TEXT.lifecycle.commitUnavailable,
          ),
        ],
      }
    );
  }

  private executeToolFromTarget(target: Element): boolean {
    // 限定按钮元素：data-tool 是工具栏按钮的命中选择器，非按钮元素（如 viewport 容器）
    // 上的同名属性不得被当作工具切换（否则画布拖拽产生的 click 会误切换工具）。
    const tool = target.closest<HTMLButtonElement>('button[data-tool]')?.dataset.tool as
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
    if (event.key === 'Escape' && this.#menuController.closeHelpPanel()) {
      event.preventDefault();
      return;
    }
    if (this.#menuController.onKeyDown(event)) return;
    if (this.#workbenchController.onKeyDown(event)) return;
    if (
      event.key === 'Escape' &&
      (this.#menuController.closeContextMenu() || this.#menuController.closeMenus())
    ) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && this.#gestureController.exitGroupEditingContext()) {
      event.preventDefault();
      return;
    }
    // 统一命令通道：capture 阶段的策略裁决已排除黑名单与手势激活期。
    // 命中设计器命令 chord 即阻止浏览器默认（命令未启用/不可用时不弹浏览器默认行为），
    // 控件级键优先，命令未命中时回落到 viewport 状态通道。
    const policy = this.#eventSystem.resolve(event);
    if (policy.kind === 'command') {
      event.preventDefault();
      const operation = this.#operations.findByShortcut(policy.chord);
      if (operation !== undefined) this.#operations.execute(operation.id, undefined);
      return;
    }
    if (!event.defaultPrevented) this.#viewportController.onKeyDown(event);
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
    const projectName = root.querySelector<HTMLElement>('.designer-project-name');
    if (projectName !== null) {
      projectName.textContent =
        project === undefined || project.name.trim() === ''
          ? DESIGNER_UI_TEXT.unnamedProject
          : project.name;
    }
    this.renderTopbarSaveStatus();
    this.renderStatusBar();
  }

  // Nebula 状态栏左/中段：左侧选中信息（未选中/单个名称/数量），中间画布静态尺寸。
  private renderStatusBar(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const document = this.#session.document;
    const componentIds = this.#session.interaction.selectedComponentIds;
    const count = componentIds.length;
    const baseSelectionText =
      count === 0
        ? DESIGNER_UI_TEXT.nothingSelected
        : count === 1
          ? document === undefined
            ? DESIGNER_UI_TEXT.selectedSingle
            : (selectedComponents(document, componentIds)[0]?.name ??
              DESIGNER_UI_TEXT.selectedSingle)
          : DESIGNER_UI_TEXT.selectedCount(count);
    const groupPath =
      document === undefined
        ? null
        : groupEditingPath(document, this.#gestureController.groupEditingParentId);
    const selectionText =
      groupPath === null
        ? baseSelectionText
        : `${DESIGNER_UI_TEXT.groupEditingPath(groupPath)} · ${baseSelectionText}`;
    const selection = root.querySelector<HTMLElement>('[data-status-selection]');
    if (selection !== null) selection.textContent = selectionText;
    const canvas = root.querySelector<HTMLElement>('[data-status-canvas]');
    if (canvas !== null && document !== undefined) {
      canvas.textContent = `${document.canvas.width} × ${document.canvas.height}`;
    }
  }

  // Nebula 保存状态徽标：保存中… / 未保存更改 / 已保存 HH:mm。
  // 无项目（未关联项目）时保持静态占位文案，与状态栏的「未关联项目」一致。
  private renderTopbarSaveStatus(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const badge = root.querySelector<HTMLElement>('[data-topbar-save-status]');
    if (badge === null) return;
    if (this.#session.project === undefined) {
      badge.dataset.state = 'direct';
      badge.textContent = DESIGNER_UI_TEXT.directDocument;
      return;
    }
    if (this.#session.projectPhase === 'saving') {
      badge.dataset.state = 'saving';
      badge.innerHTML = `${saveStatusSpinnerGlyph()}<span>${DESIGNER_UI_TEXT.saveStatus.saving}</span>`;
      return;
    }
    if (this.#session.dirty) {
      badge.dataset.state = 'dirty';
      badge.innerHTML = `<span class="topbar-save-status-dot" aria-hidden="true"></span><span>${DESIGNER_UI_TEXT.saveStatus.unsaved}</span>`;
      return;
    }
    if (this.#lastSavedAt !== undefined) {
      badge.dataset.state = 'saved';
      badge.innerHTML = `${saveStatusCheckGlyph()}<span>${DESIGNER_UI_TEXT.saveStatus.saved(
        formatSavedTime(this.#lastSavedAt),
      )}</span>`;
      return;
    }
    badge.dataset.state = 'clean';
    badge.textContent = '';
  }

  private renderOperationControls(): void {
    const root = this.shadowRoot;
    if (root === null) return;
    const phase = this.#session.projectPhase;
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
      const isBusy =
        (id === 'project-save' && phase === 'saving') ||
        (id === 'project-publish' && phase === 'publishing');
      control.ariaBusy = String(isBusy);
    }
    this.#menuController.renderMenuStates();
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

  private isProjectBusy(): boolean {
    return this.#session.projectPhase === 'saving' || this.#session.projectPhase === 'publishing';
  }

  private exportFromOperation(): void {
    const exported = this.exportDocument();
    if (exported.ok) {
      downloadDesignerDocument(this.ownerDocument, this.exportFileName(), exported.value);
      this.#notificationController.notify(DESIGNER_UI_TEXT.exported, 'success');
      this.dispatchEvent(
        new CustomEvent('base-screen-export', { detail: { document: exported.value } }),
      );
    } else {
      this.emitDiagnostics(exported.diagnostics);
    }
  }

  private exportFileName(): string {
    const projectName = this.#session.project?.name;
    if (projectName === undefined || projectName.trim() === '') {
      return DESIGNER_UI_TEXT.defaultExportFileName;
    }
    return `${projectName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')}.json`;
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
    this.#datasetController.clear();
    this.#datasetController.clear();
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
      this.#statusFeedback.textContent = designerDiagnosticSummary(diagnostic.code);
      this.#notificationController.notify(designerDiagnosticSummary(diagnostic.code), 'error');
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

// ---------------------------------------------------------------------------
// RB3 原子配置：配置对象形状校验（validate before mutate）。这些校验只做
// 足够避免坏配置提交/运行时崩溃的形状检查，不发明兼容解析器。
// ---------------------------------------------------------------------------

function isBaseScreenMaterialCatalog(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).get === 'function' &&
    typeof (value as Record<string, unknown>).has === 'function' &&
    typeof (value as Record<string, unknown>).list === 'function'
  );
}

function isScreenHostResourcePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

function isScreenHostVariablePort(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).resolve === 'function'
  );
}

function isBaseScreenRuntimeContributionIndex(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).getResourceType === 'function' &&
    typeof (value as Record<string, unknown>).hasBlueprintCapability === 'function'
  );
}

function projectPhaseLabel(phase: ScreenProjectPhase): string {
  return DESIGNER_UI_TEXT.projectPhases[phase];
}

function groupEditingPath(document: ScreenDocument, groupId: string | null): string | null {
  if (groupId === null) return null;
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const names: string[] = [];
  let current = byId.get(groupId);
  while (current !== undefined) {
    names.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return names.length === 0 ? null : names.join(' / ');
}

function saveStatusSpinnerGlyph(): string {
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 2a6 6 0 1 1-6 6"/></svg>';
}

function saveStatusCheckGlyph(): string {
  return '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M3 8.5 6.5 12 13 4.5"/></svg>';
}

function formatSavedTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

import { resolveScreenStartPageId } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { DesignerBlueprintWorkbenchController } from '../../browser/controllers/blueprint/designer-blueprint-workbench-controller.js';
import { DesignerDatasetPanelController } from '../../browser/controllers/dataset/designer-dataset-panel-controller.js';
import { DesignerCanvasRuntimeController } from '../../browser/controllers/designer-canvas-runtime-controller.js';
import { DesignerCommandPaletteController } from '../../browser/controllers/designer-command-palette-controller.js';
import { DesignerImportController } from '../../browser/controllers/designer-import-controller.js';
import { DesignerIntegrationController } from '../../browser/controllers/designer-integration-controller.js';
import { DesignerIntentChoiceController } from '../../browser/controllers/designer-intent-choice-controller.js';
import { DesignerPagePreviewController } from '../../browser/controllers/designer-page-preview-controller.js';
import { DesignerPopupPreviewController } from '../../browser/controllers/designer-popup-preview-controller.js';
import { DesignerPreviewController } from '../../browser/controllers/designer-preview-controller.js';
import { DesignerReferenceLayerController } from '../../browser/controllers/designer-reference-layer-controller.js';
import { DesignerTextEditController } from '../../browser/controllers/designer-text-edit-controller.js';
import { DesignerTopbarController } from '../../browser/controllers/designer-topbar-controller.js';
import { DesignerViewportController } from '../../browser/controllers/designer-viewport-controller.js';
import { DesignerCoordinateEntryController } from '../../browser/controllers/entry/designer-coordinate-entry-controller.js';
import { DesignerSizeEntryController } from '../../browser/controllers/entry/designer-size-entry-controller.js';
import { DesignerGestureController } from '../../browser/controllers/gesture/designer-gesture-controller.js';
import { DesignerLayersController } from '../../browser/controllers/layers/designer-layers-controller.js';
import { DesignerPanelController } from '../../browser/controllers/panel/designer-panel-controller.js';
import { DesignerProjectFeedbackController } from '../../browser/controllers/project/designer-project-feedback-controller.js';
import { DesignerProjectWorkspaceController } from '../../browser/controllers/project/designer-project-workspace-controller.js';
import { DesignerVariablesController } from '../../browser/controllers/variables/designer-variables-controller.js';
import { DesignerWorkbenchController } from '../../browser/controllers/workbench/designer-workbench-controller.js';
import { designerIcon } from '../../browser/dom/designer-icons.js';
import { readDesignerImageNaturalSize } from '../../browser/dom/designer-image-metadata-dom.js';
import { hasDesignerTextSelection } from '../../browser/dom/designer-text-selection.js';
import {
  BASE_SCREEN_METRIC_EVENT,
  createDesignerMetric,
  type DesignerMetricName,
} from '../../common/observability/designer-metrics.js';
import {
  BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
  type BaseScreenCanvasPresentationChangeEventDetail,
} from '../../common/operations/canvas/canvas-presentation.js';
import {
  BASE_SCREEN_CHANGE_STATE_EVENT,
  type BaseScreenDesignerChangeStateDetail,
} from '../../common/operations/change/designer-change-events.js';
import type { DesignerParameterPatch } from '../../common/operations/intent/designer-parameter-intent.js';
import { redirectDesignerStyleTransaction } from '../../common/operations/style/designer-component-states.js';
import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerBackRequestEventDetail,
} from '../../common/operations/workbench/designer-navigation.js';
import { DesignerProjectGateway } from '../../common/project/designer-project-gateway.js';
import {
  BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT,
  type BaseScreenProjectStateChangeEventDetail,
} from '../../common/project/project-controller.js';
import { DesignerSession } from '../../common/session/designer-session.js';
import { designerDiagnosticSummary } from '../../common/ui-text/designer-ui-text.js';
import { getDesignerGeometryDocument } from './designer-element-geometry.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function initializeDesignerElementControllers(
  element: DesignerElementHost,
  state: DesignerElementState,
): void {
  const syncActiveLeftPanelGroup = (): void => {
    state.leftPanelGroupEvents.sync(
      state.blueprintWorkbenchController.mode === 'blueprint'
        ? state.blueprintWorkbenchController.selectedLeftPanelGroupId
        : state.workbenchController.selectedLeftPanelGroupId,
    );
  };
  state.canvasRuntimeController = new DesignerCanvasRuntimeController({
    getRenderer: () => state.renderer,
    getHostCatalogPort: () => state.hostCatalogPort,
    getRuntimeContributions: () => state.runtimeContributions,
    getBlueprintHostActionPort: () => state.designerHostAdapter?.actions,
    emitBlueprintHostEvent: (event) =>
      element.dispatchEvent(
        new CustomEvent('base-screen-blueprint-event', {
          bubbles: true,
          composed: true,
          detail: event,
        }),
      ),
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    applyCanvasEffects: (effects, variables) => {
      state.popupPreviewController.apply(effects, variables);
      state.pagePreviewController.apply(effects);
    },
    resetPopups: () => state.popupPreviewController.reset(),
  });
  state.referenceLayerController = new DesignerReferenceLayerController({
    createRenderer: (root) => state.runtime.createReferenceRenderer(element, root),
    getRendererKey: () => state.catalog,
    getDocument: () => state.session.fullDocument,
    getReferenceCanvas: () => state.artboardController.referenceCanvas(),
    getContentRoot: () =>
      state.canvas?.querySelector<HTMLElement>('[data-canvas-content]') ?? undefined,
    getVariables: () => state.canvasRuntimeController.readVariables(),
    isLive: () => state.workbenchController.nativeEventsEnabled && !isPopupArtboard(state),
    onMaterialEvent: (event) => state.runtime.forwardNativeMaterialEvent(element, event),
  });
  state.pagePreviewController = new DesignerPagePreviewController({
    getDocument: () => state.session.fullDocument,
    getArtboard: () => state.session.artboard,
    setArtboard: (artboard) => state.session.setArtboard(artboard),
    getPreviewPage: () => state.artboardController.referencePage(),
    setPreviewPage: (pageId) => state.artboardController.setReferencePage(pageId),
    isEnabled: () => state.workbenchController.nativeEventsEnabled && !isPopupArtboard(state),
    onChange: (change) => state.canvasRuntimeController.handleCanvasChange(change),
  });
  state.popupPreviewController = new DesignerPopupPreviewController({
    createRenderer: (root, onMaterialEvent, onCanvasChange) =>
      state.runtime.createPopupPreviewRenderer(element, root, onMaterialEvent, onCanvasChange),
    getRendererKey: () => state.catalog,
    getDocument: () => state.session.fullDocument,
    isEnabled: () => state.workbenchController.nativeEventsEnabled && !isPopupArtboard(state),
    onMaterialEvent: (event) => state.runtime.forwardNativeMaterialEvent(element, event),
    onPopupChange: (change) => state.canvasRuntimeController.handleCanvasChange(change),
  });
  state.topbarController = new DesignerTopbarController({
    getHost: () => element,
    isBackButtonVisible: () => state.backButton,
    requestBack: () =>
      element.dispatchEvent(
        new CustomEvent<BaseScreenDesignerBackRequestEventDetail>(
          BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
          {
            bubbles: true,
            composed: true,
            detail: { source: 'topbar' },
          },
        ),
      ),
    canCreateSnapshot: () =>
      state.session.project !== undefined &&
      state.projectSnapshotPort !== undefined &&
      !state.runtime.isProjectBusy(element),
    createSnapshot: (name) => element.createSnapshot(name),
    notify: (message) => state.notificationController.notify(message, 'success'),
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
  });
  state.session = new DesignerSession({
    renderDocument: (document) => state.runtime.renderDocument(element, document),
    renderInteraction: () => state.runtime.renderInteraction(element),
    emitChange: (document) => {
      state.documentGeneration++;
      state.blueprintWorkbenchController.dispatchState();
      state.artboardController.render();
      state.referenceLayerController.sync();
      // 文档提交/撤销/重做/替换都不经 renderInteraction，面板必须在这里也拿到新快照。
      state.runtime.syncDesignerPluginPanels(element);
      state.runtime.emitChange(element, document);
    },
    emitSelectionChange: (interaction) =>
      element.dispatchEvent(
        new CustomEvent('base-screen-selection-change', { detail: interaction }),
      ),
    onProjectChange: (_project, phase) => {
      element.toggleAttribute('data-project-busy', phase === 'saving' || phase === 'publishing');
      state.projectFeedbackController.render(phase);
      state.runtime.renderControls(element);
      element.dispatchEvent(
        new CustomEvent<BaseScreenProjectStateChangeEventDetail>(
          BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT,
          {
            bubbles: true,
            composed: true,
            detail: state.session.getProjectState(),
          },
        ),
      );
    },
    onDirtyChange: (dirty, revision) => {
      state.runtime.renderControls(element);
      element.dispatchEvent(
        new CustomEvent('base-screen-dirty-change', { detail: { dirty, revision } }),
      );
    },
    onConflict: () => element.dispatchEvent(new CustomEvent('base-screen-project-conflict')),
    onArtboardChange: (artboard) => {
      state.popupPreviewController.reset();
      state.artboardController.render();
      state.referenceLayerController.sync();
      element.toggleAttribute('data-artboard-popup', isPopupArtboard(state));
      element.toggleAttribute('data-artboard-sub', artboard !== null);
      state.runtime.renderControls(element);
      element.dispatchEvent(
        new CustomEvent('base-screen-artboard-change', {
          bubbles: true,
          composed: true,
          detail: { artboard },
        }),
      );
    },
    onReady: ({ projectId, revision }) => {
      state.runtime.resetSessionSurfaces(element);
      state.lastSavedAt = Date.now();
      state.runtime.renderTopbarSaveStatus(element);
      element.dispatchEvent(
        new CustomEvent('base-screen-ready', { detail: { projectId, revision } }),
      );
    },
  });
  state.projectGateway = new DesignerProjectGateway({
    getProjectCatalogPort: () => state.projectCatalogPort,
    getProjectPreviewPort: () => state.projectPreviewPort,
    getProjectSnapshotPort: () => state.projectSnapshotPort,
    getDocument: () => state.session.fullDocument,
    getProject: () => state.session.project,
    replaceDocument: (document) => element.replaceDocument(document),
    loadProject: (projectId) => state.session.load(projectId),
  });
  state.gestureController = new DesignerGestureController({
    getCatalog: () => state.catalog,
    getMaterialLibraryItem: (id) =>
      state.resolvedMaterialLibraryItems.find((item) => item.id === id),
    insertMaterialLibraryFragmentAt: (fragmentId, position) =>
      state.runtime.insertMaterialLibraryFragment(element, fragmentId, position),
    getDocument: () => getDesignerGeometryDocument(state),
    getCanonicalDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getViewport: () => state.viewportController.state,
    panBy: (delta) => state.viewportController.panBy(delta),
    zoomBy: (factor) =>
      state.viewportController.setZoom(state.viewportController.state.zoom * factor),
    isHandActive: () => state.viewportController.activeTool === 'hand',
    getActiveTool: () => state.viewportController.activeTool,
    getToolMaterialTypes: () => state.toolMaterialTypes,
    snapCanvasPoint: (point, excludedComponentIds) =>
      state.workbenchController.snapPoint(point, excludedComponentIds),
    snapCanvasSelection: (bounds, offset, excludedComponentIds) =>
      state.workbenchController.snapSelectionOffset(bounds, offset, excludedComponentIds),
    snapCanvasGuides: (bounds, excludedComponentIds) =>
      state.workbenchController.snapAlignmentGuides(bounds, excludedComponentIds),
    renderSnapPreview: (point) => state.workbenchController.renderSnapPreview(point),
    setSnapSessionActive: (active) => {
      state.autoWidthController.setFrozen(active);
      state.workbenchController.setSnapSessionActive(active);
    },
    reduceSelection: (action) => state.session.reduceSelection(action),
    reportTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    validateHostResourceIntent: (intent) =>
      state.runtime.validateHostResourceAuthoringIntent(element, intent),
    insertHostResourceAt: (intent, position) =>
      state.runtime.insertHostResourceAt(element, intent, position),
    reportDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    renderSelection: () => state.runtime.renderSelection(element),
    focusViewport: () => state.viewportController.focusFromPointer(),
    setPanning: (panning) => state.viewportController.setPanning(panning),
    enterTextEdit: (componentId) => state.textEditController.enter(componentId),
  });
  state.textEditController = new DesignerTextEditController({
    getDocument: () => state.session.document,
    getCanvas: () => state.canvas,
    getZoom: () => state.viewportController.state.zoom,
    executeCommand: (command) => element.executeCommand(command),
    report: (result) => state.runtime.report(element, result),
    onEditingChange: (editing) => {
      if (state.selection !== undefined) state.selection.style.visibility = editing ? 'hidden' : '';
    },
  });
  // 顶层 overlay：惰性建在 `.designer` 内、shadow root 顶层，供取值选择器与变量检查器复用。
  const getOverlayHost = (): HTMLElement | undefined => {
    const root = element.shadowRoot?.querySelector<HTMLElement>('.designer');
    if (root === null || root === undefined) return undefined;
    const existing = root.querySelector<HTMLElement>('[data-designer-overlay-host]');
    if (existing !== null) return existing;
    const host = element.ownerDocument.createElement('div');
    host.className = 'designer-overlay-host';
    host.dataset.designerOverlayHost = 'true';
    root.appendChild(host);
    return host;
  };
  state.variablesController = new DesignerVariablesController({
    getDocument: () => state.session.document,
    getHostCatalogPort: () => state.hostCatalogPort,
    getOverlayHost,
    executeCommand: (command) => element.executeCommand(command),
    addToBlueprint: (variableId) => state.blueprintWorkbenchController.addVariableNode(variableId),
    report: (result) => state.runtime.report(element, result),
  });
  state.layersController = new DesignerLayersController({
    getCatalog: () => state.catalog,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    reduceSelection: (action) => state.session.reduceSelection(action),
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    canGroup: () => state.panelController.canGroup,
    canUngroup: () => state.panelController.canUngroup,
    group: () => state.panelController.group(),
    ungroup: () => state.panelController.ungroup(),
    locateComponent: (componentId) => {
      const component = getDesignerGeometryDocument(state)?.components.find(
        (item) => item.id === componentId,
      );
      if (component === undefined) return;
      state.viewportController.centerOn({
        x: component.position.x + component.size.width / 2,
        y: component.position.y + component.size.height / 2,
      });
    },
  });
  state.integrationController = new DesignerIntegrationController({
    getCatalog: () => state.catalog,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getRuntimeContributions: () => state.runtimeContributions,
    openBlueprint: (options) => element.setWorkbenchMode('blueprint', options).ok,
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
  });
  state.projectFeedbackController = new DesignerProjectFeedbackController({
    continueEditing: () => state.session.continueEditing(),
    isDirty: () => state.session.dirty,
    reloadRemote: (discardChanges) => state.session.reloadRemote(discardChanges),
    report: (result) => state.runtime.reportProject(element, result),
  });
  state.previewController = new DesignerPreviewController({
    getCatalog: () => state.catalog,
    getDocument: () => state.session.fullDocument,
    getResourcePort: () => state.resourcePort,
    getHostCatalogPort: () => state.hostCatalogPort,
    getDatasetPort: () => state.datasetPort,
    getRuntimeContributions: () => state.runtimeContributions,
    isViewerRegistered: () =>
      element.ownerDocument.defaultView?.customElements.get('base-screen-viewer') !== undefined,
  });
  state.projectWorkspaceController = new DesignerProjectWorkspaceController({
    createProject: (name) => element.createProject(name),
    deleteProject: (projectId, revision) => element.deleteProject(projectId, revision),
    getCapabilities: () => state.projectGateway.capabilities,
    getProject: () => state.session.project,
    listProjects: () => element.listProjects(),
    listSnapshots: () => element.listSnapshots(),
    loadProject: (projectId) => element.load(projectId),
    previewProject: (published) => element.previewProject(published),
    report: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    restoreSnapshot: (snapshotId) => element.restoreSnapshot(snapshotId),
  });
  state.datasetController = new DesignerDatasetPanelController({
    getCatalogPort: () => state.datasetPort,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    getResourcePort: () => state.resourcePort,
    getHostCatalogPort: () => state.hostCatalogPort,
    getRuntimeContributions: () => state.runtimeContributions,
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    report: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    refresh: (componentId) => element.refreshData(componentId),
    isHostResourceSelectionButtonVisible: () => state.hostResourceSelectionButton,
    requestHostResourceSelection: (componentId, materialType) =>
      element.requestHostResourceSelection({ kind: 'component', componentId, materialType }),
    canUndo: () => state.session.canUndo,
    undo: () => {
      state.session.undo();
    },
    copyText: async (value) => {
      const clipboard = element.ownerDocument.defaultView?.navigator.clipboard;
      if (clipboard === undefined) return false;
      try {
        await clipboard.writeText(value);
        return true;
      } catch {
        return false;
      }
    },
    requestAuthoringAction: (action, detail) => {
      element.dispatchEvent(
        new CustomEvent('base-screen-dataset-authoring-action', {
          bubbles: true,
          composed: true,
          detail: {
            action,
            componentId: state.session.interaction.focusedComponentId,
            ...detail,
          },
        }),
      );
    },
    getWorkbenchHost: () =>
      element.shadowRoot?.querySelector<HTMLElement>('[data-data-workbench]') ?? undefined,
    getOverlayHost,
    preserveScrollContinuity: (render) =>
      state.scrollContinuityController.preserve(element.shadowRoot, render),
  });
  state.importController = new DesignerImportController({
    replaceDocument: (document) => element.replaceDocument(document),
    report: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    notify: (message) => state.notificationController.notify(message, 'success'),
  });
  state.artboardController.setContext({
    getDocument: () => state.session.fullDocument,
    getArtboard: () => state.session.artboard,
    setArtboard: (artboard) => state.session.setArtboard(artboard),
    execute: (transaction) => state.session.executeFullTransaction(transaction),
    reportDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    notify: (message) => state.notificationController.notify(message, 'success'),
    // 换画板后按首屏口径重放：放得下就 100% 居中，放不下才适应窗口（弹框通常比主画布小）。
    fit: () => {
      state.viewportController.reset();
      state.viewportController.fitOnFirstRender();
    },
    onReferenceChange: () => state.referenceLayerController.sync(),
    isLive: () => state.workbenchController.nativeEventsEnabled,
  });
  state.panelController = new DesignerPanelController({
    getCatalog: () => state.catalog,
    getArtboardSubCanvas: () => {
      const artboard = state.session.artboard;
      return artboard === null
        ? undefined
        : state.session.fullDocument?.subCanvases?.find((canvas) => canvas.id === artboard);
    },
    getStartPageId: () => {
      const document = state.session.fullDocument;
      return document === undefined ? null : resolveScreenStartPageId(document);
    },
    getMaterialLibraryItems: () => state.resolvedMaterialLibraryItems,
    getMaterialLibraryGrouping: () => state.materialLibraryGrouping,
    getMaterialLibraryFragments: () => state.runtime.listMaterialLibraryFragmentItems(element),
    insertMaterialLibraryFragment: (fragmentId) => {
      const result = state.runtime.insertMaterialLibraryFragment(element, fragmentId);
      if (result !== undefined && !result.ok) {
        state.runtime.emitDiagnostics(element, result.diagnostics);
      }
    },
    getDocument: () => state.session.document,
    hasTextSelection: () => hasDesignerTextSelection(element.shadowRoot),
    getGeometryDocument: () => getDesignerGeometryDocument(state),
    getImageNaturalSize: (componentId) => readDesignerImageNaturalSize(state.canvas, componentId),
    getDatasetFields: () => state.datasetController.getFocusedDatasetFields(),
    getInspectorControls: () => state.inspectorControls,
    componentStateEditing: state.componentStateEditing,
    previewComponentState: (componentId, stateId) =>
      state.canvasRuntimeController.previewComponentState(componentId, stateId),
    readComponentStateRuntime: (componentId) => state.renderer?.readComponentState(componentId),
    readLevelScales: (dataSourceId) => {
      const source = state.session.fullDocument?.dataSources?.find(
        (candidate) => candidate.id === dataSourceId,
      )?.source;
      return source?.kind === 'host-resource'
        ? state.runtimeContributions?.getResourceType(source.resourceType)?.levelScales
        : undefined;
    },
    getGroupMaterialType: () => state.groupMaterialType,
    getInteraction: () => state.session.interaction,
    getResourcePort: () => state.resourcePort,
    getRuntimeContributions: () => state.runtimeContributions,
    executeCommand: (command) => state.runtime.executeDesignerCommand(element, command),
    // 编辑非默认状态时（ADR-0110 §2.5），检查器落到该组件 style 的改动改写成该状态的覆盖。
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(
        element,
        redirectEditingStateStyle(state, transaction),
      ),
    reduceSelection: (action) => state.session.reduceSelection(action),
    redo: () => state.session.redo(),
    setZoom: (zoom) => state.viewportController.setZoomCentered(zoom),
    undo: () => state.session.undo(),
    getZoom: () => state.viewportController.state.zoom,
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    isMaterialAvailable: (type) => !state.materialLibraryState?.unavailableTypes?.includes(type),
    requestMaterialLibraryAction: (action) =>
      state.runtime.requestMaterialLibraryAction(element, action),
    requestHostResourceSelection: (target) => element.requestHostResourceSelection(target),
    onCanvasPresentationChange: (settings) => {
      if (state.canvas !== undefined) {
        state.canvas.style.opacity = String(settings.opacity);
        state.canvas.dataset.scaleMode = settings.scaleMode;
        state.canvas.dataset.backgroundAutoFill = String(settings.backgroundAutoFill);
        state.canvas.dataset.disableComponentLoading = String(settings.disableComponentLoading);
      }
      element.dispatchEvent(
        new CustomEvent<BaseScreenCanvasPresentationChangeEventDetail>(
          BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
          {
            bubbles: true,
            composed: true,
            detail: {
              opacity: settings.opacity,
              scaleMode: settings.scaleMode,
              backgroundAutoFill: settings.backgroundAutoFill,
              disableComponentLoading: settings.disableComponentLoading,
            },
          },
        ),
      );
    },
    isHostResourceSelectionButtonVisible: () => state.hostResourceSelectionButton,
    selectInspectorTab: (tab) => state.workbenchController.selectInspectorTab(tab),
  });
  state.viewportController = new DesignerViewportController({
    getDocument: () => state.session.document,
    onBlur: () => {
      state.runtime.cancelGesture(element);
      state.workbenchController.cancelTransientState();
    },
    onToolChange: () => {
      state.workbenchController.cancelTransientState();
      state.runtime.renderControls(element);
    },
    onViewportChange: () => {
      state.workbenchController.renderCanvasPrecision();
      state.coordinateEntryController.sync();
      state.sizeEntryController.sync();
    },
  });
  state.workbenchController = new DesignerWorkbenchController({
    getCanvas: () => state.canvas,
    getDocument: () => getDesignerGeometryDocument(state),
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    getRoot: () => element.shadowRoot,
    getZoom: () => state.viewportController.state.zoom,
    // 状态栏「事件」开关：把设计态画布交互模式应用到渲染器（原地重渲染，不重建）。
    onNativeEventsChange: (enabled) => state.runtime.applyNativeEvents(element, enabled),
    onLeftPanelGroupChange: syncActiveLeftPanelGroup,
    // 数据面板整块按需加载：页签真正被选中时才发起，避免首屏解析面板代码。
    onInspectorTabChange: (tab) => {
      if (tab === 'data') state.datasetController.ensureLoaded();
    },
  });
  state.blueprintWorkbenchController = new DesignerBlueprintWorkbenchController({
    getHost: () => element,
    getDocument: () => state.session.document,
    getCatalog: () => state.catalog,
    getRuntimeContributions: () => state.runtimeContributions,
    getDocumentRevision: () => state.documentGeneration,
    getProjectRevision: () => state.session.project?.revision ?? null,
    canUndo: () => state.session.canUndo,
    canRedo: () => state.session.canRedo,
    getLeftPanelGroups: () => state.leftPanelGroups,
    setWorkbenchAuthoringMode: (mode) => state.workbenchController.setAuthoringMode(mode),
    dismissTransientSurfaces: () => state.panelController.dismissTransientSurfaces(),
    expandLeftPanel: () => state.workbenchController.expandLeftPanel(),
    onActiveLeftPanelGroupChange: syncActiveLeftPanelGroup,
    executeCommand: (command) => state.runtime.executeDesignerCommand(element, command),
    undo: () => element.undo(),
    redo: () => element.redo(),
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
  });
  state.commandPaletteController = new DesignerCommandPaletteController({
    getRoot: () => element.shadowRoot,
    getDocument: () => state.session.document,
    getWorkbenchMode: () => state.blueprintWorkbenchController.mode,
    getPluginCatalog: () => state.pluginCatalog,
    getPluginCommandPort: () => state.pluginCommandPort,
    executePluginCommand: (commandId) => state.runtime.executePluginCommand(element, commandId),
    renderKindIcon: (kind) =>
      designerIcon(
        kind === 'material'
          ? 'grid'
          : kind === 'layer'
            ? 'layers'
            : kind === 'blueprint'
              ? 'variable'
              : 'terminal',
      ),
  });
  state.coordinateEntryController = new DesignerCoordinateEntryController({
    getRoot: () => element.shadowRoot,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    report: (result) => state.runtime.report(element, result),
    focusViewport: () => state.viewportController.focus(),
  });
  state.sizeEntryController = new DesignerSizeEntryController({
    getRoot: () => element.shadowRoot,
    getDocument: () => getDesignerGeometryDocument(state),
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    report: (result) => state.runtime.report(element, result),
    focusViewport: () => state.viewportController.focus(),
  });
  // 采纳提案 = 一次普通事务（带 provenance）：必须与手动编辑共享历史与修订号。
  state.changeController.setDocumentReader(() => state.session.document);
  state.changeController.setIntentScopeReader(() => state.intentController.scope);
  state.changeController.setPaneModeHandler((mode) => {
    state.intentController.setWritingMode(mode === 'intent');
  });
  state.intentController.setOverlayHost(() => getOverlayHost());
  state.changeController.setHistoryControls(
    () => state.session.readHistory(),
    (index) => {
      state.runtime.report(element, state.session.revertTo(index));
    },
  );
  state.changeController.setStateHandler((detail: BaseScreenDesignerChangeStateDetail) => {
    element.dispatchEvent(
      new CustomEvent<BaseScreenDesignerChangeStateDetail>(BASE_SCREEN_CHANGE_STATE_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  });
  const emitMetric = (name: DesignerMetricName): void => {
    element.dispatchEvent(
      new CustomEvent(BASE_SCREEN_METRIC_EVENT, {
        bubbles: true,
        composed: true,
        detail: createDesignerMetric(name),
      }),
    );
  };
  state.changeController.setMetricHandler(emitMetric);
  // 指代歧义的点选会话：选区是画布高亮的唯一来源，把候选放进选区就等于一起高亮；
  // 收敛后的选区原样留在画布上，取消时才放回提问前的那一份。
  state.intentChoiceController = new DesignerIntentChoiceController({
    getSelectedComponentIds: () => state.session.interaction.selectedComponentIds,
    replaceSelection: (componentIds) =>
      state.session.reduceSelection({
        type: 'replace-selection',
        componentIds,
        focusedComponentId: componentIds[0] ?? null,
      }),
  });
  state.intentController.setMetricHandler(emitMetric);
  state.intentController.setParameterHandler((patch: DesignerParameterPatch) => {
    const document = state.session.document;
    if (document === undefined) return false;
    const selected = new Set(state.session.interaction.selectedComponentIds);
    const components = document.components.filter((component) => selected.has(component.id));
    if (components.length === 0) return false;
    const commands = components.map((component) => ({
      type: 'update-components' as const,
      componentIds: [component.id],
      patch: parameterComponentPatch(component, patch),
    }));
    const result = state.runtime.executeDesignerTransaction(element, { commands });
    state.runtime.report(element, result);
    return result.ok;
  });
  state.changeController.setAdoptHandler((commands, provenance) => {
    const result = state.runtime.executeDesignerTransaction(element, { commands, provenance });
    state.runtime.report(element, result);
    if (result.ok) return { ok: true };
    // 与状态栏/通知取同一条诊断摘要，单元卡里不再只说「采纳未成功」。
    const diagnostic = result.diagnostics[0];
    return {
      ok: false,
      ...(diagnostic === undefined ? {} : { reason: designerDiagnosticSummary(diagnostic.code) }),
    };
  });
}

/** 数值意图命中后写回组件的补丁：只改命中的那一个字段，其余样式原样带上。 */
function parameterComponentPatch(
  component: {
    readonly style: Record<string, unknown>;
    readonly size: { width: number; height: number };
  },
  patch: DesignerParameterPatch,
): Record<string, unknown> {
  if (patch.property === 'style.color') {
    return { style: { ...component.style, color: patch.value } };
  }
  if (patch.property === 'style.fontSize') {
    return { style: { ...component.style, fontSize: patch.value } };
  }
  if (patch.property === 'size.width') {
    return { size: { ...component.size, width: patch.value } };
  }
  return { size: { ...component.size, height: patch.value } };
}

/** 当前画板是不是弹框：弹框画板上不预览别的弹框、也不切页。 */
function isPopupArtboard(state: DesignerElementState): boolean {
  const artboard = state.session.artboard;
  if (artboard === null) return false;
  return (
    state.session.fullDocument?.subCanvases?.find((canvas) => canvas.id === artboard)?.display ===
    'popup'
  );
}

function redirectEditingStateStyle(
  state: DesignerElementState,
  transaction: ScreenDocumentTransaction,
): ScreenDocumentTransaction {
  const document = state.session.document;
  const selected = state.session.interaction.selectedComponentIds;
  if (document === undefined || selected.length !== 1) return transaction;
  const component = document.components.find((item) => item.id === selected[0]);
  if (component === undefined) return transaction;
  const stateId = state.componentStateEditing.get(component);
  return redirectDesignerStyleTransaction(document, component.id, stateId, transaction);
}

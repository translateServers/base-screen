import { DesignerBlueprintWorkbenchController } from '../../browser/controllers/blueprint/designer-blueprint-workbench-controller.js';
import { DesignerDatasetController } from '../../browser/controllers/dataset/designer-dataset-controller.js';
import { DesignerCanvasRuntimeController } from '../../browser/controllers/designer-canvas-runtime-controller.js';
import { DesignerCommandPaletteController } from '../../browser/controllers/designer-command-palette-controller.js';
import { DesignerImportController } from '../../browser/controllers/designer-import-controller.js';
import { DesignerIntegrationController } from '../../browser/controllers/designer-integration-controller.js';
import { DesignerPreviewController } from '../../browser/controllers/designer-preview-controller.js';
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
import { readDesignerImageNaturalSize } from '../../browser/dom/designer-image-metadata-dom.js';
import { hasDesignerTextSelection } from '../../browser/dom/designer-text-selection.js';
import { designerIcon } from '../../browser/ui/designer-icons.js';
import { insertDesignerBlueprintVariableNode } from '../../common/operations/blueprint/designer-blueprint-model.js';
import {
  BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
  type BaseScreenCanvasPresentationChangeEventDetail,
} from '../../common/operations/canvas/canvas-presentation.js';
import {
  BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT,
  type BaseScreenDesignerBackRequestEventDetail,
} from '../../common/operations/workbench/designer-navigation.js';
import { DesignerProjectGateway } from '../../common/project/designer-project-gateway.js';
import { DesignerSession } from '../../common/session/designer-session.js';
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
    },
    onDirtyChange: (dirty, revision) => {
      state.runtime.renderControls(element);
      element.dispatchEvent(
        new CustomEvent('base-screen-dirty-change', { detail: { dirty, revision } }),
      );
    },
    onConflict: () => element.dispatchEvent(new CustomEvent('base-screen-project-conflict')),
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
    getDocument: () => state.session.document,
    getProject: () => state.session.project,
    replaceDocument: (document) => element.replaceDocument(document),
    loadProject: (projectId) => state.session.load(projectId),
  });
  state.gestureController = new DesignerGestureController({
    getCatalog: () => state.catalog,
    getMaterialLibraryItem: (id) =>
      state.resolvedMaterialLibraryItems.find((item) => item.id === id),
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
    addToBlueprint: (variableId) => {
      const document = state.session.document;
      if (document === undefined) return;
      const blueprint = insertDesignerBlueprintVariableNode(document, variableId);
      if (blueprint !== null) {
        const result = element.executeCommand({ type: 'replace-blueprint', blueprint });
        if (!result.ok) {
          state.runtime.report(element, result);
          return;
        }
      }
      element.setWorkbenchMode('blueprint', { focus: { kind: 'variable', id: variableId } });
    },
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
    getDocument: () => state.session.document,
    getResourcePort: () => state.resourcePort,
    getHostCatalogPort: () => state.hostCatalogPort,
    getConditionalStylePort: () => state.conditionalStylePort,
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
  state.datasetController = new DesignerDatasetController({
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
  state.panelController = new DesignerPanelController({
    getCatalog: () => state.catalog,
    getMaterialLibraryItems: () => state.resolvedMaterialLibraryItems,
    getMaterialLibraryGrouping: () => state.materialLibraryGrouping,
    getDocument: () => state.session.document,
    hasTextSelection: () => hasDesignerTextSelection(element.shadowRoot),
    getGeometryDocument: () => getDesignerGeometryDocument(state),
    getImageNaturalSize: (componentId) => readDesignerImageNaturalSize(state.canvas, componentId),
    getDatasetFields: () => state.datasetController.getFocusedDatasetFields(),
    getInspectorControls: () => state.inspectorControls,
    getHostConditionalStyleAuthoring: () => state.hostConditionalStyleAuthoring,
    refreshConditionalStyles: (componentIds) =>
      state.runtime.refreshConditionalStyles(element, componentIds),
    getGroupMaterialType: () => state.groupMaterialType,
    getInteraction: () => state.session.interaction,
    getResourcePort: () => state.resourcePort,
    getRuntimeContributions: () => state.runtimeContributions,
    executeCommand: (command) => state.runtime.executeDesignerCommand(element, command),
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
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
}

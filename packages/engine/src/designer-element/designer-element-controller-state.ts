import { DesignerAssetController } from '../browser/controllers/designer-asset-controller.js';
import { DesignerCanvasRuntimeController } from '../browser/controllers/designer-canvas-runtime-controller.js';
import { DesignerCommandPaletteController } from '../browser/controllers/designer-command-palette-controller.js';
import { DesignerCoordinateEntryController } from '../browser/controllers/designer-coordinate-entry-controller.js';
import { DesignerDatasetController } from '../browser/controllers/designer-dataset-controller.js';
import { DesignerGestureController } from '../browser/controllers/designer-gesture-controller.js';
import { DesignerImportController } from '../browser/controllers/designer-import-controller.js';
import { DesignerIntegrationController } from '../browser/controllers/designer-integration-controller.js';
import { DesignerLayersController } from '../browser/controllers/designer-layers-controller.js';
import { DesignerPanelController } from '../browser/controllers/designer-panel-controller.js';
import { DesignerPreviewController } from '../browser/controllers/designer-preview-controller.js';
import { DesignerProjectFeedbackController } from '../browser/controllers/designer-project-feedback-controller.js';
import { DesignerProjectWorkspaceController } from '../browser/controllers/designer-project-workspace-controller.js';
import { DesignerTextEditController } from '../browser/controllers/designer-text-edit-controller.js';
import { DesignerVariablesController } from '../browser/controllers/designer-variables-controller.js';
import { DesignerViewportController } from '../browser/controllers/designer-viewport-controller.js';
import { DesignerWorkbenchController } from '../browser/controllers/designer-workbench-controller.js';
import { designerIcon } from '../browser/ui/designer-icons.js';
import {
  BASE_SCREEN_CANVAS_PRESENTATION_CHANGE_EVENT,
  type BaseScreenCanvasPresentationChangeEventDetail,
} from '../canvas-presentation.js';
import { DesignerProjectGateway } from '../common/project/designer-project-gateway.js';
import { DesignerSession } from '../common/session/designer-session.js';
import {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
} from '../designer-left-panel-groups.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function initializeDesignerElementControllers(
  element: DesignerElementHost,
  state: DesignerElementState,
): void {
  state.canvasRuntimeController = new DesignerCanvasRuntimeController({
    getRenderer: () => state.renderer,
    getVariablePort: () => state.variablePort,
    emitDiagnostics: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
  });
  state.session = new DesignerSession({
    renderDocument: (document) => state.runtime.renderDocument(element, document),
    renderInteraction: () => state.runtime.renderInteraction(element),
    emitChange: (document) => {
      state.documentGeneration++;
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
    getAssetCatalogPort: () => state.assetCatalogPort,
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
    getDocument: () => state.session.document,
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
    setSnapSessionActive: (active) => state.workbenchController.setSnapSessionActive(active),
    reduceSelection: (action) => state.session.reduceSelection(action),
    reportTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
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
    onEditingChange: () => {},
  });
  state.variablesController = new DesignerVariablesController({
    getDocument: () => state.session.document,
    executeCommand: (command) => element.executeCommand(command),
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
      const component = state.session.document?.components.find((item) => item.id === componentId);
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
    requestBlueprintEdit: (options) => element.requestBlueprintEdit(options),
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
    getVariablePort: () => state.variablePort,
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
  state.assetController = new DesignerAssetController({
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    getCatalog: () => state.catalog,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getPort: () => state.assetCatalogPort,
    report: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
  });
  state.datasetController = new DesignerDatasetController({
    getCatalogPort: () => state.datasetCatalogPort,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    getResourcePort: () => state.resourcePort,
    getRuntimeContributions: () => state.runtimeContributions,
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    report: (diagnostics) => state.runtime.emitDiagnostics(element, diagnostics),
    refresh: (componentId) => element.refreshData(componentId),
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
    getDatasetFields: () => state.datasetController.getFocusedDatasetFields(),
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
    requestCanvasBackgroundImage: () => element.requestCanvasBackgroundImage(),
    requestCanvasPresentationAction: (action) => {
      element.dispatchEvent(
        new CustomEvent('base-screen-canvas-presentation-action', {
          bubbles: true,
          composed: true,
          detail: { action },
        }),
      );
    },
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
              thumbnailUrl: settings.thumbnailUrl ?? null,
            },
          },
        ),
      );
    },
    isCanvasBackgroundImageButtonVisible: () => state.canvasBackgroundImageButton,
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
    },
  });
  state.workbenchController = new DesignerWorkbenchController({
    getCanvas: () => state.canvas,
    getDocument: () => state.session.document,
    getInteraction: () => state.session.interaction,
    getCatalog: () => state.catalog,
    getRoot: () => element.shadowRoot,
    getZoom: () => state.viewportController.state.zoom,
    // 状态栏「事件」开关：把设计态画布交互模式应用到渲染器（原地重渲染，不重建）。
    onNativeEventsChange: (enabled) => state.runtime.applyNativeEvents(element, enabled),
    onLeftPanelGroupChange: (groupId) => {
      element.dispatchEvent(
        new CustomEvent<BaseScreenDesignerLeftPanelGroupChangeEventDetail>(
          BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
          {
            bubbles: true,
            composed: true,
            detail: { groupId: groupId ?? null },
          },
        ),
      );
    },
  });
  state.commandPaletteController = new DesignerCommandPaletteController({
    getRoot: () => element.shadowRoot,
    getDocument: () => state.session.document,
    renderKindIcon: (kind) =>
      designerIcon(kind === 'material' ? 'grid' : kind === 'layer' ? 'layers' : 'terminal'),
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
}

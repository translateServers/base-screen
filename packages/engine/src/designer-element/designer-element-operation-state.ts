import { DesignerEventSystem } from '../browser/dom/designer-event-system.js';
import { DesignerMenuController } from '../browser/dom/designer-menu.js';
import { DesignerSurfaceRouter } from '../browser/dom/designer-surface-router.js';
import {
  createDesignerElementOperations,
  type DesignerElementOperationsHost,
  type DesignerOperationContext,
} from '../common/operations/designer-element-operations.js';
import { DesignerOperationRegistry } from '../common/operations/designer-operation-registry.js';
import { DesignerSelectionActions } from '../common/operations/designer-selection-actions.js';
import type { DesignerElementHost, DesignerElementState } from './designer-element-state.js';

export function initializeDesignerElementOperations(
  element: DesignerElementHost,
  state: DesignerElementState,
): void {
  state.operationHost = {
    getDocument: () => state.session.document,
    canUndo: () => state.session.canUndo,
    canRedo: () => state.session.canRedo,
    getSelection: () => state.session.interaction,
    getProject: () => state.session.project,
    getProjectPhase: () => state.session.projectPhase,
    hasPreviewHandler: () => state.previewHandler !== undefined,
    isDirty: () => state.session.dirty,
    canPublish: () => state.session.adapter?.capabilities.publish === true,
    hasProjectWorkspace: () =>
      state.projectCatalogPort !== undefined ||
      state.projectPreviewPort !== undefined ||
      state.projectSnapshotPort !== undefined,
    hasClipboard: () => state.panelController.hasClipboard,
    canGroup: () => state.panelController.canGroup,
    canUngroup: () => state.panelController.canUngroup,
    canAlign: () => state.panelController.canAlign,
    canDistribute: () => state.panelController.canDistribute,
    canEnterGroupEditing: () => state.gestureController.canEnterGroupEditingContext(),
    canExitGroupEditing: () => state.gestureController.canExitGroupEditingContext(),
    getToolMaterialTypes: () => state.toolMaterialTypes,
    getCatalog: () => state.catalog,
    getZoom: () => state.viewportController.state.zoom,
    undo: () => element.undo(),
    redo: () => element.redo(),
    reduceSelection: (action) => state.session.reduceSelection(action),
    executeCommand: (command) => state.runtime.executeDesignerCommand(element, command),
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    copy: () => element.copy(),
    paste: () => element.paste(),
    group: () => element.group(),
    ungroup: () => element.ungroup(),
    enterGroupEditing: () => state.gestureController.enterGroupEditingContext(),
    exitGroupEditing: () => state.gestureController.exitGroupEditingContext(),
    align: (alignment) => element.align(alignment),
    distribute: (distribution) => element.distribute(distribution),
    duplicate: () => state.panelController.duplicate(),
    setZoomCentered: (zoom) => state.viewportController.setZoomCentered(zoom),
    resetViewport: () => state.viewportController.reset(),
    toggleCanvasAid: (aid) => state.workbenchController.toggleCanvasAid(aid),
    isCanvasAidEnabled: (aid) => state.workbenchController.isCanvasAidEnabled(aid),
    toggleGuides: () => state.workbenchController.toggleGuides(),
    isGuidesVisible: () => state.workbenchController.guidesVisible,
    toggleBorderGuides: () => state.workbenchController.toggleBorderGuides(),
    isBorderGuidesEnabled: () => state.workbenchController.borderGuidesEnabled,
    cycleWorkbenchMode: () => state.workbenchController.cycleMode(),
    openProjectWorkspace: () => state.projectWorkspaceController.open(),
    save: () => element.save(),
    publish: () => element.publish(),
    retryLastProjectOperation: () => element.retryLastProjectOperation(),
    cancelProjectOperation: () => element.cancelProjectOperation(),
    setActiveTool: (tool) => state.viewportController.setActiveTool(tool),
    cancelGesture: () => state.runtime.cancelGesture(element),
    canMutateSelection: () => state.selectionActions.canMutate(),
    canEditPosition: () => state.coordinateEntryController.canOpen(),
    canSelectLayer: (direction) => state.layersController.canStepSelection(direction),
    canSetSelectionStatus: () => state.selectionActions.canSetStatus(),
    openCoordinateEntry: () => {
      state.runtime.cancelGesture(element);
      state.workbenchController.cancelTransientState();
      state.commandPaletteController.close(false);
      state.menuController.closeMenus();
      state.menuController.closeContextMenu();
      state.menuController.closeHelpPanel();
      state.coordinateEntryController.open();
    },
    deleteSelection: () => state.selectionActions.delete(),
    selectLayer: (direction) => state.layersController.stepSelection(direction),
    nudgeSelection: (x, y) => state.selectionActions.nudge(x, y),
    toggleSelectionStatus: (property, value) =>
      state.selectionActions.toggleStatus(property, value),
    reorderSelection: (edge) => state.selectionActions.reorder(edge),
    toggleHelpPanel: () => state.menuController.toggleHelpPanel(),
    fitViewportToSelectionOrCanvas: () => state.runtime.fitViewportToSelectionOrCanvas(element),
    exportFromOperation: () => state.runtime.exportFromOperation(element),
    openImportPicker: () => state.runtime.openImportPicker(element),
    togglePreview: () => element.togglePreview(),
    isProjectBusy: () => state.runtime.isProjectBusy(element),
    report: (result) => state.runtime.report(element, result),
    reportProject: (result) => state.runtime.reportProject(element, result),
    reportPreview: (result) => state.runtime.reportPreview(element, result),
  };
  state.operations = new DesignerOperationRegistry<DesignerOperationContext | undefined>(
    createDesignerElementOperations(state.operationHost),
  );
  state.eventSystem = new DesignerEventSystem({
    isGestureActive: () => state.gestureController.active,
    findOperation: (chord) => state.operations.findByShortcut(chord),
    onWindowBlur: () => {
      // 窗口失焦统一复位设计器内部状态（不触达宿主）。
      state.runtime.cancelGesture(element);
      state.workbenchController.cancelTransientState();
      state.menuController.closeMenus();
      state.menuController.closeContextMenu();
      state.menuController.closeHelpPanel();
      state.commandPaletteController.close(false);
      state.coordinateEntryController.close(false);
    },
    // 空格抓手与键盘焦点解耦：鼠标悬停视窗即可激活临时抓手（无需先点击聚焦）。
    onWindowKeyDown: (event) => state.viewportController.onWindowKeyDown(event),
    onWindowKeyUp: (event) => state.viewportController.onWindowKeyUp(event),
  });
  state.selectionActions = new DesignerSelectionActions({
    getDocument: () => state.session.document,
    getSelectedComponentIds: () => state.session.interaction.selectedComponentIds,
    executeCommand: (command) => state.runtime.executeDesignerCommand(element, command),
    executeTransaction: (transaction) =>
      state.runtime.executeDesignerTransaction(element, transaction),
    reduceSelection: (action) => state.session.reduceSelection(action),
    report: (result) => state.runtime.report(element, result),
  });
  state.menuController = new DesignerMenuController({
    getRoot: () => element.shadowRoot,
    getContextMenu: () => state.contextMenu,
    getSelectedComponentIds: () => state.session.interaction.selectedComponentIds,
    getOperationState: (id) => state.operations.getState(id, undefined),
  });
  state.surfaceRouter = new DesignerSurfaceRouter();
}

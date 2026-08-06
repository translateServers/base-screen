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
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
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
import { createDesignerWorkspace } from './browser/dom/designer-workspace.js';
import { createDesignerStyle } from './browser/styles/designer-style.js';
import {
  createDesignerElementOperations,
  type DesignerElementOperationsHost,
  type DesignerOperationContext,
} from './common/operations/designer-element-operations.js';
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
    snapCanvasSelection: (bounds, offset, excludedComponentIds, options) =>
      this.#workbenchController.snapSelectionOffset(bounds, offset, excludedComponentIds, options),
    renderSnapPreview: (point) => this.#workbenchController.renderSnapPreview(point),
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
    getInteraction: () => this.#session.interaction,
    getRoot: () => this.shadowRoot,
    getZoom: () => this.#viewportController.state.zoom,
  });
  readonly #operationHost: DesignerElementOperationsHost = {
    getDocument: () => this.#session.document,
    canUndo: () => this.#session.canUndo,
    canRedo: () => this.#session.canRedo,
    getSelection: () => this.#session.interaction,
    getProject: () => this.#session.project,
    getProjectPhase: () => this.#session.projectPhase,
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
    align: (alignment) => this.align(alignment),
    distribute: (distribution) => this.distribute(distribution),
    duplicate: () => this.#panelController.duplicate(),
    setZoomCentered: (zoom) => this.#viewportController.setZoomCentered(zoom),
    resetViewport: () => this.#viewportController.reset(),
    toggleCanvasAid: (aid) => this.#workbenchController.toggleCanvasAid(aid),
    toggleGuides: () => this.#workbenchController.toggleGuides(),
    toggleBorderGuides: () => this.#workbenchController.toggleBorderGuides(),
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
    },
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
    getOperationState: (id) => this.#operations.getState(id, undefined),
  });
  readonly #surfaceRouter = new DesignerSurfaceRouter();
  readonly #surfaceBindings: DesignerSurfaceBindings = {
    click: [
      (target) => this.#notificationController.dismiss(target as Element),
      (target) => this.#menuController.toggleMenuFromTarget(target as Element),
      () => {
        this.#menuController.closeMenus();
        this.#menuController.closeContextMenu();
        return false;
      },
      (target) => this.executeToolFromTarget(target as Element),
      (target) => this.executeOperationFromTarget(target as Element),
      (target) => this.#importController.onClick(target as Element),
      (target) => this.#projectFeedbackController.onClick(target as Element),
      (target) => this.#projectWorkspaceController.onClick(target as Element),
      (target) => this.#assetController.onClick(target as Element),
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
      (target, event) => this.#integrationController.onChange(event),
      (target, event) => this.#layersController.onChange(event),
      (target, event) => {
        this.#panelController.onPropertyChange(event);
        return true;
      },
    ],
    input: [
      (target) => this.#assetController.onInput(target),
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
    pointerUp: (target, event) => {
      this.#workbenchController.onPointerUp(event as PointerEvent);
      return true;
    },
    pointerCancel: () => {
      this.#workbenchController.cancelTransientState();
      return true;
    },
    doubleClick: (target, event) => {
      this.#workbenchController.onDoubleClick(event as MouseEvent);
      return true;
    },
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
      (target, event) => this.#integrationController.onKeyDown(event as KeyboardEvent),
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
    this.connectWindowGuards();
  }

  disconnectedCallback(): void {
    this.#eventSystem.disconnectWindowGuards();
    this.cancelGesture();
    this.#assetController.clear();
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
    this.#surfaceRouter.connect(shadow, this.#surfaceBindings);
    this.connectWindowGuards();
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
    this.#menuController.closeContextMenu();
    return this.#operations.execute(id, undefined);
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
              result = this.#session.executeTransaction(commit.transaction);
              return result;
            },
          }
        : {}),
      ...('command' in commit
        ? {
            runCommand: () => {
              result = this.#session.executeCommand(commit.command);
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
    if (
      event.key === 'Escape' &&
      (this.#menuController.closeContextMenu() || this.#menuController.closeMenus())
    ) {
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

function projectPhaseLabel(phase: ScreenProjectPhase): string {
  return DESIGNER_UI_TEXT.projectPhases[phase];
}

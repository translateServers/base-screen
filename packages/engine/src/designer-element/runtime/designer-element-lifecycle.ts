import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function connectedCallback(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  // 首连由 initialize 完成全部接线；重连（initialize 因 renderer 已存在早退）时
  // 由 reconnectSurfaces 幂等重挂并重新注入面板引用（disconnect 时已被 release 释放）。
  const reconnected = elementState.renderer !== undefined;
  elementState.runtime.initialize(element);
  if (reconnected) elementState.runtime.reconnectSurfaces(element);
  if (elementState.renderer !== undefined && elementState.session.document !== undefined) {
    elementState.runtime.renderDocument(element, elementState.session.document);
    elementState.runtime.renderInteraction(element);
  }
  if (element.shadowRoot !== null)
    elementState.blueprintWorkbenchController.connect(element.shadowRoot);
  elementState.runtime.connectWindowGuards(element);
}

export function disconnectedCallback(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.eventSystem.disconnectWindowGuards();
  elementState.blueprintWorkbenchController.disconnect();
  elementState.runtime.cancelGesture(element);
  elementState.runtime.invalidateAuthoringRequests(element);
  elementState.datasetController.clear();
  elementState.runtime.resetSessionSurfaces(element);
  elementState.runtime.disconnectSurfaces(element);
  elementState.runtime.releaseSurfaces(element);
  elementState.session.cancelProjectOperation();
  elementState.canvasRuntimeController.clear();
  elementState.renderer?.clear();
  elementState.ghostRenderer?.clear();
}

export function disconnectSurfaces(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.autoWidthController.clear();
  elementState.tooltipController.disconnect();
  elementState.coordinateEntryController.disconnect();
  elementState.sizeEntryController.disconnect();
  elementState.workbenchController.disconnect();
  elementState.gestureController.disconnect();
  elementState.viewportController.disconnect();
  elementState.surfaceRouter.disconnect();
  elementState.panelController.dispose();
  elementState.scrollContinuityController.dispose();
  // 结束进行中的画布文本编辑：避免拆卸后物料 visibility 残留与 overlay 监听滞留。
  elementState.textEditController.disconnect();
  // 关闭菜单/上下文菜单/帮助面板：帮助面板的返回焦点引用随之释放。
  elementState.menuController.closeContextMenu();
  elementState.menuController.closeMenus();
  elementState.menuController.closeHelpPanel();
}

export function releaseSurfaces(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.canvas = undefined;
  elementState.viewportElement = undefined;
  elementState.selection = undefined;
  elementState.properties = undefined;
  elementState.dataPanel = undefined;
  elementState.interactionPanel = undefined;
  elementState.statusFeedback = undefined;
  elementState.contextMenu = undefined;
  elementState.layers = undefined;
  elementState.notificationController.release();
  elementState.errorConsoleController.release();
  elementState.guardController.release();
  elementState.changeController.release();
  elementState.sceneController.release();
  elementState.presentationLockController.release();
  elementState.intentController.release();
  elementState.intentChoiceController.release();
  elementState.targetDisplayController.release();
  elementState.integrationController.release();
  elementState.importController.release();
  elementState.projectWorkspaceController.release();
  elementState.projectFeedbackController.release();
  elementState.variablesController.release();
}

export function reconnectSurfaces(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const shadow = element.shadowRoot;
  if (shadow === null || shadow === undefined) return;
  const canvas = shadow.querySelector<HTMLDivElement>('[data-canvas]');
  const viewport = shadow.querySelector<HTMLDivElement>('[data-viewport]');
  if (canvas !== null && viewport !== null) {
    elementState.canvas = canvas;
    elementState.viewportElement = viewport;
    elementState.workbenchController.connect(canvas);
    elementState.gestureController.connect(canvas);
    elementState.gestureController.connectViewport(viewport);
    elementState.viewportController.connect(viewport, canvas);
  }
  elementState.coordinateEntryController.connect();
  elementState.sizeEntryController.connect();
  elementState.surfaceRouter.connect(shadow, elementState.surfaceBindings);
  elementState.blueprintWorkbenchController.connect(shadow);
  elementState.selection = shadow.querySelector<HTMLDivElement>('[data-selection]') ?? undefined;
  elementState.properties = shadow.querySelector<HTMLDivElement>('[data-properties]') ?? undefined;
  elementState.dataPanel =
    shadow.querySelector<HTMLDivElement>('[data-inspector-pane="data"]') ?? undefined;
  elementState.interactionPanel =
    shadow.querySelector<HTMLDivElement>('[data-inspector-pane="interaction"]') ?? undefined;
  elementState.statusFeedback =
    shadow.querySelector<HTMLElement>('[data-status-feedback]') ?? undefined;
  elementState.contextMenu = shadow.querySelector<HTMLElement>('[data-context-menu]') ?? undefined;
  elementState.layers = shadow.querySelector<HTMLDivElement>('[data-layers]') ?? undefined;
  const notifications = shadow.querySelector<HTMLElement>('[data-notifications]');
  if (notifications !== null) elementState.notificationController.connect(notifications);
  const tooltip = shadow.querySelector<HTMLElement>('[data-tooltip]');
  if (tooltip !== null) elementState.tooltipController.connect(shadow, tooltip);
  const consoleDialog = shadow.querySelector<HTMLElement>('[data-error-console]');
  const consoleTrigger = shadow.querySelector<HTMLButtonElement>('[data-error-console-toggle]');
  if (consoleDialog !== null && consoleTrigger !== null) {
    elementState.errorConsoleController.connect(consoleDialog, consoleTrigger);
  }
  const guardStrip = shadow.querySelector<HTMLButtonElement>('[data-guard-toggle]');
  const guardPopover = shadow.querySelector<HTMLElement>('[data-guard-popover]');
  const guardContent = shadow.querySelector<HTMLElement>('[data-canvas-content]');
  if (guardStrip !== null && guardPopover !== null && canvas !== null && guardContent !== null) {
    elementState.guardController.connect(guardStrip, guardPopover, canvas, guardContent);
  }
  const draftBar = shadow.querySelector<HTMLElement>('[data-draft-bar]');
  const changePane = shadow.querySelector<HTMLElement>('[data-change-pane]');
  const ghostLayer = shadow.querySelector<HTMLElement>('[data-canvas-ghost]');
  const rightPanel = shadow.querySelector<HTMLElement>('[data-right-panel]');
  if (draftBar !== null && changePane !== null && ghostLayer !== null && rightPanel !== null) {
    elementState.changeController.connect(draftBar, changePane, ghostLayer, rightPanel);
  }
  const sceneBlock = shadow.querySelector<HTMLElement>('[data-scene-block]');
  const sceneList = shadow.querySelector<HTMLElement>('[data-scene-list]');
  const sceneCount = shadow.querySelector<HTMLElement>('[data-scene-count]');
  const sceneNote = shadow.querySelector<HTMLElement>('[data-scene-note]');
  const sceneBar = shadow.querySelector<HTMLElement>('[data-scene-preview-bar]');
  const sceneBarName = shadow.querySelector<HTMLElement>('[data-scene-preview-name]');
  if (
    sceneBlock !== null &&
    sceneList !== null &&
    sceneCount !== null &&
    sceneNote !== null &&
    sceneBar !== null &&
    sceneBarName !== null
  ) {
    elementState.sceneController.connect(
      sceneBlock,
      sceneList,
      sceneCount,
      sceneNote,
      sceneBar,
      sceneBarName,
    );
    elementState.sceneController.setInstanceId(elementState.instanceId);
  }
  const intentInput = shadow.querySelector<HTMLTextAreaElement>('[data-intent-input]');
  const intentSubmit = shadow.querySelector<HTMLButtonElement>('[data-intent-submit]');
  const intentScope = shadow.querySelector<HTMLElement>('[data-intent-scope]');
  const intentScopeClear = shadow.querySelector<HTMLButtonElement>('[data-intent-scope-clear]');
  const intentStatus = shadow.querySelector<HTMLElement>('[data-intent-status]');
  const intentConfirm = shadow.querySelector<HTMLElement>('[data-intent-confirm]');
  const intentRefs = shadow.querySelector<HTMLElement>('[data-intent-refs]');
  const intentRefAdd = shadow.querySelector<HTMLButtonElement>('[data-intent-ref-add]');
  if (
    intentInput !== null &&
    intentSubmit !== null &&
    intentScope !== null &&
    intentScopeClear !== null &&
    intentStatus !== null &&
    intentConfirm !== null &&
    intentRefs !== null &&
    intentRefAdd !== null
  ) {
    elementState.intentController.connect(
      elementState.instanceId,
      intentInput,
      intentSubmit,
      intentScope,
      intentScopeClear,
      intentStatus,
      intentConfirm,
      intentRefs,
      intentRefAdd,
    );
    elementState.intentChoiceController.connect(intentStatus);
  }
  const displayLayer = shadow.querySelector<HTMLElement>('[data-display-overlay-layer]');
  if (displayLayer !== null) elementState.targetDisplayController.connect(displayLayer);
  const displayPanel = shadow.querySelector<HTMLElement>('[data-display-panel]');
  const displayToggle = shadow.querySelector<HTMLElement>('[data-display-toggle]');
  if (displayPanel !== null && displayToggle !== null) {
    elementState.targetDisplayController.setPanel(displayPanel, displayToggle);
  }
  const designerRoot = shadow.querySelector<HTMLElement>('.designer');
  const presentationHint = shadow.querySelector<HTMLElement>('[data-presentation-lock-hint]');
  if (designerRoot !== null && presentationHint !== null) {
    elementState.presentationLockController.connect(designerRoot, presentationHint, {
      canEnter: () =>
        elementState.changeController.pending === undefined &&
        !elementState.sceneController.previewing,
      notifyBlocked: () =>
        elementState.notificationController.notify(
          DESIGNER_UI_TEXT.presentationLock.blocked,
          'error',
        ),
      refit: () => elementState.viewportController.fit(),
    });
  }
  const eventsPanel = shadow.querySelector<HTMLDivElement>('[data-events-panel]');
  if (eventsPanel !== null) elementState.integrationController.connect(eventsPanel);
  const importDialog = shadow.querySelector<HTMLElement>('[data-import-confirmation]');
  if (importDialog !== null) elementState.importController.connect(importDialog);
  const workspace = shadow.querySelector<HTMLElement>('[data-project-workspace]');
  if (workspace !== null) elementState.projectWorkspaceController.connect(workspace);
  const variables = shadow.querySelector<HTMLElement>('[data-variables]');
  if (variables !== null) elementState.variablesController.connect(variables);
  const conflict = shadow.querySelector<HTMLElement>('[data-project-conflict]');
  if (conflict !== null) elementState.projectFeedbackController.connect(conflict);
}

export function connectWindowGuards(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const ownerWindow = element.ownerDocument.defaultView;
  const root = element.shadowRoot;
  if (ownerWindow !== null && root !== null) {
    elementState.eventSystem.connectWindowGuards(ownerWindow, root);
  }
}

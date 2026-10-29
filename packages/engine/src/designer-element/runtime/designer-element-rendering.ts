import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { type BaseScreenMaterialEvent, createBaseScreenRenderer } from '@base-screen/renderer';
import { renderDesignerInteractionPanel } from '../../browser/dom/designer-interaction-dom.js';
import { renderDesignerLeftPanelGroups } from '../../browser/dom/designer-left-panel-groups-dom.js';
import { renderDesignerSelection } from '../../browser/dom/designer-selection-dom.js';
import { attachDesignerCanvasHint } from '../../browser/dom/workspace/designer-canvas-hint-dom.js';
import {
  createDesignerWorkspace,
  populateMaterialLibrary,
  renderMaterialLibraryState,
} from '../../browser/dom/workspace/designer-workspace.js';
import {
  adoptDesignerStyleSheets,
  createDesignerStyle,
} from '../../browser/styles/designer-style.js';
import {
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
} from '../../common/operations/material-library/material-library-state.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { getDesignerGeometryDocument } from './designer-element-geometry.js';
import {
  type DesignerElementHost,
  type DesignerElementState,
  getDesignerElementState,
} from './designer-element-state.js';

export function initialize(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (
    !element.isConnected ||
    elementState.catalog === undefined ||
    elementState.renderer !== undefined
  ) {
    return;
  }
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  // 优先挂共享构造样式表（多实例单一 CSSOM 副本）；环境不支持时回退 style 元素。
  const styleFallback = adoptDesignerStyleSheets(shadow)
    ? []
    : [createDesignerStyle(element.ownerDocument)];
  shadow.replaceChildren(
    ...styleFallback,
    createDesignerWorkspace(
      element.ownerDocument,
      elementState.resolvedMaterialLibraryItems,
      elementState.toolMaterialTypes,
      elementState.materialLibraryState,
      elementState.materialLibraryGrouping,
      elementState.leftPanelGroups,
    ),
  );
  attachDesignerCanvasHint(shadow, element.ownerDocument);
  elementState.panelController.refreshMaterialLibrary(
    shadow.querySelector<HTMLElement>('.designer'),
  );
  elementState.viewportElement = shadow.querySelector<HTMLDivElement>('[data-viewport]')!;
  elementState.canvas = shadow.querySelector<HTMLDivElement>('[data-canvas]')!;
  elementState.selection = shadow.querySelector<HTMLDivElement>('[data-selection]')!;
  elementState.properties = shadow.querySelector<HTMLDivElement>('[data-properties]')!;
  elementState.dataPanel = shadow.querySelector<HTMLDivElement>('[data-inspector-pane="data"]')!;
  elementState.interactionPanel = shadow.querySelector<HTMLDivElement>(
    '[data-inspector-pane="interaction"]',
  )!;
  elementState.statusFeedback = shadow.querySelector<HTMLElement>('[data-status-feedback]')!;
  elementState.contextMenu = shadow.querySelector<HTMLElement>('[data-context-menu]')!;
  elementState.notificationController.connect(
    shadow.querySelector<HTMLElement>('[data-notifications]')!,
  );
  elementState.tooltipController.connect(
    shadow,
    shadow.querySelector<HTMLElement>('[data-tooltip]')!,
  );
  elementState.errorConsoleController.connect(
    shadow.querySelector<HTMLElement>('[data-error-console]')!,
    shadow.querySelector<HTMLButtonElement>('[data-error-console-toggle]')!,
  );
  elementState.guardController.connect(
    shadow.querySelector<HTMLButtonElement>('[data-guard-toggle]')!,
    shadow.querySelector<HTMLElement>('[data-guard-popover]')!,
    elementState.canvas,
    shadow.querySelector<HTMLElement>('[data-canvas-content]')!,
  );
  elementState.changeController.connect(
    shadow.querySelector<HTMLElement>('[data-draft-bar]')!,
    shadow.querySelector<HTMLElement>('[data-change-pane]')!,
    shadow.querySelector<HTMLElement>('[data-canvas-ghost]')!,
    shadow.querySelector<HTMLElement>('[data-right-panel]')!,
  );
  const intentInput = shadow.querySelector<HTMLTextAreaElement>('[data-intent-input]');
  const intentSubmit = shadow.querySelector<HTMLButtonElement>('[data-intent-submit]');
  const intentScope = shadow.querySelector<HTMLElement>('[data-intent-scope]');
  const intentCapability = shadow.querySelector<HTMLElement>('[data-intent-capability]');
  const intentScopeClear = shadow.querySelector<HTMLButtonElement>('[data-intent-scope-clear]');
  const intentStatus = shadow.querySelector<HTMLElement>('[data-intent-status]');
  const intentConfirm = shadow.querySelector<HTMLElement>('[data-intent-confirm]');
  if (
    intentInput !== null &&
    intentSubmit !== null &&
    intentScope !== null &&
    intentCapability !== null &&
    intentScopeClear !== null &&
    intentStatus !== null &&
    intentConfirm !== null
  ) {
    elementState.intentController.connect(
      elementState.instanceId,
      intentInput,
      intentSubmit,
      intentScope,
      intentCapability,
      intentScopeClear,
      intentStatus,
      intentConfirm,
    );
    // 问句与取消出口就在意图状态行上：不新建浮层，也不再占一块界面。
    elementState.intentChoiceController.connect(intentStatus);
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
  elementState.runtime.renderDesignerElementMaterialLibraryState(element);
  const eventsPanel = shadow.querySelector<HTMLDivElement>('[data-events-panel]');
  if (eventsPanel !== null) elementState.integrationController.connect(eventsPanel);
  elementState.importController.connect(
    shadow.querySelector<HTMLElement>('[data-import-confirmation]')!,
  );
  elementState.previewController.connect(shadow);
  elementState.projectWorkspaceController.connect(
    shadow.querySelector<HTMLElement>('[data-project-workspace]')!,
  );
  elementState.layers = shadow.querySelector<HTMLDivElement>('[data-layers]')!;
  elementState.variablesController.connect(shadow.querySelector<HTMLElement>('[data-variables]')!);
  elementState.projectFeedbackController.connect(
    shadow.querySelector<HTMLElement>('[data-project-conflict]')!,
  );
  elementState.workbenchController.initialize();
  elementState.runtime.createRenderer(element);
  elementState.gestureController.connect(elementState.canvas);
  elementState.gestureController.connectViewport(elementState.viewportElement);
  elementState.viewportController.connect(elementState.viewportElement, elementState.canvas);
  elementState.coordinateEntryController.connect();
  elementState.sizeEntryController.connect();
  elementState.surfaceRouter.connect(shadow, elementState.surfaceBindings);
  elementState.blueprintWorkbenchController.connect(shadow);
  elementState.runtime.connectWindowGuards(element);
  if (elementState.session.document !== undefined) {
    elementState.runtime.renderDocument(element, elementState.session.document);
    elementState.runtime.renderInteraction(element);
  }
}

export function renderDocument(
  element: DesignerElementHost,
  document: ScreenDocument,
): ScreenParseResult<void> {
  const elementState = getDesignerElementState(element);

  elementState.runtime.initialize(element);
  // 画布覆盖层（参考线/选区）的 z-index 由组件数派生（token 中 calc），
  // 保证始终高于组件的 painter order z-index（0..N-1）。
  element.style.setProperty(
    '--designer-canvas-component-count',
    String(document.components.length),
  );
  if (elementState.renderer === undefined) {
    return { ok: true, value: undefined, diagnostics: [] };
  }
  const rendered = elementState.canvasRuntimeController.render(document);
  if (rendered.ok) {
    elementState.autoWidthController.sync(document);
    elementState.workbenchController.invalidateGeometry();
    elementState.runtime.syncCanvasFrameSize(element, document);
    elementState.previewController.sync(document);
    elementState.guardController.schedule(document);
    elementState.targetDisplayController.setDocument(document);
  }
  return rendered.ok
    ? { ok: true, value: undefined, diagnostics: rendered.diagnostics }
    : { ok: false, diagnostics: rendered.diagnostics };
}

export function syncCanvasFrameSize(element: DesignerElementHost, document: ScreenDocument): void {
  const elementState = getDesignerElementState(element);

  const canvas = elementState.canvas;
  if (canvas === undefined) return;
  const width = `${document.canvas.width}px`;
  const height = `${document.canvas.height}px`;
  if (canvas.style.width !== width) canvas.style.width = width;
  if (canvas.style.height !== height) canvas.style.height = height;
}

export function renderInteraction(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.panelController.captureInspectorGroupPreferences(element.shadowRoot);
  elementState.runtime.renderSelection(element);
  elementState.coordinateEntryController.sync();
  elementState.sizeEntryController.sync();
  elementState.runtime.renderProperties(element);
  elementState.runtime.renderInspectorInteraction(element);
  elementState.runtime.renderLayers(element);
  elementState.runtime.renderControls(element);
  elementState.runtime.syncDesignerPluginPanels(element);
  const selectedIds = elementState.session.interaction.selectedComponentIds;
  const componentsById = new Map(
    (elementState.session.document?.components ?? []).map(
      (component) => [component.id, component] as const,
    ),
  );
  elementState.intentController.syncScope(
    selectedIds,
    (id) => componentsById.get(id)?.name,
    selectedIds.flatMap((id) => {
      const component = componentsById.get(id);
      if (component === undefined) return [];
      return [
        {
          name: component.name,
          // 「接了数据」指真的绑了数据源字段：legacy `dataSource` 或新的 `dataBinding`。
          // 只挂静态值或变量不算——否则提示会说能改绑定，而实际没有绑定可改。
          bound: component.dataSource !== null || (component.dataBinding ?? null) !== null,
        },
      ];
    }),
  );
  // 选区是「点选候选」的唯一信号：收敛到一个候选时，选择会话在这里收束。
  elementState.intentChoiceController.onSelectionChange(selectedIds);
  elementState.integrationController.render();
  elementState.workbenchController.renderInspectorTabs();
}

export function renderLeftPanelGroups(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const layout = element.shadowRoot?.querySelector<HTMLElement>('.designer');
  if (layout === null || layout === undefined) return;
  renderDesignerLeftPanelGroups(layout, elementState.leftPanelGroups);
  elementState.runtime.syncDesignerPluginPanels(element);
  elementState.workbenchController.refreshLeftPanelGroups();
  elementState.blueprintWorkbenchController.refreshLeftPanelGroups();
}

export function renderDesignerElementMaterialLibraryState(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const shadow = element.shadowRoot;
  if (shadow === null || shadow === undefined) return;
  renderMaterialLibraryState(shadow, elementState.materialLibraryState);
  elementState.errorConsoleController.recordMaterialLibraryState(elementState.materialLibraryState);
}

export function renderMaterialLibraryGrouping(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const shadow = element.shadowRoot;
  if (shadow === null || shadow === undefined || elementState.catalog === undefined) return;
  const layout = shadow.querySelector<HTMLElement>('.designer');
  if (layout === null) return;
  populateMaterialLibrary(
    layout,
    elementState.resolvedMaterialLibraryItems,
    elementState.materialLibraryState,
    elementState.materialLibraryGrouping,
  );
  elementState.panelController.refreshMaterialLibrary(layout);
}

export function renderMaterialLibraryItems(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.runtime.renderMaterialLibraryGrouping(element);
}

export function requestMaterialLibraryAction(
  element: DesignerElementHost,
  action: BaseScreenMaterialLibraryAction,
): void {
  element.dispatchEvent(
    new CustomEvent<BaseScreenMaterialLibraryActionEventDetail>(
      BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
      { detail: { action }, bubbles: true, composed: true },
    ),
  );
}

export function renderSelection(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  renderDesignerSelection(
    elementState.selection,
    element.ownerDocument,
    getDesignerGeometryDocument(elementState),
    elementState.session.interaction.selectedComponentIds,
    elementState.catalog,
  );
}

export function renderControls(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  // 数据面板只由 renderProperties 渲染：renderControls 的调用场景（工具/脏状态/
  // 剪贴板/项目阶段）不改变其输入，重复渲染既浪费也打断面板输入焦点。
  elementState.runtime.renderToolControls(element);
  elementState.runtime.renderOperationControls(element);
  elementState.runtime.renderProjectStatus(element);
  elementState.variablesController.render();
  elementState.panelController.refreshInspectorUi(element.shadowRoot);
  elementState.topbarController.render();
  elementState.blueprintWorkbenchController.render();
}

export function renderLayers(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.layersController.render(elementState.layers);
}

export function renderProperties(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  elementState.scrollContinuityController.preserve(element.shadowRoot, () => {
    // 数据面板只有一条渲染路径：宿主接不接 datasetPort 只决定 dataset 这个 mode 可不可用，
    // 不再决定「用哪套面板」。属性面板与数据面板各渲染自己的 DOM 区；
    // dataPanel 只作为滚动守护的挂载线索传下去，不参与渲染决策。
    elementState.panelController.render(elementState.properties, elementState.dataPanel);
    elementState.datasetController.render(elementState.dataPanel);
  });
}

export function renderInspectorInteraction(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const available = renderDesignerInteractionPanel(
    elementState.interactionPanel,
    elementState.session.document,
    elementState.session.interaction,
    elementState.catalog,
    elementState.runtimeContributions,
  );
  element.shadowRoot
    ?.querySelector<HTMLButtonElement>('[data-inspector-tab="interaction"]')
    ?.toggleAttribute('disabled', !available);
  const eventsPanel =
    elementState.interactionPanel?.querySelector<HTMLDivElement>('[data-events-panel]');
  if (eventsPanel !== null && eventsPanel !== undefined) {
    elementState.integrationController.connect(eventsPanel);
  }
}

export function createRenderer(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (elementState.canvas === undefined || elementState.catalog === undefined) return;
  const content = elementState.canvas.querySelector<HTMLDivElement>('[data-canvas-content]');
  if (content === null) return;
  elementState.renderer = createBaseScreenRenderer({
    // Renderer 只挂载到内容层：内容层按 canonical 画布边界裁剪，外层 canvas
    // 继续承载选区、变换手柄和参考线等作者覆盖层。
    root: content,
    catalog: elementState.catalog,
    mode: 'design',
    // 状态栏「事件」开关是交互模式的唯一来源：渲染器重建后开关状态保持。
    interactive: elementState.workbenchController.nativeEventsEnabled,
    // 设计态原生事件（interactive 开启时）转发给宿主，与 Viewer 的
    // base-screen-material-event 同形同语义。
    onMaterialEvent: (event) => elementState.runtime.forwardNativeMaterialEvent(element, event),
    resourcePort: elementState.resourcePort,
    ...(elementState.datasetPort === undefined ? {} : { datasetPort: elementState.datasetPort }),
    ...(elementState.conditionalStylePort === undefined
      ? {}
      : { conditionalStylePort: elementState.conditionalStylePort }),
    // 设计态渲染器获得设计执行上下文（RB2）：design mode，不绑定项目。
    executionMode: 'design',
    ...(elementState.runtimeContributions === undefined
      ? {}
      : { contributionIndex: elementState.runtimeContributions }),
  });
  createGhostRenderer(elementState);
}

/**
 * 幽灵草案渲染器：同一份目录与端口，只读挂载到 `[data-canvas-ghost]`。
 *
 * 它与主渲染器完全隔离——草案的物料实例、数据请求和条件样式都不会影响画布上的
 * 真实文档；宿主丢弃草案时只需 `clear()`，不产生任何文档侧副作用。
 */
function createGhostRenderer(elementState: DesignerElementState): void {
  // 渲染器会把挂载根写成 `position: relative`，所以叠加层的定位放在外层，
  // 内层只作为渲染器根节点，避免两套定位互相覆盖。
  const ghost = elementState.canvas?.querySelector<HTMLDivElement>('[data-canvas-ghost-root]');
  if (ghost === null || ghost === undefined || elementState.catalog === undefined) return;
  elementState.ghostRenderer = createBaseScreenRenderer({
    root: ghost,
    catalog: elementState.catalog,
    mode: 'design',
    // 草案层不参与交互：原生事件关闭，也不会转发回宿主。
    interactive: false,
    onMaterialEvent: () => {},
    resourcePort: elementState.resourcePort,
    ...(elementState.datasetPort === undefined ? {} : { datasetPort: elementState.datasetPort }),
    ...(elementState.conditionalStylePort === undefined
      ? {}
      : { conditionalStylePort: elementState.conditionalStylePort }),
    executionMode: 'design',
    ...(elementState.runtimeContributions === undefined
      ? {}
      : { contributionIndex: elementState.runtimeContributions }),
  });
  const ghostHandlers = {
    render: (document: ScreenDocument) => elementState.ghostRenderer?.render(document).ok ?? false,
    clear: () => elementState.ghostRenderer?.clear(),
  };
  elementState.changeController.setGhostHandlers(ghostHandlers);
  elementState.sceneController.setGhostHandlers(ghostHandlers);
}

export function applyNativeEvents(element: DesignerElementHost, enabled: boolean): void {
  const elementState = getDesignerElementState(element);

  const renderer = elementState.renderer;
  if (renderer === undefined) return;
  const result = renderer.setInteractive(enabled);
  if (!result.ok) elementState.runtime.emitDiagnostics(element, result.diagnostics);
}

export function forwardNativeMaterialEvent(
  element: DesignerElementHost,
  event: BaseScreenMaterialEvent,
): void {
  getDesignerElementState(element).canvasRuntimeController.handleMaterialEvent(event);
  element.dispatchEvent(
    new CustomEvent<BaseScreenMaterialEvent>('base-screen-material-event', {
      bubbles: true,
      composed: true,
      detail: event,
    }),
  );
}

export function executeOperationFromTarget(element: DesignerElementHost, target: Element): boolean {
  const elementState = getDesignerElementState(element);

  const pluginControl = target.closest<HTMLButtonElement>('[data-plugin-command]');
  const pluginCommandId = pluginControl?.dataset.pluginCommand;
  if (pluginControl !== null && pluginCommandId !== undefined) {
    if (pluginControl.disabled) return true;
    elementState.menuController.closeContextMenu();
    elementState.menuController.closeMenus();
    elementState.runtime.executePluginCommand(element, pluginCommandId);
    return true;
  }

  const control = target.closest<HTMLButtonElement>('[data-action], [data-menu-action]');
  const id = control?.dataset.action ?? control?.dataset.menuAction;
  if (id === undefined || elementState.operations.get(id) === undefined) return false;
  elementState.menuController.closeContextMenu();
  elementState.menuController.closeMenus();
  return elementState.operations.execute(id, undefined);
}

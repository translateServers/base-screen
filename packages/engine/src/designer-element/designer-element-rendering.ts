import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { type BaseScreenMaterialEvent, createBaseScreenRenderer } from '@base-screen/renderer';
import { renderDesignerInteractionPanel } from '../browser/dom/designer-interaction-dom.js';
import { renderDesignerLeftPanelGroups } from '../browser/dom/designer-left-panel-groups-dom.js';
import { renderDesignerSelection } from '../browser/dom/designer-selection-dom.js';
import {
  createDesignerWorkspace,
  populateMaterialLibrary,
  renderMaterialLibraryState,
} from '../browser/dom/designer-workspace.js';
import { adoptDesignerStyleSheets, createDesignerStyle } from '../browser/styles/designer-style.js';
import {
  BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT,
  type BaseScreenMaterialLibraryAction,
  type BaseScreenMaterialLibraryActionEventDetail,
} from '../material-library-state.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

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
  elementState.errorConsoleController.connect(
    shadow.querySelector<HTMLElement>('[data-error-console]')!,
    shadow.querySelector<HTMLButtonElement>('[data-error-console-toggle]')!,
  );
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
    elementState.runtime.syncCanvasFrameSize(element, document);
    elementState.previewController.sync(document);
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
  elementState.runtime.renderProperties(element);
  elementState.runtime.renderInspectorInteraction(element);
  elementState.runtime.renderLayers(element);
  elementState.runtime.renderControls(element);
  elementState.integrationController.render();
  elementState.workbenchController.renderInspectorTabs();
}

export function renderLeftPanelGroups(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  const layout = element.shadowRoot?.querySelector<HTMLElement>('.designer');
  if (layout === null || layout === undefined) return;
  renderDesignerLeftPanelGroups(layout, elementState.leftPanelGroups);
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
    elementState.session.document,
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
    elementState.panelController.render(
      elementState.properties,
      elementState.datasetCatalogPort === undefined ? elementState.dataPanel : undefined,
    );
    if (elementState.datasetCatalogPort !== undefined)
      elementState.datasetController.render(elementState.dataPanel);
    elementState.assetController.render(elementState.properties);
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
    ...(elementState.conditionalStylePort === undefined
      ? {}
      : { conditionalStylePort: elementState.conditionalStylePort }),
    // 设计态渲染器获得设计执行上下文（RB2）：design mode，不绑定项目。
    executionMode: 'design',
    ...(elementState.runtimeContributions === undefined
      ? {}
      : { contributionIndex: elementState.runtimeContributions }),
  });
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

  const control = target.closest<HTMLButtonElement>('[data-action], [data-menu-action]');
  const id = control?.dataset.action ?? control?.dataset.menuAction;
  if (id === undefined || elementState.operations.get(id) === undefined) return false;
  elementState.menuController.closeContextMenu();
  elementState.menuController.closeMenus();
  return elementState.operations.execute(id, undefined);
}

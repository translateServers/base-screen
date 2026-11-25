import type {
  ScreenCanvas,
  ScreenComponentNode,
  ScreenDocument,
  ScreenPageCanvas,
  ScreenPopupCanvas,
  ScreenSubCanvas,
} from '@base-screen/contracts';

/**
 * 画板视图（ADR-0109 §2.5）：设计器一次只编辑一个画板——主画布或某个从画布（页面 / 弹框）。
 *
 * 会话持有完整文档；画布、命中、图层、检查器读的是「当前画板视图」：
 * - 画布尺寸与背景换成当前画板的：页面 = 主画布尺寸 + 页面背景（未设则透出主画布背景），
 *   弹框 = 面板尺寸与背景；
 * - 不属于当前画板的组件仍留在文档里（蓝图、变量、引用校验照常看得见它们），但在视图里
 *   被标成隐藏且锁定，画布不画、命中不到、命令改不动；
 * - 视图上执行的命令经 `mergeDesignerArtboard` 写回完整文档：当前画板的组件取视图版本，
 *   画板外组件一律取完整文档版本，新建的根组件归入当前画板。
 */
export interface DesignerArtboardView {
  readonly document: ScreenDocument;
  /** 视图里被隐藏锁定的画板外组件 id。 */
  readonly outside: ReadonlySet<string>;
}

/** `null` 是主画布；其余是从画布 id。 */
export type DesignerArtboardId = string | null;

export function readDesignerArtboardCanvas(
  document: ScreenDocument,
  artboard: DesignerArtboardId,
): ScreenSubCanvas | undefined {
  return artboard === null
    ? undefined
    : document.subCanvases?.find((canvas) => canvas.id === artboard);
}

const viewArtboards = new WeakMap<ScreenDocument, string>();

/**
 * 视图文档属于哪个画板：从画布视图返回其 id；主画布视图与完整文档返回 `null`。
 * 图层面板据此只列当前画板的组件（画板外组件在视图里只是被隐藏锁定，仍在数组里）。
 */
export function readDesignerArtboardOf(document: ScreenDocument): DesignerArtboardId {
  return viewArtboards.get(document) ?? null;
}

/** 归属任一弹框的组件 id（含子组件）：设计态弹框预览只渲染这些组件。 */
export function listDesignerPopupComponentIds(document: ScreenDocument): ReadonlySet<string> {
  const popups = new Set(
    (document.subCanvases ?? [])
      .filter((canvas) => canvas.display === 'popup')
      .map((canvas) => canvas.id),
  );
  const result = new Set<string>();
  for (const [componentId, canvasId] of componentArtboards(document.components)) {
    if (popups.has(canvasId)) result.add(componentId);
  }
  return result;
}

/** 某块画布上的组件 id（含子组件；`null` = 主画布）。 */
export function listDesignerCanvasComponentIds(
  document: ScreenDocument,
  artboard: DesignerArtboardId,
): ReadonlySet<string> {
  const owner = componentArtboards(document.components);
  const result = new Set<string>();
  for (const component of document.components) {
    if ((owner.get(component.id) ?? null) === artboard) result.add(component.id);
  }
  return result;
}

/** 该视图文档当前画板上的组件 id（按根组件的 `canvasId` 判定）。 */
export function listDesignerArtboardComponentIds(document: ScreenDocument): ReadonlySet<string> {
  return listDesignerCanvasComponentIds(document, readDesignerArtboardOf(document));
}

/** 组件 id → 所属从画布 id（沿父链找根组件的 `canvasId`；主画布组件不在表里）。 */
export function readDesignerComponentArtboards(document: ScreenDocument): Map<string, string> {
  return componentArtboards(document.components);
}

/**
 * 画板外组件的「隐藏且锁定」副本，按原组件引用缓存：原组件不变就复用同一个副本。
 * 渲染链路（文档解析的共享引用、候选校验缓存、挂载复用守卫）都按组件引用判定是否跳过，
 * 每次投影都新建副本会让全部画板外组件在切换画板、每次提交时整套重校验、重写 model。
 */
const hiddenCopies = new WeakMap<ScreenComponentNode, ScreenComponentNode>();

function hiddenCopyOf(component: ScreenComponentNode): ScreenComponentNode {
  if (component.status.hidden && component.status.locked) return component;
  let copy = hiddenCopies.get(component);
  if (copy === undefined) {
    copy = { ...component, status: { hidden: true, locked: true } };
    hiddenCopies.set(component, copy);
  }
  return copy;
}

export function projectDesignerArtboard(
  document: ScreenDocument,
  artboard: DesignerArtboardId,
): DesignerArtboardView {
  const subCanvas = readDesignerArtboardCanvas(document, artboard);
  const owner = componentArtboards(document.components);
  const outside = new Set<string>();
  const target = subCanvas?.id ?? null;
  for (const component of document.components) {
    if ((owner.get(component.id) ?? null) !== target) outside.add(component.id);
  }
  if (subCanvas === undefined && outside.size === 0) return { document, outside };
  const components = document.components.map((component) =>
    outside.has(component.id) ? hiddenCopyOf(component) : component,
  );
  const view: ScreenDocument = {
    ...document,
    canvas: subCanvas === undefined ? document.canvas : artboardCanvas(document.canvas, subCanvas),
    components,
  };
  if (subCanvas !== undefined) viewArtboards.set(view, subCanvas.id);
  return { document: view, outside };
}

/**
 * 视图 → 完整文档。`previous` 是投影出 `view` 之前的完整文档；结果仍需经文档校验。
 * 画板外组件在视图里的改动全部丢弃（它们不可见也不可选，改动只可能来自整体替换类命令）。
 */
export function mergeDesignerArtboard(
  previous: ScreenDocument,
  view: ScreenDocument,
  artboard: DesignerArtboardId,
  outside: ReadonlySet<string>,
): ScreenDocument {
  const subCanvas = readDesignerArtboardCanvas(view, artboard);
  const canvasId = subCanvas?.id;
  const previousById = new Map(previous.components.map((component) => [component.id, component]));
  const components = view.components.map((component) => {
    if (outside.has(component.id)) return previousById.get(component.id) ?? component;
    return assignArtboard(component, canvasId);
  });
  if (subCanvas === undefined) {
    return { ...view, canvas: view.canvas, components };
  }
  const projected = artboardCanvas(previous.canvas, subCanvas);
  const subCanvases = (view.subCanvases ?? []).map((candidate) =>
    candidate.id === subCanvas.id ? applyCanvas(candidate, view.canvas, projected) : candidate,
  );
  return { ...view, canvas: previous.canvas, components, subCanvases };
}

/**
 * 从画布在视图里扮演画布：页面 = 主画布尺寸 + 页面背景（未设则透出主画布背景）；
 * 弹框 = 面板宽高与背景。背景图只在主画布上可用。
 */
function artboardCanvas(main: ScreenCanvas, subCanvas: ScreenSubCanvas): ScreenCanvas {
  if (subCanvas.display === 'page') {
    if (subCanvas.backgroundColor === undefined && subCanvas.background === undefined) return main;
    return {
      width: main.width,
      height: main.height,
      backgroundColor: subCanvas.backgroundColor ?? main.backgroundColor,
      ...(subCanvas.background === undefined ? {} : { background: subCanvas.background }),
    };
  }
  return {
    width: subCanvas.width,
    height: subCanvas.height,
    backgroundColor: subCanvas.backgroundColor,
    ...(subCanvas.background === undefined ? {} : { background: subCanvas.background }),
  };
}

/**
 * 视图画布写回从画布。页面：尺寸恒随主画布（视图改不了），背景只有作者真的改了才写成页面
 * 自己的背景，免得「透出主画布」被悄悄固化。弹框：宽高与背景照写。
 */
function applyCanvas(
  subCanvas: ScreenSubCanvas,
  canvas: ScreenCanvas,
  projected: ScreenCanvas,
): ScreenSubCanvas {
  if (subCanvas.display === 'page') {
    const sameColor = canvas.backgroundColor === projected.backgroundColor;
    const sameBackground =
      JSON.stringify(canvas.background ?? null) === JSON.stringify(projected.background ?? null);
    if (sameColor && sameBackground) return subCanvas;
    const { backgroundColor: _color, background: _background, ...rest } = subCanvas;
    const page: ScreenPageCanvas = {
      ...rest,
      backgroundColor: canvas.backgroundColor,
      ...(canvas.background === undefined ? {} : { background: canvas.background }),
    };
    return page;
  }
  const { background: _background, ...rest } = subCanvas;
  const popup: ScreenPopupCanvas = {
    ...rest,
    width: canvas.width,
    height: canvas.height,
    backgroundColor: canvas.backgroundColor,
    ...(canvas.background === undefined ? {} : { background: canvas.background }),
  };
  return popup;
}

/** 根组件写上当前画板的 `canvasId`（主画布则去掉）；子组件不带 `canvasId`。 */
function assignArtboard(
  component: ScreenComponentNode,
  canvasId: string | undefined,
): ScreenComponentNode {
  const wanted = component.parentId === null ? canvasId : undefined;
  if (component.canvasId === wanted && (wanted === undefined || !component.belowSubCanvas)) {
    return component;
  }
  const { canvasId: _canvasId, belowSubCanvas, ...rest } = component;
  if (wanted === undefined) {
    return belowSubCanvas === true && component.parentId === null
      ? { ...rest, belowSubCanvas }
      : rest;
  }
  return { ...rest, canvasId: wanted };
}

function componentArtboards(components: readonly ScreenComponentNode[]): Map<string, string> {
  const byId = new Map(components.map((component) => [component.id, component]));
  const result = new Map<string, string>();
  for (const component of components) {
    let current = component;
    const seen = new Set<string>();
    while (current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (parent === undefined) break;
      current = parent;
    }
    if (current.parentId === null && current.canvasId !== undefined) {
      result.set(component.id, current.canvasId);
    }
  }
  return result;
}

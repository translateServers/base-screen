export interface DesignerSurfaceHandler {
  (target: EventTarget | null, event: Event): boolean;
}

// 设计器 shadow 表面的事件绑定表：由组合根（元素）按控制器声明路由链，
// 路由器只负责挂载监听并沿链分发，直到某个处理器声明已处理。
export interface DesignerSurfaceBindings {
  readonly click: readonly DesignerSurfaceHandler[];
  readonly contextMenu: DesignerSurfaceHandler;
  readonly change: readonly DesignerSurfaceHandler[];
  readonly input: readonly DesignerSurfaceHandler[];
  readonly dragStart: readonly DesignerSurfaceHandler[];
  readonly dragOver: DesignerSurfaceHandler;
  readonly drop: DesignerSurfaceHandler;
  readonly dragEnd: DesignerSurfaceHandler;
  readonly pointerDown: DesignerSurfaceHandler;
  readonly pointerMove: DesignerSurfaceHandler;
  readonly pointerUp: DesignerSurfaceHandler;
  readonly pointerCancel: DesignerSurfaceHandler;
  readonly mouseOver: DesignerSurfaceHandler;
  readonly mouseOut: DesignerSurfaceHandler;
  readonly doubleClick: DesignerSurfaceHandler;
  readonly focusOut: DesignerSurfaceHandler;
  // 剪贴板事件通道：非可编辑目标路由到应用剪贴板操作（右键/上下文菜单/系统组合的旁路）。
  readonly copy: DesignerSurfaceHandler;
  readonly cut: DesignerSurfaceHandler;
  readonly paste: DesignerSurfaceHandler;
  // 手势激活期的全 shadow 禁选（画布常禁选由手势控制器负责）。
  readonly selectStart: DesignerSurfaceHandler;
  // Safari 触控板双指手势（gesturestart/gesturechange，与 ctrl+wheel 等价）。
  readonly gesture: DesignerSurfaceHandler;
  // capture 阶段键盘通道：黑名单与手势抑制在事件进入 shadow 的 capture 首站裁决，
  // 早于目标节点与所有 bubble 绑定，避免浏览器默认行为与散落监听竞争。
  readonly keyDownCapture: DesignerSurfaceHandler;
  readonly keyUpCapture: DesignerSurfaceHandler;
  readonly keyDown: readonly DesignerSurfaceHandler[];
  readonly keyUp: DesignerSurfaceHandler;
}

// shadowRoot 级事件路由：把设计器表面（菜单、工具、操作、图层、画布、键盘）
// 的监听挂载与顺序分发集中到一处，避免组合根内散落 addEventListener。
export class DesignerSurfaceRouter {
  #root: ShadowRoot | undefined;
  #connected = false;
  #removers: Array<() => void> = [];

  connect(root: ShadowRoot, bindings: DesignerSurfaceBindings): void {
    if (this.#connected) return;
    this.#connected = true;
    this.#root = root;
    const add = (type: string, listener: EventListener, options?: AddEventListenerOptions) => {
      root.addEventListener(type, listener, options);
      this.#removers.push(() => root.removeEventListener(type, listener, options));
    };
    add('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      this.#dispatch(target, event, bindings.click);
    });
    add('contextmenu', (event) => {
      if (event.target instanceof Element) bindings.contextMenu(event.target, event);
    });
    add('change', (event) => this.#dispatch(event.target, event, bindings.change));
    add('input', (event) => this.#dispatch(event.target, event, bindings.input));
    add('dragstart', (event) => this.#dispatch(event.target, event, bindings.dragStart));
    add('dragover', (event) => bindings.dragOver(event.target, event));
    add('drop', (event) => bindings.drop(event.target, event));
    add('dragend', (event) => bindings.dragEnd(event.target, event));
    add('pointerdown', (event) => bindings.pointerDown(event.target, event));
    add('pointermove', (event) => bindings.pointerMove(event.target, event));
    add('pointerup', (event) => bindings.pointerUp(event.target, event));
    add('pointercancel', (event) => bindings.pointerCancel(event.target, event));
    add('mouseover', (event) => bindings.mouseOver(event.target, event));
    add('mouseout', (event) => bindings.mouseOut(event.target, event));
    add('lostpointercapture', (event) => bindings.pointerCancel(event.target, event));
    add('dblclick', (event) => bindings.doubleClick(event.target, event));
    add('focusout', (event) => bindings.focusOut(event.target, event));
    add('copy', (event) => {
      if (event.target instanceof Element) bindings.copy(event.target, event);
    });
    add('cut', (event) => {
      if (event.target instanceof Element) bindings.cut(event.target, event);
    });
    add('paste', (event) => {
      if (event.target instanceof Element) bindings.paste(event.target, event);
    });
    add('selectstart', (event) => {
      if (event.target instanceof Element) bindings.selectStart(event.target, event);
    });
    add('gesturestart', (event) => {
      if (event.target instanceof Element) bindings.gesture(event.target, event);
    });
    add('gesturechange', (event) => {
      if (event.target instanceof Element) bindings.gesture(event.target, event);
    });
    add(
      'keydown',
      (event) => {
        if (event.target instanceof Element) bindings.keyDownCapture(event.target, event);
      },
      { capture: true },
    );
    add(
      'keyup',
      (event) => {
        if (event.target instanceof Element) bindings.keyUpCapture(event.target, event);
      },
      { capture: true },
    );
    add('keydown', (event) => this.#dispatch(event.target, event, bindings.keyDown));
    add('keyup', (event) => bindings.keyUp(event.target, event));
  }

  /** 成对移除 connect 挂载的全部监听；重连时以同一 bindings 重新 connect 即可。 */
  disconnect(): void {
    for (const remove of this.#removers) remove();
    this.#removers = [];
    this.#root = undefined;
    this.#connected = false;
  }

  #dispatch(
    target: EventTarget | null,
    event: Event,
    handlers: readonly DesignerSurfaceHandler[],
  ): void {
    for (const handler of handlers) {
      if (handler(target, event)) return;
    }
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function isInspectorDraftTarget(target: EventTarget | null): boolean {
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  return (
    dataset !== undefined &&
    (dataset.property !== undefined ||
      dataset.prop !== undefined ||
      dataset.style !== undefined ||
      dataset.canvasProperty !== undefined ||
      dataset.canvasSetting !== undefined ||
      dataset.dataSourceType !== undefined ||
      dataset.dataSourceField !== undefined ||
      dataset.descriptorFieldId !== undefined)
  );
}

export function getInspectorDraftTarget(event: KeyboardEvent): EventTarget | undefined {
  return event.composedPath().find((target) => isInspectorDraftTarget(target));
}

export function isTextAreaDraft(target: EventTarget | null): boolean {
  return (target as { readonly tagName?: string } | null)?.tagName === 'TEXTAREA';
}

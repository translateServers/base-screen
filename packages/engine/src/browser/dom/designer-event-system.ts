import {
  type DesignerKeyboardPolicy,
  type DesignerOperationChordInfo,
  resolveDesignerKeyboardPolicy,
} from '../../common/events/designer-event-policy.js';
import { isEditableTarget } from './designer-surface-router.js';

export interface DesignerEventSystemCallbacks {
  readonly isGestureActive: () => boolean;
  readonly findOperation: (chord: string) => DesignerOperationChordInfo | undefined;
  /** window blur 时的统一状态复位（手势/空格/菜单/面板 resize/参考线拖拽）。 */
  readonly onWindowBlur?: () => void;
}

// 键盘通道与 window 守卫的浏览器侧封装：把 common/events 的三态裁决适配到真实事件，
// 供组合根挂在 shadow capture/bubble 绑定与元素生命周期上。本类只做形状适配、
// 上下文注入与监听生命周期，全部裁决逻辑在 common/events（环境无关、单元可测）。
export class DesignerEventSystem {
  #ownerWindow: Window | undefined;
  #root: ShadowRoot | undefined;
  #ownDragInFlight = false;
  readonly #windowListeners = new Map<string, (event: Event) => void>();

  constructor(private readonly callbacks: DesignerEventSystemCallbacks) {}

  resolve(event: KeyboardEvent): DesignerKeyboardPolicy {
    return resolveDesignerKeyboardPolicy(
      {
        altGraph: altGraphState(event),
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.isComposing,
        key: event.key,
        metaKey: event.metaKey,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
      },
      {
        editable: isEditableTarget(event.target),
        gestureActive: this.callbacks.isGestureActive(),
      },
      this.callbacks.findOperation,
    );
  }

  /** capture 阶段黑名单全吞：阻止默认 + 阻断 shadow 内后续分发。 */
  swallow(event: KeyboardEvent): boolean {
    const policy = this.resolve(event);
    if (policy.kind !== 'block') return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  /** 记录"本设计器发起的拖拽"（shadow 内 dragstart 时调用），供 window DnD 防线识别。 */
  markDragStart(): void {
    this.#ownDragInFlight = true;
  }

  /**
   * 注册 window 级守卫，与元素生命周期同生共死：
   * - DnD 防线：仅拦截本设计器发起的拖拽（防拖出触发页面导航）或落点在本设计器表面的事件
   *   （如文件拖入不默认打开）；宿主自身拖拽与其他页面区域零干预。
   * - blur 复位：窗口失焦时统一复位设计器内部状态，不触达宿主。
   */
  connectWindowGuards(ownerWindow: Window, root: ShadowRoot): void {
    if (this.#ownerWindow !== undefined) return;
    this.#ownerWindow = ownerWindow;
    this.#root = root;
    const onDrag = (event: Event) => {
      const dragEvent = event as DragEvent;
      const overOwnSurface = dragEvent.composedPath().includes(root);
      if (!this.#ownDragInFlight && !overOwnSurface) return;
      dragEvent.preventDefault();
      if (dragEvent.type === 'drop') this.#ownDragInFlight = false;
    };
    this.#windowListeners.set('dragover', onDrag);
    this.#windowListeners.set('drop', onDrag);
    this.#windowListeners.set('dragend', () => {
      this.#ownDragInFlight = false;
    });
    this.#windowListeners.set('blur', () => this.callbacks.onWindowBlur?.());
    for (const [type, listener] of this.#windowListeners) {
      ownerWindow.addEventListener(type, listener);
    }
  }

  /** 对称注销全部 window 监听；多实例各自持有引用，无泄漏。 */
  disconnectWindowGuards(): void {
    const view = this.#ownerWindow;
    if (view === undefined) return;
    for (const [type, listener] of this.#windowListeners) {
      view.removeEventListener(type, listener);
    }
    this.#windowListeners.clear();
    this.#ownDragInFlight = false;
    this.#ownerWindow = undefined;
    this.#root = undefined;
  }
}

function altGraphState(event: KeyboardEvent): boolean {
  return typeof event.getModifierState === 'function' ? event.getModifierState('AltGraph') : false;
}

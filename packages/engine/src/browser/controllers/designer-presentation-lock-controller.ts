import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { adoptDesignerFormControls } from '../dom/designer-form-controls-dom.js';
import { escapeHtml } from '../dom/designer-html-escape.js';

export interface DesignerPresentationLockCallbacks {
  /** 进入前的前置条件：有待决草案时不允许进入。 */
  readonly canEnter: () => boolean;
  readonly notifyBlocked: () => void;
  /** 外壳收起/恢复后重算画布适配：锁定改变的是布局，不是文档。 */
  readonly refit: () => void;
}

/**
 * 演示锁：投屏时只留画布。
 *
 * 进入要求没有待决草案（否则会被锁在未写入的草案里）；退出必须二次确认，
 * 键盘（Esc）与按钮走同一条确认路径。锁定只是根节点上的一个状态属性，
 * 不修改文档、不进历史。
 */
export class DesignerPresentationLockController {
  #root: HTMLElement | undefined;
  #hint: HTMLElement | undefined;
  #callbacks: DesignerPresentationLockCallbacks | undefined;
  #locked = false;
  #confirmExit = false;

  connect(
    root: HTMLElement,
    hint: HTMLElement,
    callbacks: DesignerPresentationLockCallbacks,
  ): void {
    this.#root = root;
    this.#hint = hint;
    this.#callbacks = callbacks;
    this.render();
  }

  release(): void {
    this.#root?.removeAttribute('data-presentation-locked');
    this.#root = undefined;
    this.#hint = undefined;
    this.#callbacks = undefined;
    this.#locked = false;
    this.#confirmExit = false;
  }

  get locked(): boolean {
    return this.#locked;
  }

  enter(): boolean {
    if (this.#locked) return true;
    if (this.#callbacks?.canEnter() === false) {
      this.#callbacks.notifyBlocked();
      return false;
    }
    this.#locked = true;
    this.#confirmExit = false;
    this.render();
    this.refit();
    return true;
  }

  /** 第一步：进入确认态，不退出。 */
  requestExit(): void {
    if (!this.#locked || this.#confirmExit) return;
    this.#confirmExit = true;
    this.render();
    // 重渲染会替换提示内的按钮：不还焦点的话，第二次 Esc 会掉到 body 而收不到。
    this.#hint?.querySelector<HTMLButtonElement>('[data-presentation-lock-action="exit"]')?.focus();
  }

  cancelExit(): void {
    if (!this.#confirmExit) return;
    this.#confirmExit = false;
    this.render();
    this.#hint
      ?.querySelector<HTMLButtonElement>('[data-presentation-lock-action="request-exit"]')
      ?.focus();
  }

  /** 第二步：真正退出。 */
  exit(): void {
    if (!this.#locked) return;
    this.#locked = false;
    this.#confirmExit = false;
    this.render();
    this.refit();
  }

  /** 布局切换后适配一次，并在下一帧再适配一次（网格轨道在首帧内可能尚未稳定）。 */
  private refit(): void {
    this.#callbacks?.refit();
    requestAnimationFrame(() => this.#callbacks?.refit());
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-presentation-lock-toggle]') !== null) {
      this.enter();
      return true;
    }
    const action = target.closest<HTMLElement>('[data-presentation-lock-action]');
    if (action !== null) {
      switch (action.dataset.presentationLockAction) {
        case 'request-exit':
          this.requestExit();
          return true;
        case 'cancel-exit':
          this.cancelExit();
          return true;
        case 'exit':
          this.exit();
          return true;
        default:
          break;
      }
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (!this.#locked || event.key !== 'Escape') return false;
    event.preventDefault();
    if (this.#confirmExit) this.exit();
    else this.requestExit();
    return true;
  }

  private render(): void {
    const root = this.#root;
    const hint = this.#hint;
    if (root !== undefined) {
      if (this.#locked) root.dataset.presentationLocked = 'true';
      else root.removeAttribute('data-presentation-locked');
    }
    if (hint === undefined) return;
    hint.hidden = !this.#locked;
    if (!this.#locked) return;
    const text = DESIGNER_UI_TEXT.presentationLock;
    hint.innerHTML = this.#confirmExit
      ? `<span class="presentation-hint-text">${text.confirmHint}</span>
         <button type="button" class="designer-control designer-button" data-presentation-lock-action="cancel-exit">${text.cancelExit}</button>
         <button type="button" class="designer-control designer-button" data-variant="danger" data-presentation-lock-action="exit">${text.confirmExit}</button>`
      : `<span class="presentation-hint-text">${escapeHtml(text.hint)}</span>
         <button type="button" class="designer-control designer-button" data-presentation-lock-action="request-exit">${text.exit}</button>`;
    adoptDesignerFormControls(hint);
  }
}

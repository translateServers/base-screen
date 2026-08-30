import type { ScreenParseResult } from '@base-screen/contracts';
import type { ScreenProjectPhase } from '../../../common/project/project-controller.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export interface DesignerProjectFeedbackCallbacks {
  readonly continueEditing: () => ScreenParseResult<void>;
  readonly isDirty: () => boolean;
  readonly reloadRemote: (discardChanges: boolean) => Promise<ScreenParseResult<unknown>>;
  readonly report: (result: ScreenParseResult<unknown>) => void;
}

export class DesignerProjectFeedbackController {
  #conflict: HTMLElement | undefined;
  #reloadConfirmationPending = false;

  constructor(private readonly callbacks: DesignerProjectFeedbackCallbacks) {}

  connect(conflict: HTMLElement): void {
    this.#conflict = conflict;
  }

  render(phase: ScreenProjectPhase): void {
    if (this.#conflict !== undefined) this.#conflict.hidden = phase !== 'conflict';
    if (phase !== 'conflict' || !this.#reloadConfirmationPending) this.resetConfirmation();
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'continue-editing') {
      this.callbacks.report(this.callbacks.continueEditing());
      return true;
    }
    if (action !== 'reload-remote') return false;
    if (this.callbacks.isDirty() && !this.#reloadConfirmationPending) {
      this.#reloadConfirmationPending = true;
      const message = this.#conflict?.querySelector('p');
      const control = this.#conflict?.querySelector<HTMLButtonElement>(
        '[data-action="reload-remote"]',
      );
      if (message !== null && message !== undefined) {
        message.textContent = DESIGNER_UI_TEXT.discardWarning;
      }
      if (control !== null && control !== undefined) {
        control.textContent = DESIGNER_UI_TEXT.discardAndReload;
      }
      return true;
    }
    void this.callbacks.reloadRemote(this.#reloadConfirmationPending).then((result) => {
      this.callbacks.report(result);
    });
    return true;
  }

  clear(): void {
    this.#reloadConfirmationPending = false;
    this.resetConfirmation();
  }

  /** 释放冲突面板引用（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。 */
  release(): void {
    this.#conflict = undefined;
  }

  private resetConfirmation(): void {
    const message = this.#conflict?.querySelector('p');
    const control = this.#conflict?.querySelector<HTMLButtonElement>(
      '[data-action="reload-remote"]',
    );
    if (message !== null && message !== undefined) message.textContent = DESIGNER_UI_TEXT.conflict;
    if (control !== null && control !== undefined)
      control.textContent = DESIGNER_UI_TEXT.reloadRemote;
  }
}

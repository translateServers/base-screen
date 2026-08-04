import type { ScreenParseResult } from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from './designer-ui-text.js';
import type { ScreenProjectPhase } from './project-controller.js';

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

  onClick(target: HTMLElement): boolean {
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

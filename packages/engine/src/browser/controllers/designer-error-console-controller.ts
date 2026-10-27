import type {
  BaseScreenMaterialLibraryAction,
  BaseScreenMaterialLibraryState,
} from '../../common/operations/material-library/material-library-state.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { createDesignerButton } from '../dom/designer-ui-primitives.js';
import { materialLibraryActions } from '../dom/material-library/designer-material-library-dom.js';

const MAX_ERROR_ENTRIES = 50;

type ErrorConsoleTone = 'error' | 'warning';

interface ErrorConsoleEntry {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly count: number;
  readonly tone: ErrorConsoleTone;
}

export class DesignerErrorConsoleController {
  #dialog: HTMLElement | undefined;
  #trigger: HTMLButtonElement | undefined;
  #currentState: BaseScreenMaterialLibraryState | undefined;
  #entries: readonly ErrorConsoleEntry[] = [];
  #lastErrorKey: string | undefined;
  #nextEntryId = 1;
  #open = false;

  connect(dialog: HTMLElement, trigger: HTMLButtonElement): void {
    this.#dialog = dialog;
    this.#trigger = trigger;
    this.render();
  }

  clear(): void {
    this.#currentState = undefined;
    this.#entries = [];
    this.#lastErrorKey = undefined;
    this.#open = false;
    this.render();
  }

  /** 释放对话框/触发器引用（元素 disconnect 时由宿主调用；重连时 connect 重新注入）。 */
  release(): void {
    this.#dialog = undefined;
    this.#trigger = undefined;
  }

  recordMaterialLibraryState(state: BaseScreenMaterialLibraryState | undefined): void {
    this.#currentState = state;
    const entry = errorEntryFor(state, this.#nextEntryId);
    if (entry === undefined) {
      this.#lastErrorKey = undefined;
      this.render();
      return;
    }

    const key = errorKeyFor(state)!;
    if (key !== this.#lastErrorKey) {
      this.#lastErrorKey = key;
      this.#nextEntryId++;
      this.#entries = [...this.#entries, entry].slice(-MAX_ERROR_ENTRIES);
    }
    this.render();
  }

  onClick(target: Element): boolean {
    if (target.closest<HTMLButtonElement>('[data-error-console-toggle]') !== null) {
      this.#open = !this.#open;
      this.render();
      if (this.#open) {
        this.#dialog?.querySelector<HTMLButtonElement>('[data-error-console-close]')?.focus();
      }
      return true;
    }
    if (target.closest<HTMLButtonElement>('[data-error-console-clear]') !== null) {
      this.#entries = [];
      this.#lastErrorKey = errorKeyFor(this.#currentState);
      this.render();
      return true;
    }
    if (target.closest<HTMLButtonElement>('[data-error-console-close]') !== null) {
      this.close();
      return true;
    }
    const overlay = target.closest<HTMLElement>('[data-error-console]');
    if (overlay !== null && target === overlay) {
      this.close();
      return true;
    }
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (!this.#open) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return true;
    }
    return event.key === 'Tab' ? this.moveFocus(event) : false;
  }

  private close(): void {
    this.#open = false;
    this.render();
    this.#trigger?.focus();
  }

  private render(): void {
    const dialog = this.#dialog;
    const trigger = this.#trigger;
    if (dialog === undefined || trigger === undefined) return;

    const count = Math.max(totalErrorCount(this.#entries), currentErrorCount(this.#currentState));
    const countElement = trigger.querySelector<HTMLElement>('[data-error-console-count]');
    if (countElement !== null) {
      countElement.toggleAttribute('data-has-value', count > 0);
      countElement.textContent = count === 0 ? '' : count > 999 ? '999+' : String(count);
    }
    const warning = count === 0 && isWarningState(this.#currentState);
    trigger.toggleAttribute('data-has-errors', count > 0);
    trigger.toggleAttribute('data-has-warning', warning);
    trigger.ariaExpanded = String(this.#open);
    trigger.ariaLabel =
      count > 0
        ? `${DESIGNER_UI_TEXT.errorConsole.openAria}，${DESIGNER_UI_TEXT.errorConsole.count(count)}`
        : warning
          ? `${DESIGNER_UI_TEXT.errorConsole.openAria}，${DESIGNER_UI_TEXT.errorConsole.attention}`
          : DESIGNER_UI_TEXT.errorConsole.openAria;
    dialog.hidden = !this.#open;

    const clear = dialog.querySelector<HTMLButtonElement>('[data-error-console-clear]');
    if (clear !== null) clear.disabled = this.#entries.length === 0;
    const summary = dialog.querySelector<HTMLElement>('[data-error-console-summary]');
    if (summary !== null) {
      summary.dataset.errorConsoleTone = count > 0 ? 'error' : warning ? 'warning' : 'empty';
      summary.textContent =
        count > 0
          ? DESIGNER_UI_TEXT.errorConsole.count(count)
          : warning
            ? DESIGNER_UI_TEXT.errorConsole.attention
            : '';
    }
    const historySummary = dialog.querySelector<HTMLElement>(
      '[data-error-console-history-summary]',
    );
    if (historySummary !== null) {
      historySummary.textContent = DESIGNER_UI_TEXT.errorConsole.historyCount(this.#entries.length);
    }
    this.renderCurrentState(dialog);
    this.renderEntries(dialog);
  }

  private renderCurrentState(dialog: HTMLElement): void {
    const surface = dialog.querySelector<HTMLElement>('[data-material-library-status]');
    if (surface === null) return;
    surface.replaceChildren();
    surface.hidden = !isActionableState(this.#currentState);
    surface.removeAttribute('data-status');
    surface.removeAttribute('role');
    surface.removeAttribute('aria-live');
    const state = this.#currentState;
    if (state === undefined || !isActionableState(state)) return;

    surface.dataset.status = state.status;
    const error = isErrorState(state);
    surface.setAttribute('role', error ? 'alert' : 'status');
    surface.setAttribute('aria-live', error ? 'assertive' : 'polite');
    const sectionTitle = surface.ownerDocument.createElement('h3');
    sectionTitle.className = 'designer-panel-section-title';
    sectionTitle.textContent = DESIGNER_UI_TEXT.errorConsole.currentStatus;
    const copy = surface.ownerDocument.createElement('div');
    copy.className = 'material-library-status-copy';
    const title = surface.ownerDocument.createElement('strong');
    title.textContent = DESIGNER_UI_TEXT.materialLibrary.statuses[state.status];
    const description = surface.ownerDocument.createElement('span');
    description.textContent = materialLibraryDescription(state);
    copy.append(title, description);
    surface.append(sectionTitle, copy);

    const actions = materialLibraryActions(state.status);
    if (actions.length === 0) return;
    const controls = surface.ownerDocument.createElement('div');
    controls.className = 'material-library-status-actions';
    for (const action of actions) {
      controls.appendChild(createMaterialLibraryAction(surface.ownerDocument, action));
    }
    surface.appendChild(controls);
  }

  private renderEntries(dialog: HTMLElement): void {
    const list = dialog.querySelector<HTMLElement>('[data-error-console-list]');
    if (list === null) return;
    list.dataset.errorConsoleOrder = 'newest-first';
    list.replaceChildren();
    if (this.#entries.length === 0) {
      const empty = list.ownerDocument.createElement('p');
      empty.className = 'designer-empty-state';
      empty.textContent = isActionableState(this.#currentState)
        ? DESIGNER_UI_TEXT.errorConsole.emptyWithCurrent
        : DESIGNER_UI_TEXT.errorConsole.empty;
      list.appendChild(empty);
      return;
    }

    for (let index = this.#entries.length - 1; index >= 0; index--) {
      const entry = this.#entries[index]!;
      const item = list.ownerDocument.createElement('article');
      item.className = 'error-console-entry';
      item.dataset.errorConsoleTone = entry.tone;
      item.dataset.errorConsoleEntry = String(entry.id);
      item.setAttribute('role', 'alert');
      const copy = list.ownerDocument.createElement('div');
      copy.className = 'error-console-entry-copy';
      const heading = list.ownerDocument.createElement('div');
      heading.className = 'error-console-entry-heading';
      const title = list.ownerDocument.createElement('strong');
      title.textContent = entry.title;
      const record = list.ownerDocument.createElement('small');
      record.textContent = DESIGNER_UI_TEXT.errorConsole.recordNumber(entry.id);
      const description = list.ownerDocument.createElement('span');
      description.textContent = entry.description;
      heading.append(title, record);
      copy.append(heading, description);
      item.appendChild(copy);
      list.appendChild(item);
    }
  }

  private moveFocus(event: KeyboardEvent): boolean {
    const dialog = this.#dialog;
    if (dialog === undefined) return false;
    const clear = dialog.querySelector<HTMLButtonElement>('[data-error-console-clear]');
    const close = dialog.querySelector<HTMLButtonElement>('[data-error-console-close]');
    const actions = [
      ...dialog.querySelectorAll<HTMLButtonElement>('[data-material-library-action]'),
    ];
    const controls = [clear, close, ...actions].filter(
      (control): control is HTMLButtonElement => control !== null && !control.disabled,
    );
    if (controls.length === 0) return false;
    const current = controls.findIndex((control) => control === event.target);
    const nextIndex =
      current < 0
        ? event.shiftKey
          ? controls.length - 1
          : 0
        : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    event.preventDefault();
    controls[nextIndex]?.focus();
    return true;
  }
}

function errorEntryFor(
  state: BaseScreenMaterialLibraryState | undefined,
  id: number,
): ErrorConsoleEntry | undefined {
  if (state === undefined || !isErrorState(state)) return undefined;
  return {
    id,
    tone: 'error',
    count: materialErrorCount(state),
    title: DESIGNER_UI_TEXT.materialLibrary.statuses[state.status],
    description: materialLibraryDescription(state),
  };
}

function materialLibraryDescription(state: BaseScreenMaterialLibraryState): string {
  return state.failedCount !== undefined && state.failedCount > 0
    ? DESIGNER_UI_TEXT.materialLibrary.failedCount(state.failedCount)
    : DESIGNER_UI_TEXT.materialLibrary.descriptions[state.status];
}

function createMaterialLibraryAction(
  ownerDocument: Document,
  action: BaseScreenMaterialLibraryAction,
): HTMLButtonElement {
  const button = createDesignerButton(ownerDocument, {
    text: DESIGNER_UI_TEXT.materialLibrary.actions[action],
  });
  button.dataset.materialLibraryAction = action;
  return button;
}

function currentErrorCount(state: BaseScreenMaterialLibraryState | undefined): number {
  return state === undefined || !isErrorState(state) ? 0 : materialErrorCount(state);
}

function totalErrorCount(entries: readonly ErrorConsoleEntry[]): number {
  return entries.reduce((total, entry) => total + entry.count, 0);
}

function materialErrorCount(state: BaseScreenMaterialLibraryState): number {
  return Math.max(1, state.failedCount ?? 1);
}

function isActionableState(
  state: BaseScreenMaterialLibraryState | undefined,
): state is BaseScreenMaterialLibraryState {
  return (
    state?.status === 'offline' ||
    state?.status === 'partial' ||
    state?.status === 'error' ||
    state?.status === 'update-available'
  );
}

function isErrorState(
  state: BaseScreenMaterialLibraryState | undefined,
): state is BaseScreenMaterialLibraryState {
  return state?.status === 'partial' || state?.status === 'error';
}

function isWarningState(state: BaseScreenMaterialLibraryState | undefined): boolean {
  return state?.status === 'offline' || state?.status === 'update-available';
}

function errorKeyFor(state: BaseScreenMaterialLibraryState | undefined): string | undefined {
  return isErrorState(state) ? `${state.status}:${state.failedCount ?? ''}` : undefined;
}

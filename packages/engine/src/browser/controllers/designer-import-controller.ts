import {
  parseScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';

export interface DesignerImportCallbacks {
  readonly replaceDocument: (document: ScreenDocument) => ScreenParseResult<ScreenDocument>;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
  readonly notify: (message: string) => void;
}

type DesignerImportView =
  | { readonly kind: 'confirm'; readonly document: ScreenDocument }
  | { readonly kind: 'error'; readonly diagnostics: readonly ScreenDiagnostic[] };

export class DesignerImportController {
  #dialog: HTMLElement | undefined;
  #title: HTMLElement | undefined;
  #body: HTMLElement | undefined;
  #generation = 0;
  #view: DesignerImportView | undefined;

  constructor(private readonly callbacks: DesignerImportCallbacks) {}

  connect(dialog: HTMLElement): void {
    this.#dialog = dialog;
    this.#title = dialog.querySelector<HTMLElement>('[data-import-title]') ?? undefined;
    this.#body = dialog.querySelector<HTMLElement>('[data-import-body]') ?? undefined;
    this.render();
  }

  request(file: File): void {
    const generation = ++this.#generation;
    void file
      .text()
      .then((contents) => JSON.parse(contents) as unknown)
      .then((document) => parseScreenDocument(document))
      .then((parsed) => {
        if (generation !== this.#generation) return;
        if (!parsed.ok) {
          this.#view = { kind: 'error', diagnostics: parsed.diagnostics };
          this.callbacks.report(parsed.diagnostics);
          this.render();
          return;
        }
        this.#view = { kind: 'confirm', document: parsed.value };
        this.render();
      })
      .catch(() => {
        if (generation !== this.#generation) return;
        const diagnostics = [invalidImportDiagnostic()];
        this.#view = { kind: 'error', diagnostics };
        this.callbacks.report(diagnostics);
        this.render();
      });
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'import-cancel' || action === 'import-close') {
      this.clear();
      return true;
    }
    const view = this.#view;
    if (action !== 'import-confirm' || view?.kind !== 'confirm') return false;
    const result = this.callbacks.replaceDocument(view.document);
    if (!result.ok) this.callbacks.report(result.diagnostics);
    if (result.ok) {
      this.callbacks.notify(DESIGNER_UI_TEXT.imported);
      this.clear();
    }
    return true;
  }

  clear(): void {
    this.#generation++;
    this.#view = undefined;
    this.render();
  }

  /** 释放对话框引用并丢弃待确认导入（元素 disconnect 时由宿主调用；重连时重新注入）。 */
  release(): void {
    this.clear();
    this.#dialog = undefined;
    this.#title = undefined;
    this.#body = undefined;
  }

  private render(): void {
    const dialog = this.#dialog;
    if (dialog === undefined) return;
    const view = this.#view;
    dialog.hidden = view === undefined;
    dialog.ariaLabel =
      view?.kind === 'error' ? DESIGNER_UI_TEXT.importFailed : DESIGNER_UI_TEXT.importConfirm;
    if (this.#title !== undefined) {
      this.#title.textContent =
        view?.kind === 'error' ? DESIGNER_UI_TEXT.importFailed : DESIGNER_UI_TEXT.importReplace;
    }
    if (this.#body === undefined) return;
    if (view === undefined) {
      this.#body.replaceChildren();
      return;
    }
    const ownerDocument = this.#body.ownerDocument;
    if (view.kind === 'error') {
      this.#body.replaceChildren(...this.renderDiagnostics(ownerDocument, view.diagnostics));
      return;
    }
    const warning = ownerDocument.createElement('p');
    warning.textContent = DESIGNER_UI_TEXT.importWarning;
    const actions = ownerDocument.createElement('div');
    actions.className = 'designer-dialog-actions';
    actions.append(
      this.createActionButton(ownerDocument, 'import-cancel', 'neutral', DESIGNER_UI_TEXT.cancel),
      this.createActionButton(
        ownerDocument,
        'import-confirm',
        'danger',
        DESIGNER_UI_TEXT.importConfirm,
      ),
    );
    this.#body.replaceChildren(warning, actions);
  }

  private renderDiagnostics(
    ownerDocument: Document,
    diagnostics: readonly ScreenDiagnostic[],
  ): HTMLElement[] {
    const list = ownerDocument.createElement('ul');
    list.className = 'import-diagnostics';
    list.setAttribute('role', 'list');
    for (const diagnostic of diagnostics) {
      const item = ownerDocument.createElement('li');
      item.className = 'import-diagnostic';
      const code = ownerDocument.createElement('span');
      code.className = 'import-diagnostic-code';
      code.textContent = diagnostic.code;
      const message = ownerDocument.createElement('span');
      message.className = 'import-diagnostic-message';
      message.textContent = diagnostic.message;
      item.append(code, message);
      if (diagnostic.path.length > 0) {
        const path = ownerDocument.createElement('code');
        path.className = 'import-diagnostic-path';
        path.textContent = diagnostic.path.join('.');
        item.append(path);
      }
      list.append(item);
    }
    const actions = ownerDocument.createElement('div');
    actions.className = 'designer-dialog-actions';
    actions.append(
      this.createActionButton(
        ownerDocument,
        'import-close',
        'neutral',
        DESIGNER_UI_TEXT.importClose,
      ),
    );
    return [list, actions];
  }

  private createActionButton(
    ownerDocument: Document,
    action: string,
    variant: 'neutral' | 'danger',
    label: string,
  ): HTMLButtonElement {
    const button = ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button';
    button.dataset.variant = variant;
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }
}

function invalidImportDiagnostic(): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'DOCUMENT_FIELD_INVALID',
    path: [],
    message: DESIGNER_UI_TEXT.importParseFailed,
  };
}

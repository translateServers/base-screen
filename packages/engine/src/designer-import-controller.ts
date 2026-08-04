import {
  parseScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
} from '@base-screen/contracts';

export interface DesignerImportCallbacks {
  readonly replaceDocument: (document: ScreenDocument) => ScreenParseResult<ScreenDocument>;
  readonly report: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

export class DesignerImportController {
  #dialog: HTMLElement | undefined;
  #generation = 0;
  #pending: ScreenDocument | undefined;

  constructor(private readonly callbacks: DesignerImportCallbacks) {}

  connect(dialog: HTMLElement): void {
    this.#dialog = dialog;
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
          this.callbacks.report(parsed.diagnostics);
          return;
        }
        this.#pending = parsed.value;
        this.render();
      })
      .catch(() => {
        if (generation === this.#generation) this.callbacks.report([invalidImportDiagnostic()]);
      });
  }

  onClick(target: Element): boolean {
    const action = target.closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'import-cancel') {
      this.clear();
      return true;
    }
    if (action !== 'import-confirm' || this.#pending === undefined) return false;
    const result = this.callbacks.replaceDocument(this.#pending);
    if (!result.ok) this.callbacks.report(result.diagnostics);
    if (result.ok) this.clear();
    return true;
  }

  clear(): void {
    this.#generation++;
    this.#pending = undefined;
    this.render();
  }

  private render(): void {
    if (this.#dialog !== undefined) this.#dialog.hidden = this.#pending === undefined;
  }
}

function invalidImportDiagnostic(): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'DOCUMENT_FIELD_INVALID',
    path: [],
    message: 'Canonical document import failed.',
  };
}

import {
  parseScreenDocument,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  applyScreenDocumentTransaction,
  commitScreenHistory,
  createScreenHistory,
  redoScreenHistory,
  reduceScreenInteraction,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
  type ScreenHistoryState,
  type ScreenInteractionAction,
  type ScreenInteractionState,
  undoScreenHistory,
} from '@base-screen/core';
import { ScreenProjectController, type ScreenProjectPhase } from './project-controller.js';

export interface DesignerSessionCallbacks {
  readonly renderDocument: (document: ScreenDocument) => ScreenParseResult<void>;
  readonly renderInteraction: () => void;
  readonly emitChange: (document: ScreenDocument | undefined) => void;
  readonly emitSelectionChange: (interaction: ScreenInteractionState) => void;
  readonly onProjectChange: (
    project: ScreenProjectEnvelope | undefined,
    phase: ScreenProjectPhase,
  ) => void;
  readonly onDirtyChange: (dirty: boolean, revision: string | undefined) => void;
  readonly onConflict: () => void;
  readonly onReady: (project: ScreenProjectEnvelope) => void;
}

export class DesignerSession {
  #document: ScreenDocument | undefined;
  #history: ScreenHistoryState | undefined;
  #interaction: ScreenInteractionState = { selectedComponentIds: [], focusedComponentId: null };
  readonly #projectController: ScreenProjectController;

  constructor(private readonly callbacks: DesignerSessionCallbacks) {
    this.#projectController = new ScreenProjectController({
      getDocument: () => this.#document,
      replaceDocument: (document) => this.replaceDocumentInternal(document, false),
      onChange: ({ project, phase }) => this.callbacks.onProjectChange(project, phase),
      onDirtyChange: (dirty) =>
        this.callbacks.onDirtyChange(dirty, this.#projectController.project?.revision),
      onConflict: () => this.callbacks.onConflict(),
    });
  }

  get adapter(): ScreenProjectAdapter | undefined {
    return this.#projectController.adapter;
  }

  get document(): ScreenDocument | undefined {
    return this.#document;
  }

  get interaction(): ScreenInteractionState {
    return this.#interaction;
  }

  get canUndo(): boolean {
    return this.#history !== undefined && this.#history.past.length > 0;
  }

  get canRedo(): boolean {
    return this.#history !== undefined && this.#history.future.length > 0;
  }

  get dirty(): boolean {
    return this.#projectController.dirty;
  }

  get project(): ScreenProjectEnvelope | undefined {
    return this.#projectController.project;
  }

  get projectPhase(): ScreenProjectPhase {
    return this.#projectController.phase;
  }

  bindProjectAdapter(adapter: ScreenProjectAdapter | undefined): ScreenParseResult<void> {
    return this.#projectController.bindAdapter(adapter);
  }

  replaceDocument(document: ScreenDocument): ScreenParseResult<ScreenDocument> {
    this.#projectController.cancelProjectOperation();
    return this.replaceDocumentInternal(document, true);
  }

  executeCommand(command: ScreenDocumentCommand): ScreenParseResult<ScreenDocument> {
    return this.executeTransaction({ commands: [command] });
  }

  executeTransaction(transaction: ScreenDocumentTransaction): ScreenParseResult<ScreenDocument> {
    if (this.#document === undefined || this.#history === undefined) {
      return failure('Designer must be connected with a catalog and document.');
    }
    const result = applyScreenDocumentTransaction(this.#document, transaction);
    if (!result.ok) {
      return { ok: false, diagnostics: result.diagnostics };
    }
    const rendered = this.callbacks.renderDocument(result.document);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#document = result.document;
    this.#history = commitScreenHistory(this.#history, result.document, 50);
    this.reconcileInteraction(true);
    this.#projectController.notifyDocumentChanged();
    this.callbacks.emitChange(this.#document);
    return { ok: true, value: result.document, diagnostics: [] };
  }

  undo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined) {
      return failure('Designer has no loaded history.');
    }
    const next = undoScreenHistory(this.#history);
    const rendered = this.callbacks.renderDocument(next.present);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#history = next;
    this.#document = next.present;
    this.reconcileInteraction(true);
    this.#projectController.notifyDocumentChanged();
    this.callbacks.emitChange(this.#document);
    return { ok: true, value: next.present, diagnostics: [] };
  }

  redo(): ScreenParseResult<ScreenDocument> {
    if (this.#history === undefined) {
      return failure('Designer has no loaded history.');
    }
    const next = redoScreenHistory(this.#history);
    const rendered = this.callbacks.renderDocument(next.present);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#history = next;
    this.#document = next.present;
    this.reconcileInteraction(true);
    this.#projectController.notifyDocumentChanged();
    this.callbacks.emitChange(this.#document);
    return { ok: true, value: next.present, diagnostics: [] };
  }

  reduceSelection(action: ScreenInteractionAction): void {
    if (this.#document === undefined) {
      return;
    }
    this.#interaction = reduceScreenInteraction(this.#interaction, action, this.#document);
    this.renderInteraction(true);
  }

  async load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const loaded = await this.#projectController.load(projectId);
    if (loaded.ok) {
      this.callbacks.onReady(loaded.value);
    }
    return loaded;
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.save();
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.publish();
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.retryLastProjectOperation();
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.#projectController.reloadRemote(discardChanges);
  }

  continueEditing(): ScreenParseResult<void> {
    return this.#projectController.continueEditing();
  }

  cancelProjectOperation(): void {
    this.#projectController.cancelProjectOperation();
  }

  unload(): void {
    this.#projectController.unload();
    this.#document = undefined;
    this.#history = undefined;
    this.#interaction = { selectedComponentIds: [], focusedComponentId: null };
  }

  private replaceDocumentInternal(
    document: ScreenDocument,
    establishBaseline: boolean,
  ): ScreenParseResult<ScreenDocument> {
    const parsed = parseScreenDocument(document);
    if (!parsed.ok) {
      return parsed;
    }
    const rendered = this.callbacks.renderDocument(parsed.value);
    if (!rendered.ok) {
      return { ok: false, diagnostics: rendered.diagnostics };
    }
    this.#document = parsed.value;
    this.#history = createScreenHistory(parsed.value);
    this.reconcileInteraction(false);
    if (establishBaseline) {
      const baseline = this.#projectController.establishDocumentBaseline(parsed.value);
      if (!baseline.ok) {
        return { ok: false, diagnostics: baseline.diagnostics };
      }
    }
    this.callbacks.emitChange(this.#document);
    return { ok: true, value: parsed.value, diagnostics: [] };
  }

  private reconcileInteraction(emitSelectionChange: boolean): void {
    this.#interaction = reduceScreenInteraction(
      this.#interaction,
      { type: 'reconcile-document' },
      this.#document!,
    );
    this.renderInteraction(emitSelectionChange);
  }

  private renderInteraction(emitSelectionChange: boolean): void {
    this.callbacks.renderInteraction();
    if (emitSelectionChange) {
      this.callbacks.emitSelectionChange(this.#interaction);
    }
  }
}

function failure(message: string): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
        path: [],
        message,
      },
    ],
  };
}

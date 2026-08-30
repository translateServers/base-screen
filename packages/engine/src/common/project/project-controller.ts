import {
  parseScreenProjectEnvelope,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenProjectAdapter,
  type ScreenProjectEnvelope,
  serializeScreenDocument,
} from '@base-screen/contracts';
import {
  loadScreenProject,
  publishScreenProject,
  saveScreenProject,
} from './project-adapter-invocation.js';
import {
  defaultScreenProjectScheduler,
  failScreenProject as fail,
  hasScreenProjectDiagnosticCode as hasCode,
  isConsistentScreenProjectAdapter as isConsistentAdapter,
  type ScreenProjectOperation as Operation,
  type ScreenProjectPendingOperation as PendingOperation,
  type ScreenProjectControllerOptions,
  type ScreenProjectPhase,
  type ScreenProjectScheduler,
  serializeScreenProjectDocument as serialize,
} from './project-controller-support.js';

export type {
  ScreenProjectControllerChange,
  ScreenProjectControllerOptions,
  ScreenProjectPhase,
  ScreenProjectScheduler,
} from './project-controller-support.js';

export class ScreenProjectController {
  #adapter: ScreenProjectAdapter | undefined;
  #project: ScreenProjectEnvelope | undefined;
  #phase: ScreenProjectPhase = 'unloaded';
  #baselineDocument: ScreenDocument | undefined;
  #dirty = false;
  #generation = 0;
  #disposed = false;
  #pending = new Set<PendingOperation>();
  #load: PendingOperation | undefined;
  #mutationTail: Promise<void> = Promise.resolve();
  #saveFlights = new Map<string, Promise<ScreenParseResult<ScreenProjectEnvelope>>>();
  #lastOperation: { readonly type: Operation; readonly projectId?: string } | undefined;
  readonly #scheduler: ScreenProjectScheduler;
  readonly #options: ScreenProjectControllerOptions;

  constructor(options: ScreenProjectControllerOptions) {
    this.#options = options;
    this.#scheduler = options.scheduler ?? defaultScreenProjectScheduler;
  }

  get adapter(): ScreenProjectAdapter | undefined {
    return this.#adapter;
  }

  get project(): ScreenProjectEnvelope | undefined {
    return this.#project;
  }

  get phase(): ScreenProjectPhase {
    return this.#phase;
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  bindAdapter(adapter: ScreenProjectAdapter | undefined): ScreenParseResult<void> {
    if (this.#project !== undefined && adapter !== this.#adapter) {
      return fail('PROJECT_ADAPTER_INVALID', 'Project adapter cannot change while loaded.');
    }
    if (!isConsistentAdapter(adapter)) {
      return fail('PROJECT_ADAPTER_INVALID', 'Project adapter publish capability is inconsistent.');
    }
    if (adapter !== this.#adapter) {
      this.abortAll();
      if (this.#phase === 'loading') {
        this.#phase = 'unloaded';
        this.notify();
      }
    }
    this.#adapter = adapter;
    return { ok: true, value: undefined, diagnostics: [] };
  }

  establishDocumentBaseline(document: ScreenDocument): ScreenParseResult<void> {
    const serialized = serialize(document);
    if (!serialized.ok) {
      return serialized;
    }
    this.abortAll();
    this.#project = undefined;
    this.#lastOperation = undefined;
    this.#baselineDocument = document;
    this.#phase = 'ready';
    this.updateDirty();
    this.notify();
    return { ok: true, value: undefined, diagnostics: [] };
  }

  notifyDocumentChanged(): void {
    this.updateDirty();
    this.notify();
  }

  async load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#disposed) {
      return fail('PROJECT_ABORTED', 'Project controller is disposed.');
    }
    if (this.#adapter === undefined) {
      return fail('PROJECT_ADAPTER_INVALID', 'Project adapter is unavailable.');
    }
    this.abortAll();
    const pending = this.createPending(projectId, undefined);
    this.#load = pending;
    this.#phase = 'loading';
    this.#lastOperation = { type: 'load', projectId };
    this.notify();

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await loadScreenProject(projectId, pending);
        if (!this.isCurrent(pending) || pending.controller.signal.aborted) {
          return fail('PROJECT_ABORTED', 'Project operation was cancelled.');
        }
        if (result.ok) {
          const parsed = parseScreenProjectEnvelope(result.value);
          if (!parsed.ok) {
            return this.finishError(pending, parsed);
          }
          if (
            parsed.value.projectId !== projectId ||
            parsed.value.projectId !== pending.projectId
          ) {
            return this.finishError(
              pending,
              fail('PROJECT_ADAPTER_INVALID', 'Project adapter returned another project.'),
            );
          }
          const replacement = this.#options.replaceDocument(parsed.value.document);
          if (!replacement.ok) {
            return this.finishError(pending, replacement);
          }
          this.#project = parsed.value;
          this.#baselineDocument = this.#options.getDocument() ?? parsed.value.document;
          this.#phase = 'ready';
          this.updateDirty();
          this.notify();
          return parsed;
        }
        if (attempt === 2 || !hasCode(result.diagnostics, 'PROJECT_UNAVAILABLE')) {
          return this.finishFailure(pending, result);
        }
        try {
          await this.#scheduler.wait(attempt === 0 ? 250 : 1000, pending.controller.signal);
        } catch {
          return fail('PROJECT_ABORTED', 'Project operation was cancelled.');
        }
      }
      return fail('PROJECT_UNAVAILABLE', 'Project load failed.');
    } finally {
      this.completePending(pending);
    }
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const document = this.#options.getDocument();
    if (document === undefined || this.#project === undefined || this.#adapter === undefined) {
      return Promise.resolve(
        fail('PROJECT_ADAPTER_INVALID', 'No loaded project is available to save.'),
      );
    }
    const snapshot = serialize(document);
    if (!snapshot.ok) {
      return Promise.resolve(snapshot);
    }
    const existing = this.#saveFlights.get(snapshot.value);
    if (existing !== undefined) {
      return existing;
    }
    this.#lastOperation = { type: 'save' };
    const operation = this.enqueueMutation('save', async (pending) => {
      const current = this.#project;
      if (current === undefined || this.#adapter === undefined) {
        return fail('PROJECT_ADAPTER_INVALID', 'No loaded project is available to save.');
      }
      const result = await saveScreenProject(current, document, pending);
      return this.applySaveResult(result, pending, current, snapshot.value);
    });
    this.#saveFlights.set(snapshot.value, operation);
    void operation.finally(() => this.#saveFlights.delete(snapshot.value));
    return operation;
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return this.publishInternal(false);
  }

  private publishInternal(allowRetry: boolean): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#adapter === undefined || this.#project === undefined) {
      return Promise.resolve(
        fail('PROJECT_ADAPTER_INVALID', 'No loaded project is available to publish.'),
      );
    }
    if (!this.#adapter.capabilities.publish || this.#adapter.publish === undefined) {
      return Promise.resolve(
        fail('PROJECT_PUBLISH_UNAVAILABLE', 'Project publishing is unavailable.'),
      );
    }
    if (this.#phase !== 'ready' && (!allowRetry || this.#phase !== 'error')) {
      return Promise.resolve(
        fail('PROJECT_PUBLISH_UNAVAILABLE', 'Project is not ready to publish.'),
      );
    }
    if (this.#dirty) {
      return Promise.resolve(fail('PROJECT_DIRTY', 'Save changes before publishing.'));
    }
    this.#lastOperation = { type: 'publish' };
    return this.enqueueMutation('publish', async (pending) => {
      const current = this.#project;
      const adapter = this.#adapter;
      if (current === undefined || adapter?.publish === undefined) {
        return fail('PROJECT_PUBLISH_UNAVAILABLE', 'Project publishing is unavailable.');
      }
      const result = await publishScreenProject(current, pending);
      if (!this.isCurrent(pending) || pending.controller.signal.aborted) {
        return fail('PROJECT_ABORTED', 'Project operation was cancelled.');
      }
      if (!result.ok) {
        return this.finishFailure(pending, result);
      }
      const parsed = parseScreenProjectEnvelope(result.value);
      if (!parsed.ok) {
        return this.finishError(pending, parsed);
      }
      if (parsed.value.projectId !== current.projectId) {
        return this.finishError(
          pending,
          fail('PROJECT_ADAPTER_INVALID', 'Project adapter returned another project.'),
        );
      }
      this.#project = parsed.value;
      this.#phase = 'ready';
      this.notify();
      return parsed;
    });
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#lastOperation?.type === 'load' && this.#lastOperation.projectId !== undefined) {
      return this.load(this.#lastOperation.projectId);
    }
    if (this.#lastOperation?.type === 'save') {
      return this.save();
    }
    if (this.#lastOperation?.type === 'publish') {
      return this.publishInternal(true);
    }
    return Promise.resolve(
      fail('PROJECT_UNAVAILABLE', 'No project operation is available to retry.'),
    );
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    if (this.#phase !== 'conflict' || this.#project === undefined) {
      return Promise.resolve(
        fail('PROJECT_UNAVAILABLE', 'No project conflict is available to reload.'),
      );
    }
    if (this.#dirty && !discardChanges) {
      return Promise.resolve(
        fail('PROJECT_DIRTY', 'Reloading remote changes would discard local edits.'),
      );
    }
    return this.load(this.#project.projectId);
  }

  continueEditing(): ScreenParseResult<void> {
    if (this.#phase !== 'conflict') {
      return fail('PROJECT_UNAVAILABLE', 'No project conflict is available to dismiss.');
    }
    this.#phase = 'ready';
    this.notify();
    return { ok: true, value: undefined, diagnostics: [] };
  }

  cancelProjectOperation(): void {
    this.abortAll();
    if (!this.#disposed) {
      this.#phase = this.#project === undefined ? 'unloaded' : 'ready';
      this.notify();
    }
  }

  unload(): void {
    this.cancelProjectOperation();
    this.#project = undefined;
    this.#baselineDocument = undefined;
    this.#phase = 'unloaded';
    this.updateDirty();
    this.notify();
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.abortAll();
    this.#disposed = true;
    this.#phase = 'disposed';
    this.notify();
  }

  private enqueueMutation(
    type: Extract<Operation, 'save' | 'publish'>,
    operation: (pending: PendingOperation) => Promise<ScreenParseResult<ScreenProjectEnvelope>>,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const pending = this.createPending(this.#project?.projectId, this.#project?.revision);
    const run: Promise<ScreenParseResult<ScreenProjectEnvelope>> = this.#mutationTail.then(
      async (): Promise<ScreenParseResult<ScreenProjectEnvelope>> => {
        if (pending.controller.signal.aborted || !this.isCurrent(pending)) {
          return fail('PROJECT_ABORTED', 'Project operation was cancelled.');
        }
        this.#phase = type === 'save' ? 'saving' : 'publishing';
        this.notify();
        return operation(pending);
      },
    );
    this.#mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    void run.then(
      () => this.completePending(pending),
      () => this.completePending(pending),
    );
    return run;
  }

  private applySaveResult(
    result: ScreenParseResult<ScreenProjectEnvelope>,
    pending: PendingOperation,
    submitted: ScreenProjectEnvelope,
    snapshot: string,
  ): ScreenParseResult<ScreenProjectEnvelope> {
    if (!this.isCurrent(pending) || pending.controller.signal.aborted) {
      return fail('PROJECT_ABORTED', 'Project operation was cancelled.');
    }
    if (!result.ok) {
      return this.finishFailure(pending, result);
    }
    const parsed = parseScreenProjectEnvelope(result.value);
    if (!parsed.ok || parsed.value.projectId !== submitted.projectId) {
      return this.finishError(
        pending,
        parsed.ok
          ? fail('PROJECT_ADAPTER_INVALID', 'Project adapter returned another project.')
          : parsed,
      );
    }
    if (this.#project?.revision !== submitted.revision) {
      return fail('PROJECT_ABORTED', 'Project operation was superseded.');
    }
    this.#project = parsed.value;
    const current = this.#options.getDocument();
    let baselineDocument = parsed.value.document;
    if (current !== undefined && serializeScreenDocument(current) === snapshot) {
      const replacement = this.#options.replaceDocument(parsed.value.document);
      if (!replacement.ok) {
        return this.finishError(pending, replacement);
      }
      baselineDocument = this.#options.getDocument() ?? parsed.value.document;
    }
    this.#baselineDocument = baselineDocument;
    this.#phase = 'ready';
    this.updateDirty();
    this.notify();
    return parsed;
  }

  private finishFailure(
    pending: PendingOperation,
    result: ScreenParseResult<ScreenProjectEnvelope>,
  ): ScreenParseResult<ScreenProjectEnvelope> {
    if (hasCode(result.diagnostics, 'PROJECT_CONFLICT')) {
      this.#phase = 'conflict';
      this.#options.onConflict?.();
    } else {
      this.#phase = 'error';
    }
    if (this.isCurrent(pending)) {
      this.notify();
    }
    return result;
  }

  private finishError<T>(
    pending: PendingOperation,
    result: ScreenParseResult<T>,
  ): ScreenParseResult<T> {
    this.#phase = 'error';
    if (this.isCurrent(pending)) {
      this.notify();
    }
    return result;
  }

  private createPending(
    projectId: string | undefined,
    revision: string | undefined,
  ): PendingOperation {
    const pending = {
      generation: this.#generation,
      controller: new AbortController(),
      adapter: this.#adapter,
      projectId,
      revision,
    };
    this.#pending.add(pending);
    return pending;
  }

  private isCurrent(pending: PendingOperation): boolean {
    const project = this.#project;
    return (
      !this.#disposed &&
      pending.generation === this.#generation &&
      pending.adapter === this.#adapter &&
      (pending.revision === undefined ||
        (project?.projectId === pending.projectId && project?.revision === pending.revision))
    );
  }

  private abortAll(): void {
    this.#generation++;
    for (const pending of this.#pending) {
      pending.controller.abort();
    }
    this.#pending.clear();
    this.#load = undefined;
  }

  private completePending(pending: PendingOperation): void {
    this.#pending.delete(pending);
    if (this.#load === pending) {
      this.#load = undefined;
    }
  }

  private updateDirty(): void {
    const document = this.#options.getDocument();
    const dirty =
      document !== undefined &&
      this.#baselineDocument !== undefined &&
      document !== this.#baselineDocument;
    if (dirty !== this.#dirty) {
      this.#dirty = dirty;
      this.#options.onDirtyChange?.(dirty);
    }
  }

  private notify(): void {
    this.#options.onChange?.({ phase: this.#phase, project: this.#project, dirty: this.#dirty });
  }
}

import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { loadScreenProjectIntoState } from './project-controller-load.js';
import {
  publishScreenProjectFromState,
  saveScreenProjectFromState,
} from './project-controller-mutations.js';
import {
  abortScreenProjectOperations,
  createScreenProjectControllerState,
  notifyScreenProjectChange,
  type ScreenProjectControllerState,
  updateScreenProjectDirty,
} from './project-controller-state.js';
import {
  failScreenProject,
  isConsistentScreenProjectAdapter,
  type ScreenProjectControllerOptions,
  type ScreenProjectPhase,
  serializeScreenProjectDocument,
} from './project-controller-support.js';

export type {
  ScreenProjectControllerChange,
  ScreenProjectControllerOptions,
  ScreenProjectPhase,
  ScreenProjectScheduler,
} from './project-controller-support.js';

export class ScreenProjectController {
  readonly #state: ScreenProjectControllerState;

  constructor(options: ScreenProjectControllerOptions) {
    this.#state = createScreenProjectControllerState(options);
  }

  get adapter(): ScreenProjectAdapter | undefined {
    return this.#state.adapter;
  }

  get project(): ScreenProjectEnvelope | undefined {
    return this.#state.project;
  }

  get phase(): ScreenProjectPhase {
    return this.#state.phase;
  }

  get dirty(): boolean {
    return this.#state.dirty;
  }

  bindAdapter(adapter: ScreenProjectAdapter | undefined): ScreenParseResult<void> {
    const state = this.#state;
    if (state.project !== undefined && adapter !== state.adapter) {
      return failScreenProject(
        'PROJECT_ADAPTER_INVALID',
        'Project adapter cannot change while loaded.',
      );
    }
    if (!isConsistentScreenProjectAdapter(adapter)) {
      return failScreenProject(
        'PROJECT_ADAPTER_INVALID',
        'Project adapter publish capability is inconsistent.',
      );
    }
    if (adapter !== state.adapter) {
      abortScreenProjectOperations(state);
      if (state.phase === 'loading') {
        state.phase = 'unloaded';
        notifyScreenProjectChange(state);
      }
    }
    state.adapter = adapter;
    return { ok: true, value: undefined, diagnostics: [] };
  }

  establishDocumentBaseline(document: ScreenDocument): ScreenParseResult<void> {
    const serialized = serializeScreenProjectDocument(document);
    if (!serialized.ok) return serialized;
    const state = this.#state;
    abortScreenProjectOperations(state);
    state.project = undefined;
    state.lastOperation = undefined;
    state.baselineDocument = document;
    state.phase = 'ready';
    updateScreenProjectDirty(state);
    notifyScreenProjectChange(state);
    return { ok: true, value: undefined, diagnostics: [] };
  }

  notifyDocumentChanged(): void {
    updateScreenProjectDirty(this.#state);
    notifyScreenProjectChange(this.#state);
  }

  load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return loadScreenProjectIntoState(this.#state, projectId);
  }

  save(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return saveScreenProjectFromState(this.#state);
  }

  publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    return publishScreenProjectFromState(this.#state, false);
  }

  retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const operation = this.#state.lastOperation;
    if (operation?.type === 'load' && operation.projectId !== undefined) {
      return this.load(operation.projectId);
    }
    if (operation?.type === 'save') return this.save();
    if (operation?.type === 'publish') return publishScreenProjectFromState(this.#state, true);
    return Promise.resolve(
      failScreenProject('PROJECT_UNAVAILABLE', 'No project operation is available to retry.'),
    );
  }

  reloadRemote(discardChanges = false): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
    const state = this.#state;
    if (state.phase !== 'conflict' || state.project === undefined) {
      return Promise.resolve(
        failScreenProject('PROJECT_UNAVAILABLE', 'No project conflict is available to reload.'),
      );
    }
    if (state.dirty && !discardChanges) {
      return Promise.resolve(
        failScreenProject('PROJECT_DIRTY', 'Reloading remote changes would discard local edits.'),
      );
    }
    return this.load(state.project.projectId);
  }

  continueEditing(): ScreenParseResult<void> {
    const state = this.#state;
    if (state.phase !== 'conflict') {
      return failScreenProject(
        'PROJECT_UNAVAILABLE',
        'No project conflict is available to dismiss.',
      );
    }
    state.phase = 'ready';
    notifyScreenProjectChange(state);
    return { ok: true, value: undefined, diagnostics: [] };
  }

  cancelProjectOperation(): void {
    const state = this.#state;
    abortScreenProjectOperations(state);
    if (!state.disposed) {
      state.phase = state.project === undefined ? 'unloaded' : 'ready';
      notifyScreenProjectChange(state);
    }
  }

  unload(): void {
    this.cancelProjectOperation();
    const state = this.#state;
    state.project = undefined;
    state.baselineDocument = undefined;
    state.phase = 'unloaded';
    updateScreenProjectDirty(state);
    notifyScreenProjectChange(state);
  }

  dispose(): void {
    const state = this.#state;
    if (state.disposed) return;
    abortScreenProjectOperations(state);
    state.disposed = true;
    state.phase = 'disposed';
    notifyScreenProjectChange(state);
  }
}

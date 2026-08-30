import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectAdapter,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  defaultScreenProjectScheduler,
  hasScreenProjectDiagnosticCode,
  type ScreenProjectControllerOptions,
  type ScreenProjectOperation,
  type ScreenProjectPendingOperation,
  type ScreenProjectPhase,
  type ScreenProjectScheduler,
} from './project-controller-support.js';

export interface ScreenProjectControllerState {
  adapter: ScreenProjectAdapter | undefined;
  project: ScreenProjectEnvelope | undefined;
  phase: ScreenProjectPhase;
  baselineDocument: ScreenDocument | undefined;
  dirty: boolean;
  generation: number;
  disposed: boolean;
  pending: Set<ScreenProjectPendingOperation>;
  load: ScreenProjectPendingOperation | undefined;
  mutationTail: Promise<void>;
  saveFlights: Map<string, Promise<ScreenParseResult<ScreenProjectEnvelope>>>;
  lastOperation: { readonly type: ScreenProjectOperation; readonly projectId?: string } | undefined;
  readonly scheduler: ScreenProjectScheduler;
  readonly options: ScreenProjectControllerOptions;
}

export function createScreenProjectControllerState(
  options: ScreenProjectControllerOptions,
): ScreenProjectControllerState {
  return {
    adapter: undefined,
    project: undefined,
    phase: 'unloaded',
    baselineDocument: undefined,
    dirty: false,
    generation: 0,
    disposed: false,
    pending: new Set(),
    load: undefined,
    mutationTail: Promise.resolve(),
    saveFlights: new Map(),
    lastOperation: undefined,
    scheduler: options.scheduler ?? defaultScreenProjectScheduler,
    options,
  };
}

export function createScreenProjectPendingOperation(
  state: ScreenProjectControllerState,
  projectId: string | undefined,
  revision: string | undefined,
): ScreenProjectPendingOperation {
  const pending = {
    generation: state.generation,
    controller: new AbortController(),
    adapter: state.adapter,
    projectId,
    revision,
  };
  state.pending.add(pending);
  return pending;
}

export function isCurrentScreenProjectOperation(
  state: ScreenProjectControllerState,
  pending: ScreenProjectPendingOperation,
): boolean {
  const project = state.project;
  return (
    !state.disposed &&
    pending.generation === state.generation &&
    pending.adapter === state.adapter &&
    (pending.revision === undefined ||
      (project?.projectId === pending.projectId && project?.revision === pending.revision))
  );
}

export function abortScreenProjectOperations(state: ScreenProjectControllerState): void {
  state.generation++;
  for (const pending of state.pending) pending.controller.abort();
  state.pending.clear();
  state.load = undefined;
}

export function completeScreenProjectOperation(
  state: ScreenProjectControllerState,
  pending: ScreenProjectPendingOperation,
): void {
  state.pending.delete(pending);
  if (state.load === pending) state.load = undefined;
}

export function updateScreenProjectDirty(state: ScreenProjectControllerState): void {
  const document = state.options.getDocument();
  const dirty =
    document !== undefined &&
    state.baselineDocument !== undefined &&
    document !== state.baselineDocument;
  if (dirty !== state.dirty) {
    state.dirty = dirty;
    state.options.onDirtyChange?.(dirty);
  }
}

export function notifyScreenProjectChange(state: ScreenProjectControllerState): void {
  state.options.onChange?.({ phase: state.phase, project: state.project, dirty: state.dirty });
}

export function finishScreenProjectFailure(
  state: ScreenProjectControllerState,
  pending: ScreenProjectPendingOperation,
  result: ScreenParseResult<ScreenProjectEnvelope>,
): ScreenParseResult<ScreenProjectEnvelope> {
  if (hasScreenProjectDiagnosticCode(result.diagnostics, 'PROJECT_CONFLICT')) {
    state.phase = 'conflict';
    state.options.onConflict?.();
  } else {
    state.phase = 'error';
  }
  if (isCurrentScreenProjectOperation(state, pending)) notifyScreenProjectChange(state);
  return result;
}

export function finishScreenProjectError<T>(
  state: ScreenProjectControllerState,
  pending: ScreenProjectPendingOperation,
  result: ScreenParseResult<T>,
): ScreenParseResult<T> {
  state.phase = 'error';
  if (isCurrentScreenProjectOperation(state, pending)) notifyScreenProjectChange(state);
  return result;
}

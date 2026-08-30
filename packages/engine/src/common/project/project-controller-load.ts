import {
  parseScreenProjectEnvelope,
  type ScreenParseResult,
  type ScreenProjectEnvelope,
} from '@base-screen/contracts';
import { loadScreenProject } from './project-adapter-invocation.js';
import {
  abortScreenProjectOperations,
  completeScreenProjectOperation,
  createScreenProjectPendingOperation,
  finishScreenProjectError,
  finishScreenProjectFailure,
  isCurrentScreenProjectOperation,
  notifyScreenProjectChange,
  type ScreenProjectControllerState,
  updateScreenProjectDirty,
} from './project-controller-state.js';
import { failScreenProject, hasScreenProjectDiagnosticCode } from './project-controller-support.js';

export async function loadScreenProjectIntoState(
  state: ScreenProjectControllerState,
  projectId: string,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  if (state.disposed)
    return failScreenProject('PROJECT_ABORTED', 'Project controller is disposed.');
  if (state.adapter === undefined) {
    return failScreenProject('PROJECT_ADAPTER_INVALID', 'Project adapter is unavailable.');
  }
  abortScreenProjectOperations(state);
  const pending = createScreenProjectPendingOperation(state, projectId, undefined);
  state.load = pending;
  state.phase = 'loading';
  state.lastOperation = { type: 'load', projectId };
  notifyScreenProjectChange(state);

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await loadScreenProject(projectId, pending);
      if (!isCurrentScreenProjectOperation(state, pending) || pending.controller.signal.aborted) {
        return failScreenProject('PROJECT_ABORTED', 'Project operation was cancelled.');
      }
      if (result.ok) {
        const parsed = parseScreenProjectEnvelope(result.value);
        if (!parsed.ok) return finishScreenProjectError(state, pending, parsed);
        if (parsed.value.projectId !== projectId || parsed.value.projectId !== pending.projectId) {
          return finishScreenProjectError(
            state,
            pending,
            failScreenProject(
              'PROJECT_ADAPTER_INVALID',
              'Project adapter returned another project.',
            ),
          );
        }
        const replacement = state.options.replaceDocument(parsed.value.document);
        if (!replacement.ok) return finishScreenProjectError(state, pending, replacement);
        state.project = parsed.value;
        state.baselineDocument = state.options.getDocument() ?? parsed.value.document;
        state.phase = 'ready';
        updateScreenProjectDirty(state);
        notifyScreenProjectChange(state);
        return parsed;
      }
      if (
        attempt === 2 ||
        !hasScreenProjectDiagnosticCode(result.diagnostics, 'PROJECT_UNAVAILABLE')
      ) {
        return finishScreenProjectFailure(state, pending, result);
      }
      try {
        await state.scheduler.wait(attempt === 0 ? 250 : 1000, pending.controller.signal);
      } catch {
        return failScreenProject('PROJECT_ABORTED', 'Project operation was cancelled.');
      }
    }
    return failScreenProject('PROJECT_UNAVAILABLE', 'Project load failed.');
  } finally {
    completeScreenProjectOperation(state, pending);
  }
}

import {
  parseScreenProjectEnvelope,
  type ScreenParseResult,
  type ScreenProjectEnvelope,
  serializeScreenDocument,
} from '@base-screen/contracts';
import { publishScreenProject, saveScreenProject } from './project-adapter-invocation.js';
import {
  completeScreenProjectOperation,
  createScreenProjectPendingOperation,
  finishScreenProjectError,
  finishScreenProjectFailure,
  isCurrentScreenProjectOperation,
  notifyScreenProjectChange,
  type ScreenProjectControllerState,
  updateScreenProjectDirty,
} from './project-controller-state.js';
import {
  failScreenProject,
  type ScreenProjectOperation,
  type ScreenProjectPendingOperation,
  serializeScreenProjectDocument,
} from './project-controller-support.js';

export function saveScreenProjectFromState(
  state: ScreenProjectControllerState,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const document = state.options.getDocument();
  if (document === undefined || state.project === undefined || state.adapter === undefined) {
    return Promise.resolve(
      failScreenProject('PROJECT_ADAPTER_INVALID', 'No loaded project is available to save.'),
    );
  }
  const snapshot = serializeScreenProjectDocument(document);
  if (!snapshot.ok) return Promise.resolve(snapshot);
  const existing = state.saveFlights.get(snapshot.value);
  if (existing !== undefined) return existing;
  state.lastOperation = { type: 'save' };
  const operation = enqueueScreenProjectMutation(state, 'save', async (pending) => {
    const current = state.project;
    if (current === undefined || state.adapter === undefined) {
      return failScreenProject(
        'PROJECT_ADAPTER_INVALID',
        'No loaded project is available to save.',
      );
    }
    const result = await saveScreenProject(current, document, pending);
    return applySaveResult(state, result, pending, current, snapshot.value);
  });
  state.saveFlights.set(snapshot.value, operation);
  void operation.finally(() => state.saveFlights.delete(snapshot.value));
  return operation;
}

export function publishScreenProjectFromState(
  state: ScreenProjectControllerState,
  allowRetry: boolean,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  if (state.adapter === undefined || state.project === undefined) {
    return Promise.resolve(
      failScreenProject('PROJECT_ADAPTER_INVALID', 'No loaded project is available to publish.'),
    );
  }
  if (!state.adapter.capabilities.publish || state.adapter.publish === undefined) {
    return Promise.resolve(
      failScreenProject('PROJECT_PUBLISH_UNAVAILABLE', 'Project publishing is unavailable.'),
    );
  }
  if (state.phase !== 'ready' && (!allowRetry || state.phase !== 'error')) {
    return Promise.resolve(
      failScreenProject('PROJECT_PUBLISH_UNAVAILABLE', 'Project is not ready to publish.'),
    );
  }
  if (state.dirty) {
    return Promise.resolve(failScreenProject('PROJECT_DIRTY', 'Save changes before publishing.'));
  }
  state.lastOperation = { type: 'publish' };
  return enqueueScreenProjectMutation(state, 'publish', async (pending) => {
    const current = state.project;
    const adapter = state.adapter;
    if (current === undefined || adapter?.publish === undefined) {
      return failScreenProject('PROJECT_PUBLISH_UNAVAILABLE', 'Project publishing is unavailable.');
    }
    const result = await publishScreenProject(current, pending);
    if (!isCurrentScreenProjectOperation(state, pending) || pending.controller.signal.aborted) {
      return failScreenProject('PROJECT_ABORTED', 'Project operation was cancelled.');
    }
    if (!result.ok) return finishScreenProjectFailure(state, pending, result);
    const parsed = parseScreenProjectEnvelope(result.value);
    if (!parsed.ok) return finishScreenProjectError(state, pending, parsed);
    if (parsed.value.projectId !== current.projectId) {
      return finishScreenProjectError(
        state,
        pending,
        failScreenProject('PROJECT_ADAPTER_INVALID', 'Project adapter returned another project.'),
      );
    }
    state.project = parsed.value;
    state.phase = 'ready';
    notifyScreenProjectChange(state);
    return parsed;
  });
}

function enqueueScreenProjectMutation(
  state: ScreenProjectControllerState,
  type: Extract<ScreenProjectOperation, 'save' | 'publish'>,
  operation: (
    pending: ScreenProjectPendingOperation,
  ) => Promise<ScreenParseResult<ScreenProjectEnvelope>>,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  const pending = createScreenProjectPendingOperation(
    state,
    state.project?.projectId,
    state.project?.revision,
  );
  const run: Promise<ScreenParseResult<ScreenProjectEnvelope>> = state.mutationTail.then(
    async (): Promise<ScreenParseResult<ScreenProjectEnvelope>> => {
      if (pending.controller.signal.aborted || !isCurrentScreenProjectOperation(state, pending)) {
        return failScreenProject('PROJECT_ABORTED', 'Project operation was cancelled.');
      }
      state.phase = type === 'save' ? 'saving' : 'publishing';
      notifyScreenProjectChange(state);
      return operation(pending);
    },
  );
  state.mutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  void run.then(
    () => completeScreenProjectOperation(state, pending),
    () => completeScreenProjectOperation(state, pending),
  );
  return run;
}

function applySaveResult(
  state: ScreenProjectControllerState,
  result: ScreenParseResult<ScreenProjectEnvelope>,
  pending: ScreenProjectPendingOperation,
  submitted: ScreenProjectEnvelope,
  snapshot: string,
): ScreenParseResult<ScreenProjectEnvelope> {
  if (!isCurrentScreenProjectOperation(state, pending) || pending.controller.signal.aborted) {
    return failScreenProject('PROJECT_ABORTED', 'Project operation was cancelled.');
  }
  if (!result.ok) return finishScreenProjectFailure(state, pending, result);
  const parsed = parseScreenProjectEnvelope(result.value);
  if (!parsed.ok || parsed.value.projectId !== submitted.projectId) {
    return finishScreenProjectError(
      state,
      pending,
      parsed.ok
        ? failScreenProject('PROJECT_ADAPTER_INVALID', 'Project adapter returned another project.')
        : parsed,
    );
  }
  if (state.project?.revision !== submitted.revision) {
    return failScreenProject('PROJECT_ABORTED', 'Project operation was superseded.');
  }
  state.project = parsed.value;
  const current = state.options.getDocument();
  // 保存成功后的三种落点，按「本地文档是否还是提交时的那份」和「服务端返回的是否同一内容」区分：
  // 只有服务端归一化出不同内容时才需要真的替换文档，也只有那条路径会重渲染并重置选区与历史。
  if (current === undefined || serializeScreenDocument(current) !== snapshot) {
    // 飞行期间又变了脏：基线钉在服务端文档上，本地继续算脏，由消费方再排一次保存。
    state.baselineDocument = parsed.value.document;
  } else if (serializeScreenDocument(parsed.value.document) === snapshot) {
    // 内容与提交快照逐字节相同：保留当前文档对象引用即可判定干净，不动会话状态。
    state.baselineDocument = current;
  } else {
    const replacement = state.options.replaceDocument(parsed.value.document);
    if (!replacement.ok) return finishScreenProjectError(state, pending, replacement);
    state.baselineDocument = state.options.getDocument() ?? parsed.value.document;
  }
  state.phase = 'ready';
  updateScreenProjectDirty(state);
  notifyScreenProjectChange(state);
  return parsed;
}

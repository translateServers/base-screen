import type {
  ScreenDocument,
  ScreenParseResult,
  ScreenProjectEnvelope,
} from '@base-screen/contracts';
import {
  failScreenProject,
  type ScreenProjectPendingOperation,
} from './project-controller-support.js';

export async function loadScreenProject(
  projectId: string,
  pending: ScreenProjectPendingOperation,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  try {
    if (pending.adapter === undefined) {
      return failScreenProject('PROJECT_ADAPTER_INVALID', 'Project adapter is unavailable.');
    }
    return await pending.adapter.load({ projectId, signal: pending.controller.signal });
  } catch {
    return failScreenProject('PROJECT_UNAVAILABLE', 'Project load is unavailable.');
  }
}

export async function saveScreenProject(
  project: ScreenProjectEnvelope,
  document: ScreenDocument,
  pending: ScreenProjectPendingOperation,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  try {
    if (pending.adapter === undefined) {
      return failScreenProject('PROJECT_ADAPTER_INVALID', 'Project adapter is unavailable.');
    }
    return await pending.adapter.save({
      projectId: project.projectId,
      revision: project.revision,
      document,
      signal: pending.controller.signal,
    });
  } catch {
    return failScreenProject('PROJECT_UNAVAILABLE', 'Project save is unavailable.');
  }
}

export async function publishScreenProject(
  project: ScreenProjectEnvelope,
  pending: ScreenProjectPendingOperation,
): Promise<ScreenParseResult<ScreenProjectEnvelope>> {
  try {
    if (pending.adapter?.publish === undefined) {
      return failScreenProject('PROJECT_PUBLISH_UNAVAILABLE', 'Project publishing is unavailable.');
    }
    return await pending.adapter.publish({
      projectId: project.projectId,
      revision: project.revision,
      signal: pending.controller.signal,
    });
  } catch {
    return failScreenProject('PROJECT_UNAVAILABLE', 'Project publish is unavailable.');
  }
}

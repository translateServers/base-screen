import type { ScreenJsonObject, ScreenResourceExecutionContext } from '@base-screen/contracts';
import { BlueprintVisibilityController } from '../blueprint-visibility.js';
import { ResourceRequestCoordinator } from '../resource/request-coordinator.js';
import { cancelResourceState } from '../resource/resource-state.js';
import type { CreateBaseScreenRendererOptions } from './renderer.js';
import type {
  ComponentValidationCache,
  MountedMaterial,
  RenderCandidate,
} from './renderer-types.js';

export interface RendererState {
  readonly options: CreateBaseScreenRendererOptions;
  mounted: Map<string, MountedMaterial>;
  candidates: Map<string, RenderCandidate>;
  document: import('@base-screen/contracts').ScreenDocument | undefined;
  lastValidatedInput: import('@base-screen/contracts').ScreenDocument | undefined;
  validationCache: ComponentValidationCache;
  variables: ScreenJsonObject;
  dataSuspended: boolean;
  disposed: boolean;
  interactive: boolean;
  coordinator: ResourceRequestCoordinator | undefined;
  readonly visibility: BlueprintVisibilityController;
}

export function createRendererState(options: CreateBaseScreenRendererOptions): RendererState {
  if (!isResourceTimeoutValid(options.resourceTimeoutMs ?? 15_000)) {
    throw new RangeError('resourceTimeoutMs must be an integer between 100 and 60000.');
  }
  const state: RendererState = {
    options,
    mounted: new Map(),
    candidates: new Map(),
    document: undefined,
    lastValidatedInput: undefined,
    validationCache: { entries: new Map() },
    variables: {},
    dataSuspended: false,
    disposed: false,
    interactive: options.interactive,
    coordinator: undefined,
    visibility: new BlueprintVisibilityController(options.root),
  };
  if (options.resourcePort !== undefined) {
    state.coordinator = new ResourceRequestCoordinator(
      options.resourcePort,
      (resourceType) =>
        options.contributionIndex?.getResourceType(resourceType)?.queryScope === 'resource',
      options.resourceTimeoutMs ?? 15_000,
      (key, componentId, context) =>
        emitObserver(
          state,
          'shared',
          key,
          componentId,
          undefined,
          context ?? defaultExecutionContext(state),
          { startedAt: undefined },
        ),
    );
  }
  return state;
}

export function cancelHostResource(
  state: RendererState,
  mounted: MountedMaterial,
  componentId: string,
): void {
  const key = mounted.resource.resourceKey;
  const slotId = mounted.resource.requestSlotId;
  const context = mounted.resource.executionContext ?? defaultExecutionContext(state);
  cancelResourceState(mounted.resource);
  if (key !== undefined) {
    if (slotId !== undefined) state.coordinator?.release(slotId, componentId);
    emitObserver(state, 'aborted', key, componentId, undefined, context, {
      startedAt: undefined,
    });
  }
}

export function emitObserver(
  state: RendererState,
  type: 'started' | 'shared' | 'succeeded' | 'failed' | 'aborted' | 'timed-out' | 'adapted',
  key: string,
  componentId: string,
  requestId: string | undefined,
  context: ScreenResourceExecutionContext,
  meta: {
    readonly startedAt: number | undefined;
    readonly fieldCount?: number | undefined;
    readonly rowCount?: number | undefined;
    readonly code?: string | undefined;
  },
): void {
  const observer = state.options.observer;
  if (observer === undefined) return;
  const [resourceType, resourceId] = key.split('\u0000');
  try {
    observer({
      type,
      requestId: requestId ?? `${componentId}:${key}:cancel`,
      componentId,
      resourceType: resourceType ?? key,
      resourceId: resourceId ?? '',
      context,
      durationMs: meta.startedAt === undefined ? 0 : Date.now() - meta.startedAt,
      ...(meta.fieldCount === undefined ? {} : { fieldCount: meta.fieldCount }),
      ...(meta.rowCount === undefined ? {} : { rowCount: meta.rowCount }),
      ...(meta.code === undefined ? {} : { code: meta.code }),
    });
  } catch {
    // Observer failures are isolated from rendering.
  }
}

export function defaultExecutionContext(state: RendererState): ScreenResourceExecutionContext {
  return {
    instanceId: state.options.instanceId ?? 'renderer',
    mode: state.options.executionMode ?? 'viewer',
    trigger: 'manual',
    traceId: '',
  };
}

function isResourceTimeoutValid(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 60_000;
}

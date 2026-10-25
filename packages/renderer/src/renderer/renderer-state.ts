import type {
  ScreenDataSourceSource,
  ScreenDiagnostic,
  ScreenJsonObject,
  ScreenResourceExecutionContext,
} from '@base-screen/contracts';
import {
  type BaseScreenMaterialCatalog,
  validateBaseScreenMaterialProps,
} from '@base-screen/plugin-core';
import { BlueprintVisibilityController } from '../blueprint-visibility.js';
import {
  DataSourceRuntime,
  type DataSourceRuntimeObserverEvent,
} from '../resource/data-source-runtime.js';
import { ResourceRequestCoordinator } from '../resource/request-coordinator.js';
import {
  SOURCE_SHARE_DATASET,
  SOURCE_SHARE_RESOURCE,
  SourceQueryPort,
  type SourceQueryRequest,
} from '../resource/source-query-port.js';
import type { CreateBaseScreenRendererOptions } from './renderer.js';
import type {
  ComponentValidationCache,
  MountedMaterial,
  RenderCandidate,
} from './renderer-types.js';

export interface RendererState {
  readonly options: CreateBaseScreenRendererOptions;
  catalog: BaseScreenMaterialCatalog;
  mounted: Map<string, MountedMaterial>;
  candidates: Map<string, RenderCandidate>;
  document: import('@base-screen/contracts').ScreenDocument | undefined;
  lastValidatedInput: import('@base-screen/contracts').ScreenDocument | undefined;
  validationCache: ComponentValidationCache;
  variables: ScreenJsonObject;
  dataSuspended: boolean;
  disposed: boolean;
  interactive: boolean;
  coordinator: ResourceRequestCoordinator<SourceQueryRequest> | undefined;
  readonly sourceQueries: SourceQueryPort;
  /** 数据源实例运行时：请求身份、缓存、代际的唯一所有者。 */
  readonly dataSources: DataSourceRuntime;
  readonly visibility: BlueprintVisibilityController;
  /** 实例状态变化后由 Renderer 注入的重投影钩子（构造期先给空实现）。 */
  onDataSourceChanged: (dataSourceId: string) => void;
}

export function createRendererState(options: CreateBaseScreenRendererOptions): RendererState {
  if (!isResourceTimeoutValid(options.resourceTimeoutMs ?? 15_000)) {
    throw new RangeError('resourceTimeoutMs must be an integer between 100 and 60000.');
  }
  const sourceQueries = new SourceQueryPort(
    options.resourcePort,
    options.datasetPort,
    options.hostCatalogPort,
  );
  let state!: RendererState;
  const coordinator =
    options.resourcePort !== undefined ||
    options.datasetPort !== undefined ||
    options.hostCatalogPort !== undefined
      ? new ResourceRequestCoordinator<SourceQueryRequest>(
          {
            resolve: (request, resolveOptions) => sourceQueries.query(request, resolveOptions),
          },
          (shareScope) => isShareableSource(shareScope, options),
          options.resourceTimeoutMs ?? 15_000,
        )
      : undefined;
  const dataSources = new DataSourceRuntime({
    sourcePort: sourceQueries,
    coordinator,
    isSuspended: () => state.dataSuspended,
    createExecutionContext: (context, dataSourceId) =>
      createExecutionContext(state, dataSourceId, context),
    emit: (event) => emitDataSourceEvent(state, event),
    onChanged: (dataSourceId) => state.onDataSourceChanged(dataSourceId),
    validateParams: (source, params) => validateHostResourceParams(state, source, params),
  });
  state = {
    options,
    catalog: options.catalog,
    mounted: new Map(),
    candidates: new Map(),
    document: undefined,
    lastValidatedInput: undefined,
    validationCache: { entries: new Map() },
    variables: {},
    dataSuspended: false,
    disposed: false,
    interactive: options.interactive,
    coordinator,
    sourceQueries,
    dataSources,
    visibility: new BlueprintVisibilityController(options.root),
    onDataSourceChanged: () => {},
  };
  return state;
}

/**
 * 数据源请求的共享范围由来源决定：
 * - `dataset`：只有数据集端口显式声明 `queryScope:'dataset'` 才共享；
 * - `host-resource`：按贡献声明的 `queryScope:'resource'`（声明缺失时按资源域处理）；
 * - `host-catalog` / `url-query`：恒不共享。
 *
 * 注意请求键已含实例 id，因此共享只在「同一实例的同一请求重复发起」时才有意义——
 * 那是 `DataSourceRuntime` 自己要挡掉的情况。这里保留协调器的共享语义是为了维持
 * 宿主声明的可观察行为，不是靠它去合并两个不同实例。
 */
function isShareableSource(shareScope: string, options: CreateBaseScreenRendererOptions): boolean {
  if (shareScope === SOURCE_SHARE_DATASET) {
    return options.datasetPort?.queryScope === 'dataset';
  }
  if (shareScope === SOURCE_SHARE_RESOURCE) return true;
  return false;
}

/** 宿主资源类型参数门控：configSchema 不通过时实例直接失败，不发请求。 */
function validateHostResourceParams(
  state: RendererState,
  source: ScreenDataSourceSource,
  params: ScreenJsonObject,
): ScreenDiagnostic | undefined {
  if (source.kind !== 'host-resource') return undefined;
  const index = state.options.contributionIndex;
  if (index === undefined) return undefined;
  const resourceType = index.getResourceType(source.resourceType);
  if (resourceType === undefined) {
    return {
      severity: 'error',
      code: 'HOST_RESOURCE_FAILED',
      path: [],
      message: 'Host resource type is not enabled by an active plugin contribution.',
    };
  }
  const validated = validateBaseScreenMaterialProps(params, resourceType.configSchema);
  if (validated.ok) return undefined;
  return {
    severity: 'error',
    code: 'HOST_RESOURCE_FAILED',
    path: [],
    message: 'Host resource request failed.',
  };
}

export function emitDataSourceEvent(
  state: RendererState,
  event: DataSourceRuntimeObserverEvent,
): void {
  const observer = state.options.observer;
  if (observer === undefined) return;
  try {
    observer({
      type: event.type,
      requestId: event.requestId ?? `${event.dataSourceId}:${event.resourceType}:cancel`,
      componentId: event.componentId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      context: event.context,
      durationMs: event.startedAt === undefined ? 0 : Date.now() - event.startedAt,
      ...(event.fieldCount === undefined ? {} : { fieldCount: event.fieldCount }),
      ...(event.rowCount === undefined ? {} : { rowCount: event.rowCount }),
      ...(event.code === undefined ? {} : { code: event.code }),
    });
  } catch {
    // Observer failures are isolated from rendering.
  }
}

export function createExecutionContext(
  state: RendererState,
  _dataSourceId: string,
  context: { readonly trigger: string; readonly traceId: string },
): ScreenResourceExecutionContext {
  return {
    instanceId: state.options.instanceId ?? 'renderer',
    mode: state.options.executionMode ?? 'viewer',
    trigger: context.trigger as ScreenResourceExecutionContext['trigger'],
    traceId: context.traceId,
    ...(state.options.projectId === undefined ? {} : { projectId: state.options.projectId }),
    ...(state.options.documentRevision === undefined
      ? {}
      : { documentRevision: state.options.documentRevision }),
  };
}

export function defaultExecutionContext(state: RendererState): ScreenResourceExecutionContext {
  return createExecutionContext(state, '', { trigger: 'manual', traceId: '' });
}

function isResourceTimeoutValid(value: number): boolean {
  return Number.isInteger(value) && value >= 100 && value <= 60_000;
}

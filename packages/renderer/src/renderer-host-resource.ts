import {
  normalizeScreenMaterialError,
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenJsonValue,
  type ScreenResourceExecutionContext,
} from '@base-screen/contracts';
import { validateScreenHostResourceBinding } from '@base-screen/core';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import type { ResolveContext } from './renderer.js';
import { diagnostic } from './renderer-diagnostics.js';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import { emitObserver, type RendererState } from './renderer-state.js';
import type { MountedMaterial, RenderCandidate } from './renderer-types.js';
import { cancelResourceState } from './resource-state.js';

export async function resolveHostResource(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  context: ResolveContext,
  refresh = false,
): Promise<void> {
  const source = candidate.component.dataSource;
  const resource = candidate.resource;
  if (source === null || source.type !== 'host-resource' || resource === undefined) {
    return;
  }
  const resourceState = mounted.resource;
  if (
    refresh &&
    state.coordinator !== undefined &&
    resourceState.requestSlotId !== undefined &&
    state.coordinator.isPending(resourceState.requestSlotId)
  ) {
    // 同一组件同一 raw identity 已在该组件的槽位上 in-flight：合并，不取消后
    // 重启。槽位按组件独立（未声明共享时），因此不会把不同组件的相同 raw
    // key 请求错误合并。
    return;
  }
  // Raw identity 变化（或上次请求已结束）时离开旧槽位：按不透明槽位 ID 释放，
  // 最后一个消费者离开会 abort 旧宿主请求。
  if (resourceState.requestSlotId !== undefined) {
    state.coordinator?.release(resourceState.requestSlotId, candidate.component.id);
  }
  cancelResourceState(resourceState);
  const generation = resourceState.resourceGeneration;
  resourceState.resourceKey = resource.key;
  resourceState.projectionKey = resource.projectionKey;
  // 按次解析的执行上下文：resolve、宿主端口与它的全部 observer 事件共享同一
  // 对象数据，且为本次操作独立派生（RB2）。
  const executionContext: ScreenResourceExecutionContext = {
    instanceId: state.options.instanceId ?? 'renderer',
    mode: state.options.executionMode ?? 'viewer',
    trigger: context.trigger,
    traceId: context.traceId,
    ...(state.options.projectId === undefined ? {} : { projectId: state.options.projectId }),
    ...(state.options.documentRevision === undefined
      ? {}
      : { documentRevision: state.options.documentRevision }),
  };
  resourceState.executionContext = executionContext;
  const requestId = `${candidate.component.id}:${resource.key}:${generation}`;
  const startedAt = Date.now();
  if (state.options.resourcePort === undefined) {
    emitObserver(
      state,
      'started',
      resource.key,
      candidate.component.id,
      requestId,
      executionContext,
      {
        startedAt,
      },
    );
    resourceState.rawValue = undefined;
    applyResourceResult(state, candidate.component.id, mounted, generation, {
      status: 'error',
      code: 'HOST_RESOURCE_UNAVAILABLE',
      message: 'Host resource port is unavailable.',
    });
    emitObserver(
      state,
      'failed',
      resource.key,
      candidate.component.id,
      requestId,
      executionContext,
      {
        startedAt,
        code: 'HOST_RESOURCE_UNAVAILABLE',
      },
    );
    return;
  }
  try {
    const { resolution, shared, slotId } = state.coordinator!.request(
      resource.key,
      source.resourceType,
      candidate.component.id,
      {
        componentId: candidate.component.id,
        resourceType: source.resourceType,
        resourceId: source.resourceId,
        params: resource.params,
      },
      executionContext,
    );
    resourceState.requestSlotId = slotId;
    if (!shared) {
      // 共享请求在首个消费者处发 started；后续消费者只发 shared（coordinator 回调）。
      emitObserver(
        state,
        'started',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
        },
      );
    }
    const resolutionValue = await resolution;
    if (resolutionValue.kind === 'timeout') {
      resourceState.rawValue = undefined;
      applyResourceResult(state, candidate.component.id, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_TIMEOUT',
        message: 'Host resource request timed out.',
      });
      emitObserver(
        state,
        'timed-out',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          code: 'HOST_RESOURCE_TIMEOUT',
        },
      );
      return;
    }
    if (resolutionValue.kind === 'failure') {
      resourceState.rawValue = undefined;
      // The host safe-failure diagnostic is normalized at the material state
      // boundary: frozen codes (access-denied/unavailable/valid dataset codes)
      // survive, unknown or internal codes collapse to HOST_RESOURCE_FAILED,
      // and the host path or raw message never reaches the material - for a
      // non-frozen code its message is discarded along with the code.
      const hostError = normalizeScreenMaterialError(resolutionValue.diagnostics.diagnostics[0]);
      applyResourceResult(state, candidate.component.id, mounted, generation, {
        status: 'error',
        code: hostError.code,
        message: hostError.message,
      });
      emitObserver(
        state,
        'failed',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          code: hostError.code,
        },
      );
      return;
    }
    const value = parseScreenJsonValue(resolutionValue.value, { maxBytes: 1024 * 1024 });
    if (!value.ok) {
      resourceState.rawValue = undefined;
      applyResourceResult(state, candidate.component.id, mounted, generation, {
        status: 'error',
        code: 'HOST_RESOURCE_INVALID',
        message: 'Host resource returned invalid JSON.',
      });
      emitObserver(
        state,
        'failed',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          code: 'HOST_RESOURCE_INVALID',
        },
      );
      return;
    }
    if (
      state.disposed ||
      state.mounted.get(candidate.component.id) !== mounted ||
      resourceState.resourceGeneration !== generation
    ) {
      return;
    }
    resourceState.rawValue = value.value;
    const current = state.candidates.get(candidate.component.id) ?? candidate;
    const adapted = adaptResourceResult(state, current, value.value);
    applyResourceResult(state, candidate.component.id, mounted, generation, adapted);
    if (adapted.status === 'ready') {
      const tabular = isTabularValue(adapted.value)
        ? (adapted.value as {
            readonly fields: readonly unknown[];
            readonly rows: readonly unknown[];
          })
        : undefined;
      emitObserver(
        state,
        'succeeded',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          fieldCount: tabular?.fields.length,
          rowCount: tabular?.rows.length,
        },
      );
      emitObserver(
        state,
        'adapted',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          fieldCount: tabular?.fields.length,
          rowCount: tabular?.rows.length,
        },
      );
    } else {
      emitObserver(
        state,
        'failed',
        resource.key,
        candidate.component.id,
        requestId,
        executionContext,
        {
          startedAt,
          ...('code' in adapted ? { code: adapted.code } : {}),
        },
      );
    }
  } catch {
    applyResourceResult(state, candidate.component.id, mounted, generation, {
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
    emitObserver(
      state,
      'failed',
      resource.key,
      candidate.component.id,
      requestId,
      executionContext,
      {
        startedAt,
        code: 'HOST_RESOURCE_FAILED',
      },
    );
  }
}

export function adaptResourceResult(
  state: RendererState,
  candidate: RenderCandidate,
  value: ScreenJsonValue,
): BaseScreenMaterialDataState {
  const source = candidate.component.dataSource;
  if (source === null || source.type !== 'host-resource' || source.binding === null) {
    return { status: 'ready', value };
  }
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Host dataset is invalid.',
    };
  }
  const declaration = candidate.entry.manifest.dataBinding;
  const adapter = candidate.entry.tabularDataAdapter;
  if (declaration === undefined || adapter === undefined) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Host dataset binding is invalid.',
    };
  }
  const binding = validateScreenHostResourceBinding(
    source.binding,
    dataset.value.fields,
    declaration.roles,
  );
  if (!binding.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Host dataset binding is invalid.',
    };
  }
  try {
    const adapted = adapter.adapt({ dataset: dataset.value, fields: binding.value.fields });
    if (!adapted.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: 'Host dataset adapter failed.',
      };
    }
    const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
    if (!parsed.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: 'Host dataset adapter failed.',
      };
    }
    return { status: 'ready', value: parsed.value };
  } catch {
    state.options.onDiagnostic?.(
      diagnostic(
        'PLUGIN_CORE_RENDER_FAILED',
        ['components', candidate.component.id, 'dataSource', 'binding'],
        'Material dataset adapter raised an exception.',
      ),
    );
    return {
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Host dataset adapter failed.',
    };
  }
}

export function applyResourceResult(
  state: RendererState,
  componentId: string,
  mounted: MountedMaterial,
  generation: number,
  dataState: BaseScreenMaterialDataState,
): void {
  const resourceState = mounted.resource;
  if (
    state.disposed ||
    state.mounted.get(componentId) !== mounted ||
    resourceState.resourceGeneration !== generation
  ) {
    return;
  }
  resourceState.dataState = dataState;
  const current = state.candidates.get(componentId);
  if (current !== undefined) {
    mounted.element.model = resolveEffectiveModel(state, current, dataState);
  }
}

function isTabularValue(value: ScreenJsonValue): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'fields' in value &&
    Array.isArray((value as { readonly fields: unknown }).fields) &&
    'rows' in value &&
    Array.isArray((value as { readonly rows: unknown }).rows)
  );
}

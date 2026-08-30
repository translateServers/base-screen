import type {
  ScreenComponentNode,
  ScreenHostResourceDataSource,
  ScreenJsonObject,
  ScreenJsonValue,
  ScreenResourceExecutionContext,
} from '@base-screen/contracts';
import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { canonicalJsonString } from '../canonical-json.js';

/**
 * Per-mounted-component resource lifecycle state. The renderer models each
 * mounted host-resource component with exactly this record so reconciliation
 * can retain the in-flight request, generation, raw query identity, projection
 * identity, the last validated raw host value, and the material-facing data
 * state across unrelated component/document edits. Host request cancellation
 * and deadline are owned by the ResourceRequestCoordinator.
 */
export type MountedResourceState = {
  /** Raw query identity: resourceType + resourceId + canonical evaluated params. */
  resourceKey: string | undefined;
  /** Projection identity derived from the field binding; re-adaptation trigger. */
  projectionKey: string | undefined;
  /** Material-facing data state (idle/loading/ready/error). */
  dataState: BaseScreenMaterialDataState;
  /** Last validated raw host value retained for local re-adaptation. */
  rawValue: ScreenJsonValue | undefined;
  /** Generation guard; every cancel bumps it so late results are suppressed. */
  resourceGeneration: number;
  /**
   * 不透明请求槽位 ID（RB1）：由协调器按次请求签发，释放/超时/进行中合并按它
   * 定位，绝不与 raw key 混用。未声明共享的相同 raw key 因此获得独立槽位。
   */
  requestSlotId: string | undefined;
  /** 最近一次 resolve 的执行上下文（RB2）：abort 等生命周期事件复用同一上下文。 */
  executionContext: ScreenResourceExecutionContext | undefined;
};

export function createMountedResourceState(): MountedResourceState {
  return {
    resourceKey: undefined,
    projectionKey: undefined,
    dataState: { status: 'idle' },
    rawValue: undefined,
    resourceGeneration: 0,
    requestSlotId: undefined,
    executionContext: undefined,
  };
}

/**
 * Cancels the current resource lifecycle exactly once: bumps the generation so
 * any in-flight promise, timeout callback, or late resolve/reject for the old
 * generation is rejected. The host request abort itself is owned by the
 * coordinator (last consumer leaves / key change / suspend / dispose).
 */
export function cancelResourceState(state: MountedResourceState): void {
  state.resourceGeneration++;
}

/**
 * Canonical raw query identity. The field binding is deliberately excluded:
 * binding changes only re-run the local projection and must not re-issue a host
 * query. Evaluated params use the deterministic canonical representation so the
 * key does not depend on parameter object insertion order.
 */
export function getHostResourceKey(
  component: ScreenComponentNode,
  params: ScreenJsonObject,
): string {
  const source = component.dataSource;
  if (source === null || source.type !== 'host-resource') {
    throw new Error('Host resource key requires a host-resource source.');
  }
  return `${source.resourceType}\u0000${source.resourceId}\u0000${canonicalJsonString(params)}`;
}

/** Projection identity derived from the field binding (or the literal null). */
export function getProjectionKey(source: ScreenHostResourceDataSource): string {
  return canonicalJsonString(source.binding as unknown as ScreenJsonValue);
}

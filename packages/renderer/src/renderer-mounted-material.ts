import type { ScreenDocument } from '@base-screen/contracts';
import { parseBaseScreenMaterialEventDetail } from '@base-screen/plugin-core';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import { adaptResourceResult } from './renderer-host-resource.js';
import { applyMaterial } from './renderer-material-dom.js';
import { cancelHostResource, type RendererState } from './renderer-state.js';
import type { MountedMaterial, RenderCandidate } from './renderer-types.js';

/**
 * Reconciles an already-mounted material. Returns the candidate whose first
 * resolve must be started after the render commit (new raw identity), or
 * undefined when no resolve should start. Starting the resolve here would run
 * before `#mounted`/`#candidates` are committed, so a synchronous terminal
 * path could never apply to the current mount.
 */
export function reconcileMountedMaterial(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  document: ScreenDocument,
  stackOrder: number,
): RenderCandidate | undefined {
  const resource = candidate.resource;
  const resourceState = mounted.resource;
  if (resource === undefined) {
    // Data source removed (or parameters became unevaluable): cancel the old
    // generation exactly once, clear the raw/projection keys and retained raw
    // value, and let the candidate dataState (idle/static/error) win.
    cancelHostResource(state, mounted, candidate.component.id);
    resourceState.resourceKey = undefined;
    resourceState.projectionKey = undefined;
    resourceState.rawValue = undefined;
    resourceState.requestSlotId = undefined;
    resourceState.dataState = candidate.model.dataState;
    applyMountedModel(state, candidate, mounted, document, stackOrder);
    return undefined;
  }
  if (resourceState.resourceKey !== resource.key) {
    // New raw identity: the render loop starts the resolve after the commit.
    resourceState.rawValue = undefined;
    resourceState.dataState = { status: 'loading' };
    applyMountedModel(state, candidate, mounted, document, stackOrder);
    return candidate;
  }
  // Same raw identity: preserve the in-flight request, controller, timer,
  // generation, retained raw value and current dataState. Unrelated edits must
  // neither abort nor re-fetch. A projection/binding-only change re-validates
  // and re-adapts locally from the retained raw value with zero host resolves.
  if (resourceState.projectionKey !== resource.projectionKey) {
    if (resourceState.rawValue !== undefined) {
      resourceState.dataState = adaptResourceResult(state, candidate, resourceState.rawValue);
    }
    resourceState.projectionKey = resource.projectionKey;
  }
  applyMountedModel(state, candidate, mounted, document, stackOrder);
  return undefined;
}

export function applyMountedModel(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  document: ScreenDocument,
  stackOrder: number,
): void {
  applyMaterial(
    mounted.element,
    candidate.component,
    document,
    resolveEffectiveModel(state, candidate, mounted.resource.dataState),
    state.visibility.isHidden(candidate.component.id),
    stackOrder,
  );
}

export function handleMaterialEvent(
  state: RendererState,
  candidate: RenderCandidate,
  event: Event,
): void {
  if (
    event.bubbles !== true ||
    event.composed !== true ||
    event.type !== 'base-screen-material-event'
  ) {
    return;
  }
  // 闭包捕获的 candidate 只用于定位组件；interactive/manifest 校验必须读取最近一次
  // render 的候选，否则 setInteractive 重渲染后事件仍按旧模型裁决（可能被错误门控）。
  const current = state.candidates.get(candidate.component.id) ?? candidate;
  if (current.model.interactive !== true) {
    return;
  }
  const parsed = parseBaseScreenMaterialEventDetail((event as CustomEvent<unknown>).detail);
  if (!parsed.ok || !current.entry.manifest.events.includes(parsed.value.name)) {
    return;
  }
  event.stopPropagation();
  try {
    state.options.onMaterialEvent?.({
      componentId: current.component.id,
      type: current.component.type,
      name: parsed.value.name,
      payload: parsed.value.payload,
    });
  } catch {
    state.options.onDiagnostic?.({
      severity: 'error',
      code: 'PLUGIN_CORE_RENDER_FAILED',
      path: ['components', current.component.id],
      message: 'Host material event callback raised an exception.',
    });
  }
}

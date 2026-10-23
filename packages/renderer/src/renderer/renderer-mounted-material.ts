import { parseBaseScreenMaterialEventDetail } from '@base-screen/plugin-core';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import { applyMaterial } from './renderer-material-dom.js';
import type { RendererState } from './renderer-state.js';
import type { MountedMaterial, RenderCandidate } from './renderer-types.js';

/**
 * 复用已挂载物料：只更新模型与投影状态。
 *
 * 请求与缓存已在 `DataSourceRuntime` 上按实例共享，所以这里没有「首次 resolve」要推迟；
 * 数据状态由候选（读运行时）决定，映射变化只重跑本地投影，不碰任何请求。
 */
export function reconcileMountedMaterial(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  stackOrder: number,
): void {
  mounted.stackOrder = stackOrder;
  mounted.projection.projectionKey = candidate.dataSource?.projectionKey;
  mounted.projection.dataState = candidate.model.dataState;
  applyMountedModel(state, candidate, mounted, stackOrder);
}

export function applyMountedModel(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  stackOrder: number,
): void {
  applyMaterial(
    mounted.element,
    candidate.component,
    resolveEffectiveModel(state, candidate, candidate.model.dataState),
    state.visibility.isHidden(candidate.component.id),
    stackOrder,
  );
}

/**
 * 宿主告警状态变化后的样式-only 重算：只重写 effective model，不碰几何、transform、
 * display 与 zIndex，因此不会打断画布手势或造成布局抖动。
 */
export function applyMountedConditionalStyle(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
): void {
  mounted.element.model = resolveEffectiveModel(state, candidate, candidate.model.dataState);
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

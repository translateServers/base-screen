import { parseBaseScreenMaterialEventDetail } from '@base-screen/plugin-core';
import { resolveEffectiveModel } from './renderer-effective-style.js';
import {
  applyMaterial,
  applyMaterialDisplay,
  applyMaterialFrame,
} from './renderer-material-dom.js';
import type { RendererState } from './renderer-state.js';
import type { AppliedModelKey, MountedMaterial, RenderCandidate } from './renderer-types.js';

/**
 * 复用已挂载物料：只更新投影状态；输入签名与上次写入 model 时全等则只重跑
 * 几何帧与 display 收尾（全部同值守卫、值未变零写入），跳过 effective model
 * 求值与 `element.model` 重赋值——未变组件不再触发物料的 `renderMaterial()`。
 * 请求与缓存已在 `DataSourceRuntime` 上按实例共享；数据状态由候选（读运行时）
 * 决定，映射变化只重跑本地投影，不碰任何请求。
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
  const applied = appliedModelKeyOf(state, candidate, stackOrder);
  if (
    mounted.applied !== undefined &&
    mounted.appliedModel !== undefined &&
    sameAppliedModelKey(mounted.applied, applied)
  ) {
    applyMaterialFrame(mounted.element, candidate.component, mounted.appliedModel, stackOrder);
    applyMaterialDisplay(mounted.element, state.visibility.isHidden(candidate.component.id));
    return;
  }
  applyMountedModel(state, candidate, mounted, stackOrder);
}

export function applyMountedModel(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  stackOrder: number,
): void {
  const model = resolveEffectiveModel(state, candidate, candidate.model.dataState);
  applyMaterial(
    mounted.element,
    candidate.component,
    model,
    state.visibility.isHidden(candidate.component.id),
    stackOrder,
  );
  mounted.applied = appliedModelKeyOf(state, candidate, stackOrder);
  mounted.appliedModel = model;
}

export function appliedModelKeyOf(
  state: RendererState,
  candidate: RenderCandidate,
  stackOrder: number,
): AppliedModelKey {
  return {
    component: candidate.component,
    entry: candidate.entry,
    interactive: candidate.model.interactive,
    stackOrder,
    hidden: state.visibility.isHidden(candidate.component.id),
    dataEpoch: candidate.dataEpoch,
  };
}

function sameAppliedModelKey(left: AppliedModelKey, right: AppliedModelKey): boolean {
  return (
    left.component === right.component &&
    left.entry === right.entry &&
    left.interactive === right.interactive &&
    left.stackOrder === right.stackOrder &&
    left.hidden === right.hidden &&
    left.dataEpoch === right.dataEpoch
  );
}

/**
 * 宿主告警状态变化后的样式-only 重算：只重写 effective model，不碰几何、transform、
 * display 与 zIndex，因此不会打断画布手势或造成布局抖动。
 *
 * 刻意不更新 `mounted.applied`：本次重写不改任何守卫输入，下一次渲染守卫命中时
 * 保留（而不是覆盖回）这次端口刷新的结果；但会同步 `appliedModel`，守卫命中时的
 * 几何/显示帧要读它的翻转与透明度。
 */
export function applyMountedConditionalStyle(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
): void {
  const model = resolveEffectiveModel(state, candidate, candidate.model.dataState);
  mounted.element.model = model;
  mounted.appliedModel = model;
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

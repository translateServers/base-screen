import type { ScreenDocument } from '@base-screen/contracts';
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
  document: ScreenDocument,
): void {
  mounted.stackOrder = stackOrder;
  mounted.projection.projectionKey = candidate.dataSource?.projectionKey;
  mounted.projection.dataState = candidate.model.dataState;
  const applied = appliedModelKeyOf(state, candidate, stackOrder, document);
  if (
    mounted.applied !== undefined &&
    mounted.appliedModel !== undefined &&
    sameAppliedModelKey(mounted.applied, applied)
  ) {
    applyMaterialFrame(mounted.element, candidate.component, mounted.appliedModel, stackOrder);
    applyMaterialDisplay(mounted.element, state.visibility.isHidden(candidate.component.id));
    return;
  }
  applyMountedModel(state, candidate, mounted, stackOrder, document);
}

/**
 * 复用路径必须显式接收本次渲染的文档：`state.document` 要到本次 render 末尾才更新，
 * 从这里读主题会按上一份文档的 palette 解析条件样式与 `theme:<slot>`。
 */
export function applyMountedModel(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  stackOrder: number,
  document: ScreenDocument,
): void {
  const model = resolveEffectiveModel(state, candidate, candidate.model.dataState, document);
  applyMaterial(
    mounted.element,
    candidate.component,
    model,
    state.visibility.isHidden(candidate.component.id),
    stackOrder,
  );
  mounted.applied = appliedModelKeyOf(state, candidate, stackOrder, document);
  mounted.appliedModel = model;
}

export function appliedModelKeyOf(
  state: RendererState,
  candidate: RenderCandidate,
  stackOrder: number,
  document: ScreenDocument,
): AppliedModelKey {
  return {
    component: candidate.component,
    entry: candidate.entry,
    interactive: candidate.model.interactive,
    stackOrder,
    hidden: state.visibility.isHidden(candidate.component.id),
    dataEpoch: candidate.dataEpoch,
    theme: document.theme,
    stateId: state.componentStates.resolve(state, candidate, candidate.model.dataState),
  };
}

function sameAppliedModelKey(left: AppliedModelKey, right: AppliedModelKey): boolean {
  return (
    left.component === right.component &&
    left.entry === right.entry &&
    left.interactive === right.interactive &&
    left.stackOrder === right.stackOrder &&
    left.hidden === right.hidden &&
    left.dataEpoch === right.dataEpoch &&
    left.theme === right.theme &&
    left.stateId === right.stateId
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

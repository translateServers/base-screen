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
 *
 * 只有显隐不同（切换画板、蓝图显隐）也不重写 model：display 不参与 model 求值。前提是上次
 * 写入 model 时物料是可见的——隐藏期间写入的物料（如首屏就隐藏的页面组件）可能按 0 尺寸
 * 排版，重新显示时仍要完整重写一次。`applied` 保持「上次写入 model 时」的签名不变，
 * 因此 `applied.hidden` 始终表示最近一次写入时的显隐。
 */
export function reconcileMountedMaterial(
  state: RendererState,
  candidate: RenderCandidate,
  mounted: MountedMaterial,
  stackOrder: number,
  document: ScreenDocument,
  opacity: number,
): void {
  mounted.stackOrder = stackOrder;
  mounted.projection.projectionKey = candidate.dataSource?.projectionKey;
  mounted.projection.dataState = candidate.model.dataState;
  const applied = appliedModelKeyOf(state, candidate, stackOrder, document);
  if (
    mounted.applied !== undefined &&
    mounted.appliedModel !== undefined &&
    (sameAppliedModelKey(mounted.applied, applied) || onlyDisplayDiffers(mounted.applied, applied))
  ) {
    applyMaterialFrame(
      mounted.element,
      candidate.component,
      mounted.appliedModel,
      stackOrder,
      opacity,
    );
    applyMaterialDisplay(mounted.element, applied.hidden);
    return;
  }
  applyMountedModel(state, candidate, mounted, stackOrder, document, opacity);
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
  opacity: number,
): void {
  const model = resolveEffectiveModel(state, candidate, candidate.model.dataState, document);
  applyMaterial(
    mounted.element,
    candidate.component,
    model,
    state.visibility.isHidden(candidate.component.id),
    stackOrder,
    opacity,
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
    // 按宿主传入的组件判定：解析会把首次出现的引用克隆一份，下一次渲染又原样复用输入引用。
    component: state.componentSources.get(candidate.component) ?? candidate.component,
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

/**
 * 两份签名只差显隐，且上次写入 model 时物料可见：此时 model 输入与元素上生效的 model 相同，
 * 改 display 就够了。上次写入时隐藏则返回 false，显示时走完整重写。
 *
 * 显隐来自组件 `status`（作者隐藏、设计器把画板外组件标成隐藏锁定）时组件引用也会变，
 * 所以组件按「除 `status` 外逐字段同引用」比较——`status` 不进 model。
 */
function onlyDisplayDiffers(applied: AppliedModelKey, next: AppliedModelKey): boolean {
  return (
    !applied.hidden &&
    next.hidden &&
    sameComponentExceptStatus(applied.component, next.component) &&
    sameAppliedModelKey(applied, { ...next, component: applied.component, hidden: false })
  );
}

function sameComponentExceptStatus(
  left: AppliedModelKey['component'],
  right: AppliedModelKey['component'],
): boolean {
  if (left === right) return true;
  const leftRecord = left as unknown as Readonly<Record<string, unknown>>;
  const rightRecord = right as unknown as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) return false;
  for (const key of leftKeys) {
    if (key === 'status') continue;
    if (!(key in rightRecord) || leftRecord[key] !== rightRecord[key]) return false;
  }
  return true;
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

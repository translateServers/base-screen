import type { ScreenComponentNode } from '@base-screen/contracts';
import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';

export function applyMaterial(
  element: BaseScreenMaterialElement,
  component: ScreenComponentNode,
  model: BaseScreenMaterialModel,
  effectivelyHidden: boolean,
  stackOrder: number,
): void {
  applyMaterialFrame(element, component, model, stackOrder);
  element.model = model;
  applyMaterialDisplay(element, effectivelyHidden);
}

/**
 * 几何帧：position、size、zIndex、transform、opacity 的写入。每次 reconcile 都要
 * 跑，但全部走同值守卫——先读后写，未变更属性的写次数为 0，不触发 CSSOM 写入。
 * 不含 display：display 必须在 model 赋值之后收尾（见 `applyMaterialDisplay`）。
 */
export function applyMaterialFrame(
  element: BaseScreenMaterialElement,
  component: ScreenComponentNode,
  model: BaseScreenMaterialModel,
  stackOrder: number,
): void {
  const position = component.position;
  const style = element.style;
  if (style.position !== 'absolute') style.position = 'absolute';
  const left = `${position.x}px`;
  if (style.left !== left) style.left = left;
  const top = `${position.y}px`;
  if (style.top !== top) style.top = top;
  const width = `${component.size.width}px`;
  // 物料自行声明的 max-content 宽度（如自适应文本）在 model 未重赋值时必须保留：
  // 几何帧每次 reconcile 都跑，不能把它重新写成 canonical 保存宽度。
  if (style.width !== 'max-content' && style.width !== width) style.width = width;
  const height = `${component.size.height}px`;
  if (style.height !== height) style.height = height;
  // Core painter order makes root subtrees indivisible spans. A unique order avoids child zIndex
  // values escaping their root subtree while Material elements remain mounted on the canvas root.
  const zIndex = String(stackOrder);
  if (style.zIndex !== zIndex) style.zIndex = zIndex;
  if (element.dataset.baseScreenComponentId !== component.id) {
    element.dataset.baseScreenComponentId = component.id;
  }
  if (style.transformOrigin !== 'center') style.transformOrigin = 'center';
  const rotate = `rotate(${component.rotation}deg)`;
  const scaleX = model.style.flipX === true ? -1 : 1;
  const scaleY = model.style.flipY === true ? -1 : 1;
  const transform = scaleX === 1 && scaleY === 1 ? rotate : `${rotate} scale(${scaleX}, ${scaleY})`;
  if (style.transform !== transform) style.transform = transform;
  const opacity =
    typeof model.style.opacity === 'number' && Number.isFinite(model.style.opacity)
      ? String(Math.min(1, Math.max(0, model.style.opacity)))
      : '';
  if (style.opacity !== opacity) style.opacity = opacity;
}

/**
 * display 收尾：必须在 `element.model = model` 之后写——物料的 model setter 可能
 * 覆盖宿主元素 display，隐藏裁剪要留在最后生效。守卫命中（跳过 model 重赋值）
 * 时同样要跑，蓝图可见性在渲染之外改写的 display 由此恢复。
 */
export function applyMaterialDisplay(
  element: BaseScreenMaterialElement,
  effectivelyHidden: boolean,
): void {
  const display = effectivelyHidden ? 'none' : 'block';
  if (element.style.display !== display) element.style.display = display;
}

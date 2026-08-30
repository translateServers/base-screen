import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialElement, BaseScreenMaterialModel } from '@base-screen/plugin-core';

export function applyMaterial(
  element: BaseScreenMaterialElement,
  component: ScreenComponentNode,
  document: ScreenDocument,
  model: BaseScreenMaterialModel,
  effectivelyHidden: boolean,
  stackOrder: number,
): void {
  const position = component.position;
  // 同值守卫：reconcile 路径每次 render 都会重写全部几何样式；先读后写把
  // 未变更属性的写次数降为 0，避免无关变更（如选区变化）触发全量 CSSOM 写入。
  const style = element.style;
  if (style.position !== 'absolute') style.position = 'absolute';
  const left = `${position.x}px`;
  if (style.left !== left) style.left = left;
  const top = `${position.y}px`;
  if (style.top !== top) style.top = top;
  const width = `${component.size.width}px`;
  if (style.width !== width) style.width = width;
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
  element.model = model;
  const display = effectivelyHidden ? 'none' : 'block';
  if (style.display !== display) style.display = display;
}

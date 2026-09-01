import type { ScreenSize } from '@base-screen/contracts';

/** 读取官方图片物料宿主投影的内部自然尺寸，不穿透物料内部 DOM。 */
export function readDesignerImageNaturalSize(
  root: ParentNode | undefined,
  componentId: string,
): ScreenSize | undefined {
  if (root === undefined) return undefined;
  for (const element of root.querySelectorAll<HTMLElement>('[data-base-screen-component-id]')) {
    if (element.dataset.baseScreenComponentId !== componentId) continue;
    const width = Number(element.dataset.baseScreenImageNaturalWidth);
    const height = Number(element.dataset.baseScreenImageNaturalHeight);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { width, height }
      : undefined;
  }
  return undefined;
}

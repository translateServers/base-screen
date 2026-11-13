const SKELETON_ATTRIBUTE = 'data-viewer-skeleton';

const SKELETON_STYLE = `
[${SKELETON_ATTRIBUTE}] {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  background: rgba(127, 127, 127, 0.12);
  background: color-mix(in srgb, currentColor 10%, transparent);
  animation: base-screen-viewer-skeleton-pulse 1.4s ease-in-out infinite;
}
@keyframes base-screen-viewer-skeleton-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  [${SKELETON_ATTRIBUTE}] {
    animation: none;
  }
}
`;

export function createViewerSkeletonStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.setAttribute('data-viewer-skeleton-style', 'true');
  style.textContent = SKELETON_STYLE;
  return style;
}

/**
 * Viewer 首帧骨架：runtime、catalog 或文档就绪前先铺满整个查看区域，
 * 避免宿主已经挂载 `<base-screen-viewer>` 却看到空白。
 *
 * 骨架留在 Shadow Root 上而不是渲染器挂载根里：文档未渲染时挂载根还没有
 * 画布尺寸，放进去会塌成 0 高。首次渲染落定后整体移除。
 */
export function createViewerSkeleton(ownerDocument: Document): HTMLDivElement {
  const skeleton = ownerDocument.createElement('div');
  skeleton.setAttribute(SKELETON_ATTRIBUTE, 'true');
  skeleton.setAttribute('aria-hidden', 'true');
  return skeleton;
}

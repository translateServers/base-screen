/**
 * 推送实例过期标记的默认呈现（ADR-0104 §2.6）。
 *
 * 物料基类在 `ready && stale` 时给宿主元素打 `data-base-screen-data-stale`；查看器在 Shadow
 * Root 里，宿主样式选不中它，所以这里给一个默认的角标状态点。不用 `opacity` / `filter`：
 * 两者都是渲染器内联写到物料宿主上的保留样式（ADR-0099 §2.3），样式表盖不过内联。
 *
 * 宿主可在 `<base-screen-viewer>` 上用继承的自定义属性覆盖：
 * - `--base-screen-stale-indicator-display: none` 关闭；
 * - `--base-screen-stale-indicator-color` 改颜色。
 */
const STALE_STYLE = `
[data-base-screen-data-stale]::after {
  content: '';
  display: var(--base-screen-stale-indicator-display, block);
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--base-screen-stale-indicator-color, #f5a623);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  z-index: 1;
}
`;

export const VIEWER_STALE_STYLE_ATTRIBUTE = 'data-viewer-stale-style';

export function createViewerStaleStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.setAttribute(VIEWER_STALE_STYLE_ATTRIBUTE, 'true');
  style.textContent = STALE_STYLE;
  return style;
}

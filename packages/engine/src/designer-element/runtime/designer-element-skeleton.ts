import { createDesignerWorkspaceSkeleton } from '../../browser/dom/workspace/designer-workspace-skeleton.js';
import {
  adoptDesignerStyleSheets,
  createDesignerStyle,
} from '../../browser/styles/designer-style.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

const SKELETON_SELECTOR = '[data-designer-skeleton]';

/**
 * 连接后、catalog 到达前的首帧：先挂与最终栅格同尺寸的骨架，宿主可以立即
 * 把元素放进页面，不必等待运行时、在线物料或项目数据。
 */
export function initializeDesignerSkeleton(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (!element.isConnected || elementState.catalog !== undefined) return;
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  if (shadow.querySelector(SKELETON_SELECTOR) !== null) return;
  // 优先挂共享构造样式表（多实例单一 CSSOM 副本）；环境不支持时回退 style 元素。
  const styleFallback = adoptDesignerStyleSheets(shadow)
    ? []
    : [createDesignerStyle(element.ownerDocument)];
  shadow.replaceChildren(...styleFallback, createDesignerWorkspaceSkeleton(element.ownerDocument));
  elementState.skeletonShown = true;
  element.setAttribute('data-designer-state', 'loading');
}

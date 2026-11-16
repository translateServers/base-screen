import { createDesignerWorkspaceSkeleton } from '../../browser/dom/workspace/designer-workspace-skeleton.js';
import {
  adoptDesignerStyleSheets,
  createDesignerStyle,
} from '../../browser/styles/designer-style.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

const SKELETON_SELECTOR = '[data-designer-skeleton]';
const STAGE_SELECTOR = '[data-skeleton-size="stage"]';

/**
 * catalog 迟迟不到时的兜底时限：超过后把脉冲骨架切换为可识别的错误态，
 * 避免宿主界面永久停在加载动画里。catalog 之后到达仍可正常初始化。
 */
export const SKELETON_TIMEOUT_MS = 15_000;

/**
 * 连接后、catalog 到达前的首帧：先挂与最终栅格同尺寸的骨架，宿主可以立即
 * 把元素放进页面，不必等待运行时、在线物料或项目数据。
 */
export function initializeDesignerSkeleton(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (!element.isConnected || elementState.catalog !== undefined) return;
  const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
  if (shadow.querySelector(SKELETON_SELECTOR) === null) {
    // 优先挂共享构造样式表（多实例单一 CSSOM 副本）；环境不支持时回退 style 元素。
    const styleFallback = adoptDesignerStyleSheets(shadow)
      ? []
      : [createDesignerStyle(element.ownerDocument)];
    shadow.replaceChildren(
      ...styleFallback,
      createDesignerWorkspaceSkeleton(element.ownerDocument),
    );
    elementState.skeletonShown = true;
    element.setAttribute('data-designer-state', 'loading');
  }
  scheduleSkeletonTimeout(element);
}

/** 完整初始化成功或断连时撤销兜底计时，避免迟到的超时覆盖真实状态。 */
export function cancelDesignerSkeletonTimeout(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (elementState.skeletonTimeout === undefined) return;
  clearTimeout(elementState.skeletonTimeout);
  elementState.skeletonTimeout = undefined;
}

function scheduleSkeletonTimeout(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (elementState.skeletonTimeout !== undefined) return;
  elementState.skeletonTimeout = setTimeout(() => {
    elementState.skeletonTimeout = undefined;
    failDesignerSkeleton(element);
  }, SKELETON_TIMEOUT_MS);
}

function failDesignerSkeleton(element: DesignerElementHost): void {
  const elementState = getDesignerElementState(element);

  if (
    !element.isConnected ||
    elementState.catalog !== undefined ||
    elementState.renderer !== undefined
  ) {
    return;
  }
  const skeleton = element.shadowRoot?.querySelector<HTMLElement>(SKELETON_SELECTOR) ?? null;
  if (skeleton === null) return;
  skeleton.setAttribute('data-designer-skeleton-state', 'error');
  skeleton.removeAttribute('aria-busy');
  const stage = skeleton.querySelector(STAGE_SELECTOR);
  if (stage !== null) stage.replaceWith(createSkeletonError(element.ownerDocument));
  element.setAttribute('data-designer-state', 'error');
  element.setAttribute('aria-busy', 'false');
}

function createSkeletonError(ownerDocument: Document): HTMLElement {
  const notice = ownerDocument.createElement('p');
  notice.className = 'designer-skeleton-error';
  notice.setAttribute('role', 'status');
  notice.textContent = DESIGNER_UI_TEXT.loadingTimedOut;
  return notice;
}

import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

/**
 * 首帧骨架：复用 `.designer` 的栅格与面板宽度，保证被完整工作区替换时
 * 不产生尺寸或位置变化。所有占位块只做视觉占位，不承载交互。
 */
export function designerWorkspaceSkeletonMarkup(): string {
  return `
    <header class="designer-topbar designer-skeleton-topbar" aria-hidden="true">
      <span class="designer-skeleton-block" data-skeleton-size="brand"></span>
      <span class="designer-skeleton-block" data-skeleton-size="tools"></span>
      <span class="designer-skeleton-block" data-skeleton-size="actions"></span>
    </header>
    <aside class="rail designer-skeleton-panel" aria-hidden="true">
      <span class="designer-skeleton-block" data-skeleton-size="tabs"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
    </aside>
    <div class="workspace designer-skeleton-workspace" aria-hidden="true">
      <span class="designer-skeleton-block" data-skeleton-size="stage"></span>
    </div>
    <aside class="properties designer-skeleton-panel" aria-hidden="true">
      <span class="designer-skeleton-block" data-skeleton-size="tabs"></span>
      <span class="designer-skeleton-block" data-skeleton-size="heading"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
      <span class="designer-skeleton-block" data-skeleton-size="row"></span>
    </aside>
    <footer class="statusbar designer-skeleton-status" aria-hidden="true">
      <span class="designer-skeleton-block" data-skeleton-size="status"></span>
    </footer>`;
}

export function createDesignerWorkspaceSkeleton(ownerDocument: Document): HTMLElement {
  const layout = ownerDocument.createElement('section');
  layout.className = 'designer';
  layout.dataset.designerSkeleton = 'true';
  layout.setAttribute('aria-busy', 'true');
  layout.setAttribute('aria-label', DESIGNER_UI_TEXT.loading);
  layout.innerHTML = designerWorkspaceSkeletonMarkup();
  return layout;
}

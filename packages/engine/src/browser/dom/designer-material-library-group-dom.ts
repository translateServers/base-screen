import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import type { BaseScreenMaterialLibraryGrouping } from '../../material-library-grouping.js';
import {
  materialLibraryGroupChildren,
  materialLibraryGroupMaterialTypes,
  materialLibraryGroupPath,
} from '../../material-library-grouping.js';

export function renderMaterialLibraryGroupNavigation(
  layout: ParentNode,
  grouping: BaseScreenMaterialLibraryGrouping | undefined,
  selectedGroupId: string | undefined,
): void {
  const navigation = layout.querySelector<HTMLElement>('[data-material-groups]');
  if (navigation === null) return;

  navigation.replaceChildren();
  navigation.hidden = grouping === undefined;
  if (grouping === undefined) return;

  const breadcrumbs = navigation.ownerDocument.createElement('div');
  breadcrumbs.className = 'material-group-breadcrumbs';
  breadcrumbs.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroupPath);
  const all = navigation.ownerDocument.createElement('button');
  all.type = 'button';
  all.className = 'designer-control designer-button material-group-breadcrumb-button';
  all.dataset.materialGroupAll = 'true';
  all.ariaPressed = String(selectedGroupId === undefined);
  all.textContent = DESIGNER_UI_TEXT.allMaterialGroups;
  breadcrumbs.appendChild(all);

  const path =
    selectedGroupId === undefined ? [] : materialLibraryGroupPath(grouping, selectedGroupId);
  for (const [index, group] of path.entries()) {
    const separator = navigation.ownerDocument.createElement('span');
    separator.className = 'material-group-breadcrumb-separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '/';
    const breadcrumb = navigation.ownerDocument.createElement('button');
    breadcrumb.type = 'button';
    breadcrumb.className = 'designer-control designer-button material-group-breadcrumb-button';
    breadcrumb.dataset.materialGroupBreadcrumb = group.id;
    breadcrumb.ariaPressed = String(index === path.length - 1);
    breadcrumb.ariaLabel = DESIGNER_UI_TEXT.materialGroupSelect(group.label);
    breadcrumb.textContent = group.label;
    breadcrumbs.append(separator, breadcrumb);
  }

  const groups = navigation.ownerDocument.createElement('div');
  groups.className = 'material-group-children';
  groups.setAttribute('role', 'group');
  groups.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroups);
  for (const group of materialLibraryGroupChildren(grouping, selectedGroupId)) {
    const button = navigation.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'designer-control designer-button material-group-button';
    button.dataset.materialGroup = group.id;
    button.ariaPressed = String(group.id === selectedGroupId);
    button.ariaLabel = DESIGNER_UI_TEXT.materialGroupSelect(group.label);
    const label = navigation.ownerDocument.createElement('span');
    label.className = 'material-group-label';
    label.textContent = group.label;
    const materialCount = materialLibraryGroupMaterialTypes(grouping, group.id).length;
    const count = navigation.ownerDocument.createElement('span');
    count.className = 'material-group-count';
    count.textContent = String(materialCount);
    count.ariaLabel = DESIGNER_UI_TEXT.materialGroupCount(materialCount);
    button.append(label, count);
    groups.appendChild(button);
  }

  navigation.append(breadcrumbs, groups);
  attachGroupRowScrollAffordance(breadcrumbs, true);
  attachGroupRowScrollAffordance(groups, false);
}

// 内容溢出时的滚动可用性：隐藏原生滚动条后，用 data-scroll-start/end 驱动边缘渐隐提示，
// 并把纵向滚轮映射为横向滚动（仅在本行还能滚动时拦截，保证滚动链传递给面板）。
// revealEnd 用于面包屑：进入深层分组时把当前层级（最右）滚动进可视区。
function attachGroupRowScrollAffordance(row: HTMLElement, revealEnd: boolean): void {
  const updateScrollState = () => {
    const max = row.scrollWidth - row.clientWidth;
    row.dataset.scrollStart = String(row.scrollLeft > 1);
    row.dataset.scrollEnd = String(row.scrollLeft < max - 1);
  };
  row.addEventListener('scroll', updateScrollState, { passive: true });
  row.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0) return;
      const next = Math.min(Math.max(row.scrollLeft + event.deltaY * unit, 0), max);
      if (next === row.scrollLeft) return;
      event.preventDefault();
      row.scrollLeft = next;
    },
    { passive: false },
  );
  if (revealEnd) row.scrollLeft = Math.max(row.scrollWidth - row.clientWidth, 0);
  updateScrollState();
}

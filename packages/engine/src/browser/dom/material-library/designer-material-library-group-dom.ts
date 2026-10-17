import {
  type BaseScreenMaterialLibraryGrouping,
  materialLibraryGroupMaterialTypes,
  materialLibraryGroupPath,
} from '../../../common/operations/material-library/material-library-grouping.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import { materialCategoryIcon } from './designer-material-library-dom.js';
import {
  type DesignerMaterialGroupButton,
  type DesignerMaterialGroupView,
  getMaterialGroupView,
  renderMaterialGroupButtons,
} from './designer-material-library-group-view.js';

export function renderMaterialLibraryGroupNavigation(
  layout: ParentNode,
  grouping: BaseScreenMaterialLibraryGrouping | undefined,
  selectedGroupId: string | undefined,
): DesignerMaterialGroupView | undefined {
  const navigation = layout.querySelector<HTMLElement>('[data-material-groups]');
  if (navigation === null) return undefined;

  navigation.hidden = grouping === undefined;
  const inline = layout.querySelector<HTMLElement>('[data-material-group-inline]');
  const trigger = layout.querySelector<HTMLButtonElement>('[data-material-group-toggle]');
  const content = layout.querySelector<HTMLElement>('[data-material-library-content]');
  if (inline !== null) inline.hidden = grouping === undefined;
  if (trigger !== null) trigger.hidden = grouping === undefined;
  if (content !== null) content.dataset.materialGrouped = String(grouping !== undefined);
  if (grouping === undefined) {
    navigation.replaceChildren();
    return undefined;
  }

  const view = getMaterialGroupView(navigation);
  const path =
    selectedGroupId === undefined ? [] : materialLibraryGroupPath(grouping, selectedGroupId);
  const selected = path.at(-1);
  // A leaf keeps its siblings visible; a branch becomes the next browsing level.
  const branchPath =
    selected?.children !== undefined || path.length <= 1 ? path : path.slice(0, -1);
  const branch = branchPath.at(-1);
  const parent = branchPath.at(-2);
  const pathLabel = [DESIGNER_UI_TEXT.allMaterialGroups, ...path.map((group) => group.label)].join(
    ' / ',
  );
  const branchChanged = navigation.dataset.materialGroupBranch !== (branch?.id ?? '');
  navigation.dataset.materialGroupBranch = branch?.id ?? '';
  view.heading.textContent = parent?.label ?? '';
  view.back.hidden = parent === undefined;
  view.back.dataset.materialGroupBreadcrumb = parent?.id ?? '';
  view.back.setAttribute(
    'data-tip',
    parent === undefined
      ? DESIGNER_UI_TEXT.materialGroupBack
      : DESIGNER_UI_TEXT.materialGroupBackTo(
          branchPath
            .slice(0, -1)
            .map((group) => group.label)
            .join(' / '),
        ),
  );
  view.back.setAttribute('aria-description', view.back.getAttribute('data-tip') ?? '');
  if (trigger !== null) {
    trigger.setAttribute('data-tip', pathLabel);
    trigger.setAttribute('aria-label', DESIGNER_UI_TEXT.materialGroupChoose(pathLabel));
    const label = trigger.querySelector<HTMLElement>('[data-material-group-toggle-label]');
    if (label !== null) label.textContent = selected?.label ?? DESIGNER_UI_TEXT.allMaterialGroups;
  }

  const allCount = materialLibraryGroupMaterialTypes(grouping).length;
  renderMaterialGroupButtons(view.roots, [
    {
      key: 'all',
      action: 'all',
      label: DESIGNER_UI_TEXT.allMaterials,
      accessibleLabel: DESIGNER_UI_TEXT.allMaterialGroups,
      path: DESIGNER_UI_TEXT.allMaterialGroups,
      icon: 'grid',
      count: allCount,
      selected: path.length === 0,
    },
    ...grouping.groups.map((group): DesignerMaterialGroupButton => {
      const types = materialLibraryGroupMaterialTypes(grouping, group.id);
      const labelIcon = materialCategoryIcon(group.label);
      const icon = labelIcon === 'grid' ? materialCategoryIcon(types.join(' ')) : labelIcon;
      return {
        key: `group:${group.id}`,
        action: 'select',
        groupId: group.id,
        label: group.label,
        accessibleLabel: DESIGNER_UI_TEXT.materialGroupSelect(group.label),
        path: group.label,
        icon: icon === 'grid' ? 'rect' : icon,
        count: types.length,
        selected: path[0]?.id === group.id,
        hasChildren: group.children !== undefined,
      };
    }),
  ]);

  renderMaterialGroupButtons(view.children, [
    {
      key: 'current',
      action: 'current',
      groupId: branch?.id,
      label: DESIGNER_UI_TEXT.materialGroupAll,
      accessibleLabel:
        branch === undefined
          ? DESIGNER_UI_TEXT.allMaterialGroups
          : DESIGNER_UI_TEXT.materialGroupSelectAll(branch.label),
      path:
        branchPath.map((group) => group.label).join(' / ') || DESIGNER_UI_TEXT.allMaterialGroups,
      count:
        branch === undefined
          ? allCount
          : materialLibraryGroupMaterialTypes(grouping, branch.id).length,
      selected: selected?.id === branch?.id,
    },
    ...(branch?.children ?? []).map(
      (group): DesignerMaterialGroupButton => ({
        key: `group:${group.id}`,
        action: 'select',
        groupId: group.id,
        label: group.label,
        accessibleLabel: DESIGNER_UI_TEXT.materialGroupSelect(group.label),
        path: [...branchPath, group].map((entry) => entry.label).join(' / '),
        count: materialLibraryGroupMaterialTypes(grouping, group.id).length,
        selected: selected?.id === group.id,
        hasChildren: group.children !== undefined,
      }),
    ),
  ]);
  if (branchChanged) view.children.scrollTop = 0;
  return view;
}

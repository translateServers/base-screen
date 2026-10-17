import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { DesignerIconName } from '../../ui/designer-icons.js';
import { materialCategoryIcon } from '../material-library/designer-material-library-dom.js';
import type { DesignerLayerToolbarState } from './designer-layers-toolbar-dom.js';

export interface DesignerLayerItem {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly type: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly childCount: number;
  readonly hidden: boolean;
  readonly locked: boolean;
  readonly missingMaterial: boolean;
  // 行首类型图标：由物料分类关键词确定性派生（与物料库缩略图同一规则），无匹配回退网格。
  readonly icon?: DesignerIconName;
  // 行副行的尺寸读数：canonical 尺寸，不含缩放。
  readonly width: number;
  readonly height: number;
}

export interface DesignerLayerView {
  readonly items: readonly DesignerLayerItem[];
  readonly diagnostics: readonly ScreenDiagnostic[];
  /** 按父分组的已排序兄弟 id 表（zIndex 升序）：供 canMove 复用，避免每行重排。 */
  readonly siblingsByParent: ReadonlyMap<string | null, readonly string[]>;
}

export type DesignerLayerSelectionDirection = 'up' | 'down';

export function getDesignerLayerSelectionTarget(
  view: Pick<DesignerLayerView, 'items'>,
  interaction: ScreenInteractionState,
  direction: DesignerLayerSelectionDirection,
): string | undefined {
  const selectableIds = view.items.filter((item) => !item.hidden).map((item) => item.id);
  if (selectableIds.length === 0) return undefined;

  const selectableIdSet = new Set(selectableIds);
  const selectedIds = new Set(interaction.selectedComponentIds);
  const focusedId = interaction.focusedComponentId;
  const anchorId =
    focusedId !== null && selectedIds.has(focusedId) && selectableIdSet.has(focusedId)
      ? focusedId
      : selectableIds.find((componentId) => selectedIds.has(componentId));
  if (anchorId === undefined) return selectableIds[0];

  const anchorIndex = selectableIds.indexOf(anchorId);
  const targetIndex = anchorIndex + (direction === 'up' ? -1 : 1);
  return targetIndex < 0 || targetIndex >= selectableIds.length
    ? undefined
    : selectableIds[targetIndex];
}

export interface DesignerLayersRenderOptions {
  readonly interaction: ScreenInteractionState;
  readonly search: string;
  readonly collapsed: ReadonlySet<string>;
  /** 拖拽中的图层 id：该行降档，避免看起来还能再被拖一次。 */
  readonly draggingId?: string | undefined;
  /** 落点指示：在 rowId 行的 before / after / inside 处画指示线或高亮。 */
  readonly dropIndicator?: DesignerLayerDropIndicator | undefined;
  readonly renameDrafts: ReadonlyMap<string, string>;
  readonly renamingId: string | null | undefined;
  readonly renderLimit: number;
  readonly toolbarState: DesignerLayerToolbarState;
  /** canMove 收到该行所属父级的已排序兄弟表（渲染路径复用，避免每行重新 filter+sort）。 */
  readonly canMove: (
    componentId: string,
    direction: 'up' | 'down',
    siblings: readonly string[],
  ) => boolean;
}

/** 与拖拽控制器共享的落点描述；渲染层只消费，不解释。 */
export interface DesignerLayerDropIndicator {
  readonly rowId: string;
  readonly edge: 'before' | 'after' | 'inside';
}

export const DESIGNER_LAYER_PAGE_SIZE = 100;

export function createDesignerLayerView(
  document: ScreenDocument | undefined,
  catalog: BaseScreenMaterialCatalog | undefined,
): DesignerLayerView {
  if (document === undefined) {
    return { items: [], diagnostics: [], siblingsByParent: new Map() };
  }
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const order = new Map(document.components.map((component, index) => [component.id, index]));
  const children = new Map<string | null, string[]>();
  for (const component of document.components) {
    const siblings = children.get(component.parentId) ?? [];
    siblings.push(component.id);
    children.set(component.parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => compareSiblings(left, right, byId, order));
  }
  const items: DesignerLayerItem[] = [];
  visitLayer(null, 0, children, byId, document, catalog, items);
  return {
    items,
    diagnostics: items.filter((item) => item.missingMaterial).map(missingMaterialDiagnostic),
    siblingsByParent: children,
  };
}

export function filterDesignerLayerItems(
  items: readonly DesignerLayerItem[],
  search: string,
  collapsed: ReadonlySet<string>,
): readonly DesignerLayerItem[] {
  const query = search.trim().toLowerCase();
  if (query !== '') {
    const byId = new Map(items.map((item) => [item.id, item]));
    const children = new Map<string, string[]>();
    for (const item of items) {
      if (item.parentId === null) continue;
      const siblings = children.get(item.parentId) ?? [];
      siblings.push(item.id);
      children.set(item.parentId, siblings);
    }
    const visible = new Set<string>();
    for (const item of items) {
      if (!matchesLayerQuery(item, query)) continue;
      let current: DesignerLayerItem | undefined = item;
      while (current !== undefined && !visible.has(current.id)) {
        visible.add(current.id);
        current = current.parentId === null ? undefined : byId.get(current.parentId);
      }
      addLayerDescendants(item.id, children, visible);
    }
    return items.filter((item) => visible.has(item.id));
  }

  const hidden = new Set<string>();
  return items.filter((item) => {
    if (item.parentId !== null && hidden.has(item.parentId)) {
      hidden.add(item.id);
      return false;
    }
    if (collapsed.has(item.id)) hidden.add(item.id);
    return true;
  });
}

function addLayerDescendants(
  componentId: string,
  children: ReadonlyMap<string, readonly string[]>,
  visible: Set<string>,
): void {
  for (const childId of children.get(componentId) ?? []) {
    visible.add(childId);
    addLayerDescendants(childId, children, visible);
  }
}

function visitLayer(
  parentId: string | null,
  depth: number,
  children: ReadonlyMap<string | null, readonly string[]>,
  byId: ReadonlyMap<
    string,
    {
      readonly id: string;
      readonly name: string;
      readonly type: string;
      readonly size: { readonly width: number; readonly height: number };
    }
  >,
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  items: DesignerLayerItem[],
): void {
  for (const id of children.get(parentId) ?? []) {
    const component = byId.get(id)!;
    items.push({
      id: component.id,
      parentId,
      name: component.name,
      type: component.type,
      depth,
      hasChildren: (children.get(component.id)?.length ?? 0) > 0,
      childCount: children.get(component.id)?.length ?? 0,
      hidden: isScreenComponentEffectivelyHidden(document, component.id),
      locked: isScreenComponentEffectivelyLocked(document, component.id),
      missingMaterial: catalog?.get(component.type) === undefined,
      icon: materialCategoryIcon(
        `${catalog?.get(component.type)?.manifest.category ?? ''} ${component.type}`,
      ),
      width: component.size.width,
      height: component.size.height,
    });
    visitLayer(id, depth + 1, children, byId, document, catalog, items);
  }
}

function compareSiblings(
  leftId: string,
  rightId: string,
  byId: ReadonlyMap<string, { readonly zIndex: number }>,
  order: ReadonlyMap<string, number>,
): number {
  const left = byId.get(leftId)!;
  const right = byId.get(rightId)!;
  return right.zIndex - left.zIndex || order.get(rightId)! - order.get(leftId)!;
}

function matchesLayerQuery(item: DesignerLayerItem, query: string): boolean {
  return `${item.name} ${item.type}`.toLowerCase().includes(query);
}

function missingMaterialDiagnostic(item: DesignerLayerItem): ScreenDiagnostic {
  return {
    severity: 'warning',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path: ['components', item.id, 'type'],
    message: `Material "${item.type}" for layer "${item.name}" is unavailable.`,
  };
}

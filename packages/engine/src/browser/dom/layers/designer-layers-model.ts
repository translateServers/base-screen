import type { ScreenComponentNode, ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type { DesignerIconName } from '../../dom/designer-icons.js';
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
  // 副行的类型读数：物料清单的可读名称（回退 type 原文），不把技术 id 当正文展示。
  readonly typeLabel: string;
  // 行首类型图标：由物料分类关键词确定性派生（与物料库缩略图同一规则），无匹配回退网格。
  readonly icon?: DesignerIconName;
  // 行副行的尺寸读数：canonical 尺寸，不含缩放。
  readonly width: number;
  readonly height: number;
  // 能力标记：这行组件是否已经有数据绑定 / 是否出现在蓝图关系里。
  // 以前只能靠点开组件才知道，图层里看不出来「这个卡片是不是已经接数了」。
  readonly hasDataBinding: boolean;
  readonly hasInteraction: boolean;
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
  // 每次重建只遍历一遍文档与蓝图：逐行判断会把蓝图扫描做成 O(n×r)。
  const dataBound = new Set(
    document.components
      .filter(
        (component) =>
          component.dataBinding != null ||
          (component.dataSource != null && component.dataSource.type !== 'static'),
      )
      .map((component) => component.id),
  );
  const interacted = collectInteractedComponents(document);
  visitLayer(null, 0, children, byId, document, catalog, items, dataBound, interacted);
  return {
    items,
    diagnostics: items.filter((item) => item.missingMaterial).map(missingMaterialDiagnostic),
    siblingsByParent: children,
  };
}

/** 出现在任何蓝图关系（触发器源、目标、动作目标）里的组件 id。 */
function collectInteractedComponents(document: ScreenDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const relation of document.blueprint.relations) {
    if (relation.type === 'semantic') {
      ids.add(relation.source.componentId);
      ids.add(relation.target.componentId);
      continue;
    }
    // effect 只描述「做什么」，作用对象由 source / target 承载，不另带组件 id。
    if ('componentId' in relation.source) ids.add(relation.source.componentId);
    if ('componentId' in relation.target) ids.add(relation.target.componentId);
  }
  return ids;
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
  byId: ReadonlyMap<string, ScreenComponentNode>,
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog | undefined,
  items: DesignerLayerItem[],
  dataBound: ReadonlySet<string>,
  interacted: ReadonlySet<string>,
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
      typeLabel: catalog?.get(component.type)?.manifest.name ?? component.type,
      icon: materialCategoryIcon(
        `${catalog?.get(component.type)?.manifest.category ?? ''} ${component.type}`,
      ),
      width: component.size.width,
      height: component.size.height,
      hasDataBinding: dataBound.has(component.id),
      hasInteraction: interacted.has(component.id),
    });
    visitLayer(id, depth + 1, children, byId, document, catalog, items, dataBound, interacted);
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
  // 能力标记也可搜：搜「数据」「交互」能直接筛出对应组件（标记本身只有圆点，没有文字）。
  const badges = [
    item.hasDataBinding ? DESIGNER_UI_TEXT.layersPanel.badgeData : '',
    item.hasInteraction ? DESIGNER_UI_TEXT.layersPanel.badgeInteraction : '',
  ].join(' ');
  return `${item.name} ${item.type} ${badges}`.toLowerCase().includes(query);
}

function missingMaterialDiagnostic(item: DesignerLayerItem): ScreenDiagnostic {
  return {
    severity: 'warning',
    code: 'PLUGIN_CORE_LIFECYCLE_INVALID',
    path: ['components', item.id, 'type'],
    message: `Material "${item.type}" for layer "${item.name}" is unavailable.`,
  };
}

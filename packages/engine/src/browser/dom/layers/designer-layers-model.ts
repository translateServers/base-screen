import type { ScreenComponentNode, ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import {
  isScreenComponentEffectivelyHidden,
  isScreenComponentEffectivelyLocked,
  type ScreenInteractionState,
} from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { listDesignerArtboardComponentIds } from '../../../common/session/designer-artboard.js';
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
  // 只列当前画板的组件（ADR-0109）：别的画板的组件在视图里只是被隐藏锁定。
  const onArtboard =
    (document.subCanvases?.length ?? 0) > 0
      ? listDesignerArtboardComponentIds(document)
      : undefined;
  for (const component of document.components) {
    if (onArtboard !== undefined && !onArtboard.has(component.id)) continue;
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

/** 在蓝图里有节点且至少连了一条线的组件 id。 */
function collectInteractedComponents(document: ScreenDocument): ReadonlySet<string> {
  const connected = new Set<string>();
  for (const edge of document.blueprint.edges) {
    connected.add(edge.from.node);
    connected.add(edge.to.node);
  }
  const ids = new Set<string>();
  for (const node of document.blueprint.nodes) {
    if (node.kind === 'component' && connected.has(node.id)) ids.add(node.componentId);
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

/**
 * 左右键在树上的动作：展开/折叠分组，或进出父子层级。
 *
 * 与上下键分开是因为两者的「下一步」不同源：上下键走可见序列，左右键走层级关系。
 * 把判定收在这里，DOM 查询只负责取样（是否分组、是否展开、父与首个子行），
 * 叶子行右键该不该消费、折叠态的父行该不该跳这类分支才有唯一落点，也才能脱离 DOM 单测。
 */
export type DesignerLayerBranchAction =
  | { readonly type: 'collapse'; readonly id: string }
  | { readonly type: 'expand'; readonly id: string }
  | { readonly type: 'focus'; readonly id: string };

export function resolveDesignerLayerBranchAction(input: {
  readonly direction: 'left' | 'right';
  readonly id: string;
  readonly isGroup: boolean;
  readonly expanded: boolean;
  readonly parentId: string | null;
  readonly firstChildId: string | null;
  readonly searchActive: boolean;
}): DesignerLayerBranchAction | undefined {
  const { direction, id, isGroup, expanded, parentId, firstChildId, searchActive } = input;
  // 搜索态下可见性由查询决定，折叠集合不再生效：此时再发 expand/collapse 只会改一个
  // 当前看不见的状态，用户按了键却没有任何画面变化。搜索时左右键只做层级移动。
  if (direction === 'right') {
    if (!isGroup) return undefined;
    if (!expanded && !searchActive) return { type: 'expand', id };
    return firstChildId === null ? undefined : { type: 'focus', id: firstChildId };
  }
  if (isGroup && expanded && !searchActive) return { type: 'collapse', id };
  return parentId === null ? undefined : { type: 'focus', id: parentId };
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

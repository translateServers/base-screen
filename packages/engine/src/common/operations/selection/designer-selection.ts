import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';
import {
  buildComponentIndex,
  getDescendantIds,
  isScreenComponentEffectivelyLocked,
} from '@base-screen/core';

// 选中组件（仅包含显式选中的 id，不展开子组件）。
export function selectedComponents(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  const selected = new Set(componentIds);
  return document.components.filter((component) => selected.has(component.id));
}

// 把选中集合扩展为完整子树：每个选中的根组件连同其全部后代一起返回。
// 编组/容器语义下移动、变换、对齐等操作以子树为单位，避免组本体移动而子组件散落。
export function selectionSubtree(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenComponentNode[] {
  const index = buildComponentIndex(document);
  const collected = new Set<string>(componentIds);
  for (const id of componentIds) {
    for (const descendantId of getDescendantIds(index, id)) {
      collected.add(descendantId);
    }
  }
  return document.components.filter((component) => collected.has(component.id));
}

// 判断选中集合中是否存在 id 的祖先（选中根集合里的顶层组件）。
export function hasSelectedAncestor(
  document: ScreenDocument,
  selected: ReadonlySet<string>,
  componentId: string,
): boolean {
  const byId = new Map(document.components.map((component) => [component.id, component]));
  let parentId = byId.get(componentId)?.parentId ?? null;
  while (parentId !== null) {
    if (selected.has(parentId)) {
      return true;
    }
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return false;
}

// 把选中集合裁剪为顶层根组件：其祖先也被选中（如框选同时命中组与子组件）时只保留祖先。
export function selectedRootIds(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly string[] {
  const selected = new Set(componentIds);
  return componentIds.filter(
    (componentId) => !hasSelectedAncestor(document, selected, componentId),
  );
}

// Resolve a hit component to the object selectable in the current group-editing context.
// At the canvas root this collapses any descendant hit to its root group/container; inside
// a group it collapses deep hits to that group's direct child.
export function selectionTargetInContext(
  document: ScreenDocument,
  componentId: string,
  editingParentId: string | null,
): string | null {
  const byId = new Map(document.components.map((component) => [component.id, component]));
  let current = byId.get(componentId);
  while (current !== undefined) {
    if (current.parentId === editingParentId) {
      return current.id;
    }
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return null;
}

export function selectionTargetsInContext(
  document: ScreenDocument,
  componentIds: readonly string[],
  editingParentId: string | null,
): readonly string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const componentId of componentIds) {
    const target = selectionTargetInContext(document, componentId, editingParentId);
    if (target !== null && !seen.has(target)) {
      seen.add(target);
      targets.push(target);
    }
  }
  return targets;
}

/**
 * 「全选」的目标：当前编辑层级（画布根层，或正在编辑的组内）的全部直接成员，排除锁定组件。
 *
 * 不把子孙也选进来：组合 / 卡片插入后是父子结构，混选父子会让删除、移动、对齐这类「选区须同属
 * 一个父级」的操作整体失效（Ctrl+A 后按 Delete 没反应）。锁定组件在画布上本来就点不中，
 * 选进来同样会让这些操作失效。与 Figma 的 Ctrl+A 语义一致。
 */
export function selectAllTargetIds(
  document: ScreenDocument,
  editingParentId: string | null,
): readonly string[] {
  return document.components
    .filter(
      (component) =>
        component.parentId === editingParentId &&
        !isScreenComponentEffectivelyLocked(document, component.id),
    )
    .map((component) => component.id);
}

export function parentIdOf(document: ScreenDocument, componentId: string): string | null {
  return document.components.find((component) => component.id === componentId)?.parentId ?? null;
}

export function hasDirectChildren(document: ScreenDocument, componentId: string): boolean {
  return document.components.some((component) => component.parentId === componentId);
}

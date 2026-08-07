import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';

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
  const byParent = new Map<string | null, string[]>();
  for (const component of document.components) {
    const children = byParent.get(component.parentId);
    if (children !== undefined) {
      children.push(component.id);
    } else {
      byParent.set(component.parentId, [component.id]);
    }
  }
  const collected = new Set<string>();
  const queue = [...componentIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (collected.has(id)) {
      continue;
    }
    collected.add(id);
    queue.push(...(byParent.get(id) ?? []));
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

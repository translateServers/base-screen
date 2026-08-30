import type { ScreenComponentNode, ScreenDocument } from '@base-screen/contracts';

export interface ComponentIndex {
  readonly byId: ReadonlyMap<
    string,
    { readonly component: ScreenComponentNode; readonly index: number }
  >;
  readonly childrenByParent: ReadonlyMap<string | null, readonly string[]>;
}

// 文档不可变：组件索引按文档引用缓存。事务内多命令、语义校验与各查询
// 共享同一份索引，避免每个命令 O(n) 重建；WeakMap 随文档引用回收。
const componentIndexCache = new WeakMap<ScreenDocument, ComponentIndex>();

export function buildComponentIndex(document: ScreenDocument): ComponentIndex {
  const cached = componentIndexCache.get(document);
  if (cached !== undefined) return cached;
  const byId = new Map<string, { component: ScreenComponentNode; index: number }>();
  const childrenByParent = new Map<string | null, string[]>();

  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    byId.set(component.id, { component, index });
    const parentId = component.parentId;
    const children = childrenByParent.get(parentId);
    if (children !== undefined) {
      children.push(component.id);
    } else {
      childrenByParent.set(parentId, [component.id]);
    }
  }

  const built: ComponentIndex = { byId, childrenByParent };
  componentIndexCache.set(document, built);
  return built;
}

export function getRootIds(index: ComponentIndex): readonly string[] {
  return index.childrenByParent.get(null) ?? [];
}

export function getAncestorIds(index: ComponentIndex, id: string): readonly string[] {
  const ancestors: string[] = [];
  let current = index.byId.get(id);
  if (current === undefined) {
    return ancestors;
  }
  const visited = new Set<string>([id]);
  let parentId = current.component.parentId;
  while (parentId !== null && !visited.has(parentId)) {
    ancestors.push(parentId);
    visited.add(parentId);
    current = index.byId.get(parentId);
    if (current === undefined) {
      break;
    }
    parentId = current.component.parentId;
  }
  return ancestors;
}

export function getAncestorDepth(index: ComponentIndex, id: string): number {
  return getAncestorIds(index, id).length;
}

export function getDescendantIds(index: ComponentIndex, id: string): readonly string[] {
  const descendants: string[] = [];
  const pending = [...(index.childrenByParent.get(id) ?? [])].reverse();
  const visited = new Set<string>();

  while (pending.length > 0) {
    const currentId = pending.pop()!;
    if (visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);
    descendants.push(currentId);
    const children = index.childrenByParent.get(currentId);
    if (children !== undefined) {
      for (let childIndex = children.length - 1; childIndex >= 0; childIndex--) {
        pending.push(children[childIndex]!);
      }
    }
  }

  return descendants;
}

export function isEffectiveHidden(index: ComponentIndex, id: string): boolean {
  const entry = index.byId.get(id);
  if (entry === undefined) {
    return false;
  }
  if (entry.component.status.hidden) {
    return true;
  }
  return getAncestorIds(index, id).some((ancestorId) => {
    const ancestor = index.byId.get(ancestorId);
    return ancestor?.component.status.hidden ?? false;
  });
}

export function isEffectiveLocked(index: ComponentIndex, id: string): boolean {
  const entry = index.byId.get(id);
  if (entry === undefined) {
    return false;
  }
  if (entry.component.status.locked) {
    return true;
  }
  return getAncestorIds(index, id).some((ancestorId) => {
    const ancestor = index.byId.get(ancestorId);
    return ancestor?.component.status.locked ?? false;
  });
}

function compareSiblings(index: ComponentIndex, aId: string, bId: string): number {
  const a = index.byId.get(aId)!;
  const b = index.byId.get(bId)!;
  if (a.component.zIndex !== b.component.zIndex) {
    return a.component.zIndex - b.component.zIndex;
  }
  return a.index - b.index;
}

function sortChildren(index: ComponentIndex, children: readonly string[]): readonly string[] {
  return [...children].sort((a, b) => compareSiblings(index, a, b));
}

// 绘制顺序按文档引用缓存：顺序完全由不可变文档决定（zIndex + 文档序 DFS），
// renderer 每次 render、engine 命中测试/框选重复调用时复用，避免重复排序全部兄弟组。
const painterOrderCache = new WeakMap<ScreenDocument, readonly string[]>();

export function getPainterOrder(document: ScreenDocument): readonly string[] {
  const cached = painterOrderCache.get(document);
  if (cached !== undefined) return cached;
  const index = buildComponentIndex(document);
  const result: string[] = [];
  const pending = [...sortChildren(index, getRootIds(index))].reverse();
  const visited = new Set<string>();

  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    result.push(id);
    const children = index.childrenByParent.get(id);
    if (children !== undefined) {
      const sortedChildren = sortChildren(index, children);
      for (let childIndex = sortedChildren.length - 1; childIndex >= 0; childIndex--) {
        pending.push(sortedChildren[childIndex]!);
      }
    }
  }

  painterOrderCache.set(document, result);
  return result;
}

export function getDescendantSet(
  index: ComponentIndex,
  ids: readonly string[],
): ReadonlySet<string> {
  const descendants = new Set<string>();
  for (const id of ids) {
    for (const descendantId of getDescendantIds(index, id)) {
      descendants.add(descendantId);
    }
  }
  return descendants;
}

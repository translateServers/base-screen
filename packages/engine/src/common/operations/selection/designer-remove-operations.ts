import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, type ScreenDocumentCommand } from '@base-screen/core';

// 删除组件时的级联清理：目标及其全部 descendants 一并纳入移除集合；
// 若蓝图关系以被移除组件为来源或目标，则同步剪除对应关系，保证文档在
// fail-closed 校验下依然合法（否则删除会因悬空引用而整体失败）。
// 剪除命令必须排在 remove-components 之前：该命令自身会对候选文档做
// fail-closed 校验，先删组件会先产生悬空引用。
export function removeComponentCommands(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenDocumentCommand[] {
  const removed = removedComponentIds(document, componentIds);
  const survivingRelations = document.blueprint.relations.filter((relation) => {
    if (relation.type === 'semantic') {
      return !removed.has(relation.source.componentId) && !removed.has(relation.target.componentId);
    }
    if (relation.source.kind === 'component' && removed.has(relation.source.componentId)) {
      return false;
    }
    if (relation.target.kind === 'component' && removed.has(relation.target.componentId)) {
      return false;
    }
    return true;
  });
  const survivingLayoutNodes = document.blueprint.layout?.nodes.filter((node) => {
    if (node.id.startsWith('component:')) {
      return !removed.has(node.id.slice('component:'.length));
    }
    if (node.id.startsWith('variable:') || node.id === 'host') return true;
    // 旧事件图的 condition/action/unconnected 位置没有关系模型等价物，随删除一并修剪。
    return false;
  });
  const relationsChanged = survivingRelations.length !== document.blueprint.relations.length;
  const layoutChanged =
    document.blueprint.layout !== undefined &&
    survivingLayoutNodes !== undefined &&
    survivingLayoutNodes.length !== document.blueprint.layout.nodes.length;
  const commands: ScreenDocumentCommand[] = [];
  if (relationsChanged || layoutChanged) {
    commands.push({
      type: 'replace-blueprint',
      blueprint: {
        relations: survivingRelations,
        ...(document.blueprint.layout === undefined
          ? {}
          : {
              layout: {
                ...document.blueprint.layout,
                nodes: survivingLayoutNodes ?? [],
              },
            }),
      },
    });
  }
  commands.push({ type: 'remove-components', componentIds });
  return commands;
}

function removedComponentIds(
  document: ScreenDocument,
  componentIds: readonly string[],
): ReadonlySet<string> {
  const removed = new Set<string>();
  const index = buildComponentIndex(document);
  const pending = [...componentIds];
  while (pending.length > 0) {
    const componentId = pending.pop()!;
    if (removed.has(componentId)) {
      continue;
    }
    removed.add(componentId);
    pending.push(...(index.childrenByParent.get(componentId) ?? []));
  }
  return removed;
}

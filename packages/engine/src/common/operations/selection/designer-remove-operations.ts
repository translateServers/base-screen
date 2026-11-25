import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, type ScreenDocumentCommand } from '@base-screen/core';
import { pruneDesignerBlueprintEntities } from '../blueprint/designer-blueprint-graph.js';

// 删除组件时的级联清理：目标及其全部 descendants 一并纳入移除集合；
// 蓝图里引用被移除组件的节点（连同其连线与布局位置）同步剪除，保证文档在
// fail-closed 校验下依然合法（否则删除会因悬空引用而整体失败）。
// 剪除命令必须排在 remove-components 之前：该命令自身会对候选文档做
// fail-closed 校验，先删组件会先产生悬空引用。
export function removeComponentCommands(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenDocumentCommand[] {
  const removed = removedComponentIds(document, componentIds);
  const pruned = pruneDesignerBlueprintEntities(document.blueprint, { componentIds: removed });
  const commands: ScreenDocumentCommand[] = [];
  if (pruned !== document.blueprint)
    commands.push({ type: 'replace-blueprint', blueprint: pruned });
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

import type { ScreenDocument } from '@base-screen/contracts';
import { buildComponentIndex, type ScreenDocumentCommand } from '@base-screen/core';

// 删除组件时的级联清理：目标及其全部 descendants 一并纳入移除集合；
// 若蓝图规则以被移除组件为触发器，则同步剪除对应规则，保证文档在
// fail-closed 校验下依然合法（否则删除会因悬空 trigger 而整体失败）。
// 剪除命令必须排在 remove-components 之前：该命令自身会对候选文档做
// fail-closed 校验，先删组件会先产生悬空 trigger。
export function removeComponentCommands(
  document: ScreenDocument,
  componentIds: readonly string[],
): readonly ScreenDocumentCommand[] {
  const removed = removedComponentIds(document, componentIds);
  const survivingRules = document.blueprint.rules.filter(
    (rule) => !removed.has(rule.trigger.componentId),
  );
  const commands: ScreenDocumentCommand[] = [];
  if (survivingRules.length !== document.blueprint.rules.length) {
    commands.push({ type: 'replace-blueprint', blueprint: { rules: survivingRules } });
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

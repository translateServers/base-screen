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
  const survivingRules: ScreenDocument['blueprint']['rules'][number][] = [];
  const changedRuleIds = new Set<string>();
  let rulesChanged = false;
  for (const rule of document.blueprint.rules) {
    if (rule.trigger.type === 'material-event' && removed.has(rule.trigger.componentId)) {
      rulesChanged = true;
      changedRuleIds.add(rule.id);
      continue;
    }
    const actions = rule.actions.filter(
      (action) => action.type !== 'component-visibility' || !removed.has(action.componentId),
    );
    if (actions.length !== rule.actions.length) {
      rulesChanged = true;
      changedRuleIds.add(rule.id);
      if (actions.length === 0) continue;
      survivingRules.push({ ...rule, actions });
    } else {
      survivingRules.push(rule);
    }
  }
  const validLayoutNodeIds = new Set<string>();
  for (const component of document.components) {
    if (!removed.has(component.id)) validLayoutNodeIds.add(`component:${component.id}`);
  }
  for (const variable of document.variables) validLayoutNodeIds.add(`variable:${variable.id}`);
  for (const rule of survivingRules) {
    if (rule.condition !== undefined) validLayoutNodeIds.add(`condition:${rule.id}`);
    rule.actions.forEach((_action, index) => validLayoutNodeIds.add(`action:${rule.id}:${index}`));
  }
  const survivingLayoutNodes = document.blueprint.layout?.nodes.filter((node) => {
    if (node.id.startsWith('action:')) {
      return (
        ![...changedRuleIds].some((ruleId) => node.id.startsWith(`action:${ruleId}:`)) &&
        validLayoutNodeIds.has(node.id)
      );
    }
    if (node.id.startsWith('component:') || node.id.startsWith('condition:')) {
      return validLayoutNodeIds.has(node.id);
    }
    return true;
  });
  const commands: ScreenDocumentCommand[] = [];
  if (rulesChanged || survivingLayoutNodes?.length !== document.blueprint.layout?.nodes.length) {
    commands.push({
      type: 'replace-blueprint',
      blueprint: {
        rules: survivingRules,
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

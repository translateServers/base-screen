import type { ScreenBlueprint, ScreenDocument } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';

export function renderDesignerEventsPanel(
  panel: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (panel === undefined) return;
  panel.replaceChildren();
  const focused = interaction.focusedComponentId;
  const rules =
    document?.blueprint.rules.filter((rule) => rule.trigger.componentId === focused) ?? [];
  const summary = panel.ownerDocument.createElement('p');
  summary.textContent =
    focused === null ? '选择组件以查看事件规则。' : `当前组件有 ${rules.length} 条事件规则。`;
  panel.appendChild(summary);
  const open = panel.ownerDocument.createElement('button');
  open.type = 'button';
  open.dataset.action = 'open-blueprint';
  open.disabled = getFocusedEventName(document, interaction, catalog) === undefined;
  open.textContent = '打开蓝图';
  panel.appendChild(open);
}

export function renderDesignerBlueprintWorkspace(
  workspace: HTMLElement | undefined,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): void {
  if (workspace === undefined || document === undefined) return;
  workspace.replaceChildren();
  const heading = workspace.ownerDocument.createElement('header');
  heading.textContent = '蓝图';
  const add = workspace.ownerDocument.createElement('button');
  add.type = 'button';
  add.dataset.action = 'blueprint-add-rule';
  add.disabled = getFocusedEventName(document, interaction, catalog) === undefined;
  add.textContent = '添加规则';
  const close = workspace.ownerDocument.createElement('button');
  close.type = 'button';
  close.dataset.action = 'close-blueprint';
  close.textContent = '关闭';
  heading.append(add, close);
  workspace.appendChild(heading);
  const list = workspace.ownerDocument.createElement('ol');
  for (const rule of document.blueprint.rules) {
    const item = workspace.ownerDocument.createElement('li');
    item.textContent = `${rule.trigger.componentId}.${rule.trigger.eventName}，${rule.actions.length} 个动作`;
    const remove = workspace.ownerDocument.createElement('button');
    remove.type = 'button';
    remove.dataset.blueprintRemoveRule = rule.id;
    remove.textContent = '移除';
    item.appendChild(remove);
    list.appendChild(item);
  }
  workspace.appendChild(list);
}

export function createDesignerBlueprintRule(
  document: ScreenDocument,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenBlueprint | undefined {
  const eventName = getFocusedEventName(document, interaction, catalog);
  const componentId = interaction.focusedComponentId;
  if (eventName === undefined || componentId === null) return undefined;
  let index = document.blueprint.rules.length + 1;
  const ids = new Set(document.blueprint.rules.map((rule) => rule.id));
  while (ids.has(`rule-${index}`)) index++;
  return {
    rules: [
      ...document.blueprint.rules,
      {
        id: `rule-${index}`,
        trigger: { type: 'material-event', componentId, eventName },
        actions: [],
      },
    ],
  };
}

function getFocusedEventName(
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): string | undefined {
  const component = document?.components.find((item) => item.id === interaction.focusedComponentId);
  return component === undefined ? undefined : catalog?.get(component.type)?.manifest.events[0];
}

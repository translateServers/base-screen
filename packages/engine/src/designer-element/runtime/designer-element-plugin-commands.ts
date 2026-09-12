import type { ScreenJsonValue } from '@base-screen/contracts';
import type { BaseScreenPluginContextMenu } from '@base-screen/plugin-core';
import {
  renderDesignerPluginPanels,
  updateDesignerPluginPanelModels,
} from '../../browser/dom/plugin/designer-plugin-panel-dom.js';
import {
  type DesignerPluginCommandItem,
  findDesignerPluginCommandByShortcut,
  listDesignerPluginCommandItems,
} from '../../common/operations/plugin/designer-plugin-commands.js';
import {
  createDesignerPluginPanelModel,
  designerPluginPanelModelKey,
  listDesignerPluginPanels,
  resolveDesignerPluginPanelAction,
} from '../../common/operations/plugin/designer-plugin-panels.js';
import { type DesignerElementHost, getDesignerElementState } from './designer-element-state.js';

export function listPluginCommandItems(
  element: DesignerElementHost,
  menu: BaseScreenPluginContextMenu,
): readonly DesignerPluginCommandItem[] {
  const state = getDesignerElementState(element);
  return listDesignerPluginCommandItems(
    state.pluginCatalog,
    state.pluginCommandPort !== undefined,
    menu,
  );
}

export function findPluginCommandByShortcut(
  element: DesignerElementHost,
  chord: string,
): DesignerPluginCommandItem | undefined {
  const state = getDesignerElementState(element);
  const command = findDesignerPluginCommandByShortcut(state.pluginCatalog, chord);
  if (command === undefined) return undefined;
  return {
    ...command,
    disabled: command.disabled || state.pluginCommandPort === undefined,
  };
}

/**
 * chrome 触发保持 ADR-0070 的 `args: null`；面板触发才带自己给出的 args。
 */
export function executePluginCommand(
  element: DesignerElementHost,
  commandId: string,
  args: ScreenJsonValue = null,
): void {
  const state = getDesignerElementState(element);
  const port = state.pluginCommandPort;
  if (port === undefined) return;
  void port.execute({ commandId, args }).then((result) => {
    if (!result.ok) state.runtime.emitDiagnostics(element, result.diagnostics);
  });
}

/** 面板派动的动作：校验失败也要出声，否则面板点了没反应无从排查。 */
export function executeDesignerPluginPanelAction(
  element: DesignerElementHost,
  panelId: string,
  detail: unknown,
): void {
  const state = getDesignerElementState(element);
  const resolved = resolveDesignerPluginPanelAction(panelId, detail);
  if (!resolved.ok) {
    state.runtime.emitDiagnostics(element, resolved.diagnostics);
    return;
  }
  if (state.pluginCommandPort === undefined) {
    state.runtime.emitDiagnostics(element, [
      {
        severity: 'error',
        code: 'PLUGIN_CORE_COMMAND_UNAUTHORIZED',
        path: [],
        message: 'No plugin command port is configured for this designer.',
      },
    ]);
    return;
  }
  executePluginCommand(element, resolved.value.commandId, resolved.value.args);
}

/**
 * 挂载/移除插件面板并推送 model。元素只在面板集合变化时重建，model 只在文档代际或选区变化
 * 时重新赋值，两者都不进 hover 与拖动预览路径，避免高频重绘造成抖动。
 */
export function syncDesignerPluginPanels(element: DesignerElementHost): void {
  const state = getDesignerElementState(element);
  const layout = element.shadowRoot?.querySelector<HTMLElement>('.designer');
  if (layout === null || layout === undefined) return;
  const entries = listDesignerPluginPanels(state.pluginPanels);
  renderDesignerPluginPanels(layout, entries, (panelId, detail) =>
    state.runtime.executeDesignerPluginPanelAction(element, panelId, detail),
  );
  if (entries.length === 0) return;
  const document = state.session.document;
  const interaction = state.session.interaction;
  updateDesignerPluginPanelModels(
    layout,
    document === undefined ? undefined : createDesignerPluginPanelModel(document, interaction),
    designerPluginPanelModelKey(state.documentGeneration, interaction),
  );
}

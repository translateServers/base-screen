import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenInteractionState } from '@base-screen/core';
import type {
  BaseScreenPluginDesignSnapshot,
  BaseScreenPluginPanelCatalog,
  BaseScreenPluginPanelCatalogEntry,
} from '@base-screen/plugin-core';
import { parseBaseScreenPluginPanelActionDetail } from '@base-screen/plugin-core';
import { cloneAndFreeze } from '../../tools/designer-json-snapshot.js';

/** 面板动作的目标命令；args 由面板给出，因此贡献命令不再固定为 null。 */
export interface DesignerPluginPanelAction {
  readonly commandId: string;
  readonly args: ScreenJsonValue;
}

/**
 * 校验面板派发的动作。监听器绑定时已知该元素归属的面板 id，所以这里只做一致性拒绝：
 * 冒充别的面板身份不会得到更多权限，命令可见性仍由 manager 的声明加授权集合决定。
 */
export function resolveDesignerPluginPanelAction(
  boundPanelId: string,
  detail: unknown,
): ScreenParseResult<DesignerPluginPanelAction> {
  const parsed = parseBaseScreenPluginPanelActionDetail(detail);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value.panelId !== boundPanelId) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'PLUGIN_CORE_COMMAND_UNAUTHORIZED',
          path: ['panelId'],
          message: 'Plugin panel action does not match the originating panel.',
        },
      ],
    };
  }
  return {
    ok: true,
    value: { commandId: parsed.value.commandId, args: parsed.value.args },
    diagnostics: [],
  };
}

/** Designer 可见的插件面板列表；目录本身已按 panel id 稳定排序。 */
export function listDesignerPluginPanels(
  panels: BaseScreenPluginPanelCatalog | undefined,
): readonly BaseScreenPluginPanelCatalogEntry[] {
  return panels?.list() ?? [];
}

/** 写入面板 model 的只读快照：与 designReadPort 同一形状，面板不必区分来源。 */
export function createDesignerPluginPanelModel(
  document: ScreenDocument,
  interaction: ScreenInteractionState,
): BaseScreenPluginDesignSnapshot {
  return Object.freeze({
    document: cloneAndFreeze(document),
    selectedComponentIds: Object.freeze([...interaction.selectedComponentIds]),
    focusedComponentId: interaction.focusedComponentId,
  });
}

/**
 * 面板 model 的变更指纹：只有文档代际或选区真的变化时才重新赋值 model，避免在 hover、
 * 拖动预览等高频渲染路径上反复触发面板重绘造成抖动。
 */
export function designerPluginPanelModelKey(
  documentGeneration: number,
  interaction: ScreenInteractionState,
): string {
  const selection = interaction.selectedComponentIds.join('|');
  return `${documentGeneration}#${interaction.focusedComponentId ?? ''}#${selection}`;
}

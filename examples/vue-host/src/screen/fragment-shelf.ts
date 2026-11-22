import type { BaseScreenDesignerElement } from 'base-screen';
import {
  BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
  type BaseScreenFragmentSaveRequestEventDetail,
} from 'base-screen/designer';
import type { BaseScreenFragmentDefinition } from 'base-screen/plugin-core';
import { METRIC_CARD_FRAGMENT } from './metric-value';

/**
 * 宿主的「我的组合」（ADR-0100 第二阶段）：设计器的「存为组合」只派发保存请求，命名、归类与存储归宿主。
 *
 * 示例只存在内存里（刷新即丢），真实宿主应写入自己的后端，再把列表设回 `materialLibraryFragments`。
 * 预置的「指标卡」与作者存下的组合放在同一个列表里，物料库按 category 混排。
 */
export function attachHostFragmentShelf(
  designer: BaseScreenDesignerElement,
  on: (type: string, listener: EventListener) => () => void,
): void {
  let saved: readonly BaseScreenFragmentDefinition[] = [];
  const render = (): void => {
    designer.materialLibraryFragments = [METRIC_CARD_FRAGMENT, ...saved];
  };
  render();
  on(BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT, (event) => {
    const detail = (event as CustomEvent<BaseScreenFragmentSaveRequestEventDetail>).detail;
    const index = saved.length + 1;
    const name = detail.suggestedName.trim() === '' ? `我的组合 ${index}` : detail.suggestedName;
    saved = [
      ...saved,
      {
        id: `host-app.saved-${Date.now().toString(36)}-${index}`,
        name,
        category: '我的组合',
        keywords: ['组合', name],
        ...detail.fragment,
      },
    ];
    render();
  });
}

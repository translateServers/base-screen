import type { ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenFragmentBody } from '@base-screen/plugin-core';
import {
  BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
  type BaseScreenFragmentSaveRequestEventDetail,
  extractBaseScreenComponentFragment,
} from '../../common/operations/material-component/material-component-fragment-extract.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 「将选区存为分片」（ADR-0100 第二阶段）的元素侧入口。
 *
 * `createComponentFragment` 是纯读取：宿主可以在自己的界面里随时调用。`requestFragmentSave`
 * 供 Engine 的「存为组合」操作使用——提取成功后派发 `base-screen-fragment-save-request`，
 * 宿主决定是否保存、叫什么名字、放哪个分类；Engine 不持有分片存储（与 ADR-0089 同构）。
 */
export function createComponentFragment(
  element: DesignerElementHost,
  componentIds?: readonly string[],
): ScreenParseResult<BaseScreenFragmentBody> {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  if (document === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'AUTHORING_SOURCE_INVALID',
          path: [],
          message: 'Saving a fragment requires a document.',
        },
      ],
    };
  }
  return extractBaseScreenComponentFragment({
    document,
    componentIds: componentIds ?? state.session.interaction.selectedComponentIds,
    catalog: state.catalog,
  });
}

export function readFragmentSaveAction(element: DesignerElementHost): boolean {
  return getDesignerElementState(element).fragmentSaveAction;
}

export function canRequestFragmentSave(element: DesignerElementHost): boolean {
  const state = getDesignerElementState(element);
  return (
    state.fragmentSaveAction &&
    state.session.document !== undefined &&
    state.session.interaction.selectedComponentIds.length > 0
  );
}

/** 提取当前选区并派发保存请求；失败时上报诊断，不派发事件。 */
export function requestFragmentSave(element: DesignerElementHost): void {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  const componentIds = state.session.interaction.selectedComponentIds.filter(
    (id) => document?.components.some((component) => component.id === id) === true,
  );
  const extracted = createComponentFragment(element, componentIds);
  if (!extracted.ok) {
    state.runtime.emitDiagnostics(element, extracted.diagnostics);
    return;
  }
  const fragment = extracted.value;
  const detail: BaseScreenFragmentSaveRequestEventDetail = {
    fragment,
    componentIds,
    suggestedName: fragment.shell?.name ?? fragment.nodes[0]?.name ?? '',
    diagnostics: extracted.diagnostics,
  };
  element.dispatchEvent(
    new CustomEvent<BaseScreenFragmentSaveRequestEventDetail>(
      BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
      { detail, bubbles: true, composed: true },
    ),
  );
}

import type { ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialDataState,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import type { RendererState } from './renderer-state.js';
import type { RenderCandidate } from './renderer-types.js';

/**
 * candidate.model.style 始终为 canonical 基础样式（主题引用已解析）；effective style 是当前生效
 * 状态（ADR-0110）的预校验样式，默认状态即基础样式。不回写文档。
 */
export function resolveEffectiveModel(
  state: RendererState,
  candidate: RenderCandidate,
  dataState: BaseScreenMaterialDataState,
  _document: ScreenDocument | undefined,
): BaseScreenMaterialModel {
  const stateId = state.componentStates.resolve(state, candidate, dataState);
  state.componentStates.commit(state, candidate.component.id, stateId);
  const style = candidate.stateStyles.get(stateId) ?? candidate.model.style;
  return { ...candidate.model, dataState, style };
}

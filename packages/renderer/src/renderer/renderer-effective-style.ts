import type { ScreenComponentNode, ScreenDocument, ScreenJsonObject } from '@base-screen/contracts';
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

/**
 * 每个组件最终写到宿主的透明度：自身与全部祖先容器按组件状态解析后的 opacity 连乘。
 *
 * 物料在 DOM 里是画布根节点的兄弟元素，父容器的 CSS opacity 无法自然传给文档后代；
 * 因此渲染器必须显式合成。祖先链带环（契约已禁止）时按 1 退出，避免死循环。
 */
export function resolveComponentOpacities(
  state: RendererState,
  candidates: ReadonlyMap<string, RenderCandidate>,
  document: ScreenDocument,
): ReadonlyMap<string, number> {
  const components = new Map(document.components.map((component) => [component.id, component]));
  const opacities = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (component: ScreenComponentNode): number => {
    const cached = opacities.get(component.id);
    if (cached !== undefined) return cached;
    if (visiting.has(component.id)) return 1;
    visiting.add(component.id);
    const candidate = candidates.get(component.id);
    const style =
      candidate === undefined
        ? component.style
        : effectiveStyleOf(state, candidate, candidate.model.dataState);
    const own = readOpacity(style);
    const parent = component.parentId === null ? undefined : components.get(component.parentId);
    const inherited = parent === undefined ? 1 : resolve(parent);
    visiting.delete(component.id);
    const combined = own * inherited;
    opacities.set(component.id, combined);
    return combined;
  };

  for (const component of document.components) resolve(component);
  return opacities;
}

function effectiveStyleOf(
  state: RendererState,
  candidate: RenderCandidate,
  dataState: BaseScreenMaterialDataState,
): ScreenJsonObject {
  const stateId = state.componentStates.resolve(state, candidate, dataState);
  return candidate.stateStyles.get(stateId) ?? candidate.model.style;
}

function readOpacity(style: ScreenJsonObject): number {
  const value = style.opacity;
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

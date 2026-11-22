import type { ScreenDocument, ScreenParseResult, ScreenPosition } from '@base-screen/contracts';
import type {
  BaseScreenFragmentDefinition,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  type BaseScreenResolvedFragmentLibraryItem,
  fragmentBody,
  parseBaseScreenMaterialLibraryFragments,
  resolveBaseScreenFragmentLibraryItems,
} from '../../common/operations/material-library/material-library-fragments.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';
import { insertComponentFragmentWithPlacement } from './designer-element-insert-component-fragment.js';

/**
 * 物料库中的组合分片（ADR-0100 第一阶段 1b）。
 *
 * 来源有两路：宿主 `materialLibraryFragments` 与插件 `fragment` 贡献（经 runtimeContributions）。
 * 解析结果按「catalog / 宿主分片 / 贡献索引」三个引用记忆化——三者任一换了引用才重新试运行，
 * 试运行产出的 warning 诊断因此每次变化只上报一次，不会随每次面板重绘重复刷屏。
 */
interface FragmentLibraryMemo {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly hostFragments: readonly BaseScreenFragmentDefinition[] | undefined;
  readonly contributions: BaseScreenRuntimeContributionIndex | undefined;
  readonly items: readonly BaseScreenResolvedFragmentLibraryItem[];
}

const fragmentLibraryMemos = new WeakMap<DesignerElementHost, FragmentLibraryMemo>();

export function readMaterialLibraryFragments(
  element: DesignerElementHost,
): readonly BaseScreenFragmentDefinition[] | undefined {
  return getDesignerElementState(element).materialLibraryFragments;
}

/** 形状错误失败关闭（保留旧值并上报）；catalog 相关的失败留到试运行，只隐藏单个分片。 */
export function writeMaterialLibraryFragments(
  element: DesignerElementHost,
  value: readonly BaseScreenFragmentDefinition[] | undefined,
): void {
  const state = getDesignerElementState(element);
  if (value === undefined) {
    state.materialLibraryFragments = undefined;
  } else {
    const parsed = parseBaseScreenMaterialLibraryFragments(value);
    if (!parsed.ok) {
      state.runtime.emitDiagnostics(element, parsed.diagnostics);
      return;
    }
    state.materialLibraryFragments = parsed.value;
  }
  state.runtime.renderMaterialLibraryItems(element);
}

export function listMaterialLibraryFragmentItems(
  element: DesignerElementHost,
): readonly BaseScreenResolvedFragmentLibraryItem[] {
  const state = getDesignerElementState(element);
  const catalog = state.catalog;
  if (catalog === undefined) return [];
  const hostFragments = state.materialLibraryFragments;
  const contributions = state.runtimeContributions;
  const memo = fragmentLibraryMemos.get(element);
  if (
    memo !== undefined &&
    memo.catalog === catalog &&
    memo.hostFragments === hostFragments &&
    memo.contributions === contributions
  ) {
    return memo.items;
  }
  const resolved = resolveBaseScreenFragmentLibraryItems({
    catalog,
    ...(hostFragments === undefined ? {} : { hostFragments }),
    pluginFragments: contributions?.listFragments?.() ?? [],
  });
  fragmentLibraryMemos.set(element, {
    catalog,
    hostFragments,
    contributions,
    items: resolved.items,
  });
  if (resolved.diagnostics.length > 0) {
    // 试运行诊断全是 warning：分片只是被隐藏，设计器照常可用。只发诊断事件供宿主记录，
    // 不走 emitDiagnostics——后者会把首条诊断弹成错误通知，启动时一条过期分片就会误报故障。
    element.dispatchEvent(
      new CustomEvent('base-screen-diagnostic', { detail: { diagnostics: resolved.diagnostics } }),
    );
  }
  return resolved.items;
}

/**
 * 按物料库分片 id 插入：与公开 `insertComponentFragment` 走同一条路径（同一解析器、同一事务、
 * 可撤销、成功后选中分片根节点）。未知或已被试运行隐藏的分片返回 undefined，由调用方决定是否忽略。
 *
 * 有 `anchor`（拖放落点）时按落点放置、可越出画布，与单个物料拖放一致；无 `anchor`（点击/回车）
 * 时取可见画布中心并整片贴进画布。
 */
export function insertMaterialLibraryFragment(
  element: DesignerElementHost,
  fragmentId: string,
  anchor?: ScreenPosition,
): ScreenParseResult<ScreenDocument> | undefined {
  const item = listMaterialLibraryFragmentItems(element).find(
    (candidate) => candidate.id === fragmentId,
  );
  if (item === undefined) return undefined;
  return insertComponentFragmentWithPlacement(
    element,
    { ...(anchor === undefined ? {} : { anchor }), ...fragmentBody(item.fragment) },
    anchor === undefined ? 'fit-canvas' : 'at-anchor',
  );
}

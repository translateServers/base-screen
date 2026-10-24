import type { BaseScreenMaterialDataState } from '@base-screen/plugin-core';
import { BOARD_DEGRADED_COLOR } from './identity.js';

/**
 * 数据态降级层：本插件所有物料共用的「失败保留上次画面 + 右上角标」实现。
 *
 * 为什么要一处实现：降级是**数据层的失败语义**（PRD §7.3 / §8.6），不是某个物料的
 * 视觉偏好。8 个物料各写一份必然漂移——角标位置、文案、是否清屏会一个物料一个样，
 * 而冒烟只能按 `[data-board-degraded]` 统一断言。
 *
 * 分工：文案映射在这里（物料只负责「拿到错误码后怎么画」），**重试节拍与宿主级错误
 * 计数不在这里**——那属于宿主的轮询控制器。
 *
 * ## 码表边界（重要，别当成漏映射）
 *
 * 物料侧能收到的错误码是**冻结集**（`packages/contracts/src/diagnostics/material-error.ts`
 * 的 `SCREEN_MATERIAL_ERROR_CODES`，8 个）。更细的宿主码在渲染器边界就被归一了
 * （`packages/renderer/src/renderer/renderer-host-resource.ts` 的
 * `normalizeScreenMaterialError`）：
 *
 * - `HOST_DATASET_PARAMETER_INVALID`（本地参数求值失败）→ **`HOST_RESOURCE_FAILED`**
 * - `HOST_DATASET_UNAVAILABLE`（404）→ **`HOST_RESOURCE_FAILED`**
 * - `HOST_DATASET_VARIABLE_INVALID` → **`HOST_RESOURCE_FAILED`**
 *
 * 因此本表把 `HOST_RESOURCE_FAILED` 写成「数据更新失败」而不是「数据源不可用」：
 * 它实际覆盖「参数错了 / 数据集不存在 / 宿主请求失败」三类原因，「数据源不可用」会
 * 误导值班员以为是断网。**精确原因由宿主承载**（宿主知道自己发出的请求错在哪，见
 * `production.status` 变量的文案），物料角标只表达「这块数据不新鲜了」。
 *
 * 表里保留那些当前不可达的码不是死代码：冻结集一旦扩展（新增数据集细化码），文案
 * 立刻生效，不需要回来改物料。
 *
 * 文案纪律：只用错误码的短文案，不显示 `model.dataState.message`——后者是英文
 * （`'Host dataset request failed.'`），且非冻结 code 的消息已被基座丢弃。
 */
export const BOARD_DEGRADATION_TEXT: Readonly<Record<string, string>> = {
  HOST_RESOURCE_ACCESS_DENIED: '无访问权限',
  HOST_RESOURCE_UNAVAILABLE: '数据源不可用',
  HOST_RESOURCE_TIMEOUT: '数据更新超时',
  // 冻结集里的兜底码：涵盖本地参数非法、数据集 404 与宿主请求失败，故不写成"数据源"。
  HOST_RESOURCE_FAILED: '数据更新失败',
  HOST_RESOURCE_INVALID: '数据格式异常',
  HOST_DATASET_CATALOG_FAILED: '数据集目录不可用',
  HOST_DATASET_DESCRIPTOR_INVALID: '数据格式异常',
  HOST_DATASET_INVALID: '数据格式异常',
  HOST_DATASET_PARAMETER_INVALID: '参数无效',
  HOST_DATASET_BINDING_INVALID: '绑定无效',
  HOST_DATASET_ADAPTER_FAILED: '投影失败',
  HOST_DATASET_UNAVAILABLE: '数据集不可用',
  HOST_DATASET_VARIABLE_INVALID: '变量不可用',
  HOST_VARIABLE_DESCRIPTOR_INVALID: '变量不可用',
  HOST_VARIABLE_CATALOG_FAILED: '变量目录不可用',
};

/** 未知错误码的通用文案：宁可短而准，也不把英文原文抛到屏上。 */
export const BOARD_DEGRADATION_FALLBACK = '数据异常';

/** 角标节点上的属性名：冒烟据此断言「出现了降级角标」。 */
export const BOARD_DEGRADED_BADGE_ATTRIBUTE = 'data-board-degraded-badge';
export const BOARD_DEGRADED_ATTRIBUTE = 'data-board-degraded';

/** 错误码 → 屏上短文案。纯函数，便于单测覆盖全码表。 */
export function degradationText(code: string): string {
  return BOARD_DEGRADATION_TEXT[code] ?? BOARD_DEGRADATION_FALLBACK;
}

/**
 * 是否应该**保留已有画面**而不是画占位符。
 *
 * 真值表：
 * - 从未成功渲染过（`hasFrame === false`）→ false：任何非 ready 态都交给 SDK 状态视图
 *   （首屏就是「加载中 / 加载失败」，没有上一帧可保留）。
 * - 已经成功过 + ready → false：这次要换成新画面（由 `commit()` 就位）。
 * - 已经成功过 + idle/loading/error → true：不清屏。`loading` 尤其重要——3–5 秒一次的
 *   轮询如果每次都清屏重画，屏上会持续闪烁（PRD §2.3 硬要求）。
 */
export function shouldKeepFrame(state: BaseScreenMaterialDataState, hasFrame: boolean): boolean {
  if (!hasFrame) return false;
  return state.status !== 'ready';
}

/**
 * 移除降级角标（幂等）：创建前与恢复成功后都要调用。
 *
 * 只删角标节点与宿主上的同名属性，不碰画面子节点——「保留上次值」正是靠不清屏实现的。
 */
export function clearDegradedBadge(host: HTMLElement): void {
  for (const stale of Array.from(host.querySelectorAll(`[${BOARD_DEGRADED_BADGE_ATTRIBUTE}]`))) {
    stale.remove();
  }
  host.removeAttribute(BOARD_DEGRADED_ATTRIBUTE);
}

/**
 * 在宿主元素右上角放一个降级角标。
 *
 * 硬约束（PRD §7.3 视觉纪律）：12 px、橙 `#fa8c16`、不遮挡读数、**不改变组件几何**、
 * 不闪烁。因此：绝对定位 + `pointer-events:none`、单行 ellipsis、**没有任何
 * transition/animation**；宿主元素只补 `position:relative`（建立定位上下文），
 * 绝不写 `width`/`height`。
 */
export function appendDegradedBadge(
  ownerDocument: Document,
  host: HTMLElement,
  text: string,
): HTMLElement {
  // 幂等：重复失败时不叠出多个角标。
  clearDegradedBadge(host);
  const badge = ownerDocument.createElement('span');
  badge.setAttribute(BOARD_DEGRADED_BADGE_ATTRIBUTE, '');
  // 角标节点自身也带 `data-board-degraded`（PRD 的断言口径）；宿主元素同步同名属性
  // 作为样式钩子。计数断言请用 `[data-board-degraded-badge]`，避免父子各命中一次。
  badge.setAttribute(BOARD_DEGRADED_ATTRIBUTE, '');
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'polite');
  badge.textContent = text;
  badge.style.cssText = [
    'position:absolute',
    'top:2px',
    'right:4px',
    'pointer-events:none',
    'font-size:12px',
    'line-height:1.4',
    'color:' + BOARD_DEGRADED_COLOR,
    'max-width:60%',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'white-space:nowrap',
  ].join(';');
  host.style.position = 'relative';
  host.setAttribute(BOARD_DEGRADED_ATTRIBUTE, '');
  host.appendChild(badge);
  return badge;
}

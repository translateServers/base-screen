/**
 * 检查器每次提交都会整栏 `replaceChildren`（`renderDesignerProperties`），焦点随旧节点
 * 一起被移除，浏览器把 activeElement 退回 body。表现是「改完宽度按回车，再按 Tab 跳不到
 * 高度，得重新用鼠标点」。这里按稳定键记住焦点，重建后找回同一个控件。
 *
 * 键的来源必须是 DOM 上已有的稳定标识（几何/属性的 `data-property`、页面配置的
 * `data-canvas-property`、批量输入的 `data-multi-property`、描述符行与自定义控件的
 * `data-inspector-search-key`），不能依赖元素顺序——顺序会随折叠与密度变化。
 */

export type InspectorFocusTarget =
  | { readonly kind: 'property'; readonly value: string }
  | { readonly kind: 'canvas'; readonly value: string }
  | { readonly kind: 'multi'; readonly value: string }
  | { readonly kind: 'search-key'; readonly value: string };

export interface InspectorFocusSnapshot {
  readonly target: InspectorFocusTarget;
  /** 文本输入的光标位置，重建后按原位置还原（`select()` 会把整段选中，不适合数值框）。 */
  readonly caret: number | null;
}

const FOCUSABLE_SELECTOR = 'input, select, textarea';

export function captureInspectorFocus(container: HTMLElement): InspectorFocusSnapshot | undefined {
  const active = activeElementOf(container);
  if (active === null || !container.contains(active)) return undefined;
  const target = resolveFocusTarget(active);
  if (target === undefined) return undefined;
  return { target, caret: readCaret(active) };
}

export function restoreInspectorFocus(
  container: HTMLElement,
  snapshot: InspectorFocusSnapshot | undefined,
): void {
  if (snapshot === undefined) return;
  const candidate = findFocusTarget(container, snapshot.target);
  if (candidate === null || isDisabled(candidate)) return;
  candidate.focus({ preventScroll: true });
  const caret = snapshot.caret;
  if (caret === null) return;
  setCaret(candidate, caret);
}

function activeElementOf(container: HTMLElement): HTMLElement | null {
  const root = container.getRootNode() as { activeElement?: Element | null } | null;
  const active = root?.activeElement ?? container.ownerDocument?.activeElement ?? null;
  return active === null || active === undefined ? null : (active as HTMLElement);
}

function resolveFocusTarget(element: HTMLElement): InspectorFocusTarget | undefined {
  const property = element.dataset?.property;
  if (property !== undefined) return { kind: 'property', value: property };
  const canvas = element.dataset?.canvasProperty;
  if (canvas !== undefined) return { kind: 'canvas', value: canvas };
  const multi = element.dataset?.multiProperty;
  if (multi !== undefined) return { kind: 'multi', value: multi };
  const searchKey = element.closest<HTMLElement>('[data-inspector-search-key]')?.dataset
    .inspectorSearchKey;
  if (searchKey !== undefined) return { kind: 'search-key', value: searchKey };
  return undefined;
}

function findFocusTarget(container: HTMLElement, target: InspectorFocusTarget): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
    const candidate = resolveFocusTarget(element);
    if (candidate === undefined) continue;
    if (candidate.kind === target.kind && candidate.value === target.value) return element;
  }
  return null;
}

function readCaret(element: HTMLElement): number | null {
  try {
    // number/date 等控件读取 selectionStart 会抛 InvalidStateError。
    const caret = (element as HTMLInputElement).selectionStart;
    return typeof caret === 'number' ? caret : null;
  } catch {
    return null;
  }
}

function setCaret(element: HTMLElement, caret: number): void {
  const field = element as HTMLInputElement;
  if (typeof field.setSelectionRange !== 'function') return;
  try {
    field.setSelectionRange(caret, caret);
  } catch {
    // 部分控件类型（number/date）不支持 setSelectionRange，忽略即可。
  }
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLInputElement).disabled === true;
}

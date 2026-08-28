const DESIGNER_SCROLL_SCOPE_SELECTOR = '[data-designer-scroll-scope]';

interface DesignerScrollPosition {
  readonly left: number;
  readonly top: number;
}

type DesignerScrollRoot = ParentNode & Pick<Node, 'ownerDocument'>;
type DesignerScrollScheduler = (work: () => void) => void;

/**
 * 在属性区同步重渲染前后交接显式标记的滚动上下文。
 *
 * 该控制器只处理带 `data-designer-scroll-scope` 的容器：scope 相同表示重建前后的
 * DOM 承载同一个交互上下文。同步恢复用于普通替换，下一帧再次恢复用于等待弹层定位、
 * max-height 等布局约束生效，避免首次赋值因暂时不可滚动而被浏览器钳制为 0。
 */
export class DesignerScrollContinuityController {
  readonly #schedule: DesignerScrollScheduler | undefined;
  #pending: ReadonlyMap<string, DesignerScrollPosition> | undefined;
  #pendingRoot: DesignerScrollRoot | undefined;
  #restoreScheduled = false;
  #generation = 0;

  constructor(schedule?: DesignerScrollScheduler) {
    this.#schedule = schedule;
  }

  preserve<T>(root: DesignerScrollRoot | null | undefined, render: () => T): T {
    if (root === null || root === undefined) return render();
    const positions = mergePendingPositions(readScopedScrollPositions(root), this.#pending);
    try {
      return render();
    } finally {
      this.#pending = restoreScopedScrollPositions(root, positions);
      this.#pendingRoot = root;
      this.#scheduleRestore();
    }
  }

  dispose(): void {
    this.#generation++;
    this.#pending = undefined;
    this.#pendingRoot = undefined;
    this.#restoreScheduled = false;
  }

  #scheduleRestore(): void {
    if (this.#pending === undefined || this.#pending.size === 0 || this.#restoreScheduled) return;
    this.#restoreScheduled = true;
    const generation = this.#generation;
    const run = (): void => {
      if (generation !== this.#generation) return;
      this.#restoreScheduled = false;
      const root = this.#pendingRoot;
      const positions = this.#pending;
      this.#pending = undefined;
      this.#pendingRoot = undefined;
      if (root !== undefined && positions !== undefined) {
        restoreScopedScrollPositions(root, positions);
      }
    };
    if (this.#schedule !== undefined) {
      this.#schedule(run);
      return;
    }
    scheduleAfterLayout(this.#pendingRoot, run);
  }
}

function readScopedScrollPositions(
  root: DesignerScrollRoot,
): ReadonlyMap<string, DesignerScrollPosition> {
  const positions = new Map<string, DesignerScrollPosition>();
  for (const element of root.querySelectorAll<HTMLElement>(DESIGNER_SCROLL_SCOPE_SELECTOR)) {
    const scope = element.dataset.designerScrollScope;
    if (scope === undefined || scope.length === 0) continue;
    positions.set(scope, { left: element.scrollLeft, top: element.scrollTop });
  }
  return positions;
}

function mergePendingPositions(
  current: ReadonlyMap<string, DesignerScrollPosition>,
  pending: ReadonlyMap<string, DesignerScrollPosition> | undefined,
): ReadonlyMap<string, DesignerScrollPosition> {
  if (pending === undefined || pending.size === 0) return current;
  const merged = new Map(current);
  for (const scope of current.keys()) {
    const position = pending.get(scope);
    if (position !== undefined) merged.set(scope, position);
  }
  return merged;
}

function restoreScopedScrollPositions(
  root: DesignerScrollRoot,
  positions: ReadonlyMap<string, DesignerScrollPosition>,
): ReadonlyMap<string, DesignerScrollPosition> {
  const pending = new Map<string, DesignerScrollPosition>();
  if (positions.size === 0) return pending;
  for (const element of root.querySelectorAll<HTMLElement>(DESIGNER_SCROLL_SCOPE_SELECTOR)) {
    const scope = element.dataset.designerScrollScope;
    if (scope === undefined) continue;
    const position = positions.get(scope);
    if (position === undefined) continue;
    element.scrollLeft = position.left;
    element.scrollTop = position.top;
    if (
      !matchesScrollPosition(element.scrollLeft, position.left) ||
      !matchesScrollPosition(element.scrollTop, position.top)
    ) {
      pending.set(scope, position);
    }
  }
  return pending;
}

function matchesScrollPosition(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.5;
}

function scheduleAfterLayout(root: DesignerScrollRoot | undefined, work: () => void): void {
  const view = root?.ownerDocument?.defaultView;
  if (view?.requestAnimationFrame !== undefined) {
    view.requestAnimationFrame(work);
    return;
  }
  if (view?.queueMicrotask !== undefined) {
    view.queueMicrotask(work);
    return;
  }
  work();
}

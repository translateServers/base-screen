import type { DesignerDatasetWorkbenchStep } from '../../dom/dataset/designer-dataset-types.js';

/**
 * 派生锚点用**段容器**（`[data-ds-section]`），不是段内内容。
 *
 * 折叠分组之后，段内内容在收起时 rect 全 0，且内容总高变短会让「滚到底」提前发生——
 * 按内容矩形派生会把 activeStep 判错（症状：滚到「字段映射」却报 preview）。
 * 段容器本身永远有高度（组头摘要就是它的可见部分），`offsetTop` 在收起时也稳定。
 */
const TRACKED_SECTION_SELECTOR = '[data-ds-section]';

/**
 * 段 → 导航步骤的**唯一映射表**。
 *
 * 只此一处：判据（本文件）与实现（段构造）都不许各自再推一遍——「两处独立推导」正是
 * 今天踩过的同类风险（改一处、另一处静默错）。
 */
const SECTION_STEP = {
  value: 'source',
  source: 'source',
  'host-link': 'source',
  preview: 'preview',
  authoring: 'preview',
} as const satisfies Readonly<Record<string, DesignerDatasetWorkbenchStep>>;

/**
 * 把滚动位置映射成"当前在看哪一段"。
 *
 * 内联面板的三步条已经删掉（它与顶部页签构成双层导航，且 detail 被 CSS 藏成 0 信息），
 * 但滚动派生的 `data-active-step` 仍然有用：它让"滚到哪一段"这件事继续可被观察，
 * 也是工作台步骤导航复用同一套状态的前提。因此**进度条不再是必要条件**。
 */
export class DesignerDataFlowScrollSync {
  #content: HTMLElement | undefined;
  #scrollHandler: (() => void) | undefined;
  #pendingProgrammaticStep: DesignerDatasetWorkbenchStep | undefined;
  #pendingProgrammaticTimer: number | undefined;

  constructor(private readonly onStepChange: (step: DesignerDatasetWorkbenchStep) => void) {}

  bind(panel: HTMLElement): void {
    const content = panel.querySelector<HTMLElement>('.designer-datav-data-flow-content');
    const flow = panel.querySelector<HTMLElement>('.designer-datav-data-flow');
    if (content === null || flow === null) {
      this.clear();
      return;
    }
    if (this.#content === content) {
      this.handleScroll();
      return;
    }
    this.disconnectListener();
    this.#content = content;
    const handler = () => this.handleScroll();
    content.addEventListener('scroll', handler, { passive: true });
    this.#scrollHandler = handler;
    this.handleScroll();
  }

  beginProgrammaticScroll(step: DesignerDatasetWorkbenchStep): void {
    this.#pendingProgrammaticStep = step;
    if (this.#pendingProgrammaticTimer !== undefined) {
      globalThis.clearTimeout(this.#pendingProgrammaticTimer);
    }
    this.#pendingProgrammaticTimer = globalThis.setTimeout(() => {
      this.#pendingProgrammaticStep = undefined;
      this.#pendingProgrammaticTimer = undefined;
      this.handleScroll();
    }, 700) as unknown as number;
  }

  clear(): void {
    this.disconnectListener();
    if (this.#pendingProgrammaticTimer !== undefined) {
      globalThis.clearTimeout(this.#pendingProgrammaticTimer);
      this.#pendingProgrammaticTimer = undefined;
    }
    this.#pendingProgrammaticStep = undefined;
  }

  private handleScroll(): void {
    const content = this.#content;
    if (content === undefined) return;
    const sections = [...content.querySelectorAll<HTMLElement>(TRACKED_SECTION_SELECTOR)];
    if (sections.length === 0) return;
    // 两条规则，都只看段容器的 `offsetTop`：
    // 1) 滚到底：取最后一个「顶边进入视口」的段（用户此刻看到的是尾部几个组）；
    // 2) 否则：取最后一个「顶边已越过激活线」的段。
    const atBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 10;
    const line = atBottom
      ? content.scrollTop + content.clientHeight
      : content.scrollTop + Math.min(content.clientHeight * 0.25, 80);
    let step: DesignerDatasetWorkbenchStep = 'source';
    for (const section of sections) {
      if (section.offsetTop > line) break;
      const mapped = SECTION_STEP[section.dataset.dsSection as keyof typeof SECTION_STEP];
      if (mapped !== undefined) step = mapped;
    }
    this.emitStep(step);
  }

  private emitStep(step: DesignerDatasetWorkbenchStep): void {
    if (this.#pendingProgrammaticStep !== undefined && step !== this.#pendingProgrammaticStep) {
      return;
    }
    this.onStepChange(step);
  }

  private disconnectListener(): void {
    if (this.#content !== undefined && this.#scrollHandler !== undefined) {
      this.#content.removeEventListener('scroll', this.#scrollHandler);
    }
    this.#scrollHandler = undefined;
    this.#content = undefined;
  }
}

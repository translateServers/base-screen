import type { DesignerDatasetWorkbenchStep } from '../../dom/dataset/designer-dataset-types.js';

const TRACKED_SECTION_SELECTOR = [
  '[data-workbench-section="source"]',
  '[data-workbench-section="mapping"]',
  '[data-workbench-section="preview"]',
].join(', ');

/** Keeps the compact data-flow progress navigation aligned with its scroll container. */
export class DesignerDataFlowScrollSync {
  #content: HTMLElement | undefined;
  #scrollHandler: (() => void) | undefined;
  #pendingProgrammaticStep: DesignerDatasetWorkbenchStep | undefined;
  #pendingProgrammaticTimer: number | undefined;

  constructor(private readonly onStepChange: (step: DesignerDatasetWorkbenchStep) => void) {}

  bind(panel: HTMLElement): void {
    const content = panel.querySelector<HTMLElement>('.designer-datav-data-flow-content');
    const progress = panel.querySelector<HTMLElement>('.designer-datav-data-flow-progress');
    const flow = panel.querySelector<HTMLElement>('.designer-datav-data-flow');
    if (content === null || progress === null || flow === null) {
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
    if (content.scrollTop <= 10) {
      this.emitStep('source');
      return;
    }
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 10) {
      const lastStep = trackedStep(sections[sections.length - 1]);
      if (lastStep !== undefined) this.emitStep(lastStep);
      return;
    }
    const contentBox = content.getBoundingClientRect();
    const activationLine = contentBox.top + Math.min(contentBox.height * 0.25, 80);
    let bestSection: HTMLElement | undefined;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const section of sections) {
      const distance = Math.abs(section.getBoundingClientRect().top - activationLine);
      if (distance < minDistance) {
        minDistance = distance;
        bestSection = section;
      }
    }
    const step = trackedStep(bestSection);
    if (step !== undefined) this.emitStep(step);
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

function trackedStep(element: HTMLElement | undefined): DesignerDatasetWorkbenchStep | undefined {
  const step = element?.dataset.workbenchSection;
  return step === 'source' || step === 'mapping' || step === 'preview' ? step : undefined;
}

import type { ScreenDocument } from '@base-screen/contracts';
import { compositeOver, parseCssColorAlpha, type RgbColor } from '@base-screen/core';
import type { DesignerMetricName } from '../../common/observability/designer-metrics.js';
import { DESIGNER_UI_TEXT } from '../../common/ui-text/designer-ui-text.js';
import {
  type DesignerGuardSnapshot,
  evaluateContrastGuard,
} from '../../common/validation/designer-guard.js';
import { measureCanvasContrast } from '../dom/guard/designer-contrast-measure.js';
import {
  type DesignerGuardView,
  guardStripMarkup,
  renderGuardPopover,
} from '../dom/guard/designer-guard-dom.js';

/** 文档变更到测量之间的静默窗口：合并连续编辑，避免守卫自己变成抖动源。 */
const MEASURE_DELAY_MS = 180;
const FALLBACK_BACKGROUND: RgbColor = { r: 255, g: 255, b: 255 };

interface GuardPreview {
  readonly componentId: string;
  /** 预览写入的颜色：只回滚「仍处于预览色」的节点，避免覆盖重新渲染的结果。 */
  readonly color: string;
  readonly records: readonly {
    readonly element: HTMLElement;
    readonly color: string;
    readonly priority: string;
  }[];
}

export class DesignerGuardController {
  #strip: HTMLButtonElement | undefined;
  #popover: HTMLElement | undefined;
  #canvas: HTMLElement | undefined;
  #content: HTMLElement | undefined;
  #elementsByComponent: ReadonlyMap<string, readonly HTMLElement[]> = new Map();
  #view: DesignerGuardView = {
    checked: 0,
    truncated: false,
    issues: [],
    previewComponentId: null,
  };
  #preview: GuardPreview | undefined;
  #open = false;
  #enabled = true;
  #pending: ReturnType<typeof setTimeout> | undefined;
  #changeHandler: ((result: DesignerGuardSnapshot) => void) | undefined;
  #metricHandler: ((name: DesignerMetricName) => void) | undefined;
  #applyHandler: ((componentId: string, color: string) => boolean) | undefined;

  connect(
    strip: HTMLButtonElement,
    popover: HTMLElement,
    canvas: HTMLElement,
    content: HTMLElement,
  ): void {
    this.#strip = strip;
    this.#popover = popover;
    this.#canvas = canvas;
    this.#content = content;
    this.render();
  }

  release(): void {
    this.#cancelPending();
    this.clearPreview();
    this.#strip = undefined;
    this.#popover = undefined;
    this.#canvas = undefined;
    this.#content = undefined;
    this.#open = false;
  }

  setApplyHandler(handler: (componentId: string, color: string) => boolean): void {
    this.#applyHandler = handler;
  }

  setChangeHandler(handler: (result: DesignerGuardSnapshot) => void): void {
    this.#changeHandler = handler;
  }

  setMetricHandler(handler: (name: DesignerMetricName) => void): void {
    this.#metricHandler = handler;
  }

  /** 关掉守卫只停止测量与展示，不写入任何东西；重新打开会立刻补一次测量。 */
  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) return;
    this.#enabled = enabled;
    if (!enabled) this.#cancelPending();
    this.render();
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  readResult(): DesignerGuardSnapshot {
    return {
      enabled: this.#enabled,
      checked: this.#view.checked,
      truncated: this.#view.truncated,
      issues: this.#view.issues,
    };
  }

  schedule(document: ScreenDocument): void {
    if (!this.#enabled) return;
    this.#cancelPending();
    this.#pending = setTimeout(() => {
      this.#pending = undefined;
      this.refresh(document);
    }, MEASURE_DELAY_MS);
  }

  /** 立即测量并刷新：文档或主题变化后由宿主调用。 */
  refresh(document: ScreenDocument): void {
    if (!this.#enabled) return;
    this.clearPreview();
    const canvas = this.#canvas;
    const content = this.#content;
    if (canvas === undefined || content === undefined) return;
    const measurement = measureCanvasContrast({
      content,
      baseBackground: canvasBackground(canvas),
      components: new Map(document.components.map((component) => [component.id, component])),
    });
    this.#elementsByComponent = measurement.textElements;
    const result = evaluateContrastGuard(measurement.samples);
    this.#view = {
      checked: result.checked,
      truncated: measurement.truncated,
      issues: result.issues,
      previewComponentId: null,
    };
    if (result.issues.length > 0) this.#metricHandler?.('guard_fail');
    this.render();
  }

  onClick(target: Element): boolean {
    if (target.closest('[data-guard-toggle]') !== null) {
      this.#open = !this.#open;
      this.render();
      if (this.#open) {
        this.#popover?.querySelector<HTMLButtonElement>('[data-guard-action="close"]')?.focus();
      }
      return true;
    }
    const action = target.closest<HTMLElement>('[data-guard-action]');
    if (action !== null) {
      const name = action.dataset.guardAction;
      if (name === 'close') {
        this.close();
        return true;
      }
      if (name === 'preview') {
        this.preview(action.dataset.guardIssue ?? '');
        return true;
      }
      if (name === 'cancel') {
        this.clearPreview();
        this.render();
        return true;
      }
      if (name === 'apply') {
        this.applyFix(action.dataset.guardIssue ?? '', action.dataset.guardColor ?? '');
        return true;
      }
    }
    if (this.#open && target.closest('[data-guard-popover]') === null) this.close();
    return false;
  }

  onKeyDown(event: KeyboardEvent): boolean {
    if (!this.#open || event.key !== 'Escape') return false;
    event.preventDefault();
    this.close();
    return true;
  }

  /** 预览修复：只覆盖这些文本节点的内联颜色，不动文档。 */
  private preview(componentId: string): void {
    const issue = this.#view.issues.find((item) => item.componentId === componentId);
    const elements = this.#elementsByComponent.get(componentId);
    const suggested = issue?.suggestedColor;
    if (suggested == null || elements === undefined) return;
    this.clearPreview();
    this.#preview = {
      componentId,
      color: suggested,
      records: elements.map((element) => {
        const record = {
          element,
          color: element.style.getPropertyValue('color'),
          priority: element.style.getPropertyPriority('color'),
        };
        element.style.setProperty('color', suggested, 'important');
        return record;
      }),
    };
    this.#view = { ...this.#view, previewComponentId: componentId };
    this.#metricHandler?.('fix_preview');
    this.render();
    this.#popover?.querySelector<HTMLButtonElement>(`[data-guard-action="apply"]`)?.focus();
  }

  private applyFix(componentId: string, color: string): void {
    if (componentId === '' || color === '' || this.#applyHandler === undefined) return;
    if (!this.#applyHandler(componentId, color)) return;
    this.#metricHandler?.('fix_apply');
    this.clearPreview();
  }

  private clearPreview(): void {
    const preview = this.#preview;
    if (preview === undefined) return;
    for (const record of preview.records) {
      // 重新渲染已经改写了该节点的内联颜色时不能回滚：那会把刚应用的结果覆盖掉。
      // 预览写入带 `!important`，重新渲染是普通优先级，因此按「值 + 优先级」一起判定。
      const style = record.element.style;
      if (
        style.getPropertyValue('color') !== preview.color ||
        style.getPropertyPriority('color') !== 'important'
      ) {
        continue;
      }
      if (record.color === '') record.element.style.removeProperty('color');
      else record.element.style.setProperty('color', record.color, record.priority);
    }
    this.#preview = undefined;
    this.#view = { ...this.#view, previewComponentId: null };
  }

  private close(): void {
    this.#open = false;
    this.render();
    this.#strip?.focus();
  }

  private render(): void {
    this.#changeHandler?.(this.readResult());
    const strip = this.#strip;
    if (strip !== undefined) {
      strip.innerHTML = guardStripMarkup(this.#view);
      strip.dataset.state = this.#view.issues.length === 0 ? 'pass' : 'fail';
      strip.setAttribute('aria-expanded', String(this.#open));
      strip.setAttribute('aria-label', DESIGNER_UI_TEXT.guard.stripAria(this.#view.issues.length));
    }
    const popover = this.#popover;
    if (popover === undefined) return;
    popover.hidden = !this.#open;
    if (this.#open) renderGuardPopover(popover, this.#view);
  }

  #cancelPending(): void {
    if (this.#pending === undefined) return;
    clearTimeout(this.#pending);
    this.#pending = undefined;
  }
}

/** 画布底色可能带 alpha，先合成到白色，得到可比较的不透明背景。 */
function canvasBackground(canvas: HTMLElement): RgbColor {
  const layer = parseCssColorAlpha(getComputedStyle(canvas).backgroundColor);
  if (layer === undefined) return FALLBACK_BACKGROUND;
  return compositeOver(layer.color, layer.alpha, FALLBACK_BACKGROUND);
}

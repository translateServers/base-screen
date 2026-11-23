import type { ScreenDocument, ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type { ScreenBlueprintCanvasEffect } from '@base-screen/core';
import type { BaseScreenCanvasChange } from '@base-screen/renderer';
import type { DesignerArtboardId } from '../../common/session/designer-artboard.js';

export interface DesignerPagePreviewCallbacks {
  /** 完整文档（含全部从画布）。 */
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getArtboard: () => DesignerArtboardId;
  readonly setArtboard: (artboard: DesignerArtboardId) => ScreenParseResult<null>;
  /** 状态栏「事件」开着且当前不是弹框画板时才切页。 */
  readonly isEnabled: () => boolean;
  /** 切页完成后按顺序回调（旧页离开 → 新页进入 → 页面已切换），用于分派蓝图事件。 */
  readonly onChange: (change: BaseScreenCanvasChange) => void;
}

/**
 * 设计态的页面切换（ADR-0109 §2.5）：「事件」开着时，蓝图里的「打开页面 / 上一页 / 下一页 / 返回」
 * 直接把设计器切到对应页面的画板，所见即查看器里的那一页。弹框仍由弹框预览层呈现。
 *
 * 切画板会重新渲染画布，所以切换推迟到本轮蓝图分派结束之后（微任务）再做，避免在分派途中替换渲染。
 * 「当前页」取当前画板：正在编辑主画布时视为还没有页面，「下一页」进入第一页。
 */
export class DesignerPagePreviewController {
  #history: string[] = [];
  #queue: ScreenBlueprintCanvasEffect[] = [];
  #scheduled = false;

  constructor(private readonly callbacks: DesignerPagePreviewCallbacks) {}

  apply(effects: readonly ScreenBlueprintCanvasEffect[]): void {
    if (!this.callbacks.isEnabled()) return;
    const pages = this.#pageIds();
    const relevant = effects.filter(
      (effect) => effect.type === 'page-navigation' || pages.includes(effect.canvasId),
    );
    if (relevant.length === 0) return;
    this.#queue.push(...relevant);
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      const queue = this.#queue;
      this.#queue = [];
      for (const effect of queue) this.#run(effect);
    });
  }

  /** 关掉「事件」或替换文档时清空返回历史。 */
  reset(): void {
    this.#history = [];
    this.#queue = [];
  }

  #run(effect: ScreenBlueprintCanvasEffect): void {
    if (!this.callbacks.isEnabled()) return;
    const pages = this.#pageIds();
    const current = this.#currentPage(pages);
    if (effect.type === 'page-navigation') {
      if (effect.operation === 'back') {
        const previous = this.#history.pop();
        if (previous !== undefined) this.#go(previous, undefined, false);
        return;
      }
      const index = current === null ? -1 : pages.indexOf(current);
      const target = pages[effect.operation === 'next' ? index + 1 : index - 1];
      if (target !== undefined) this.#go(target, undefined, true);
      return;
    }
    const open =
      effect.operation === 'open'
        ? true
        : effect.operation === 'close'
          ? false
          : effect.canvasId !== current;
    if (open) {
      this.#go(effect.canvasId, effect.payload, true);
    } else if (effect.canvasId === current) {
      const previous = this.#history.pop();
      if (previous !== undefined) this.#go(previous, undefined, false);
    }
  }

  #go(pageId: string, payload: ScreenJsonValue | undefined, remember: boolean): void {
    const pages = this.#pageIds();
    const from = this.#currentPage(pages);
    if (pageId === from || !pages.includes(pageId)) return;
    const result = this.callbacks.setArtboard(pageId);
    if (!result.ok) return;
    if (from !== null && remember) this.#history.push(from);
    if (from !== null) {
      this.callbacks.onChange({
        type: 'canvas',
        canvasId: from,
        display: 'page',
        open: false,
        reason: 'blueprint',
      });
    }
    this.callbacks.onChange({
      type: 'canvas',
      canvasId: pageId,
      display: 'page',
      open: true,
      reason: 'blueprint',
      ...(payload === undefined ? {} : { payload }),
    });
    this.callbacks.onChange({ type: 'page-changed', from, to: pageId, reason: 'blueprint' });
  }

  #pageIds(): string[] {
    return (this.callbacks.getDocument()?.subCanvases ?? [])
      .filter((canvas) => canvas.display === 'page')
      .map((canvas) => canvas.id);
  }

  #currentPage(pages: readonly string[]): string | null {
    const artboard = this.callbacks.getArtboard();
    return artboard !== null && pages.includes(artboard) ? artboard : null;
  }
}

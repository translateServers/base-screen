/**
 * 设计器尺寸档：把 CSS `@container designer-shell` 的分档结果同步成宿主可读的公共面。
 *
 * 阈值与 adaptivity.css 的容器查询逐字一致，口径是 `:host` 的内容盒：
 * - 完整档：内容宽 > 1043
 * - 窄栏档：内容宽 <= 1043
 * - 降级档：内容宽 <= 895 或内容高 <= 639
 *
 * 这三个数字 = 栅格账（1042 / 894 / 638）+ `.designer` 自身的两条 1px 边框 − 1。
 * 进入新档位严格使用 CSS 阈值；从更窄档恢复时额外多留 2px，避免宿主在阈值附近
 * 反复收起/展开自己的侧栏造成抖动。
 */
export type DesignerSizeTier = 'full' | 'compact' | 'degraded';

export const DESIGNER_SIZE_TIER_LIMITS = {
  /** 内容宽不超过该值进入窄栏档（= 完整档下限 1044 − 1）。 */
  compactMaxWidth: 1043,
  /** 内容宽不超过该值进入降级档（= 窄栏档下限 896 − 1）。 */
  degradedMaxWidth: 895,
  /** 内容高不超过该值进入降级档（= 可用高度 640 − 1）。 */
  degradedMaxHeight: 639,
} as const;

/** 恢复档位时的滞回量（像素）。 */
export const DESIGNER_SIZE_TIER_HYSTERESIS = 2;

export const BASE_SCREEN_DESIGNER_SIZE_CHANGE_EVENT = 'base-screen-designer-size-change';

export interface DesignerSizeSample {
  readonly width: number;
  readonly height: number;
}

export interface BaseScreenDesignerSizeChangeEventDetail {
  readonly tier: DesignerSizeTier;
  readonly degraded: boolean;
  readonly width: number;
  readonly height: number;
}

/**
 * 纯函数：按容器内容盒尺寸判定档位。
 *
 * 传入 `previous` 时启用滞回：进入更窄档位仍在 CSS 阈值上，恢复到更宽档位则要求
 * 越过阈值 2px。尺寸尚未布局（0 或非有限值，例如 `display:none`）时保持上一档。
 */
export function classifyDesignerSize(
  sample: DesignerSizeSample,
  previous?: DesignerSizeTier,
): DesignerSizeTier {
  const { width, height } = sample;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return previous ?? 'degraded';
  }
  const limits = DESIGNER_SIZE_TIER_LIMITS;
  const margin = previous === undefined ? 0 : DESIGNER_SIZE_TIER_HYSTERESIS;
  if (previous === 'degraded') {
    const recovered =
      width > limits.degradedMaxWidth + margin && height > limits.degradedMaxHeight + margin;
    if (!recovered) return 'degraded';
  } else if (width <= limits.degradedMaxWidth || height <= limits.degradedMaxHeight) {
    return 'degraded';
  }
  if (previous === 'compact') {
    return width > limits.compactMaxWidth + margin ? 'full' : 'compact';
  }
  if (previous === 'full') {
    return width <= limits.compactMaxWidth ? 'compact' : 'full';
  }
  return width <= limits.compactMaxWidth ? 'compact' : 'full';
}

/**
 * 观察宿主元素的内容盒尺寸，维护 `data-size-tier` / `data-size-degraded`，并在档位
 * 变化时派发 `base-screen-designer-size-change`。
 *
 * ResizeObserver 回调统一合并到下一帧执行；只写属性与事件，不改文档、不触发布局。
 * 观察对象与 CSS 容器是同一个元素（`:host`），保证两边口径一致。
 */
export class DesignerSizeTierController {
  #element: HTMLElement | undefined;
  #observer: ResizeObserver | undefined;
  #frame: number | undefined;
  #pendingSize: DesignerSizeSample | undefined;
  #tier: DesignerSizeTier | undefined;
  #generation = 0;

  /** 当前档位（未同步过时为 undefined）。 */
  get tier(): DesignerSizeTier | undefined {
    return this.#tier;
  }

  connect(element: HTMLElement): void {
    if (this.#element === element && this.#observer !== undefined) return;
    this.disconnect();
    this.#element = element;
    this.#generation++;
    if (typeof ResizeObserver !== 'undefined') {
      this.#observer = new ResizeObserver(this.onResize);
      this.#observer.observe(element);
    }
    // 不等首帧回调：宿主在元素就绪的同一任务里就能读到档位。
    this.sync();
  }

  disconnect(): void {
    this.#generation++;
    const view = this.#element?.ownerDocument.defaultView;
    if (this.#frame !== undefined) {
      view?.cancelAnimationFrame(this.#frame);
      this.#frame = undefined;
    }
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#element = undefined;
    this.#pendingSize = undefined;
  }

  private readonly onResize = (entries: ResizeObserverEntry[]): void => {
    const entry = entries[entries.length - 1];
    if (entry === undefined) return;
    this.#pendingSize = { width: entry.contentRect.width, height: entry.contentRect.height };
    this.scheduleSync();
  };

  private scheduleSync(): void {
    if (this.#frame !== undefined) return;
    const view = this.#element?.ownerDocument.defaultView;
    if (view === null || view === undefined) {
      this.sync();
      return;
    }
    const generation = this.#generation;
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = undefined;
      if (generation !== this.#generation) return;
      this.sync();
    });
  }

  private sync(): void {
    const element = this.#element;
    if (element === undefined || !element.isConnected) return;
    const sample = this.#pendingSize ?? {
      width: element.clientWidth,
      height: element.clientHeight,
    };
    this.#pendingSize = undefined;
    if (sample.width <= 0 || sample.height <= 0) return;
    this.apply(element, sample);
  }

  private apply(element: HTMLElement, sample: DesignerSizeSample): void {
    const tier = classifyDesignerSize(sample, this.#tier);
    if (tier === this.#tier) return;
    this.#tier = tier;
    element.dataset.sizeTier = tier;
    element.toggleAttribute('data-size-degraded', tier === 'degraded');
    element.dispatchEvent(
      new CustomEvent<BaseScreenDesignerSizeChangeEventDetail>(
        BASE_SCREEN_DESIGNER_SIZE_CHANGE_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: {
            tier,
            degraded: tier === 'degraded',
            width: sample.width,
            height: sample.height,
          },
        },
      ),
    );
  }
}

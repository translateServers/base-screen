import type {
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenResourceExecutionContext,
} from '@base-screen/contracts';

/**
 * 仅实例内、仅 in-flight 的宿主请求协调（Data Runtime Hardening / DRH-R2/R3）。
 *
 * - raw query identity 完全相同的可共享请求合并为一次宿主 resolve；
 *   `componentId` 仅审计、不进 key。
 * - 共享只发生在显式声明 `queryScope: 'resource'` 的资源类型上；缺省组件域不共享。
 * - 槽位身份（slot identity）不透明：每次新请求签发独立槽位 ID，释放/超时/合并
 *   按槽位定位，而不是按 raw key。未声明共享的相同 raw key 请求因此拥有独立
 *   槽位、独立宿主 resolve 与独立 settle 行为，互不覆盖、互不阻塞。
 * - 每个消费者独立离开只移除自身订阅；最后一个消费者离开才 abort 宿主请求。
 * - 完成后不缓存：结果分发后条目立即释放。
 */

export type SharedResolution =
  | { readonly kind: 'ok'; readonly value: ScreenJsonValue }
  | { readonly kind: 'failure'; readonly diagnostics: ScreenParseResult<ScreenJsonValue> }
  | { readonly kind: 'timeout' };

type SharedRequest = {
  /** 不透明槽位 ID：释放/超时/合并的定位键，绝不与 raw key 混用。 */
  readonly slotId: string;
  readonly key: string;
  readonly resourceType: string;
  readonly consumers: Set<string>;
  readonly controller: AbortController;
  readonly promise: Promise<SharedResolution>;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export type CoordinatorRequestResult = {
  readonly resolution: Promise<SharedResolution>;
  readonly shared: boolean;
  readonly slotId: string;
};

export class ResourceRequestCoordinator {
  #requests = new Map<string, SharedRequest>();
  #nextSlotId = 0;

  constructor(
    private readonly resourcePort: ScreenHostResourcePort,
    private readonly isShareable: (resourceType: string) => boolean,
    private readonly timeoutMs: number,
    private readonly onShared?: (
      key: string,
      componentId: string,
      context: ScreenResourceExecutionContext | undefined,
    ) => void,
  ) {}

  request(
    key: string,
    resourceType: string,
    componentId: string,
    request: ScreenHostResourceRequest,
    context?: ScreenResourceExecutionContext,
  ): CoordinatorRequestResult {
    if (this.isShareable(resourceType)) {
      for (const entry of this.#requests.values()) {
        if (entry.key !== key) continue;
        entry.consumers.add(componentId);
        this.onShared?.(key, componentId, context);
        return { resolution: entry.promise, shared: true, slotId: entry.slotId };
      }
    }
    const slotId = `request-slot-${++this.#nextSlotId}`;
    return {
      resolution: this.#start(slotId, key, resourceType, componentId, request, context),
      shared: false,
      slotId,
    };
  }

  release(slotId: string, componentId: string): void {
    const entry = this.#requests.get(slotId);
    if (entry === undefined) return;
    entry.consumers.delete(componentId);
    if (entry.consumers.size === 0) {
      this.#finish(entry);
    }
  }

  abortAll(): void {
    for (const entry of this.#requests.values()) {
      this.#finish(entry);
    }
    this.#requests.clear();
  }

  get pending(): number {
    return this.#requests.size;
  }

  /** 指定槽位是否仍有进行中请求（按不透明槽位 ID，而非 raw key）。 */
  isPending(slotId: string): boolean {
    return this.#requests.has(slotId);
  }

  #start(
    slotId: string,
    key: string,
    resourceType: string,
    componentId: string,
    request: ScreenHostResourceRequest,
    context: ScreenResourceExecutionContext | undefined,
  ): Promise<SharedResolution> {
    const controller = new AbortController();
    let settle: (resolution: SharedResolution) => void = () => {};
    const promise = new Promise<SharedResolution>((resolve) => {
      settle = resolve;
    });
    const entry: SharedRequest = {
      slotId,
      key,
      resourceType,
      consumers: new Set([componentId]),
      controller,
      promise,
      timer: undefined,
    };
    entry.timer = setTimeout(() => {
      if (this.#requests.get(slotId) !== entry) return;
      controller.abort();
      this.#requests.delete(slotId);
      settle({ kind: 'timeout' });
    }, this.timeoutMs);
    this.#requests.set(slotId, entry);

    let resultPromise: ReturnType<ScreenHostResourcePort['resolve']>;
    try {
      resultPromise = this.resourcePort.resolve(request, {
        signal: controller.signal,
        ...(context === undefined ? {} : { context }),
      });
    } catch {
      if (this.#requests.get(slotId) === entry) this.#requests.delete(slotId);
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      settle({ kind: 'failure', diagnostics: { ok: false as const, diagnostics: [] } });
      return promise;
    }
    void resultPromise.then(
      (result) => {
        if (this.#requests.get(slotId) !== entry) return;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        this.#requests.delete(slotId);
        settle(
          result.ok
            ? { kind: 'ok', value: result.value }
            : { kind: 'failure', diagnostics: result },
        );
      },
      () => {
        if (this.#requests.get(slotId) !== entry) return;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        this.#requests.delete(slotId);
        settle({ kind: 'failure', diagnostics: { ok: false as const, diagnostics: [] } });
      },
    );
    return promise;
  }

  #finish(entry: SharedRequest): void {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.controller.abort();
    if (this.#requests.get(entry.slotId) === entry) {
      this.#requests.delete(entry.slotId);
    }
  }
}

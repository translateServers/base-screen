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
 * - 每个消费者独立离开只移除自身订阅；最后一个消费者离开才 abort 宿主请求。
 * - 完成后不缓存：结果分发后条目立即释放。
 */

export type SharedResolution =
  | { readonly kind: 'ok'; readonly value: ScreenJsonValue }
  | { readonly kind: 'failure'; readonly diagnostics: ScreenParseResult<ScreenJsonValue> }
  | { readonly kind: 'timeout' };

type SharedRequest = {
  readonly key: string;
  readonly resourceType: string;
  readonly consumers: Set<string>;
  readonly controller: AbortController;
  readonly promise: Promise<SharedResolution>;
  timer: ReturnType<typeof setTimeout> | undefined;
};

export class ResourceRequestCoordinator {
  #requests = new Map<string, SharedRequest>();

  constructor(
    private readonly resourcePort: ScreenHostResourcePort,
    private readonly isShareable: (resourceType: string) => boolean,
    private readonly timeoutMs: number,
    private readonly onShared?: (key: string, componentId: string) => void,
  ) {}

  request(
    key: string,
    resourceType: string,
    componentId: string,
    request: ScreenHostResourceRequest,
    context?: ScreenResourceExecutionContext,
  ): { readonly resolution: Promise<SharedResolution>; readonly shared: boolean } {
    const existing = this.#requests.get(key);
    if (existing !== undefined && this.isShareable(resourceType)) {
      existing.consumers.add(componentId);
      this.onShared?.(key, componentId);
      return { resolution: existing.promise, shared: true };
    }
    return {
      resolution: this.#start(key, resourceType, componentId, request, context),
      shared: false,
    };
  }

  release(key: string, componentId: string): void {
    const entry = this.#requests.get(key);
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

  /** 该 raw key 是否有进行中的共享请求（用于同组件同 key 刷新合并）。 */
  isPending(key: string): boolean {
    return this.#requests.has(key);
  }

  #start(
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
      key,
      resourceType,
      consumers: new Set([componentId]),
      controller,
      promise,
      timer: undefined,
    };
    entry.timer = setTimeout(() => {
      if (this.#requests.get(key) !== entry) return;
      controller.abort();
      this.#requests.delete(key);
      settle({ kind: 'timeout' });
    }, this.timeoutMs);
    this.#requests.set(key, entry);

    let resultPromise: ReturnType<ScreenHostResourcePort['resolve']>;
    try {
      resultPromise = this.resourcePort.resolve(request, {
        signal: controller.signal,
        ...(context === undefined ? {} : { context }),
      });
    } catch {
      if (this.#requests.get(key) === entry) this.#requests.delete(key);
      if (entry.timer !== undefined) clearTimeout(entry.timer);
      settle({ kind: 'failure', diagnostics: { ok: false as const, diagnostics: [] } });
      return promise;
    }
    void resultPromise.then(
      (result) => {
        if (this.#requests.get(key) !== entry) return;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        this.#requests.delete(key);
        settle(
          result.ok
            ? { kind: 'ok', value: result.value }
            : { kind: 'failure', diagnostics: result },
        );
      },
      () => {
        if (this.#requests.get(key) !== entry) return;
        if (entry.timer !== undefined) clearTimeout(entry.timer);
        this.#requests.delete(key);
        settle({ kind: 'failure', diagnostics: { ok: false as const, diagnostics: [] } });
      },
    );
    return promise;
  }

  #finish(entry: SharedRequest): void {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.controller.abort();
    if (this.#requests.get(entry.key) === entry) {
      this.#requests.delete(entry.key);
    }
  }
}

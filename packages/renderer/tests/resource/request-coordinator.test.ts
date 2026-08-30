import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourceBinding,
  ScreenHostResourceParameter,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';

class FakeMaterialElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {} as CSSStyleDeclaration;
  model: BaseScreenMaterialModel | undefined;
  root: FakeRoot | undefined;

  addEventListener(): void {}
  removeEventListener(): void {}

  remove(): void {
    if (this.root !== undefined) {
      const index = this.root.children.indexOf(this);
      if (index >= 0) this.root.children.splice(index, 1);
    }
  }
}

class FakeRoot {
  readonly children: FakeMaterialElement[] = [];
  readonly style = {} as CSSStyleDeclaration;

  appendChild(element: FakeMaterialElement): FakeMaterialElement {
    element.root = this;
    this.children.push(element);
    return element;
  }
}

function createCatalog(type = 'base.test'): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type,
    tagName: 'base-screen-test',
    name: 'Test',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 100, height: 40 },
    defaultProps: {},
    defaultStyle: {},
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['host-resource'],
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
  };
  return {
    get: (materialType) => (materialType === type ? entry : undefined),
    has: (materialType) => materialType === type,
    list: () => [entry],
  };
}

function contributionIndex(shareable: boolean): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'dataset'
        ? {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset',
            configSchema: {
              kind: 'object',
              properties: { limit: { kind: 'number' } },
              required: [],
            },
            ...(shareable ? { queryScope: 'resource' as const } : {}),
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function component(
  id: string,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId: null,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex: 0,
    status: { locked: false, hidden: false },
    props: {},
    style: {},
    dataSource,
  };
}

function document(components: readonly ScreenComponentNode[]): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables: [],
    blueprint: { rules: [] },
  };
}

function hostSource(
  resourceId: string,
  params: Readonly<Record<string, ScreenHostResourceParameter>> = {},
  binding: ScreenHostResourceBinding | null = null,
): ScreenComponentNode['dataSource'] {
  return {
    type: 'host-resource',
    resourceType: 'dataset',
    resourceId,
    params,
    binding,
  } as ScreenComponentNode['dataSource'];
}

type PendingRequest = {
  readonly request: ScreenHostResourceRequest;
  readonly signal: ScreenAbortSignal;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
  rejectRequest: (reason: unknown) => void;
};

function createDeferredPort(): {
  readonly port: ScreenHostResourcePort;
  readonly requests: PendingRequest[];
} {
  const requests: PendingRequest[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (request, options) => {
      const pending: PendingRequest = {
        request,
        signal: options.signal,
        aborted: false,
        resolveRequest: () => {},
        rejectRequest: () => {},
      };
      requests.push(pending);
      options.signal.addEventListener('abort', () => {
        pending.aborted = true;
      });
      return new Promise<ScreenParseResult<ScreenJsonValue>>((resolve, reject) => {
        pending.resolveRequest = resolve;
        pending.rejectRequest = reject;
      });
    },
  };
  return { port, requests };
}

async function flush(times = 4): Promise<void> {
  for (let index = 0; index < times; index++) {
    await Promise.resolve();
  }
}

describe('Renderer request coordination (DRH-R2/R3)', () => {
  it('shares one in-flight host resolve for identical shareable raw keys', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders', { limit: { kind: 'literal', value: 5 } });

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(root.children[1]?.model?.dataState).toMatchObject({ status: 'ready' });
    renderer.dispose();
  });

  it('keeps same-key requests isolated when queryScope is not declared', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(false),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);
    renderer.dispose();
  });

  it('non-shareable same-key consumers settle independently on distinct slots (RB1)', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(false),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);

    // 两个同 raw key 的请求各自独立 settle：a 成功、b 失败，互不覆盖。
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    requests[1]!.resolveRequest({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'HOST_RESOURCE_ACCESS_DENIED', path: [], message: 'denied' },
      ],
    });
    await flush();
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(root.children[1]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_ACCESS_DENIED',
    });

    // 移除一个消费者不影响另一个的已完成终态，也不误 abort 对方的请求。
    expect(renderer.render(document([component('a', source)])).ok).toBe(true);
    expect(requests[1]!.aborted).toBe(false);

    // 完成后 a 的刷新得到全新独立请求（b 已离开）。
    renderer.refreshData('a');
    await flush();
    expect(requests).toHaveLength(3);
    expect(requests[2]!.request.componentId).toBe('a');
    expect(requests[2]!.aborted).toBe(false);
    renderer.dispose();
  });

  it('coalesces only the same-component pending refresh, never a non-shareable same-key sibling (RB1)', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(false),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);

    // a 与 b 各自 pending：重复刷新 a 只合并 a 自己的槽位，不取消 b、也不把
    // 两个组件错误合并。
    renderer.refreshData('a');
    renderer.refreshData('a');
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => !request.aborted)).toBe(true);

    renderer.refreshData('b');
    expect(requests).toHaveLength(2);

    // a 先 settle 后再刷新：只产生 a 的新请求，b 的进行中请求保持独立不 abort。
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    renderer.refreshData('a');
    await flush();
    expect(requests).toHaveLength(3);
    expect(requests[2]!.request.componentId).toBe('a');
    expect(requests[1]!.aborted).toBe(false);
    renderer.dispose();
  });

  it('never merges different params or resource ids', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });

    expect(
      renderer.render(
        document([
          component('a', hostSource('orders', { limit: { kind: 'literal', value: 5 } })),
          component('b', hostSource('orders', { limit: { kind: 'literal', value: 10 } })),
          component('c', hostSource('other')),
        ]),
      ).ok,
    ).toBe(true);
    expect(requests).toHaveLength(3);
    renderer.dispose();
  });

  it('a consumer leaving removes only its subscription; the last consumer abort aborts the host request', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    expect(renderer.render(document([component('b', source)])).ok).toBe(true);
    expect(requests[0]!.aborted).toBe(false);

    expect(renderer.render(document([])).ok).toBe(true);
    expect(requests[0]!.aborted).toBe(true);
    renderer.dispose();
  });

  it('releases completed results instead of caching across renders', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source)])).ok).toBe(true);
    expect(requests).toHaveLength(1);
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();

    expect(renderer.render(document([component('b', source)])).ok).toBe(true);
    expect(requests).toHaveLength(2);
    renderer.dispose();
  });

  it('distributes one consistent failure terminal state to every current consumer', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    requests[0]!.resolveRequest({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'HOST_RESOURCE_ACCESS_DENIED', path: [], message: 'denied' },
      ],
    });
    await flush();
    expect(root.children[0]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_ACCESS_DENIED',
    });
    expect(root.children[1]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_ACCESS_DENIED',
    });
    renderer.dispose();
  });

  it('distributes one consistent timeout terminal state to every current consumer', async () => {
    vi.useFakeTimers();
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(true),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
      resourceTimeoutMs: 100,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(root.children[0]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_TIMEOUT',
    });
    expect(root.children[1]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_TIMEOUT',
    });
    renderer.dispose();
    vi.useRealTimers();
  });

  it('completion and timeout each settle only their own non-shareable slot (RB1)', async () => {
    vi.useFakeTimers();
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(false),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
      resourceTimeoutMs: 100,
    });
    const source = hostSource('orders');

    expect(renderer.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);

    // a 的槽位先完成：只结算 a，b 的同 raw key 槽位保持 pending、不被 abort。
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await vi.advanceTimersByTimeAsync(10);
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(requests[1]!.aborted).toBe(false);
    expect(root.children[1]?.model?.dataState).toMatchObject({ status: 'loading' });

    // 超时只命中 b 的槽位：a 的完成终态不被覆盖、不重新进入 loading。
    await vi.advanceTimersByTimeAsync(200);
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(root.children[1]?.model?.dataState).toMatchObject({
      status: 'error',
      code: 'HOST_RESOURCE_TIMEOUT',
    });

    // 超时后 a 可独立刷新得到全新槽位请求，且不触碰 b 已结束的槽位。
    renderer.refreshData('a');
    await flush();
    expect(requests).toHaveLength(3);
    expect(requests[2]!.request.componentId).toBe('a');
    expect(requests[2]!.aborted).toBe(false);
    renderer.dispose();
    vi.useRealTimers();
  });

  it('a late resolve for a released non-shareable slot is discarded and never touches the sibling (RB1)', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: contributionIndex(false),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });
    const source5 = hostSource('orders', { limit: { kind: 'literal', value: 5 } });
    const source10 = hostSource('orders', { limit: { kind: 'literal', value: 10 } });

    expect(renderer.render(document([component('a', source5), component('b', source5)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(2);
    const aRequest = requests[0]!;
    const bRequest = requests[1]!;

    // a 的 raw identity 变化：释放 a 的旧槽位（abort），只为 a 启动新请求。
    expect(renderer.render(document([component('a', source10), component('b', source5)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(3);
    expect(aRequest.aborted).toBe(true);
    expect(bRequest.aborted).toBe(false);
    expect(requests[2]!.request.componentId).toBe('a');

    // 旧槽位的迟到结果被丢弃：a 保持新请求 loading，b 的独立槽位不受影响。
    aRequest.resolveRequest({ ok: true, value: { stale: true }, diagnostics: [] });
    await flush();
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'loading' });
    expect(root.children[1]?.model?.dataState).toMatchObject({ status: 'loading' });

    // b 的槽位正常完成：只结算 b。
    bRequest.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    expect(root.children[1]?.model?.dataState).toMatchObject({ status: 'ready' });
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'loading' });
    renderer.dispose();
  });

  it('shareable merging stays within one renderer instance (RB1)', async () => {
    const rootA = new FakeRoot();
    const rootB = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const createRenderer = (root: FakeRoot) =>
      createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        contributionIndex: contributionIndex(true),
        mode: 'viewer',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: port,
      });
    const rendererA = createRenderer(rootA);
    const rendererB = createRenderer(rootB);
    const source = hostSource('orders');

    expect(rendererA.render(document([component('a', source), component('b', source)])).ok).toBe(
      true,
    );
    expect(requests).toHaveLength(1);

    // 第二个实例即使共享同一 raw key，也不与第一个实例的 in-flight 槽位合并。
    expect(rendererB.render(document([component('c', source)])).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.request.componentId).toBe('c');
    expect(requests[0]!.aborted).toBe(false);
    rendererA.dispose();
    rendererB.dispose();
  });
});

import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourceBinding,
  ScreenHostResourceParameter,
  ScreenHostResourcePort,
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
import { createBaseScreenRenderer } from '../src/renderer.js';

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
    resolve: (_request, options) => {
      const pending: PendingRequest = {
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
});

import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenResourceExecutionContext,
  ScreenResourceObserverEvent,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../src/renderer/renderer.js';

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

function shareableIndex(): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'dataset'
        ? {
            kind: 'dataResourceType',
            id: 'dataset',
            name: 'Dataset',
            configSchema: { kind: 'object', properties: {}, required: [] },
            queryScope: 'resource',
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function component(id: string): ScreenComponentNode {
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
    dataSource: {
      type: 'host-resource',
      resourceType: 'dataset',
      resourceId: 'orders',
      params: {},
      binding: null,
    },
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

type PendingRequest = {
  readonly signal: ScreenAbortSignal;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
};

function createDeferredPort(): {
  readonly port: ScreenHostResourcePort;
  readonly requests: PendingRequest[];
} {
  const requests: PendingRequest[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (_request, options) => {
      const pending: PendingRequest = { signal: options.signal, resolveRequest: () => {} };
      requests.push(pending);
      return new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
        pending.resolveRequest = resolve;
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

describe('Renderer observer events (DRH-R8)', () => {
  it('emits started/succeeded/adapted with identity, context, counts, and no payload', async () => {
    const events: ScreenResourceObserverEvent[] = [];
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: shareableIndex(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: (event) => events.push(event),
      instanceId: 'instance-1',
      executionMode: 'viewer',
      resourcePort: {
        resolve: async () => ({
          ok: true as const,
          value: { fields: [{ id: 'a', label: 'A', valueType: 'string' }], rows: [{ a: 'x' }] },
          diagnostics: [],
        }),
      },
    });

    expect(renderer.render(document([component('c1')])).ok).toBe(true);
    await flush();
    renderer.dispose();

    const types = events.map((event) => event.type);
    expect(types).toEqual(['started', 'succeeded', 'adapted']);
    for (const event of events) {
      expect(event.componentId).toBe('c1');
      expect(event.resourceType).toBe('dataset');
      expect(event.resourceId).toBe('orders');
      expect(event.context.instanceId).toBe('instance-1');
      expect(event.context.mode).toBe('viewer');
      expect(typeof event.requestId).toBe('string');
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(event)).not.toContain('params');
      expect(Object.keys(event)).not.toContain('payload');
      expect(Object.keys(event)).not.toContain('message');
    }
    expect(events.find((event) => event.type === 'succeeded')?.rowCount).toBe(1);
    expect(events.find((event) => event.type === 'succeeded')?.fieldCount).toBe(1);
  });

  it('emits shared for a second consumer of the same shareable request', async () => {
    const events: ScreenResourceObserverEvent[] = [];
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: shareableIndex(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: (event) => events.push(event),
      instanceId: 'instance-1',
      executionMode: 'viewer',
      resourcePort: port,
    });

    expect(renderer.render(document([component('a'), component('b')])).ok).toBe(true);
    expect(events.filter((event) => event.type === 'started')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'shared')).toHaveLength(1);
    expect(events.find((event) => event.type === 'shared')?.componentId).toBe('b');
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();
    renderer.dispose();
  });

  it('emits failed with the normalized frozen code on host failure', async () => {
    const events: ScreenResourceObserverEvent[] = [];
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: (event) => events.push(event),
      instanceId: 'instance-1',
      executionMode: 'viewer',
      resourcePort: {
        resolve: async () => ({
          ok: false as const,
          diagnostics: [
            {
              severity: 'error' as const,
              code: 'HOST_RESOURCE_ACCESS_DENIED',
              path: [],
              message: 'denied',
            },
          ],
        }),
      },
    });

    expect(renderer.render(document([component('c1')])).ok).toBe(true);
    await flush();
    renderer.dispose();

    const failed = events.find((event) => event.type === 'failed');
    expect(failed?.code).toBe('HOST_RESOURCE_ACCESS_DENIED');
    expect('message' in (failed ?? {})).toBe(false);
    expect(Object.keys(failed ?? {})).not.toContain('payload');
    expect(Object.keys(failed ?? {})).not.toContain('params');
  });

  it('emits timed-out with the frozen code and never carries host payload', async () => {
    vi.useFakeTimers();
    const events: ScreenResourceObserverEvent[] = [];
    const root = new FakeRoot();
    const { port } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: (event) => events.push(event),
      instanceId: 'instance-1',
      executionMode: 'viewer',
      resourcePort: port,
      resourceTimeoutMs: 100,
    });

    expect(renderer.render(document([component('c1')])).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    const timedOut = events.find((event) => event.type === 'timed-out');
    expect(timedOut?.code).toBe('HOST_RESOURCE_TIMEOUT');
    expect(timedOut?.requestId).toBeDefined();
    renderer.dispose();
    vi.useRealTimers();
  });

  it('isolates throwing observers without breaking resolution', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: () => {
        throw new Error('observer boom');
      },
      instanceId: 'instance-1',
      executionMode: 'viewer',
      resourcePort: {
        resolve: async () => ({ ok: true as const, value: { ready: true }, diagnostics: [] }),
      },
    });

    expect(renderer.render(document([component('c1')])).ok).toBe(true);
    await flush();
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'ready' });
    renderer.dispose();
  });

  it('observer events carry the same execution context as the host resolve (RB2)', async () => {
    const events: ScreenResourceObserverEvent[] = [];
    const seenContexts: ScreenResourceExecutionContext[] = [];
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      contributionIndex: shareableIndex(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      observer: (event) => events.push(event),
      instanceId: 'instance-1',
      executionMode: 'viewer',
      projectId: 'proj-9',
      documentRevision: 'rev-3',
      resourcePort: {
        resolve: (_request, options) => {
          seenContexts.push(options.context!);
          return Promise.resolve({
            ok: true as const,
            value: { fields: [{ id: 'a', label: 'A', valueType: 'string' }], rows: [{ a: 'x' }] },
            diagnostics: [],
          });
        },
      },
    });

    expect(
      renderer.render(document([component('c1')]), { trigger: 'polling', traceId: 'trace-abc' }).ok,
    ).toBe(true);
    await flush();
    renderer.dispose();

    expect(seenContexts).toHaveLength(1);
    for (const event of events) {
      expect(event.context).toEqual(seenContexts[0]);
      expect(event.context).toMatchObject({
        instanceId: 'instance-1',
        mode: 'viewer',
        trigger: 'polling',
        traceId: 'trace-abc',
        projectId: 'proj-9',
        documentRevision: 'rev-3',
      });
    }
    // 同一 resolve 的所有事件都指向同一上下文数据（trigger/trace 不被其他组件消费）。
    expect(events.filter((event) => event.type === 'started')[0]?.context).toEqual(
      events.filter((event) => event.type === 'succeeded')[0]?.context,
    );
  });
});

import type {
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeNode {
  readonly style = {} as CSSStyleDeclaration;
  removed = false;

  appendChild<T>(child: T): T {
    return child;
  }

  remove(): void {
    this.removed = true;
  }
}

class FakeShadowRoot extends FakeNode {}

class FakeDocument {
  createElement(): FakeNode {
    return new FakeNode();
  }
}

function catalog(): BaseScreenMaterialCatalog {
  return {
    get: () => undefined,
    has: () => false,
    list: () => [],
  };
}

function resourcePort(): ScreenHostResourcePort {
  return { resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }) };
}

function variablePort(): ScreenHostVariablePort {
  return { resolve: async () => ({ ok: true as const, value: {}, diagnostics: [] }) };
}

async function createViewer(): Promise<
  InstanceType<typeof import('../src/viewer.js')['BaseScreenViewerElement']>
> {
  const ownerDocument = new FakeDocument();
  class FakeHTMLElement extends FakeNode {
    isConnected = true;
    ownerDocument = ownerDocument as unknown as Document;
    shadowRoot: FakeShadowRoot | null = null;

    attachShadow(): FakeShadowRoot {
      this.shadowRoot = new FakeShadowRoot();
      return this.shadowRoot;
    }

    dispatchEvent(): boolean {
      return true;
    }
  }
  class FakeCustomEvent {
    constructor(
      readonly type: string,
      readonly init?: unknown,
    ) {}
  }
  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('CustomEvent', FakeCustomEvent);
  const { BaseScreenViewerElement } = await import('../src/viewer.js');
  return new BaseScreenViewerElement();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('BaseScreenViewerElement configure validation (RB3)', () => {
  it('rejects an invalid catalog before committing any state (zero side effects)', async () => {
    const viewer = await createViewer();
    viewer.resourcePort = resourcePort();
    viewer.catalog = catalog();
    const firstPort = viewer.resourcePort;
    const firstCatalog = viewer.catalog;

    const result = viewer.configure({
      catalog: {} as unknown as BaseScreenMaterialCatalog,
      resourcePort: resourcePort(),
    });
    expect(result.ok).toBe(false);
    // 失败配置零副作用：既有字段保持原样，且未创建 Renderer（未 attach shadow）。
    expect(viewer.catalog).toBe(firstCatalog);
    expect(viewer.resourcePort).toBe(firstPort);
    expect(viewer.shadowRoot).toBeNull();
  });

  it('rejects an invalid timeout before committing any state', async () => {
    const viewer = await createViewer();
    viewer.catalog = catalog();
    const firstCatalog = viewer.catalog;

    const result = viewer.configure({ catalog: catalog(), resourceTimeoutMs: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
    expect(viewer.catalog).toBe(firstCatalog);
    expect(viewer.shadowRoot).toBeNull();
  });

  it('rejects invalid resource/variable port shapes and contribution index shapes', async () => {
    const badPort = await createViewer();
    const portResult = badPort.configure({
      catalog: catalog(),
      resourcePort: {} as unknown as ScreenHostResourcePort,
    });
    expect(portResult.ok).toBe(false);
    expect(badPort.resourcePort).toBeUndefined();

    const badVariablePort = await createViewer();
    const variableResult = badVariablePort.configure({
      catalog: catalog(),
      variablePort: { nope: 1 } as unknown as ScreenHostVariablePort,
    });
    expect(variableResult.ok).toBe(false);
    expect(badVariablePort.variablePort).toBeUndefined();

    const badContributions = await createViewer();
    const contributionsResult = badContributions.configure({
      catalog: catalog(),
      runtimeContributions: {} as unknown as BaseScreenRuntimeContributionIndex,
    });
    expect(contributionsResult.ok).toBe(false);
    expect(badContributions.runtimeContributions).toBeUndefined();
  });

  it('rejects invalid blueprint ports before committing any state', async () => {
    const viewer = await createViewer();
    viewer.catalog = catalog();
    const firstCatalog = viewer.catalog;

    const runtimeResult = viewer.configure({
      catalog: catalog(),
      blueprintRuntimePort: {} as unknown as { emit: () => void },
    });
    expect(runtimeResult.ok).toBe(false);

    const actionResult = viewer.configure({
      catalog: catalog(),
      blueprintHostActionPort: { emit: () => undefined } as unknown as { execute: () => void },
    });
    expect(actionResult.ok).toBe(false);
    expect(viewer.catalog).toBe(firstCatalog);
    expect(viewer.shadowRoot).toBeNull();
  });

  it('CSP-P3-C01 accepts a valid conditional style port and rejects an invalid one atomically', async () => {
    const port = { resolve: () => undefined };
    const viewer = await createViewer();
    const valid = viewer.configure({ catalog: catalog(), conditionalStylePort: port });
    expect(valid.ok).toBe(true);
    expect(viewer.conditionalStylePort).toBe(port);

    const invalid = await createViewer();
    const firstCatalog = catalog();
    invalid.catalog = firstCatalog;
    const result = invalid.configure({
      catalog: catalog(),
      conditionalStylePort: { nope: 1 } as unknown as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
    // 失败配置零副作用：既有 catalog 保持原样、未创建 Renderer、端口未提交。
    expect(invalid.catalog).toBe(firstCatalog);
    expect(invalid.conditionalStylePort).toBeUndefined();
    expect(invalid.shadowRoot).toBeNull();
  });

  it('a failed configure leaves the viewer usable for a later valid configure', async () => {
    const viewer = await createViewer();
    const failed = viewer.configure({
      catalog: {} as unknown as BaseScreenMaterialCatalog,
    });
    expect(failed.ok).toBe(false);

    const valid = viewer.configure({
      catalog: catalog(),
      resourcePort: resourcePort(),
      variablePort: variablePort(),
    });
    expect(valid).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(viewer.shadowRoot).not.toBeNull();
  });

  it('keeps optional ports optional: catalog alone is a valid configuration', async () => {
    const viewer = await createViewer();
    const result = viewer.configure({ catalog: catalog() });
    expect(result).toEqual({ ok: true, value: null, diagnostics: [] });
    expect(viewer.resourcePort).toBeUndefined();
    expect(viewer.variablePort).toBeUndefined();
    // 未提供端口也允许完成初始化（静态渲染路径）。
    expect(viewer.shadowRoot).not.toBeNull();
  });

  it('rejects configure after the viewer is already initialized', async () => {
    const viewer = await createViewer();
    expect(viewer.configure({ catalog: catalog() })).toEqual({
      ok: true,
      value: null,
      diagnostics: [],
    });
    expect(viewer.shadowRoot).not.toBeNull();

    const second = viewer.configure({
      catalog: catalog(),
      resourcePort: resourcePort(),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.diagnostics[0]?.code).toBe('PLUGIN_CORE_LIFECYCLE_INVALID');
    }
    // 已初始化实例上的失败 configure 同样零副作用：端口保持原样。
    expect(viewer.resourcePort).toBeUndefined();
  });
});

describe('BaseScreenViewerElement resourceTimeoutMs legacy setter (RB3)', () => {
  const documentFixture: ScreenDocument = {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };

  async function createViewerWithEvents(): Promise<{
    viewer: InstanceType<typeof import('../src/viewer.js')['BaseScreenViewerElement']>;
    dispatched: unknown[];
  }> {
    const dispatched: unknown[] = [];
    const ownerDocument = new FakeDocument();
    class FakeHTMLElement extends FakeNode {
      isConnected = true;
      ownerDocument = ownerDocument as unknown as Document;
      shadowRoot: FakeShadowRoot | null = null;

      attachShadow(): FakeShadowRoot {
        this.shadowRoot = new FakeShadowRoot();
        return this.shadowRoot;
      }

      dispatchEvent(event: unknown): boolean {
        dispatched.push(event);
        return true;
      }
    }
    class FakeCustomEvent {
      constructor(
        readonly type: string,
        readonly init?: unknown,
      ) {}
    }
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    vi.stubGlobal('CustomEvent', FakeCustomEvent);
    const { BaseScreenViewerElement } = await import('../src/viewer.js');
    return { viewer: new BaseScreenViewerElement(), dispatched };
  }

  function lifecycleDiagnostics(dispatched: unknown[]): unknown[] {
    const diagnostics: unknown[] = [];
    for (const event of dispatched) {
      const record = event as {
        readonly type?: string;
        readonly init?: { readonly detail?: { readonly diagnostics?: unknown[] } };
      };
      if (record.type === 'base-screen-diagnostic') {
        diagnostics.push(...(record.init?.detail?.diagnostics ?? []));
      }
    }
    return diagnostics;
  }

  it('rejects out-of-range or non-integer setter values with a diagnostic and no side effects', async () => {
    const { viewer, dispatched } = await createViewerWithEvents();
    const defaultTimeout = viewer.resourceTimeoutMs;
    expect(defaultTimeout).toBe(15_000);

    const invalidValues = [5, 0, -100, 99, 99.5, 60_001, 100_000, NaN, Infinity, -Infinity];
    for (const invalid of invalidValues) {
      viewer.resourceTimeoutMs = invalid;
      // 无效输入零副作用：既有 timeout 保持不变，且不初始化 Renderer。
      expect(viewer.resourceTimeoutMs).toBe(defaultTimeout);
    }
    expect(viewer.shadowRoot).toBeNull();

    const diagnostics = lifecycleDiagnostics(dispatched);
    expect(diagnostics.length).toBeGreaterThanOrEqual(invalidValues.length);
    for (const diagnostic of diagnostics) {
      expect(diagnostic).toMatchObject({ code: 'PLUGIN_CORE_LIFECYCLE_INVALID' });
    }
  });

  it('accepts the same integer 100..60000 range as configure and keeps a valid value usable', async () => {
    const { viewer, dispatched } = await createViewerWithEvents();

    viewer.resourceTimeoutMs = 100;
    viewer.resourceTimeoutMs = 600;
    expect(viewer.resourceTimeoutMs).toBe(600);
    expect(lifecycleDiagnostics(dispatched)).toEqual([]);

    // 被拒绝的无效值之后，有效值仍可正常初始化（不会在 createBaseScreenRenderer 抛错）。
    viewer.resourceTimeoutMs = 5;
    expect(viewer.resourceTimeoutMs).toBe(600);
    viewer.resourceTimeoutMs = 60_000;
    expect(viewer.resourceTimeoutMs).toBe(60_000);
    viewer.catalog = catalog();
    viewer.resourcePort = resourcePort();
    viewer.variablePort = variablePort();
    viewer.document = documentFixture;
    expect(viewer.shadowRoot).not.toBeNull();
  });

  it('rejects a differing setter value after initialization without changing the committed timeout', async () => {
    const { viewer, dispatched } = await createViewerWithEvents();
    viewer.catalog = catalog();
    viewer.resourcePort = resourcePort();
    viewer.variablePort = variablePort();
    viewer.document = documentFixture;
    expect(viewer.shadowRoot).not.toBeNull();
    const committed = viewer.resourceTimeoutMs;

    viewer.resourceTimeoutMs = 60_000;
    expect(viewer.resourceTimeoutMs).toBe(committed);
    expect(lifecycleDiagnostics(dispatched).length).toBeGreaterThanOrEqual(1);
  });
});

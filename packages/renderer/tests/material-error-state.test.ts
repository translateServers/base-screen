import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDiagnostic,
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
  BaseScreenMaterialDataBindingRole,
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
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

function createDatasetCatalog(
  adapter: BaseScreenMaterialTabularDataAdapter,
  roles: readonly BaseScreenMaterialDataBindingRole[] = [
    { id: 'columns', minFields: 1, maxFields: 256, valueTypes: ['string', 'number'] },
  ],
): BaseScreenMaterialCatalog {
  const manifest: BaseScreenMaterialManifest = {
    type: 'base.test',
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
    dataBinding: { roles },
    designCapabilities: { resize: true, rotate: true, children: true },
  };
  const entry = {
    manifest,
    constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    tabularDataAdapter: adapter,
  };
  return {
    get: (type) => (type === manifest.type ? entry : undefined),
    has: (type) => type === manifest.type,
    list: () => [entry],
  };
}

function component(
  id: string,
  zIndex: number,
  parentId: string | null = null,
  dataSource: ScreenComponentNode['dataSource'] = null,
): ScreenComponentNode {
  return {
    id,
    type: 'base.test',
    name: id,
    parentId,
    position: { x: 0, y: 0 },
    size: { width: 100, height: 40 },
    rotation: 0,
    zIndex,
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
    blueprint: { relations: [] },
  };
}

function hostSource(
  resourceId: string,
  resourceType = 'dataset',
  params: Readonly<Record<string, ScreenHostResourceParameter>> = {
    limit: { kind: 'literal', value: 5 },
  },
  binding: ScreenHostResourceBinding | null = null,
): ScreenComponentNode['dataSource'] {
  return {
    type: 'host-resource',
    resourceId,
    resourceType,
    params,
    binding,
  } as ScreenComponentNode['dataSource'];
}

function hostDiagnostic(code: ScreenDiagnostic['code'], message: string): ScreenDiagnostic {
  return { severity: 'error', code, path: [], message };
}

const TABULAR_VALUE: ScreenJsonValue = {
  fields: [
    { id: 'name', label: '名称', valueType: 'string' },
    { id: 'amount', label: '金额', valueType: 'number' },
  ],
  rows: [{ name: 'A', amount: 2 }],
};

const OK_ADAPTER: BaseScreenMaterialTabularDataAdapter = {
  adapt: ({ dataset, fields }) => ({
    ok: true,
    value: { columns: fields.columns?.map((field) => field.id) ?? [], rows: dataset.rows },
    diagnostics: [],
  }),
};

type PendingRequest = {
  readonly signal: ScreenAbortSignal;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
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
      };
      requests.push(pending);
      options.signal.addEventListener('abort', () => {
        pending.aborted = true;
      });
      return new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
        pending.resolveRequest = resolve;
      });
    },
  };
  return { port, requests };
}

describe('Renderer material error state protocol', () => {
  it('preserves a host access-denied diagnostic as the material error code', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({
          ok: false,
          diagnostics: [
            hostDiagnostic('HOST_RESOURCE_ACCESS_DENIED', 'Contact your administrator.'),
          ],
        }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_ACCESS_DENIED',
      message: 'Contact your administrator.',
    });
  });

  it('preserves a host dataset-invalid diagnostic as the material error code', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({
          ok: false,
          diagnostics: [hostDiagnostic('HOST_DATASET_INVALID', 'Dataset is malformed.')],
        }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Dataset is malformed.',
    });
  });

  it('normalizes an unknown host diagnostic to HOST_RESOURCE_FAILED and replaces an unsafe raw message with the safe default', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({
          ok: false,
          diagnostics: [
            hostDiagnostic(
              'HOST_DATASET_PARAMETER_INVALID',
              'SELECT * FROM users WHERE token = secret\ninternal stack: host.js:42',
            ),
          ],
        }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
  });

  it('keeps a safe-looking raw message from an unknown host code out of the material', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({
          ok: false,
          diagnostics: [
            hostDiagnostic(
              'HOST_DATASET_PARAMETER_INVALID',
              'SELECT * FROM users WHERE token = secret-token',
            ),
          ],
        }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
  });

  it('normalizes an empty host failure result to HOST_RESOURCE_FAILED with the safe default', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: false, diagnostics: [] }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_FAILED',
      message: 'Host resource request failed.',
    });
  });

  it('sanitizes an unsafe host message at the material boundary', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({
          ok: false,
          diagnostics: [hostDiagnostic('HOST_RESOURCE_ACCESS_DENIED', 'denied\nreset token')],
        }),
      },
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('orders'))])).ok).toBe(
      true,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_RESOURCE_ACCESS_DENIED',
      message: 'Host resource access is denied.',
    });
  });

  it('reports an adapter that returns a failure as HOST_DATASET_ADAPTER_FAILED', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog({
        adapt: () => ({ ok: false, diagnostics: [] }),
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: true, value: TABULAR_VALUE, diagnostics: [] }),
      },
    });
    const source = hostSource('orders', 'dataset', undefined, {
      fields: { columns: ['name'] },
    });

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Host dataset adapter failed.',
    });
  });

  it('reports an adapter whose output is not valid JSON as HOST_DATASET_ADAPTER_FAILED', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog({
        adapt: () => ({
          ok: true,
          value: Number.NaN as unknown as ScreenJsonValue,
          diagnostics: [],
        }),
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: true, value: TABULAR_VALUE, diagnostics: [] }),
      },
    });
    const source = hostSource('orders', 'dataset', undefined, {
      fields: { columns: ['name'] },
    });

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Host dataset adapter failed.',
    });
  });

  it('reports a throwing adapter as HOST_DATASET_ADAPTER_FAILED with a separate safe exception diagnostic', async () => {
    const root = new FakeRoot();
    const diagnostics: ScreenDiagnostic[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog({
        adapt: () => {
          throw new Error('boom');
        },
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      resourcePort: {
        resolve: async () => ({ ok: true, value: TABULAR_VALUE, diagnostics: [] }),
      },
    });
    const source = hostSource('orders', 'dataset', undefined, {
      fields: { columns: ['name'] },
    });

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: 'Host dataset adapter failed.',
    });
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'dataset', 'dataBinding'],
        message: 'Material dataset adapter raised an exception.',
      },
    ]);
  });

  it('reports a binding that fails role validation as HOST_DATASET_BINDING_INVALID', async () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog(OK_ADAPTER),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: true, value: TABULAR_VALUE, diagnostics: [] }),
      },
    });
    // The bound field id does not exist in the dataset, so role validation fails.
    const source = hostSource('orders', 'dataset', undefined, {
      fields: { columns: ['missing'] },
    });

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Host dataset binding is invalid.',
    });
  });

  it('reports a missing binding declaration or adapter as HOST_DATASET_BINDING_INVALID', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const source = hostSource('orders', 'dataset', undefined, {
      fields: { columns: ['name'] },
    });

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Host dataset binding is invalid.',
    });
  });

  it('keeps an active abort lifecycle-only: the material stays loading, never error', async () => {
    const root = new FakeRoot();
    const { port, requests } = createDeferredPort();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: port,
    });

    expect(renderer.render(document([component('res', 0, null, hostSource('a'))])).ok).toBe(true);
    expect(renderer.render(document([component('res', 0, null, hostSource('b'))])).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.aborted).toBe(true);
    expect(root.children[0]?.model?.dataState.status).toBe('loading');

    requests[0]!.resolveRequest({ ok: true, value: { stale: true }, diagnostics: [] });
    await Promise.resolve();
    expect(root.children[0]?.model?.dataState.status).toBe('loading');
  });
});

import type {
  ScreenAbortSignal,
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDataSourceSource,
  ScreenDocument,
  ScreenHostCatalogPort,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenValueRef,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialDataBindingRole,
} from '@base-screen/plugin-core';
import { describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  createDatasetCatalog,
  FakeRoot,
} from '../renderer/__fixtures__/renderer-test-harness.js';

// ---------------------------------------------------------------------------
// R1：请求身份是数据源实例，不是组件。
//
// 全部用新形态（文档级 `dataSources` + 组件 `dataValue`）：「两个组件共享一次请求」
// 只可能发生在它们共享同一个实例时；旧形态的每个组件会各自合成一个实例。
// ---------------------------------------------------------------------------

const TABULAR = {
  fields: [
    { id: 'name', label: 'Name', valueType: 'string' as const },
    { id: 'amount', label: 'Amount', valueType: 'number' as const },
  ],
  rows: [{ name: 'a', amount: 1 }],
};

const ROLES: readonly BaseScreenMaterialDataBindingRole[] = [
  { id: 'columns', minFields: 1, maxFields: 8, valueTypes: ['string', 'number'] },
];

function datasetCatalog(): BaseScreenMaterialCatalog {
  return createDatasetCatalog(
    {
      adapt: ({ dataset, fields }) => ({
        ok: true,
        value: {
          columns: Object.keys(fields).flatMap((roleId) =>
            (fields[roleId] ?? []).map((field) => field.id),
          ),
          rows: dataset.rows,
        },
        diagnostics: [],
      }),
    },
    ROLES,
  );
}

const RESOURCE: ScreenDataSourceSource = {
  kind: 'host-resource',
  resourceType: 'dataset',
  resourceId: 'orders',
};

function instance(
  id: string,
  source: ScreenDataSourceSource,
  params: Readonly<Record<string, ScreenValueRef>> = {},
  updatePolicy?: ScreenDataSource['updatePolicy'],
): ScreenDataSource {
  return {
    id,
    name: id,
    source,
    params,
    ...(updatePolicy === undefined ? {} : { updatePolicy }),
  };
}

function reader(
  id: string,
  dataSourceId: string,
  options: {
    readonly path?: readonly string[];
    readonly dataBinding?: { readonly fields: Readonly<Record<string, readonly string[]>> };
  } = {},
): ScreenComponentNode {
  return {
    ...component(id, 0, null, null),
    dataValue: { kind: 'data-source-field', dataSourceId, path: options.path ?? [] },
    ...(options.dataBinding === undefined ? {} : { dataBinding: options.dataBinding }),
  };
}

function document(
  components: readonly ScreenComponentNode[],
  dataSources: readonly ScreenDataSource[],
  variables: ScreenDocument['variables'] = [],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    dataSources,
    variables,
    blueprint: { relations: [] },
  };
}

type Pending = {
  readonly request: ScreenHostResourceRequest;
  readonly signal: ScreenAbortSignal;
  aborted: boolean;
  resolveRequest: (value: ScreenParseResult<ScreenJsonValue>) => void;
};

function deferredPort(): { readonly port: ScreenHostResourcePort; readonly requests: Pending[] } {
  const requests: Pending[] = [];
  const port: ScreenHostResourcePort = {
    resolve: (request, options) => {
      const pending: Pending = {
        request,
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

function countingPort(): { readonly port: ScreenHostResourcePort; readonly calls: () => number } {
  let calls = 0;
  return {
    port: {
      resolve: async () => {
        calls++;
        return { ok: true as const, value: TABULAR, diagnostics: [] };
      },
    },
    calls: () => calls,
  };
}

async function flush(times = 6): Promise<void> {
  for (let index = 0; index < times; index++) {
    await Promise.resolve();
  }
}

function rendererFor(options: {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly hostCatalogPort?: ScreenHostCatalogPort;
}) {
  const root = new FakeRoot();
  const renderer = createBaseScreenRenderer({
    root: root as unknown as HTMLElement,
    catalog: options.catalog,
    mode: 'viewer',
    interactive: false,
    onMaterialEvent: undefined,
    resourcePort: options.resourcePort,
    ...(options.hostCatalogPort === undefined ? {} : { hostCatalogPort: options.hostCatalogPort }),
  });
  return { root, renderer };
}

describe('R1 · 一实例一请求', () => {
  it('两个组件引用同一实例、同参数 ⇒ 宿主只被调用一次，各自得到自己的投影', async () => {
    const { port, requests } = deferredPort();
    const { root, renderer } = rendererFor({ catalog: datasetCatalog(), resourcePort: port });
    const screen = document(
      [
        // 一个取实例结果里的某个字段（不做表格投影），一个做字段映射投影。
        reader('left', 'orders', { path: ['rows'] }),
        reader('right', 'orders', { dataBinding: { fields: { columns: ['amount'] } } }),
      ],
      [instance('orders', RESOURCE)],
    );

    expect(renderer.render(screen).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.request.dataSourceId).toBe('orders');

    requests[0]!.resolveRequest({ ok: true, value: TABULAR, diagnostics: [] });
    await flush();

    expect(requests).toHaveLength(1);
    // 同一次结果，两个组件按各自的 `path` + 字段映射投影出不同数据。
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: TABULAR.rows,
    });
    expect(root.children[1]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['amount'], rows: TABULAR.rows },
    });
    renderer.dispose();
  });

  it('读数组件卸载后另一个仍能读缓存：不发第二次请求、不 abort', async () => {
    const { port, requests } = deferredPort();
    const { renderer } = rendererFor({ catalog: createCatalog(), resourcePort: port });
    const orders = instance('orders', RESOURCE);

    expect(
      renderer.render(document([reader('a', 'orders'), reader('b', 'orders')], [orders])).ok,
    ).toBe(true);
    expect(requests).toHaveLength(1);
    requests[0]!.resolveRequest({ ok: true, value: { ready: true }, diagnostics: [] });
    await flush();

    // a 卸载：b 还在读同一实例，请求与缓存都留在实例上。
    expect(renderer.render(document([reader('b', 'orders')], [orders])).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.aborted).toBe(false);

    // 再挂回 a 也不重发：同键 + ready ⇒ 直接复用。
    expect(
      renderer.render(document([reader('a', 'orders'), reader('b', 'orders')], [orders])).ok,
    ).toBe(true);
    expect(requests).toHaveLength(1);
    renderer.dispose();
  });

  it('参数变化 ⇒ 新请求；旧回包晚到被代际丢弃，不改写新结果', async () => {
    const { port, requests } = deferredPort();
    const { root, renderer } = rendererFor({ catalog: createCatalog(), resourcePort: port });
    const withParam = (region: string): readonly ScreenDataSource[] => [
      instance('orders', RESOURCE, { region: { kind: 'inline', value: region } }),
    ];

    expect(renderer.render(document([reader('a', 'orders')], withParam('north'))).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.request.params).toEqual({ region: 'north' });

    expect(renderer.render(document([reader('a', 'orders')], withParam('south'))).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.request.params).toEqual({ region: 'south' });
    expect(requests[0]!.aborted).toBe(true);

    // 旧回包晚到：代际不匹配，必须被丢弃。
    requests[0]!.resolveRequest({ ok: true, value: { region: 'north' }, diagnostics: [] });
    await flush();
    expect(root.children[0]?.model?.dataState.status).toBe('loading');

    requests[1]!.resolveRequest({ ok: true, value: { region: 'south' }, diagnostics: [] });
    await flush();
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { region: 'south' },
    });
    renderer.dispose();
  });

  it("updatePolicy.mode:'once' 下同键二次 render 不重发请求", async () => {
    const host = countingPort();
    const { renderer } = rendererFor({ catalog: createCatalog(), resourcePort: host.port });
    const screen = document(
      [reader('a', 'orders')],
      [instance('orders', RESOURCE, {}, { mode: 'once' })],
    );

    expect(renderer.render(screen).ok).toBe(true);
    await flush();
    expect(host.calls()).toBe(1);

    expect(renderer.render(screen).ok).toBe(true);
    expect(renderer.render(screen).ok).toBe(true);
    await flush();
    expect(host.calls()).toBe(1);
    renderer.dispose();
  });

  it('参数取自变量：变量值变化 ⇒ 请求键变化重发；变量缺值 ⇒ 实例失败且组件进 error 态', async () => {
    const { port, requests } = deferredPort();
    const { root, renderer } = rendererFor({ catalog: createCatalog(), resourcePort: port });
    const screen = (initialValue: string | null): ScreenDocument =>
      document(
        [reader('a', 'orders')],
        [instance('orders', RESOURCE, { region: { kind: 'variable', variableId: 'region' } })],
        [
          {
            id: 'region',
            name: 'region',
            initialValue,
            value: { kind: 'inline', value: initialValue },
            controlled: false,
          },
        ],
      );

    // 变量还没有运行期取值：参数求值失败 ⇒ 不发请求，组件进 error 态。
    expect(renderer.render(screen('north')).ok).toBe(true);
    expect(requests).toHaveLength(0);
    expect(root.children[0]?.model?.dataState).toMatchObject({ status: 'error' });

    // 变量到位：请求键含变量值。
    renderer.setVariables({ region: 'north' });
    expect(renderer.render(screen('north')).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.request.params).toEqual({ region: 'north' });

    // 变量值变化 ⇒ 键变化 ⇒ 新请求。
    renderer.setVariables({ region: 'south' });
    expect(renderer.render(screen('south')).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]!.request.params).toEqual({ region: 'south' });
    renderer.dispose();
  });

  it('host-catalog 来源：两个组件读同一 sourceId 但各自实例 ⇒ 不共享，各发一次', async () => {
    const resolve = vi.fn<ScreenHostCatalogPort['resolve']>(async () => ({
      ok: true as const,
      value: 'north',
      diagnostics: [],
    }));
    const { renderer } = rendererFor({
      // 目录类来源与 'variable' 同权（旧模型里它就是变量来源）。
      catalog: createCatalog('base.test', ['variable']),
      hostCatalogPort: {
        list: async () => ({ ok: true, value: { items: [] }, diagnostics: [] }),
        describe: async () => ({ ok: false as const, diagnostics: [] }),
        resolve,
      },
    });
    const source: ScreenDataSourceSource = { kind: 'host-catalog', sourceId: 'tenant-region' };

    expect(
      renderer.render(
        document(
          [reader('a', 'tenant-a'), reader('b', 'tenant-b')],
          [instance('tenant-a', source), instance('tenant-b', source)],
        ),
      ).ok,
    ).toBe(true);
    await flush();

    // 目录类来源恒不共享：两个实例 = 两条请求，即便 sourceId 相同。
    expect(resolve).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });
});

import type {
  ScreenComponentNode,
  ScreenHostResourcePort,
  ScreenJsonValue,
  ScreenParseResult,
} from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  createDatasetCatalog,
  createImageCatalog,
  createStaticDatasetCatalog,
  document,
  FakeRoot,
  rendererWithRoot,
} from './__fixtures__/renderer-test-harness.js';

describe('BaseScreenRenderer data runtime', () => {
  it('R5 validates and forwards declared image alternative text to its Material model', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createImageCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const image = {
      ...component('image', 0),
      type: 'base.image',
      props: { source: '', alt: '趋势图' },
    };

    expect(renderer.render(document([image])).ok).toBe(true);
    expect(root.children[0]?.model?.props).toEqual({ source: '', alt: '趋势图' });
  });

  it('R2 keeps every root subtree within its Core painter-order span', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });

    const result = renderer.render(
      document([
        component('root-1', 0),
        component('root-2', 0),
        component('root-1-child', 100, 'root-1'),
      ]),
    );

    expect(result.ok).toBe(true);
    expect(root.children.map((element) => element.dataset.baseScreenComponentId)).toEqual([
      'root-1',
      'root-1-child',
      'root-2',
    ]);
    expect(root.children.map((element) => element.style.zIndex)).toEqual(['0', '1', '2']);
  });

  it('reuses mounts and skips re-parse for a same-reference re-render', () => {
    const { root, renderer } = rendererWithRoot();
    const doc = document([component('a', 0), component('b', 1)]);

    expect(renderer.render(doc).ok).toBe(true);
    const first = [...root.children];

    // 同引用重渲染（如 setInteractive 原地重渲染）：不重挂载、不重建 DOM。
    expect(renderer.render(doc).ok).toBe(true);
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(first[0]);
    expect(root.children[1]).toBe(first[1]);
  });

  it('validates only changed components for a structurally shared document', () => {
    const { root, renderer } = rendererWithRoot();
    const a = component('a', 0);
    const b = component('b', 1);
    expect(renderer.render(document([a, b])).ok).toBe(true);
    const first = [...root.children];

    // 派生文档：仅组件 a 的 position 变化，b 引用共享（命中校验缓存）。
    const moved = { ...a, position: { x: 40, y: 20 } };
    const result = renderer.render(document([moved, b]));

    expect(result.ok).toBe(true);
    expect(root.children[0]?.style.left).toBe('40px');
    expect(root.children[0]?.style.top).toBe('20px');
    // reconcile 路径复用全部挂载元素。
    expect(root.children[0]).toBe(first[0]);
    expect(root.children[1]).toBe(first[1]);

    // clear 后缓存重置，重渲染仍成功（FakeMaterialElement.remove 不回收
    // root.children 数组，故此处只断言渲染结果）。
    renderer.clear();
    expect(renderer.render(document([moved, b])).ok).toBe(true);
  });

  it('R2 does not restart an unchanged host-resource resolve for unrelated edits', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const resourcePort: ScreenHostResourcePort = {
      resolve: async () => {
        resolveCalls++;
        return { ok: true, value: { status: 'ready' }, diagnostics: [] };
      },
    };
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort,
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'resource-1',
      resourceType: 'resource',
      params: { region: { kind: 'literal', value: 'north' } },
      binding: null,
    };
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(1);

    const edited = document([{ ...initial.components[0]!, name: 'Edited resource' }]);
    expect(renderer.render(edited).ok).toBe(true);
    expect(resolveCalls).toBe(1);
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
  });

  it('R1 resolves again when only a host-resource id changes', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          return { ok: true, value: { resolveCalls }, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'resource-1',
      resourceType: 'resource',
      params: { region: { kind: 'literal', value: 'north' } },
      binding: null,
    };
    const initial = document([component('resource', 0, null, source)]);

    expect(renderer.render(initial).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(1);

    expect(
      renderer.render(
        document([
          {
            ...initial.components[0]!,
            dataSource: { ...source, resourceId: 'resource-2' },
          },
        ]),
      ).ok,
    ).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(2);
  });

  it('R4 projects a validated dataset and forwards only evaluated request parameters', async () => {
    const root = new FakeRoot();
    const requests: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createDatasetCatalog({
        adapt: ({ dataset, fields }) => ({
          ok: true,
          value: {
            columns: fields.columns?.map((field) => field.id) ?? [],
            rows: dataset.rows,
          },
          diagnostics: [],
        }),
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async (request) => {
          requests.push(request);
          return {
            ok: true as const,
            value: {
              fields: [
                { id: 'name', label: '名称', valueType: 'string' },
                { id: 'amount', label: '金额', valueType: 'number' },
              ],
              rows: [{ name: 'A', amount: 2 }],
            },
            diagnostics: [],
          };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { limit: { kind: 'literal', value: 5 } },
      binding: { fields: { columns: ['name'] } },
    };

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(requests).toEqual([
      {
        componentId: 'dataset',
        resourceType: 'dataset',
        resourceId: 'orders',
        params: { limit: 5 },
      },
    ]);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['name'], rows: [{ name: 'A', amount: 2 }] },
    });
  });

  it('projects a bound static tabular dataset through the same material adapter', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStaticDatasetCatalog({
        adapt: ({ dataset, fields }) => ({
          ok: true,
          value: { columns: fields.columns?.map((field) => field.id) ?? [], rows: dataset.rows },
          diagnostics: [],
        }),
      }),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'static',
      value: {
        fields: [
          { id: 'name', label: 'Name', valueType: 'string', nullable: false },
          { id: 'amount', label: 'Amount', valueType: 'number', nullable: false },
        ],
        rows: [{ name: 'North', amount: 42 }],
      },
      binding: { fields: { columns: ['name', 'amount'] } },
    };

    expect(renderer.render(document([component('dataset', 0, null, source)])).ok).toBe(true);
    expect(root.children[0]?.model?.dataState).toEqual({
      status: 'ready',
      value: { columns: ['name', 'amount'], rows: [{ name: 'North', amount: 42 }] },
    });
  });

  it('R4 blocks a variable-dependent resource until variables are supplied', async () => {
    const root = new FakeRoot();
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { region: { kind: 'variable', name: 'region' } },
      binding: null,
    };
    const screen = document([component('dependent', 0, null, source)]);

    expect(renderer.render(screen).ok).toBe(true);
    expect(resolveCalls).toBe(0);
    expect(root.children[0]?.model?.dataState.status).toBe('error');

    expect(renderer.setVariables({ region: 'north' }).ok).toBe(true);
    expect(renderer.render(screen).ok).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveCalls).toBe(1);
  });

  it('R4 coalesces repeated refreshes while a component request is pending', async () => {
    const root = new FakeRoot();
    let resolveRequest: (() => void) | undefined;
    let resolveCalls = 0;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => {
          resolveCalls++;
          await new Promise<void>((resolve) => {
            resolveRequest = resolve;
          });
          return { ok: true as const, value: { ready: true }, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'orders',
      resourceType: 'dataset',
      params: { limit: { kind: 'literal', value: 5 } },
      binding: null,
    };
    expect(renderer.render(document([component('refreshable', 0, null, source)])).ok).toBe(true);
    renderer.refreshData('refreshable');
    renderer.refreshData('refreshable');
    expect(resolveCalls).toBe(1);
    resolveRequest?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    renderer.refreshData('refreshable');
    expect(resolveCalls).toBe(2);
  });

  it('R4 suppresses a late result after timeout', async () => {
    vi.useFakeTimers();
    try {
      const root = new FakeRoot();
      let resolveRequest: ((value: ScreenParseResult<ScreenJsonValue>) => void) | undefined;
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createCatalog(),
        mode: 'viewer',
        interactive: false,
        onMaterialEvent: undefined,
        resourceTimeoutMs: 100,
        resourcePort: {
          resolve: () =>
            new Promise<ScreenParseResult<ScreenJsonValue>>((resolve) => {
              resolveRequest = resolve;
            }),
        },
      });
      const source: ScreenComponentNode['dataSource'] = {
        type: 'host-resource',
        resourceId: 'orders',
        resourceType: 'dataset',
        params: { limit: { kind: 'literal', value: 5 } },
        binding: null,
      };
      expect(renderer.render(document([component('timeout', 0, null, source)])).ok).toBe(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(root.children[0]?.model?.dataState.status).toBe('error');
      resolveRequest?.({ ok: true, value: { late: true }, diagnostics: [] });
      await Promise.resolve();
      await Promise.resolve();
      expect(root.children[0]?.model?.dataState).toMatchObject({ code: 'HOST_RESOURCE_TIMEOUT' });
    } finally {
      vi.useRealTimers();
    }
  });
});

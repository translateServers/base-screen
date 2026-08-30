import type {
  ScreenComponentNode,
  ScreenJsonObject,
  ScreenJsonValue,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  document,
  FakeMaterialElement,
  FakeRoot,
} from './__fixtures__/renderer-test-harness.js';

describe('conditional style rules', () => {
  function createStyleRuleCatalog(): BaseScreenMaterialCatalog {
    const manifest: BaseScreenMaterialManifest = {
      type: 'base.test',
      tagName: 'base-screen-test',
      name: 'Test',
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: { color: '#ffffff' },
      styleSchema: {
        kind: 'object',
        properties: { color: { kind: 'string' }, fontWeight: { kind: 'string' } },
        required: ['color'],
      },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: ['static', 'host-resource'],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const entry = {
      manifest,
      constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    };
    return {
      get: (type) => (type === manifest.type ? entry : undefined),
      has: (type) => type === manifest.type,
      list: () => [entry],
    };
  }

  function styledComponent(
    value: ScreenJsonValue,
    styleRules: ScreenComponentNode['styleRules'],
  ): ScreenComponentNode {
    return {
      ...component('metric', 0, null, { type: 'static', value }),
      style: { color: '#ffffff' },
      ...(styleRules === undefined ? {} : { styleRules }),
    };
  }

  function flush(): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < 8; index++) chain = chain.then(() => undefined);
    return chain;
  }

  it('R3 applies a threshold rule to a static source and restores the base style', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const warn = {
      id: 'warn',
      when: { path: [], operator: 'gt', value: 100 },
      style: { color: '#ff0000' },
    } as const;

    expect(renderer.render(document([styledComponent(120, [warn])])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ff0000' });

    expect(renderer.render(document([styledComponent(42, [warn])])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffffff' });
  });

  it('R3 merges matched rules in document order with per-key override', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const rules = [
      { id: 'warn', when: { path: [], operator: 'gt', value: 10 }, style: { color: '#ffaa00' } },
      {
        id: 'crit',
        when: { path: [], operator: 'gt', value: 100 },
        style: { color: '#ff0000', fontWeight: '700' },
      },
    ] as const;

    expect(renderer.render(document([styledComponent(150, rules)])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ff0000', fontWeight: '700' });

    expect(renderer.render(document([styledComponent(50, rules)])).ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffaa00' });
  });

  it('R3 resolves object paths, array indices, exists, and contains', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const red = { color: '#ff0000' } as const;
    const cases: readonly [ScreenJsonValue, ScreenComponentNode['styleRules'], boolean][] = [
      [
        { amount: 120 },
        [{ id: 'r', when: { path: ['amount'], operator: 'gt', value: 100 }, style: red }],
        true,
      ],
      [
        { amount: 80 },
        [{ id: 'r', when: { path: ['amount'], operator: 'gt', value: 100 }, style: red }],
        false,
      ],
      [
        { rows: [{ v: 7 }] },
        [{ id: 'r', when: { path: ['rows', '0', 'v'], operator: 'eq', value: 7 }, style: red }],
        true,
      ],
      [
        { rows: [{ v: 7 }] },
        [{ id: 'r', when: { path: ['rows', '1', 'v'], operator: 'eq', value: 7 }, style: red }],
        false,
      ],
      [{ rows: [] }, [{ id: 'r', when: { path: ['rows'], operator: 'exists' }, style: red }], true],
      [{}, [{ id: 'r', when: { path: ['__proto__'], operator: 'exists' }, style: red }], false],
      [
        ['a', 'b'],
        [{ id: 'r', when: { path: [], operator: 'contains', value: 'a' }, style: red }],
        true,
      ],
      [
        'error',
        [{ id: 'r', when: { path: [], operator: 'contains', value: 'err' }, style: red }],
        true,
      ],
      ['high', [{ id: 'r', when: { path: [], operator: 'gt', value: 100 }, style: red }], false],
      [100, [{ id: 'r', when: { path: [], operator: 'gt', value: 100 }, style: red }], false],
    ];
    for (const [index, [value, rules, matched]] of cases.entries()) {
      expect(renderer.render(document([styledComponent(value, rules)])).ok).toBe(true);
      expect(root.children[0]?.model?.style?.color, `case ${index}`).toBe(
        matched ? '#ff0000' : '#ffffff',
      );
    }
  });

  it('R3 keeps the base style while host data is loading and evaluates after resolve', async () => {
    const root = new FakeRoot();
    let currentValue: ScreenJsonValue = 120;
    const requests: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async (request) => {
          requests.push(request);
          return { ok: true as const, value: currentValue, diagnostics: [] };
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'metrics',
      resourceType: 'dataset',
      params: {},
      binding: null,
    };
    const warn = [
      { id: 'warn', when: { path: [], operator: 'gt', value: 100 }, style: { color: '#ff0000' } },
    ] as const;
    const target: ScreenComponentNode = {
      ...component('metric', 0, null, source),
      style: { color: '#ffffff' },
      styleRules: warn,
    };

    expect(renderer.render(document([target])).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');

    await flush();
    expect(root.children[0]?.model?.dataState.status).toBe('ready');
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');

    currentValue = 42;
    renderer.refreshData('metric');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    expect(requests).toHaveLength(2);

    // 无关编辑触发原地重渲染：保留的 ready 数据继续派生 effective style，不发新请求。
    currentValue = 150;
    renderer.refreshData('metric');
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(requests).toHaveLength(3);
    expect(renderer.render(document([{ ...target, name: 'metric-renamed' }])).ok).toBe(true);
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');
    expect(requests).toHaveLength(3);
  });

  it('R3 fails closed on a rule style outside the material schema and keeps the tree unchanged', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createStyleRuleCatalog(),
      mode: 'design',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
    });
    const invalid = styledComponent(120, [
      { id: 'bad', when: { path: [], operator: 'gt', value: 100 }, style: { unknownKey: 'x' } },
    ]);

    const result = renderer.render(document([invalid]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.path.slice(0, 5)).toEqual([
        'components',
        0,
        'styleRules',
        0,
        'style',
      ]);
    }
    expect(root.children).toEqual([]);
  });
});

describe('conditional style port (ADR-0059)', () => {
  function createPortCatalog(): BaseScreenMaterialCatalog {
    const manifest: BaseScreenMaterialManifest = {
      type: 'base.test',
      tagName: 'base-screen-test',
      name: 'Test',
      category: 'Test',
      keywords: [],
      defaultSize: { width: 100, height: 40 },
      defaultProps: {},
      defaultStyle: { color: '#ffffff' },
      styleSchema: {
        kind: 'object',
        properties: { color: { kind: 'string' }, fontWeight: { kind: 'string' } },
        required: ['color'],
      },
      stylePanel: [],
      propsSchema: { kind: 'object', properties: {}, required: [] },
      propertyPanel: [],
      events: [],
      dataCapabilities: ['static', 'host-resource'],
      designCapabilities: { resize: true, rotate: true, children: true },
    };
    const entry = {
      manifest,
      constructor: FakeMaterialElement as unknown as BaseScreenMaterialConstructor,
    };
    return {
      get: (type) => (type === manifest.type ? entry : undefined),
      has: (type) => type === manifest.type,
      list: () => [entry],
    };
  }

  function portComponent(
    value: ScreenJsonValue,
    styleRules?: ScreenComponentNode['styleRules'],
  ): ScreenComponentNode {
    return {
      ...component('metric', 0, null, { type: 'static', value }),
      style: { color: '#ffffff', fontWeight: '400' },
      ...(styleRules === undefined ? {} : { styleRules }),
    };
  }

  function flush(): Promise<void> {
    let chain = Promise.resolve();
    for (let index = 0; index < 8; index++) chain = chain.then(() => undefined);
    return chain;
  }

  it('CSP-P2-C01 merges base → document rules → port overrides with per-key override', () => {
    const root = new FakeRoot();
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      conditionalStylePort: {
        resolve: () => ({ color: '#00ff00', fontWeight: '900' }),
      },
    });
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];

    expect(renderer.render(document([portComponent(150, rules)])).ok).toBe(true);
    // 端口覆盖同键后写优先（规则的红被端口绿覆盖），未覆盖键保留规则结果。
    expect(root.children[0]?.model?.style).toEqual({ color: '#00ff00', fontWeight: '900' });
  });

  it('CSP-P2-C02 receives componentId with the full dataState and re-evaluates on refresh', async () => {
    const root = new FakeRoot();
    const seen: { componentId: string; status: string; value?: ScreenJsonValue }[] = [];
    let currentValue: ScreenJsonValue = 120;
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: {
        resolve: async () => ({ ok: true as const, value: currentValue, diagnostics: [] }),
      },
      conditionalStylePort: {
        resolve: ({ componentId, dataState }) => {
          seen.push({
            componentId,
            status: dataState.status,
            ...(dataState.status === 'ready' ? { value: dataState.value } : {}),
          });
          if (dataState.status !== 'ready') return undefined;
          return typeof dataState.value === 'number' && dataState.value > 100
            ? { color: '#ff0000' }
            : undefined;
        },
      },
    });
    const source: ScreenComponentNode['dataSource'] = {
      type: 'host-resource',
      resourceId: 'metrics',
      resourceType: 'dataset',
      params: {},
      binding: null,
    };
    const target: ScreenComponentNode = {
      ...component('metric', 0, null, source),
      style: { color: '#ffffff', fontWeight: '400' },
    };

    expect(renderer.render(document([target])).ok).toBe(true);
    // 首次挂载即收到 loading 态请求：端口可见完整 dataState，自行决定无覆盖。
    expect(seen[0]).toEqual({ componentId: 'metric', status: 'loading' });
    await flush();
    expect(root.children[0]?.model?.style.color).toBe('#ff0000');

    currentValue = 42;
    renderer.refreshData('metric');
    await flush();
    // 数据刷新重求值：不命中返回 undefined，自动回退基础样式。
    expect(root.children[0]?.model?.style.color).toBe('#ffffff');
    expect(seen.every((item) => item.componentId === 'metric')).toBe(true);
    expect(seen.some((item) => item.status === 'ready' && item.value === 42)).toBe(true);
  });

  it('CSP-P2-C03 fails closed on an invalid override: ignores the port and reports one diagnostic', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      onDiagnostic: (item) => diagnostics.push(item),
      conditionalStylePort: { resolve: () => ({ unknownKey: 'x' }) as never },
    });
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];

    const result = renderer.render(document([portComponent(150, rules)]));

    // 渲染继续：非法覆盖不抵达物料，保留 base+规则结果。
    expect(result.ok).toBe(true);
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffaa00', fontWeight: '400' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      path: ['components', 'metric', 'conditionalStyle'],
    });
  });

  it('CSP-P2-C04 isolates a throwing resolve: ignores overrides, render continues', () => {
    const root = new FakeRoot();
    const diagnostics: unknown[] = [];
    const renderer = createBaseScreenRenderer({
      root: root as unknown as HTMLElement,
      catalog: createPortCatalog(),
      mode: 'viewer',
      interactive: false,
      onMaterialEvent: undefined,
      resourcePort: undefined,
      onDiagnostic: (item) => diagnostics.push(item),
      conditionalStylePort: {
        resolve: ({ componentId }) => {
          if (componentId === 'metric') throw new Error('port boom');
          return { color: '#00ff00' };
        },
      },
    });
    const metric = portComponent(120);
    const other = { ...portComponent(120), id: 'other', name: 'other' };

    const result = renderer.render(document([metric, other]));

    expect(result.ok).toBe(true);
    // 抛异常组件回退基础样式；其他组件不受影响正常获得覆盖。
    expect(root.children[0]?.model?.style).toEqual({ color: '#ffffff', fontWeight: '400' });
    expect(root.children[1]?.model?.style.color).toBe('#00ff00');
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 'PLUGIN_CORE_RENDER_FAILED',
        path: ['components', 'metric', 'conditionalStyle'],
        message: 'Conditional style port resolve raised an exception.',
      },
    ]);
  });

  it('CSP-P2-C05 keeps a port-less renderer and an undefined-returning port byte-identical', () => {
    const rules = [
      {
        id: 'warn',
        when: { path: [], operator: 'gt' as const, value: 10 },
        style: { color: '#ffaa00' },
      },
    ];
    const render = (options?: {
      conditionalStylePort?: { resolve(): ScreenJsonObject | undefined };
    }): string => {
      const root = new FakeRoot();
      const renderer = createBaseScreenRenderer({
        root: root as unknown as HTMLElement,
        catalog: createPortCatalog(),
        mode: 'viewer',
        interactive: false,
        onMaterialEvent: undefined,
        resourcePort: undefined,
        ...(options?.conditionalStylePort === undefined
          ? {}
          : { conditionalStylePort: options.conditionalStylePort }),
      });
      renderer.render(document([portComponent(150, rules)]));
      return JSON.stringify(root.children[0]?.model?.style);
    };

    expect(render()).toBe(render({ conditionalStylePort: { resolve: () => undefined } }));
  });
});

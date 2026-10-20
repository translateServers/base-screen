import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDocument,
  ScreenJsonValue,
  ScreenVariableEntry,
  ScreenVariableHandle,
} from '@base-screen/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  component,
  createDeferredResourcePort,
  createHostResourceCatalog,
  createImmediateResourcePort,
  createVariablePort,
  createViewerHarness,
  flush,
  hostSource,
  hostVariable,
  renderAssignments,
} from './__fixtures__/viewer-test-harness.js';

// ---------------------------------------------------------------------------
// 变量 = 文档取值引用在当前实例结果上的求值。
//
// 变量不再「批量向宿主解析」：`data-source-field` 的值来自实例运行时；实例未落定/失败时
// 回落 `initialValue`（绝不写 undefined）。值只在 ViewerVariableController 里算一次。
// ---------------------------------------------------------------------------

const HOST_CATALOG_SOURCE = { kind: 'host-catalog' as const, sourceId: 'tenant-region' };

function derivedVariable(
  id: string,
  dataSourceId: string,
  initialValue: ScreenJsonValue = null,
  controlled = false,
): ScreenVariableEntry {
  return {
    id,
    name: id,
    initialValue,
    controlled,
    value: { kind: 'data-source-field', dataSourceId, path: [] },
  };
}

function inlineVariable(
  id: string,
  value: ScreenJsonValue,
  controlled = false,
): ScreenVariableEntry {
  return {
    id,
    name: id,
    initialValue: value,
    controlled,
    value: { kind: 'inline', value },
  };
}

function instance(id: string): ScreenDataSource {
  return { id, name: id, source: HOST_CATALOG_SOURCE, params: {} };
}

function documentWith(
  components: readonly ScreenComponentNode[],
  variables: readonly ScreenVariableEntry[],
  dataSources: readonly ScreenDataSource[] = [],
): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components,
    variables,
    dataSources,
    blueprint: { rules: [] },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('变量派生（T02c-2）', () => {
  it('inline 变量渲染前就绪，不产生任何宿主调用', async () => {
    const variables = createVariablePort({});
    const screen = documentWith([], [inlineVariable('title', '本周')]);
    const { viewer, mount } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: variables.port,
    });
    await flush();

    expect(variables.requests).toHaveLength(0);
    expect(viewer.getVariable('title')?.value).toBe('本周');
    expect(mount.children).toHaveLength(0);
  });

  it('派生变量：实例 settle 后取该字段；实例返回新值 ⇒ 变量更新并且只重渲染一次', async () => {
    const variables = createVariablePort({}, true);
    const resources = createDeferredResourcePort();
    const screen = documentWith(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
      ],
      [derivedVariable('region', 'region-instance', 'north')],
      [instance('region-instance')],
    );
    const { viewer, mount } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    // 实例未落定：变量回落 initialValue，不写 undefined。
    expect(viewer.getVariable('region')?.value).toBe('north');
    expect(variables.requests).toHaveLength(1);

    variables.requests[0]!.resolveRequest({ ok: true, value: 'south', diagnostics: [] });
    await flush();
    expect(viewer.getVariable('region')?.value).toBe('south');

    // 新值带来的一次重渲染：材料模型只被再赋值一次（没有 render 风暴）。
    const assignments = renderAssignments.count;
    variables.values['region-instance'] = 'east';
    viewer.refreshVariables({ variableIds: ['region'] });
    await flush();
    expect(variables.requests).toHaveLength(2);
    variables.requests[1]!.resolveRequest({ ok: true, value: 'east', diagnostics: [] });
    await flush();
    expect(viewer.getVariable('region')?.value).toBe('east');
    expect(renderAssignments.count - assignments).toBe(1);
    expect(mount.children).toHaveLength(1);
    viewer.unload();
  });

  it('派生实例失败 ⇒ 变量回落 initialValue，组件进入 error 且变量不是 undefined', async () => {
    const variables = createVariablePort({}, true);
    const resources = createDeferredResourcePort();
    const screen = documentWith(
      [
        {
          ...component('a', null),
          dataValue: { kind: 'data-source-field', dataSourceId: 'region-instance', path: [] },
        },
      ],
      [derivedVariable('region', 'region-instance', 'fallback')],
      [instance('region-instance')],
    );
    const { viewer, mount } = await createViewerHarness({
      catalog: createHostResourceCatalog([], ['variable']),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    variables.requests[0]!.resolveRequest({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message: 'down' },
      ],
    });
    await flush();

    expect(viewer.getVariable('region')?.value).toBe('fallback');
    expect(viewer.getVariable('region')?.value).not.toBeUndefined();
    expect(mount.children[0]?.model?.dataState).toMatchObject({ status: 'error' });
    viewer.unload();
  });

  it('inline 变量恒可写（含 controlled:false 的迁移静态变量）；派生变量拒写', async () => {
    const catalogPort = createVariablePort({}, true);
    const screen = documentWith(
      [component('a', hostSource('orders'))],
      [
        // 迁移后的静态变量：inline + controlled:false（旧实现同样可写）。
        { ...inlineVariable('legacy', 'x'), controlled: false },
        inlineVariable('open', 'x', true),
        derivedVariable('derived', 'derived-instance'),
      ],
      [instance('derived-instance')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: catalogPort.port,
    });
    await flush();

    // 迁移静态变量可写：旧实现里 handled.set / 蓝图都直接写。
    expect(viewer.getVariable('legacy')?.set('y').ok).toBe(true);
    expect(viewer.getVariable('legacy')?.value).toBe('y');

    const changes: ScreenJsonValue[] = [];
    const handle: ScreenVariableHandle | undefined = viewer.getVariable('open');
    const stop = handle?.onChange((value) => changes.push(value));
    expect(handle?.set('y').ok).toBe(true);
    expect(handle?.value).toBe('y');
    expect(changes).toEqual(['y']);
    stop?.();

    // 派生值：写入会被下一次刷新覆盖，因此拒写且值不变。
    const derived = viewer.getVariable('derived');
    expect(derived?.value).toBeNull();
    expect(derived?.set('y')).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'VARIABLE_WRITE_FORBIDDEN' }],
    });
    expect(viewer.getVariable('derived')?.value).toBeNull();
    viewer.unload();
  });

  it('蓝图 set-variable：inline（含 controlled:false）可写，派生变量被拒', async () => {
    const screen = documentWith(
      [component('trigger')],
      [
        { ...inlineVariable('legacy', 'x'), controlled: false },
        derivedVariable('derived', 'derived-instance'),
      ],
      [instance('derived-instance')],
    );
    const rule = (variableId: string) => ({
      id: `set-${variableId}`,
      trigger: { type: 'material-event' as const, componentId: 'trigger', eventName: 'change' },
      actions: [
        {
          type: 'set-variable' as const,
          variableId,
          value: { kind: 'literal' as const, value: 'written' },
        },
      ],
    });
    const withRules: ScreenDocument = {
      ...screen,
      blueprint: { rules: [rule('legacy'), rule('derived')] },
    };
    const { viewer, mount } = await createViewerHarness({
      catalog: createHostResourceCatalog(['change'], ['variable']),
      document: withRules,
      resourcePort: createImmediateResourcePort().port,
      variablePort: createVariablePort({}).port,
    });
    await flush();

    mount.children[0]?.fire({ name: 'change', payload: {} });
    await flush();

    // 迁移静态变量照常被蓝图写入；派生变量保持不变（不会被静默覆盖）。
    expect(viewer.getVariable('legacy')?.value).toBe('written');
    expect(viewer.getVariable('derived')?.value).toBeNull();
    viewer.unload();
  });

  it('controlled 只决定初始种子：受控派生变量未就绪种 null，非受控种 initialValue', async () => {
    const catalogPort = createVariablePort({}, true);
    const screen = documentWith(
      [],
      [
        derivedVariable('controlled', 'a-instance', 'seed', true),
        derivedVariable('plain', 'b-instance', 'seed', false),
      ],
      [instance('a-instance'), instance('b-instance')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog([], ['variable']),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: catalogPort.port,
    });
    await flush();

    // 实例都还在途：受控变量等外部值（null），非受控用文档 initialValue。
    expect(viewer.getVariable('controlled')?.value).toBeNull();
    expect(viewer.getVariable('plain')?.value).toBe('seed');
    viewer.unload();
  });

  it("updatePolicy.mode='auto' 按间隔触发刷新；dispose 后停止；manual/once 不触发", async () => {
    vi.useFakeTimers();
    const catalogPort = createVariablePort({}, true);
    const screen = documentWith(
      [],
      [
        derivedVariable('auto', 'auto-instance'),
        derivedVariable('manual', 'manual-instance'),
        derivedVariable('once', 'once-instance'),
      ],
      [
        {
          id: 'auto-instance',
          name: 'auto',
          source: HOST_CATALOG_SOURCE,
          params: {},
          updatePolicy: { mode: 'auto', intervalSeconds: 1 },
        },
        {
          id: 'manual-instance',
          name: 'manual',
          source: HOST_CATALOG_SOURCE,
          params: {},
          updatePolicy: { mode: 'manual' },
        },
        {
          id: 'once-instance',
          name: 'once',
          source: HOST_CATALOG_SOURCE,
          params: {},
          updatePolicy: { mode: 'once' },
        },
      ],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog([], ['variable']),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: catalogPort.port,
    });
    await flush();
    // 先让初次请求落定：在途同键刷新会被合并（不放大请求），所以定时器的效果要有落定前提。
    for (const request of [...catalogPort.requests]) {
      request.resolveRequest({ ok: true, value: 1, diagnostics: [] });
    }
    await flush();
    const baseline = catalogPort.requests.length;
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(catalogPort.requests.length).toBe(baseline + 1);
    catalogPort.requests.at(-1)?.resolveRequest({ ok: true, value: 2, diagnostics: [] });
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(catalogPort.requests.length).toBe(baseline + 2);
    // 只有 auto 实例被定时刷新（三个实例来源相同，按实例 id 区分已被 runtime 保证）。
    expect(
      catalogPort.requests.slice(baseline).every((request) => request.sourceId === 'tenant-region'),
    ).toBe(true);

    viewer.unload();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(catalogPort.requests.length).toBe(baseline + 2);
  });

  it('refreshVariables() 无参只刷新派生变量依赖的实例；纯 inline 文档零宿主调用', async () => {
    const variables = createVariablePort({});
    const screen = documentWith(
      [],
      [derivedVariable('region', 'region-instance'), inlineVariable('title', 't')],
      [instance('region-instance')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog([], ['variable']),
      document: screen,
      resourcePort: createImmediateResourcePort().port,
      variablePort: variables.port,
    });
    await flush();
    const afterInitial = variables.requests.length;

    viewer.refreshVariables();
    await flush();
    expect(variables.requests.length).toBe(afterInitial + 1);
    expect(variables.requests.at(-1)?.sourceId).toBe('tenant-region');

    viewer.unload();

    // 纯 inline：没有实例依赖 ⇒ 不产生任何宿主调用。
    const inlinePort = createVariablePort({});
    const inlineOnly = documentWith([], [inlineVariable('a', 1), inlineVariable('b', 2)]);
    const harness = await createViewerHarness({
      catalog: createHostResourceCatalog([], ['variable']),
      document: inlineOnly,
      resourcePort: createImmediateResourcePort().port,
      variablePort: inlinePort.port,
    });
    await flush();
    harness.viewer.refreshVariables();
    await flush();
    expect(inlinePort.requests).toHaveLength(0);
    harness.viewer.unload();
  });
});

describe('变量刷新：跨变量共享与 trace 透传', () => {
  it('两个变量共用同一 sourceId 时各自实例独立请求（变量不再批量解析）', async () => {
    const variables = createVariablePort({ shared: 'north' });
    const resources = createImmediateResourcePort();
    const screen = documentWith(
      [
        component('a', hostSource('orders', { value: { kind: 'variable', variableId: 'first' } })),
        component('b', hostSource('orders', { value: { kind: 'variable', variableId: 'second' } })),
      ],
      [hostVariable('first', 'shared'), hostVariable('second', 'shared')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();

    // 两个变量各自一个实例（`data-source-first` / `data-source-second`）：宿主只看到同一个
    // sourceId，因此「两个变量共享来源但实例不同 ⇒ 两次请求」正是新模型的可见差别。
    expect(variables.requests).toHaveLength(2);
    expect(variables.requests.every((request) => request.sourceId === 'shared')).toBe(true);
    // 派生变量落定前的第一轮用 initialValue 取数，落定后再按真实值取一次。
    expect(resources.requests.slice(-2).map((request) => request.request.params)).toEqual([
      { value: 'north' },
      { value: 'north' },
    ]);
    viewer.unload();
  });

  it('refreshVariables({variableIds}) 只刷新命中的实例并带上 trace', async () => {
    const variables = createVariablePort({ 'region-id': 'north', 'page-id': 1 });
    const resources = createImmediateResourcePort();
    const screen = documentWith(
      [
        component(
          'a',
          hostSource('orders', { region: { kind: 'variable', variableId: 'region' } }),
        ),
        component('b', hostSource('orders', { page: { kind: 'variable', variableId: 'page' } })),
      ],
      [hostVariable('region', 'region-id'), hostVariable('page', 'page-id')],
    );
    const { viewer } = await createViewerHarness({
      catalog: createHostResourceCatalog(),
      document: screen,
      resourcePort: resources.port,
      variablePort: variables.port,
    });
    await flush();
    const before = variables.requests.length;

    variables.values['region-id'] = 'south';
    viewer.refreshVariables({ variableIds: ['region', 'region'], traceId: 'var-trace' });
    await flush();

    expect(variables.requests).toHaveLength(before + 1);
    expect(variables.requests.at(-1)).toMatchObject({
      sourceId: 'region-id',
      purpose: 'runtime',
    });
    const refreshed = resources.requests.at(-1);
    expect(refreshed?.request.params).toEqual({ region: 'south' });
    expect(refreshed?.context?.trigger).toBe('variable');
    viewer.unload();
  });
});

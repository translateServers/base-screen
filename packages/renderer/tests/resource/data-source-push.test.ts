import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDataSourceSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenHostResourcePort,
  ScreenHostResourceRequest,
  ScreenHostSubscribeOptions,
  ScreenJsonValue,
  ScreenResourceObserverEvent,
  ScreenSourceDelivery,
  ScreenSourcePushEvent,
  ScreenSourcePushSink,
  ScreenUpdatePolicy,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialMode,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseScreenRenderer } from '../../src/renderer/renderer.js';
import {
  component,
  createCatalog,
  FakeRoot,
} from '../renderer/__fixtures__/renderer-test-harness.js';

// ---------------------------------------------------------------------------
// ADR-0104：push 实例的订阅生命周期、四类数据事件、游标、窗口、合帧与过期语义。
// 全部经渲染器公开入口驱动；计时用 vitest fake timers（无 rAF 时合帧退化为 16 ms 定时器）。
// ---------------------------------------------------------------------------

const FIELDS = [
  { id: 't', label: 'Time', valueType: 'string' as const },
  { id: 'value', label: 'Value', valueType: 'number' as const },
];

function table(...values: number[]): ScreenJsonValue {
  return { fields: FIELDS, rows: values.map((value) => row(value)) };
}

function row(value: number): { t: string; value: number } {
  return { t: new Date(Date.UTC(2026, 10, 22, 0, 0, value)).toISOString(), value };
}

const SERIES: ScreenDataSourceSource = {
  kind: 'host-resource',
  resourceType: 'series',
  resourceId: 'oee',
};

function instance(
  updatePolicy: ScreenUpdatePolicy,
  source: ScreenDataSourceSource = SERIES,
): ScreenDataSource {
  return { id: 'live', name: 'live', source, params: {}, updatePolicy };
}

function reader(dataSourceId = 'live'): ScreenComponentNode {
  return {
    ...component('reader', 0, null, null),
    dataValue: { kind: 'data-source-field', dataSourceId, path: [] },
  };
}

function screen(dataSource: ScreenDataSource): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [reader()],
    dataSources: [dataSource],
    variables: [],
    blueprint: { nodes: [], edges: [] },
  };
}

type Subscription = {
  readonly request: ScreenHostResourceRequest;
  readonly sink: ScreenSourcePushSink;
  readonly options: ScreenHostSubscribeOptions;
  aborted: boolean;
};

function pushPort(
  options: { readonly subscribe?: boolean; readonly resolveValue?: ScreenJsonValue } = {},
) {
  const subscriptions: Subscription[] = [];
  let resolveCalls = 0;
  const port: ScreenHostResourcePort = {
    resolve: async () => {
      resolveCalls++;
      return { ok: true as const, value: options.resolveValue ?? table(100), diagnostics: [] };
    },
    ...(options.subscribe === false
      ? {}
      : {
          subscribe: (request, sink, subscribeOptions) => {
            const subscription: Subscription = {
              request,
              sink,
              options: subscribeOptions,
              aborted: false,
            };
            subscribeOptions.signal.addEventListener('abort', () => {
              subscription.aborted = true;
            });
            subscriptions.push(subscription);
            return { ok: true as const, value: null, diagnostics: [] };
          },
        }),
  };
  const last = (): Subscription => {
    const subscription = subscriptions[subscriptions.length - 1];
    if (subscription === undefined) throw new Error('no subscription');
    return subscription;
  };
  const push = (event: ScreenSourcePushEvent) => last().sink.push(event);
  return { port, subscriptions, last, push, resolveCalls: () => resolveCalls };
}

function contributions(
  delivery: ScreenSourceDelivery | undefined,
): BaseScreenRuntimeContributionIndex {
  return {
    getResourceType: (resourceType) =>
      resourceType === 'series'
        ? {
            kind: 'dataResourceType',
            id: 'series',
            name: 'Series',
            configSchema: { kind: 'object', properties: {}, required: [] },
            ...(delivery === undefined ? {} : { delivery }),
          }
        : undefined,
    hasBlueprintCapability: () => false,
  };
}

function setup(
  options: {
    readonly mode?: BaseScreenMaterialMode;
    readonly delivery?: ScreenSourceDelivery | undefined;
    readonly subscribe?: boolean;
    readonly resolveValue?: ScreenJsonValue;
    readonly resourceTimeoutMs?: number;
  } = {},
) {
  const host = pushPort({
    ...(options.subscribe === undefined ? {} : { subscribe: options.subscribe }),
    ...(options.resolveValue === undefined ? {} : { resolveValue: options.resolveValue }),
  });
  const events: ScreenResourceObserverEvent[] = [];
  const diagnostics: ScreenDiagnostic[] = [];
  const root = new FakeRoot();
  const renderer = createBaseScreenRenderer({
    root: root as unknown as HTMLElement,
    catalog: createCatalog(),
    mode: options.mode ?? 'viewer',
    interactive: false,
    onMaterialEvent: undefined,
    resourcePort: host.port,
    contributionIndex: contributions(
      'delivery' in options ? options.delivery : { push: { append: true } },
    ),
    observer: (event) => events.push(event),
    onDiagnostic: (item) => diagnostics.push(item),
    ...(options.resourceTimeoutMs === undefined
      ? {}
      : { resourceTimeoutMs: options.resourceTimeoutMs }),
  });
  const dataState = () => root.children[0]?.model?.dataState;
  return { host, renderer, root, events, diagnostics, dataState };
}

/** 跑过一帧（合帧定时器 16 ms）并冲掉微任务。 */
async function frame(): Promise<void> {
  await vi.advanceTimersByTimeAsync(20);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.UTC(2026, 10, 22)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('push · 订阅生命周期', () => {
  it('viewer 渲染即订阅，首个快照前为 loading，快照落地后 ready', async () => {
    const { host, renderer, dataState } = setup();
    expect(renderer.render(screen(instance({ mode: 'push' }))).ok).toBe(true);
    expect(host.subscriptions).toHaveLength(1);
    expect(host.resolveCalls()).toBe(0);
    expect(host.last().request).toMatchObject({ dataSourceId: 'live', resourceId: 'oee' });
    expect(dataState()).toEqual({ status: 'loading' });

    host.push({ type: 'snapshot', value: table(1, 2) });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1, 2) });
    renderer.dispose();
  });

  it('设计态不订阅：push 实例只做一次拉取', async () => {
    const { host, renderer, dataState } = setup({ mode: 'design' });
    renderer.render(screen(instance({ mode: 'push' })));
    await vi.advanceTimersByTimeAsync(0);
    expect(host.subscriptions).toHaveLength(0);
    expect(host.resolveCalls()).toBe(1);
    expect(dataState()).toEqual({ status: 'ready', value: table(100) });
    renderer.dispose();
  });

  it('订阅选项带 retain 提示；请求键变化退订旧订阅，旧 sink 的事件被丢弃', async () => {
    const { host, renderer, dataState } = setup();
    const retain = { rows: 50 };
    renderer.render(screen(instance({ mode: 'push', retain })));
    expect(host.last().options.retain).toEqual(retain);
    const first = host.last();

    renderer.render(
      screen(instance({ mode: 'push', retain }, { ...SERIES, resourceId: 'output' })),
    );
    expect(first.aborted).toBe(true);
    expect(host.subscriptions).toHaveLength(2);
    first.sink.push({ type: 'snapshot', value: table(9) });
    await frame();
    expect(dataState()).toEqual({ status: 'loading' });

    host.push({ type: 'snapshot', value: table(3) });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(3) });
    renderer.dispose();
  });

  it('dispose 与 suspendData 退订', () => {
    const { host, renderer } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    renderer.suspendData();
    expect(host.last().aborted).toBe(true);
    const { host: other, renderer: second } = setup();
    second.render(screen(instance({ mode: 'push' })));
    second.dispose();
    expect(other.last().aborted).toBe(true);
    renderer.dispose();
  });

  it('refreshData 重新订阅，不额外 resolve，旧值保留到新快照', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    await frame();
    renderer.refreshData('reader');
    expect(host.subscriptions).toHaveLength(2);
    expect(host.subscriptions[0]?.aborted).toBe(true);
    expect(host.resolveCalls()).toBe(0);
    expect(dataState()).toEqual({ status: 'ready', value: table(1) });
    host.push({ type: 'snapshot', value: table(2) });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(2) });
    renderer.dispose();
  });
});

describe('push · 增量、合帧与窗口', () => {
  it('一帧内多条增量只通知一次，按到达顺序追加', async () => {
    const { host, renderer, dataState, events } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    host.push({ type: 'append', rows: [row(2)] });
    host.push({ type: 'append', rows: [row(3), row(4)] });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1, 2, 3, 4) });
    expect(events.filter((event) => event.type === 'pushed')).toHaveLength(1);
    expect(events.find((event) => event.type === 'pushed')?.rowCount).toBe(4);
    renderer.dispose();
  });

  it('首个快照前的增量被丢弃', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'append', rows: [row(1)] });
    await frame();
    expect(dataState()).toEqual({ status: 'loading' });
    renderer.dispose();
  });

  it('按 retain.rows 从头部裁剪', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push', retain: { rows: 3 } })));
    host.push({ type: 'snapshot', value: table(1, 2) });
    host.push({ type: 'append', rows: [row(3), row(4), row(5)] });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(3, 4, 5) });
    renderer.dispose();
  });

  it('按 retain.seconds 以数据里最新一行的时间为基准裁剪', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push', retain: { seconds: 2, timeField: 't' } })));
    host.push({ type: 'snapshot', value: table(1, 2, 3) });
    host.push({ type: 'append', rows: [row(5)] });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(3, 5) });
    renderer.dispose();
  });

  it('未声明 append 的来源推增量 ⇒ HOST_RESOURCE_INVALID，订阅被中止', async () => {
    const { host, renderer, dataState } = setup({ delivery: { push: {} } });
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    host.push({ type: 'append', rows: [row(2)] });
    await frame();
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_INVALID' });
    expect(host.last().aborted).toBe(true);
    renderer.dispose();
  });

  it('增量行带未知字段 ⇒ HOST_RESOURCE_INVALID', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    host.push({ type: 'append', rows: [{ t: 'x', value: 2, extra: true }] });
    await frame();
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_INVALID' });
    renderer.dispose();
  });

  it('invalidate 触发同键 resolve，期间保留当前值', async () => {
    const { host, renderer, dataState } = setup({ resolveValue: table(7, 8) });
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    await frame();
    host.push({ type: 'invalidate' });
    expect(dataState()).toEqual({ status: 'ready', value: table(1) });
    await vi.advanceTimersByTimeAsync(0);
    expect(host.resolveCalls()).toBe(1);
    expect(dataState()).toEqual({ status: 'ready', value: table(7, 8) });
    renderer.dispose();
  });
});

describe('push · 游标', () => {
  it('重复 revision 丢弃；跳号进入重同步并标过期，新快照恢复', async () => {
    const { host, renderer, dataState, events } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1), cursor: { epoch: 'a', revision: 1 } });
    host.push({ type: 'append', rows: [row(2)], cursor: { epoch: 'a', revision: 2 } });
    host.push({ type: 'append', rows: [row(2)], cursor: { epoch: 'a', revision: 2 } });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1, 2) });

    host.push({ type: 'append', rows: [row(4)], cursor: { epoch: 'a', revision: 4 } });
    host.push({ type: 'append', rows: [row(3)], cursor: { epoch: 'a', revision: 3 } });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1, 2), stale: true });
    expect(events.some((event) => event.type === 'resync')).toBe(true);

    host.push({
      type: 'snapshot',
      value: table(1, 2, 3, 4),
      cursor: { epoch: 'a', revision: 4 },
    });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1, 2, 3, 4) });
    renderer.dispose();
  });

  it('换 epoch 的增量视为跳号；换 epoch 的快照作为新基准', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1), cursor: { epoch: 'a', revision: 9 } });
    host.push({ type: 'append', rows: [row(2)], cursor: { epoch: 'b', revision: 1 } });
    await frame();
    expect(dataState()).toMatchObject({ stale: true });
    host.push({ type: 'snapshot', value: table(5), cursor: { epoch: 'b', revision: 1 } });
    host.push({ type: 'append', rows: [row(6)], cursor: { epoch: 'b', revision: 2 } });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(5, 6) });
    renderer.dispose();
  });
});

describe('push · 连接状态与过期', () => {
  it('reconnecting 标过期，open 恢复', async () => {
    const { host, renderer, dataState, events } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    host.push({ type: 'status', status: 'reconnecting' });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1), stale: true });
    host.push({ type: 'status', status: 'open' });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1) });
    expect(
      events.filter((event) => event.type === 'connection').map((event) => event.connection),
    ).toEqual(['reconnecting', 'open']);
    renderer.dispose();
  });

  it('failed ⇒ error、不保留旧值、中止订阅', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    await frame();
    host.push({ type: 'status', status: 'failed' });
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_UNAVAILABLE' });
    expect(host.last().aborted).toBe(true);
    renderer.dispose();
  });

  it('从未有值时 suspended ⇒ HOST_RESOURCE_UNAVAILABLE，之后的快照仍能恢复', async () => {
    const { host, renderer, dataState } = setup();
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'status', status: 'suspended' });
    await frame();
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_UNAVAILABLE' });
    host.push({ type: 'status', status: 'open' });
    host.push({ type: 'snapshot', value: table(1) });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1) });
    renderer.dispose();
  });

  it('超过静默超时无任何事件 ⇒ 过期；心跳恢复', async () => {
    const { host, renderer, dataState } = setup({
      delivery: { push: { append: true, inactivityTimeoutSeconds: 5 } },
    });
    renderer.render(screen(instance({ mode: 'push' })));
    host.push({ type: 'snapshot', value: table(1) });
    await frame();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(dataState()).toEqual({ status: 'ready', value: table(1), stale: true });
    host.push({ type: 'heartbeat' });
    await frame();
    expect(dataState()).toEqual({ status: 'ready', value: table(1) });
    renderer.dispose();
  });

  it('suspended 期间按 fallbackIntervalSeconds 轮询，open 后停止', async () => {
    const { host, renderer } = setup();
    renderer.render(screen(instance({ mode: 'push', fallbackIntervalSeconds: 10 })));
    host.push({ type: 'snapshot', value: table(1) });
    host.push({ type: 'status', status: 'suspended' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(host.resolveCalls()).toBe(1);
    host.push({ type: 'status', status: 'open' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(host.resolveCalls()).toBe(1);
    renderer.dispose();
  });

  it('首个快照超时 ⇒ HOST_RESOURCE_TIMEOUT', async () => {
    const { host, renderer, dataState } = setup({ resourceTimeoutMs: 1_000 });
    renderer.render(screen(instance({ mode: 'push' })));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_TIMEOUT' });
    expect(host.last().aborted).toBe(true);
    renderer.dispose();
  });
});

describe('push · 门控', () => {
  it('端口没有 subscribe 且未配回退 ⇒ HOST_RESOURCE_UNAVAILABLE', () => {
    const { host, renderer, dataState } = setup({ subscribe: false });
    renderer.render(screen(instance({ mode: 'push' })));
    expect(host.resolveCalls()).toBe(0);
    expect(dataState()).toMatchObject({ status: 'error', code: 'HOST_RESOURCE_UNAVAILABLE' });
    renderer.dispose();
  });

  it('资源类型未声明 push 但配了回退 ⇒ warning + 按间隔轮询', async () => {
    const { host, renderer, dataState, diagnostics } = setup({ delivery: undefined });
    renderer.render(screen(instance({ mode: 'push', fallbackIntervalSeconds: 5 })));
    expect(host.subscriptions).toHaveLength(0);
    expect(diagnostics.some((item) => item.severity === 'warning')).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(host.resolveCalls()).toBe(1);
    expect(dataState()).toEqual({ status: 'ready', value: table(100) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(host.resolveCalls()).toBe(3);
    renderer.dispose();
  });
});

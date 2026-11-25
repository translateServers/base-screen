import type {
  ScreenAbortSignal,
  ScreenHostSubscribeOptions,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenSourcePushEvent,
  ScreenSourcePushSink,
} from '@base-screen/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSseSubscribe,
  createSubscriptionHub,
  type HostKitEventSource,
  type HostKitPushSnapshot,
  type HostKitSubscribe,
  type SubscriptionHubOptions,
} from '../src/index.js';

type Request = { readonly resourceId: string };

function recorder(): ScreenSourcePushSink & { readonly events: ScreenSourcePushEvent[] } {
  const events: ScreenSourcePushEvent[] = [];
  return { events, push: (event) => events.push(event) };
}

function subscription(): {
  readonly controller: AbortController;
  readonly options: ScreenHostSubscribeOptions;
} {
  const controller = new AbortController();
  return { controller, options: { signal: controller.signal as ScreenAbortSignal } };
}

function table(...values: number[]): ScreenJsonValue {
  return {
    fields: [{ id: 'value', label: 'Value', valueType: 'number' }],
    rows: values.map((value) => ({ value })),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// createSubscriptionHub
// ---------------------------------------------------------------------------

type Opened = {
  readonly request: Request;
  readonly sink: ScreenSourcePushSink;
  readonly signal: ScreenAbortSignal;
};

function upstream() {
  const opened: Opened[] = [];
  const open: HostKitSubscribe<Request> = (request, sink, options) => {
    opened.push({ request, sink, signal: options.signal });
    return { ok: true, value: null, diagnostics: [] };
  };
  const emit = (event: ScreenSourcePushEvent, index = opened.length - 1) =>
    opened[index]?.sink.push(event);
  return { opened, open, emit };
}

function hubOf(
  open: HostKitSubscribe<Request>,
  extra: Partial<SubscriptionHubOptions<Request>> = {},
) {
  return createSubscriptionHub<Request>({ keyOf: (request) => request.resourceId, open, ...extra });
}

describe('createSubscriptionHub', () => {
  it('同键订阅共享一条上游连接，事件扇出给所有订阅者', () => {
    const up = upstream();
    const hub = hubOf(up.open);
    const a = recorder();
    const b = recorder();
    hub.subscribe({ resourceId: 'oee' }, a, subscription().options);
    hub.subscribe({ resourceId: 'oee' }, b, subscription().options);
    hub.subscribe({ resourceId: 'output' }, recorder(), subscription().options);
    expect(up.opened).toHaveLength(2);
    expect(hub.channelCount()).toBe(2);

    up.emit({ type: 'snapshot', value: table(1) }, 0);
    expect(a.events).toEqual([{ type: 'snapshot', value: table(1) }]);
    expect(b.events).toEqual([{ type: 'snapshot', value: table(1) }]);
  });

  it('迟到订阅者先收到连接状态，再收到合并了增量的合成快照', () => {
    const up = upstream();
    const hub = hubOf(up.open);
    hub.subscribe({ resourceId: 'oee' }, recorder(), subscription().options);
    up.emit({ type: 'status', status: 'open' });
    up.emit({ type: 'snapshot', value: table(1), cursor: { epoch: 'a', revision: 1 } });
    up.emit({ type: 'append', rows: [{ value: 2 }], cursor: { epoch: 'a', revision: 2 } });

    const late = recorder();
    hub.subscribe({ resourceId: 'oee' }, late, subscription().options);
    expect(late.events).toEqual([
      { type: 'status', status: 'open' },
      { type: 'snapshot', value: table(1, 2), cursor: { epoch: 'a', revision: 2 } },
    ]);
  });

  it('合成快照按 replayRows 裁剪；invalidate 之后迟到者在快照后紧跟 invalidate', () => {
    const up = upstream();
    const hub = hubOf(up.open, { replayRows: 2 });
    hub.subscribe({ resourceId: 'oee' }, recorder(), subscription().options);
    up.emit({ type: 'snapshot', value: table(1, 2) });
    up.emit({ type: 'append', rows: [{ value: 3 }] });
    up.emit({ type: 'invalidate' });
    const late = recorder();
    hub.subscribe({ resourceId: 'oee' }, late, subscription().options);
    expect(late.events).toEqual([{ type: 'snapshot', value: table(2, 3) }, { type: 'invalidate' }]);
  });

  it('最后一个订阅者离开后 linger 到期才关闭；期间重新订阅直接复用', async () => {
    const up = upstream();
    const hub = hubOf(up.open, { lingerMs: 1_000 });
    const first = subscription();
    hub.subscribe({ resourceId: 'oee' }, recorder(), first.options);
    first.controller.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(up.opened[0]?.signal.aborted).toBe(false);

    const second = subscription();
    hub.subscribe({ resourceId: 'oee' }, recorder(), second.options);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(up.opened).toHaveLength(1);
    expect(up.opened[0]?.signal.aborted).toBe(false);

    second.controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(up.opened[0]?.signal.aborted).toBe(true);
    expect(hub.channelCount()).toBe(0);
  });

  it('上游 failed 立即关闭并清空缓存，之后的订阅重新打开', () => {
    const up = upstream();
    const hub = hubOf(up.open);
    const a = recorder();
    hub.subscribe({ resourceId: 'oee' }, a, subscription().options);
    up.emit({ type: 'snapshot', value: table(1) });
    up.emit({ type: 'status', status: 'failed' });
    expect(a.events.at(-1)).toEqual({ type: 'status', status: 'failed' });
    expect(up.opened[0]?.signal.aborted).toBe(true);
    expect(hub.channelCount()).toBe(0);

    const b = recorder();
    hub.subscribe({ resourceId: 'oee' }, b, subscription().options);
    expect(up.opened).toHaveLength(2);
    expect(b.events).toEqual([]);
  });

  it('单个 sink 抛错不影响其它订阅者；上游同步失败原样返回', () => {
    const up = upstream();
    const hub = hubOf(up.open);
    hub.subscribe(
      { resourceId: 'oee' },
      {
        push: () => {
          throw new Error('boom');
        },
      },
      subscription().options,
    );
    const b = recorder();
    hub.subscribe({ resourceId: 'oee' }, b, subscription().options);
    up.emit({ type: 'heartbeat' });
    expect(b.events).toEqual([{ type: 'heartbeat' }]);

    const denied = hubOf(() => ({
      ok: false,
      diagnostics: [
        { severity: 'error', code: 'HOST_RESOURCE_ACCESS_DENIED', path: [], message: 'no' },
      ],
    }));
    const result = denied.subscribe({ resourceId: 'x' }, recorder(), subscription().options);
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_RESOURCE_ACCESS_DENIED' }],
    });
    expect(denied.channelCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createSseSubscribe
// ---------------------------------------------------------------------------

type FakeMessage = { data?: unknown; lastEventId?: string };

class FakeEventSource implements HostKitEventSource {
  static instances: FakeEventSource[] = [];
  readyState = 0;
  closed = false;
  readonly listeners = new Map<string, ((event: FakeMessage) => void)[]>();

  constructor(
    readonly url: string,
    readonly init?: { readonly withCredentials?: boolean },
  ) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: FakeMessage) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  fire(type: string, event: FakeMessage = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open(): void {
    this.readyState = 1;
    this.fire('open');
  }

  error(readyState: number): void {
    this.readyState = readyState;
    this.fire('error');
  }

  send(type: string, data: unknown, lastEventId = ''): void {
    this.fire(type, { data: JSON.stringify(data), lastEventId });
  }
}

function sse(
  overrides: Partial<Parameters<typeof createSseSubscribe<Request>>[0]> = {},
): HostKitSubscribe<Request> {
  return createSseSubscribe<Request>({
    url: (request) => `https://host.example/stream/${request.resourceId}`,
    EventSource: FakeEventSource,
    ...overrides,
  });
}

function lastSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) throw new Error('no event source');
  return source;
}

describe('createSseSubscribe', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
  });

  it('打开即报 open；消息体就是推送事件，命名事件以事件名补齐 type', () => {
    const sink = recorder();
    expect(sse()({ resourceId: 'oee' }, sink, subscription().options)).toMatchObject({ ok: true });
    expect(lastSource().url).toBe('https://host.example/stream/oee');
    lastSource().open();
    lastSource().send('message', { type: 'snapshot', value: table(1) });
    lastSource().send('append', { rows: [{ value: 2 }] });
    lastSource().fire('heartbeat');
    expect(sink.events).toEqual([
      { type: 'status', status: 'open' },
      { type: 'snapshot', value: table(1) },
      { type: 'append', rows: [{ value: 2 }] },
      { type: 'heartbeat' },
    ]);
  });

  it('从 Last-Event-ID（epoch:revision）补齐游标；不认识的消息被忽略', () => {
    const sink = recorder();
    sse()({ resourceId: 'oee' }, sink, subscription().options);
    lastSource().send('append', { rows: [] }, 'e1:7');
    lastSource().send('message', { hello: true });
    lastSource().fire('message', { data: 'not json' });
    expect(sink.events).toEqual([
      { type: 'append', rows: [], cursor: { epoch: 'e1', revision: 7 } },
    ]);
  });

  it('url 返回 undefined ⇒ ACCESS_DENIED；没有 EventSource ⇒ UNAVAILABLE', () => {
    expect(
      sse({ url: () => undefined })({ resourceId: 'x' }, recorder(), subscription().options),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_RESOURCE_ACCESS_DENIED' }] });
    const subscribe = createSseSubscribe<Request>({ url: () => 'https://host.example/x' });
    const original = (globalThis as { EventSource?: unknown }).EventSource;
    (globalThis as { EventSource?: unknown }).EventSource = undefined;
    try {
      expect(subscribe({ resourceId: 'x' }, recorder(), subscription().options)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'HOST_RESOURCE_UNAVAILABLE' }],
      });
    } finally {
      (globalThis as { EventSource?: unknown }).EventSource = original;
    }
  });

  it('出错重连 ⇒ reconnecting，持续超过 suspendAfterMs ⇒ suspended，重新打开 ⇒ open', async () => {
    const sink = recorder();
    sse({ suspendAfterMs: 5_000 })({ resourceId: 'oee' }, sink, subscription().options);
    lastSource().open();
    lastSource().error(0);
    await vi.advanceTimersByTimeAsync(5_000);
    lastSource().open();
    expect(sink.events.map((event) => event.type === 'status' && event.status)).toEqual([
      'open',
      'reconnecting',
      'suspended',
      'open',
    ]);
  });

  it('浏览器放弃重连（readyState CLOSED）⇒ failed 并关闭', () => {
    const sink = recorder();
    sse()({ resourceId: 'oee' }, sink, subscription().options);
    lastSource().error(2);
    expect(sink.events).toMatchObject([
      { type: 'status', status: 'failed', diagnostic: { code: 'HOST_RESOURCE_UNAVAILABLE' } },
    ]);
    expect(lastSource().closed).toBe(true);
  });

  it('abort 关闭连接，之后的消息不再转发', () => {
    const sink = recorder();
    const { controller, options } = subscription();
    sse()({ resourceId: 'oee' }, sink, options);
    controller.abort();
    expect(lastSource().closed).toBe(true);
    lastSource().send('heartbeat', {});
    expect(sink.events).toEqual([]);
  });

  it('fetchSnapshot：打开后取快照，期间的增量暂存，快照后按游标去重再转发', async () => {
    let resolveSnapshot: (value: ScreenParseResult<HostKitPushSnapshot>) => void = () => {};
    const fetchSnapshot = vi.fn(
      () =>
        new Promise<ScreenParseResult<HostKitPushSnapshot>>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const sink = recorder();
    sse({ fetchSnapshot })({ resourceId: 'oee' }, sink, subscription().options);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    lastSource().open();
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    lastSource().send('append', { rows: [{ value: 2 }] }, 'a:2');
    lastSource().send('append', { rows: [{ value: 3 }] }, 'a:3');
    expect(sink.events).toEqual([{ type: 'status', status: 'open' }]);

    resolveSnapshot({
      ok: true,
      value: { value: table(1, 2), cursor: { epoch: 'a', revision: 2 } },
      diagnostics: [],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.events.slice(1)).toEqual([
      { type: 'snapshot', value: table(1, 2), cursor: { epoch: 'a', revision: 2 } },
      { type: 'append', rows: [{ value: 3 }], cursor: { epoch: 'a', revision: 3 } },
    ]);
  });

  it('fetchSnapshot：重新打开时重新取快照；拉取失败 ⇒ failed', async () => {
    const fetchSnapshot = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: { value: table(1) }, diagnostics: [] })
      .mockResolvedValueOnce({ ok: false, diagnostics: [] });
    const sink = recorder();
    sse({ fetchSnapshot })({ resourceId: 'oee' }, sink, subscription().options);
    lastSource().open();
    await vi.advanceTimersByTimeAsync(0);
    lastSource().error(0);
    lastSource().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(sink.events.at(-1)).toMatchObject({ type: 'status', status: 'failed' });
    expect(lastSource().closed).toBe(true);
  });

  it('可与订阅中心组合：两个实例订阅同一资源只开一条 SSE', () => {
    const hub = createSubscriptionHub<Request>({
      keyOf: (request) => request.resourceId,
      open: sse(),
    });
    const a = recorder();
    const b = recorder();
    hub.subscribe({ resourceId: 'oee' }, a, subscription().options);
    hub.subscribe({ resourceId: 'oee' }, b, subscription().options);
    expect(FakeEventSource.instances).toHaveLength(1);
    lastSource().open();
    lastSource().send('snapshot', { value: table(1) });
    expect(b.events).toEqual([
      { type: 'status', status: 'open' },
      { type: 'snapshot', value: table(1) },
    ]);
  });
});

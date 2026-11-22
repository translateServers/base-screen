import type {
  ScreenHostSubscribeOptions,
  ScreenJsonValue,
  ScreenParseResult,
  ScreenPushCursor,
  ScreenSourceConnectionStatus,
  ScreenSourcePushEvent,
  ScreenSourcePushSink,
} from '@base-screen/contracts';
import { subscribeFailure, subscribeOk } from './push-result.js';

/**
 * 宿主端口 `subscribe` 的函数形状（ADR-0104 §2.2）：资源端口、来源目录端口与本包的 helper 共用。
 * `Request` 是端口自己的请求类型（`ScreenHostResourceRequest` 等）。
 */
export type HostKitSubscribe<Request> = (
  request: Request,
  sink: ScreenSourcePushSink,
  options: ScreenHostSubscribeOptions,
) => ScreenParseResult<null>;

export interface SubscriptionHubOptions<Request> {
  /**
   * 物理连接的复用键：同键的逻辑订阅共享一条上游连接。应只由资源身份与参数派生，
   * 不得混入会话或凭证（ADR-0104 §2.1）。
   */
  readonly keyOf: (request: Request) => string;
  /** 打开一条上游连接；签名与端口 `subscribe` 相同，可直接传 `createSseSubscribe(...)` 的结果。 */
  readonly open: HostKitSubscribe<Request>;
  /** 最后一个订阅者离开后延迟关闭的毫秒数；缺省 2000，0 表示立即关闭。 */
  readonly lingerMs?: number;
  /** 为迟到订阅者合成快照时最多保留的行数；缺省 1000。 */
  readonly replayRows?: number;
}

export interface HostKitSubscriptionHub<Request> {
  /** 可直接作为资源端口 / 来源目录端口的 `subscribe`。 */
  readonly subscribe: HostKitSubscribe<Request>;
  /** 当前打开的上游连接数（含 linger 中的）。 */
  channelCount(): number;
  /** 关闭全部上游连接；之后的订阅会重新打开。 */
  dispose(): void;
}

type Listener = { readonly sink: ScreenSourcePushSink };

type Channel = {
  readonly key: string;
  readonly controller: AbortController;
  readonly listeners: Set<Listener>;
  snapshot: { value: ScreenJsonValue; cursor: ScreenPushCursor | undefined } | undefined;
  invalidated: boolean;
  status: ScreenSourceConnectionStatus | undefined;
  lingerTimer: ReturnType<typeof setTimeout> | undefined;
  closed: boolean;
};

const DEFAULT_LINGER_MS = 2_000;
const DEFAULT_REPLAY_ROWS = 1_000;

/**
 * 订阅中心（ADR-0104 §2.9）：按资源键做引用计数，把多个逻辑订阅复用到一条上游连接。
 *
 * - 上游事件扇出给同键的全部订阅者；单个 sink 抛错不影响其它订阅者。
 * - 迟到的订阅者先收到当前连接状态，再收到合成快照：最近一次 `snapshot` 加上其后的
 *   `append` 行（按 `replayRows` 从头部裁剪），游标取最新值。这样「每次订阅后首个数据事件
 *   必须是 snapshot」的契约对每个订阅者都成立。上游 `invalidate` 之后到下一次快照之前，
 *   迟到者会在快照后紧跟一条 `invalidate`。
 * - 最后一个订阅者离开后等 `lingerMs` 再关闭上游，期间重新订阅直接复用。
 * - 上游报 `failed` 时立即关闭该连接并清空缓存，之后的订阅重新打开。
 * - 上游连接用第一个订阅者的请求与选项打开（含 `retain` 提示）；同键订阅者的提示应一致。
 */
export function createSubscriptionHub<Request>(
  options: SubscriptionHubOptions<Request>,
): HostKitSubscriptionHub<Request> {
  const lingerMs = Math.max(0, options.lingerMs ?? DEFAULT_LINGER_MS);
  const replayRows = Math.max(1, Math.floor(options.replayRows ?? DEFAULT_REPLAY_ROWS));
  const channels = new Map<string, Channel>();

  const close = (channel: Channel): void => {
    if (channel.closed) return;
    channel.closed = true;
    if (channel.lingerTimer !== undefined) clearTimeout(channel.lingerTimer);
    channel.lingerTimer = undefined;
    channel.listeners.clear();
    if (channels.get(channel.key) === channel) channels.delete(channel.key);
    channel.controller.abort();
  };

  const fanout = (channel: Channel, event: ScreenSourcePushEvent): void => {
    if (channel.closed || event === null || typeof event !== 'object') return;
    remember(channel, event, replayRows);
    for (const listener of [...channel.listeners]) deliver(listener.sink, event);
    if (event.type === 'status' && event.status === 'failed') close(channel);
  };

  const release = (channel: Channel, listener: Listener): void => {
    if (!channel.listeners.delete(listener)) return;
    if (channel.listeners.size > 0 || channel.closed) return;
    if (lingerMs === 0) {
      close(channel);
      return;
    }
    channel.lingerTimer = setTimeout(() => {
      channel.lingerTimer = undefined;
      if (channel.listeners.size === 0) close(channel);
    }, lingerMs);
  };

  const subscribe: HostKitSubscribe<Request> = (request, sink, subscribeOptions) => {
    if (subscribeOptions.signal.aborted) return subscribeOk();
    let key: string;
    try {
      key = options.keyOf(request);
    } catch {
      return subscribeFailure('HOST_RESOURCE_INVALID', 'Subscription key could not be derived.');
    }
    const listener: Listener = { sink };
    const existing = channels.get(key);
    if (existing !== undefined && !existing.closed) {
      if (existing.lingerTimer !== undefined) clearTimeout(existing.lingerTimer);
      existing.lingerTimer = undefined;
      existing.listeners.add(listener);
      replay(existing, sink);
    } else {
      const channel: Channel = {
        key,
        controller: new AbortController(),
        listeners: new Set([listener]),
        snapshot: undefined,
        invalidated: false,
        status: undefined,
        lingerTimer: undefined,
        closed: false,
      };
      channels.set(key, channel);
      let opened: ScreenParseResult<null>;
      try {
        opened = options.open(
          request,
          { push: (event) => fanout(channel, event) },
          {
            ...subscribeOptions,
            signal: channel.controller.signal,
          },
        );
      } catch {
        opened = subscribeFailure(
          'HOST_RESOURCE_UNAVAILABLE',
          'Upstream subscription could not be opened.',
        );
      }
      if (!opened.ok) {
        close(channel);
        return opened;
      }
      if (channel.closed) return subscribeOk(); // 上游在 open 内同步报了 failed，已扇出给本订阅者
    }
    subscribeOptions.signal.addEventListener(
      'abort',
      () => {
        const channel = channels.get(key);
        if (channel !== undefined && channel.listeners.has(listener)) release(channel, listener);
      },
      { once: true },
    );
    return subscribeOk();
  };

  return {
    subscribe,
    channelCount: () => channels.size,
    dispose: () => {
      for (const channel of [...channels.values()]) close(channel);
    },
  };
}

function remember(channel: Channel, event: ScreenSourcePushEvent, replayRows: number): void {
  switch (event.type) {
    case 'snapshot':
      channel.snapshot = { value: event.value, cursor: event.cursor };
      channel.invalidated = false;
      return;
    case 'append': {
      const snapshot = channel.snapshot;
      if (snapshot === undefined || !Array.isArray(event.rows)) return;
      const rows = tabularRows(snapshot.value);
      if (rows === undefined) return;
      const merged = [...rows, ...event.rows];
      const kept = merged.length > replayRows ? merged.slice(merged.length - replayRows) : merged;
      channel.snapshot = {
        value: { ...(snapshot.value as Record<string, ScreenJsonValue>), rows: kept },
        cursor: event.cursor ?? snapshot.cursor,
      };
      return;
    }
    case 'invalidate':
      channel.invalidated = true;
      return;
    case 'status':
      channel.status = event.status;
      return;
    default:
      return;
  }
}

function replay(channel: Channel, sink: ScreenSourcePushSink): void {
  if (channel.status !== undefined) deliver(sink, { type: 'status', status: channel.status });
  const snapshot = channel.snapshot;
  if (snapshot === undefined) return;
  deliver(sink, {
    type: 'snapshot',
    value: snapshot.value,
    ...(snapshot.cursor === undefined ? {} : { cursor: snapshot.cursor }),
  });
  if (channel.invalidated) deliver(sink, { type: 'invalidate' });
}

function tabularRows(value: ScreenJsonValue): readonly ScreenJsonValue[] | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const rows = (value as { readonly rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as readonly ScreenJsonValue[]) : undefined;
}

function deliver(sink: ScreenSourcePushSink, event: ScreenSourcePushEvent): void {
  try {
    sink.push(event);
  } catch {
    // 单个订阅者的异常不影响其它订阅者与上游。
  }
}

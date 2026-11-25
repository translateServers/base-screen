import type {
  ScreenJsonValue,
  ScreenParseResult,
  ScreenPushCursor,
  ScreenSourceConnectionStatus,
  ScreenSourcePushEvent,
} from '@base-screen/contracts';
import { subscribeFailure, subscribeOk } from './push-result.js';
import type { HostKitSubscribe } from './subscription-hub.js';

/** 一条 SSE 消息：`data` 已尝试按 JSON 解析，失败时保留原始字符串。 */
export interface HostKitSseMessage {
  /** 事件名：未命名事件为 `message`。 */
  readonly event: string;
  readonly data: unknown;
  readonly lastEventId: string;
}

/** 快照拉取的结果：值与可选游标。 */
export interface HostKitPushSnapshot {
  readonly value: ScreenJsonValue;
  readonly cursor?: ScreenPushCursor;
}

/** 浏览器 `EventSource` 的最小结构子集（便于测试与非浏览器环境注入）。 */
export interface HostKitEventSource {
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: { readonly data?: unknown; readonly lastEventId?: string }) => void,
  ): void;
  close(): void;
}

export type HostKitEventSourceConstructor = new (
  url: string,
  init?: { readonly withCredentials?: boolean },
) => HostKitEventSource;

export interface SseSubscribeOptions<Request> {
  /** 订阅地址；返回 `undefined` 表示该请求不允许订阅（同步返回 `HOST_RESOURCE_ACCESS_DENIED`）。 */
  readonly url: (request: Request) => string | undefined;
  /**
   * 把一条 SSE 消息映射为零到多个推送事件；返回 `undefined` 表示忽略。
   * 缺省：消息体本身就是 `ScreenSourcePushEvent`；命名事件且消息体没有 `type` 时，以事件名补齐。
   */
  readonly mapEvent?: (
    message: HostKitSseMessage,
    request: Request,
  ) => ScreenSourcePushEvent | readonly ScreenSourcePushEvent[] | undefined;
  /** 除 `message` 外额外监听的命名事件；缺省监听五类推送事件名。 */
  readonly events?: readonly string[];
  /**
   * 流本身不发快照时提供：每次连接（含重连）打开后调用一次。拉取期间到达的增量先暂存，
   * 快照发出后按游标丢掉已包含在快照里的部分，再转发其余（先挂监听，再取快照）。
   */
  readonly fetchSnapshot?: (
    request: Request,
    signal: AbortSignal,
  ) => Promise<ScreenParseResult<HostKitPushSnapshot>>;
  /** 从 `Last-Event-ID`（`<epoch>:<revision>`）补齐缺失的游标；缺省 true。 */
  readonly cursorFromEventId?: boolean;
  /** 持续重连超过该时长报 `suspended`；缺省 30000 ms。 */
  readonly suspendAfterMs?: number;
  readonly withCredentials?: boolean;
  /** 缺省使用全局 `EventSource`。 */
  readonly EventSource?: HostKitEventSourceConstructor;
}

const PUSH_EVENT_TYPES: ReadonlySet<string> = new Set([
  'snapshot',
  'append',
  'invalidate',
  'status',
  'heartbeat',
]);
const DEFAULT_EVENTS: readonly string[] = [...PUSH_EVENT_TYPES];
const EVENT_SOURCE_CLOSED = 2;
const MAX_BUFFERED_EVENTS = 1_000;
const EVENT_ID_CURSOR = /^(.+):(\d+)$/;

/**
 * 基于浏览器原生 `EventSource` 的订阅 helper（ADR-0104 §2.9）。重连交给浏览器内建机制，
 * 这里不自写重试；只负责把 SSE 消息映射为推送事件、维护连接状态、按契约衔接快照与增量。
 *
 * 连接状态：打开 ⇒ `open`；出错但仍在重连 ⇒ `reconnecting`，持续超过 `suspendAfterMs`
 * ⇒ `suspended`；浏览器放弃重连（服务端返回 204 或非 `text/event-stream`）⇒ `failed`，并关闭。
 * `signal` abort 即关闭连接、丢弃在途快照请求。
 */
export function createSseSubscribe<Request>(
  options: SseSubscribeOptions<Request>,
): HostKitSubscribe<Request> {
  const suspendAfterMs = Math.max(0, options.suspendAfterMs ?? 30_000);
  const cursorFromEventId = options.cursorFromEventId ?? true;
  const events = options.events ?? DEFAULT_EVENTS;
  return (request, sink, subscribeOptions) => {
    let url: string | undefined;
    try {
      url = options.url(request);
    } catch {
      url = undefined;
    }
    if (url === undefined) {
      return subscribeFailure(
        'HOST_RESOURCE_ACCESS_DENIED',
        'Subscription is not allowed for this request.',
      );
    }
    const EventSourceImpl =
      options.EventSource ??
      (globalThis as { EventSource?: HostKitEventSourceConstructor }).EventSource;
    if (EventSourceImpl === undefined) {
      return subscribeFailure('HOST_RESOURCE_UNAVAILABLE', 'EventSource is not available.');
    }
    if (subscribeOptions.signal.aborted) return subscribeOk();

    let closed = false;
    let buffering = false;
    let buffer: ScreenSourcePushEvent[] = [];
    let snapshotRequest: AbortController | undefined;
    let suspendTimer: ReturnType<typeof setTimeout> | undefined;
    let status: ScreenSourceConnectionStatus | undefined;
    let source: HostKitEventSource;

    const emit = (event: ScreenSourcePushEvent): void => {
      if (closed) return;
      try {
        sink.push(event);
      } catch {
        // sink 异常不影响连接。
      }
    };
    const setStatus = (next: ScreenSourceConnectionStatus): void => {
      if (next === status) return;
      status = next;
      emit({ type: 'status', status: next });
    };
    const close = (): void => {
      if (closed) return;
      closed = true;
      if (suspendTimer !== undefined) clearTimeout(suspendTimer);
      suspendTimer = undefined;
      snapshotRequest?.abort();
      snapshotRequest = undefined;
      buffer = [];
      source.close();
    };
    const fail = (message: string): void => {
      if (closed) return;
      status = 'failed';
      emit({
        type: 'status',
        status: 'failed',
        diagnostic: { severity: 'error', code: 'HOST_RESOURCE_UNAVAILABLE', path: [], message },
      });
      close();
    };
    const flush = (cursor: ScreenPushCursor | undefined): void => {
      const pending = buffer;
      buffer = [];
      for (const event of pending) {
        if (
          event.type === 'append' &&
          cursor !== undefined &&
          event.cursor !== undefined &&
          event.cursor.epoch === cursor.epoch &&
          event.cursor.revision <= cursor.revision
        ) {
          continue; // 已包含在快照里
        }
        emit(event);
      }
    };
    const deliver = (event: ScreenSourcePushEvent): void => {
      if (!buffering) {
        emit(event);
        return;
      }
      if (event.type === 'snapshot') {
        // 流自己发了快照：它就是新基准，在途的快照拉取作废。
        buffering = false;
        snapshotRequest?.abort();
        snapshotRequest = undefined;
        emit(event);
        flush(event.cursor);
        return;
      }
      if (event.type === 'status' || event.type === 'heartbeat') {
        emit(event);
        return;
      }
      buffer.push(event);
      if (buffer.length > MAX_BUFFERED_EVENTS) buffer.shift();
    };
    const beginSnapshot = (): void => {
      const fetchSnapshot = options.fetchSnapshot;
      if (fetchSnapshot === undefined) return;
      snapshotRequest?.abort();
      const controller = new AbortController();
      snapshotRequest = controller;
      buffering = true;
      buffer = [];
      const settle = (result: ScreenParseResult<HostKitPushSnapshot> | undefined): void => {
        if (closed || snapshotRequest !== controller || !buffering) return;
        snapshotRequest = undefined;
        if (result === undefined || !result.ok) {
          fail('Snapshot request failed.');
          return;
        }
        buffering = false;
        const { value, cursor } = result.value;
        emit({ type: 'snapshot', value, ...(cursor === undefined ? {} : { cursor }) });
        flush(cursor);
      };
      fetchSnapshot(request, controller.signal).then(settle, () => settle(undefined));
    };
    const onMessage = (
      name: string,
      message: { readonly data?: unknown; readonly lastEventId?: string },
    ): void => {
      if (closed) return;
      const lastEventId = typeof message.lastEventId === 'string' ? message.lastEventId : '';
      const parsed: HostKitSseMessage = {
        event: name,
        data: parseData(message.data),
        lastEventId,
      };
      let mapped: ScreenSourcePushEvent | readonly ScreenSourcePushEvent[] | undefined;
      try {
        mapped = (options.mapEvent ?? defaultMapEvent)(parsed, request);
      } catch {
        mapped = undefined;
      }
      if (mapped === undefined) return;
      const list = Array.isArray(mapped) ? mapped : [mapped as ScreenSourcePushEvent];
      for (const event of list) {
        deliver(cursorFromEventId ? withEventIdCursor(event, lastEventId) : event);
      }
    };

    try {
      source = new EventSourceImpl(
        url,
        options.withCredentials === undefined
          ? undefined
          : { withCredentials: options.withCredentials },
      );
    } catch {
      return subscribeFailure(
        'HOST_RESOURCE_UNAVAILABLE',
        'Subscription stream could not be opened.',
      );
    }
    source.addEventListener('open', () => {
      if (closed) return;
      if (suspendTimer !== undefined) clearTimeout(suspendTimer);
      suspendTimer = undefined;
      setStatus('open');
      // 每次（重新）打开都重新取快照：重连期间可能漏了事件，补不齐就以快照为准。
      beginSnapshot();
    });
    source.addEventListener('error', () => {
      if (closed) return;
      if (source.readyState === EVENT_SOURCE_CLOSED) {
        fail('Subscription stream was closed by the server.');
        return;
      }
      if (status !== 'suspended') setStatus('reconnecting');
      if (suspendTimer === undefined && status !== 'suspended') {
        suspendTimer = setTimeout(() => {
          suspendTimer = undefined;
          if (!closed && status === 'reconnecting') setStatus('suspended');
        }, suspendAfterMs);
      }
    });
    for (const name of new Set(['message', ...events])) {
      source.addEventListener(name, (message) => onMessage(name, message));
    }
    subscribeOptions.signal.addEventListener('abort', close, { once: true });
    return subscribeOk();
  };
}

function parseData(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

/** 缺省映射：消息体就是推送事件；命名事件且没有 `type` 时以事件名补齐。 */
function defaultMapEvent(message: HostKitSseMessage): ScreenSourcePushEvent | undefined {
  const data = message.data;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    // 不带消息体的命名事件只对无载荷的两类有意义。
    if (message.event === 'heartbeat') return { type: 'heartbeat' };
    if (message.event === 'invalidate') return { type: 'invalidate' };
    return undefined;
  }
  const record = data as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : message.event;
  if (!PUSH_EVENT_TYPES.has(type)) return undefined;
  return { ...record, type } as unknown as ScreenSourcePushEvent;
}

function withEventIdCursor(
  event: ScreenSourcePushEvent,
  lastEventId: string,
): ScreenSourcePushEvent {
  if ((event.type !== 'snapshot' && event.type !== 'append') || event.cursor !== undefined) {
    return event;
  }
  const match = EVENT_ID_CURSOR.exec(lastEventId);
  if (match === null) return event;
  const revision = Number(match[2]);
  if (!Number.isSafeInteger(revision)) return event;
  return { ...event, cursor: { epoch: match[1] as string, revision } };
}

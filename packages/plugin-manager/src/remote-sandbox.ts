import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const MAX_MESSAGE_BYTES = 64 * 1024;

export interface CreateBaseScreenRemotePluginSandboxOptions {
  readonly target: HTMLElement;
  readonly entryUrl: string;
  readonly expectedOrigin: string;
  readonly timeoutMs?: number;
  readonly onEvent:
    | ((event: { readonly name: string; readonly payload: ScreenJsonValue }) => void)
    | undefined;
}

export interface BaseScreenRemotePluginSandbox {
  readonly element: HTMLIFrameElement | undefined;
  readonly status: 'loading' | 'ready' | 'failed' | 'disposed';
  ready(): Promise<ScreenParseResult<null>>;
  dispose(): void;
}

export function createBaseScreenRemotePluginSandbox(
  options: CreateBaseScreenRemotePluginSandboxOptions,
): BaseScreenRemotePluginSandbox {
  const preflight = preflightSandbox(options);
  return preflight.ok
    ? new RemotePluginSandbox(options, preflight.value)
    : new FailedRemotePluginSandbox(preflight);
}

class RemotePluginSandbox implements BaseScreenRemotePluginSandbox {
  readonly element: HTMLIFrameElement;
  #status: BaseScreenRemotePluginSandbox['status'] = 'loading';
  #ready: Promise<ScreenParseResult<null>>;
  #resolveReady: ((result: ScreenParseResult<null>) => void) | undefined;
  #readySettleTimer: ReturnType<typeof setTimeout> | undefined;
  #timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly options: CreateBaseScreenRemotePluginSandboxOptions,
    preflight: { readonly entryUrl: string; readonly timeoutMs: number },
  ) {
    this.element = options.target.ownerDocument.createElement('iframe');
    this.#ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });

    this.element.sandbox.add('allow-scripts', 'allow-same-origin');
    this.element.referrerPolicy = 'no-referrer';
    this.element.src = preflight.entryUrl;
    this.element.addEventListener('load', this.handleLoad);
    this.element.addEventListener('error', this.handleLoadError);
    this.#timeout = setTimeout(
      () => this.finish(failure('REMOTE_PLUGIN_TIMEOUT', 'Remote plugin timed out.')),
      preflight.timeoutMs,
    );
    options.target.appendChild(this.element);
    options.target.ownerDocument.defaultView?.addEventListener('message', this.handleMessage);
  }

  get status(): BaseScreenRemotePluginSandbox['status'] {
    return this.#status;
  }

  ready(): Promise<ScreenParseResult<null>> {
    return this.#ready;
  }

  dispose(): void {
    if (this.#status === 'disposed') {
      return;
    }
    this.#status = 'disposed';
    this.cleanup();
    this.element.remove();
    this.finish(failure('REMOTE_PLUGIN_DISPOSED', 'Remote plugin sandbox was disposed.'));
  }

  private readonly handleLoad = (): void => {
    if (this.#status !== 'loading') {
      return;
    }
    this.element.contentWindow?.postMessage(
      { type: 'base-screen-init' },
      this.options.expectedOrigin,
    );
  };

  private readonly handleLoadError = (): void => {
    this.finish(failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin could not load.'));
  };

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (this.#status === 'disposed' || event.source !== this.element.contentWindow) {
      return;
    }
    if (event.origin !== this.options.expectedOrigin) {
      this.finish(failure('REMOTE_PLUGIN_ORIGIN_INVALID', 'Remote plugin origin is invalid.'));
      return;
    }
    const parsed = parseMessage(event.data);
    if (!parsed.ok) {
      this.finish(parsed);
      return;
    }
    if (parsed.value.type === 'ready') {
      if (this.#status !== 'loading') {
        this.finish(
          failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.'),
        );
        return;
      }
      this.#status = 'ready';
      // Permit a bootstrap that emits ready twice in one turn to fail the pending handshake.
      this.#readySettleTimer = setTimeout(() => {
        this.#readySettleTimer = undefined;
        this.finish({ ok: true, value: null, diagnostics: [] });
      }, 0);
      return;
    }
    if (this.#status !== 'ready') {
      this.finish(
        failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.'),
      );
      return;
    }
    this.options.onEvent?.({ name: parsed.value.name, payload: parsed.value.payload });
  };

  private finish(result: ScreenParseResult<null>): void {
    if (result.ok) {
      this.#status = 'ready';
    } else if (this.#status !== 'disposed') {
      this.#status = 'failed';
    }
    if (!result.ok) {
      this.cleanup();
    } else if (this.#timeout !== undefined) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
    const resolveReady = this.#resolveReady;
    if (resolveReady === undefined) {
      return;
    }
    resolveReady(result);
    this.#resolveReady = undefined;
  }

  private cleanup(): void {
    this.element.removeEventListener('load', this.handleLoad);
    this.element.removeEventListener('error', this.handleLoadError);
    this.options.target.ownerDocument.defaultView?.removeEventListener(
      'message',
      this.handleMessage,
    );
    if (this.#timeout !== undefined) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
    if (this.#readySettleTimer !== undefined) {
      clearTimeout(this.#readySettleTimer);
      this.#readySettleTimer = undefined;
    }
  }
}

class FailedRemotePluginSandbox implements BaseScreenRemotePluginSandbox {
  readonly element = undefined;
  #status: BaseScreenRemotePluginSandbox['status'] = 'failed';

  constructor(private readonly result: ScreenParseResult<null>) {}

  get status(): BaseScreenRemotePluginSandbox['status'] {
    return this.#status;
  }

  ready(): Promise<ScreenParseResult<null>> {
    return Promise.resolve(this.result);
  }

  dispose(): void {
    this.#status = 'disposed';
  }
}

function preflightSandbox(
  options: CreateBaseScreenRemotePluginSandboxOptions,
): ScreenParseResult<{ readonly entryUrl: string; readonly timeoutMs: number }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    return failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin timeout is invalid.');
  }
  try {
    const entry = new URL(options.entryUrl);
    const expected = new URL(options.expectedOrigin);
    const hostOrigin = options.target.ownerDocument.location.origin;
    if (
      expected.origin !== options.expectedOrigin ||
      entry.origin !== expected.origin ||
      entry.origin === hostOrigin
    ) {
      return failure('REMOTE_PLUGIN_ORIGIN_INVALID', 'Remote plugin origin is invalid.');
    }
    return { ok: true, value: { entryUrl: entry.href, timeoutMs }, diagnostics: [] };
  } catch {
    return failure('REMOTE_PLUGIN_ORIGIN_INVALID', 'Remote plugin origin is invalid.');
  }
}

type RemoteMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'emit-event'; readonly name: string; readonly payload: ScreenJsonValue };

function parseMessage(input: unknown): ScreenParseResult<RemoteMessage> {
  const parsed = parseScreenJsonValue(input, { maxBytes: MAX_MESSAGE_BYTES });
  if (
    !parsed.ok ||
    parsed.value === null ||
    Array.isArray(parsed.value) ||
    typeof parsed.value !== 'object'
  ) {
    return failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.');
  }
  const message = parsed.value as Record<string, ScreenJsonValue>;
  if (typeof message.type !== 'string') {
    return failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.');
  }
  if (message.type === 'ready' && hasExactKeys(message, ['type'])) {
    return { ok: true, value: { type: 'ready' }, diagnostics: [] };
  }
  if (
    message.type === 'emit-event' &&
    hasExactKeys(message, ['type', 'name', 'payload']) &&
    isIdentifier(message.name) &&
    Object.hasOwn(message, 'payload')
  ) {
    return {
      ok: true,
      value: {
        type: 'emit-event',
        name: message.name,
        payload: message.payload!,
      },
      diagnostics: [],
    };
  }
  return failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.');
}

function hasExactKeys(value: Record<string, ScreenJsonValue>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
}

function failure<T>(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

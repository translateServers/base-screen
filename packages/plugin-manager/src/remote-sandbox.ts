import {
  parseScreenJsonValue,
  type ScreenDiagnostic,
  type ScreenParseResult,
} from '@base-screen/contracts';

export interface CreateBaseScreenRemotePluginSandboxOptions {
  readonly target: HTMLElement;
  readonly moduleUrl: string;
  readonly expectedOrigin: string;
  readonly timeoutMs: number;
  readonly onEvent:
    | ((event: { readonly name: string; readonly payload: unknown }) => void)
    | undefined;
}

export interface BaseScreenRemotePluginSandbox {
  readonly element: HTMLIFrameElement;
  readonly status: 'loading' | 'ready' | 'failed' | 'disposed';
  ready(): Promise<ScreenParseResult<null>>;
  dispose(): void;
}

export function createBaseScreenRemotePluginSandbox(
  options: CreateBaseScreenRemotePluginSandboxOptions,
): BaseScreenRemotePluginSandbox {
  return new RemotePluginSandbox(options);
}

class RemotePluginSandbox implements BaseScreenRemotePluginSandbox {
  readonly element: HTMLIFrameElement;
  #status: BaseScreenRemotePluginSandbox['status'] = 'loading';
  #ready: Promise<ScreenParseResult<null>>;
  #resolveReady: ((result: ScreenParseResult<null>) => void) | undefined;
  #timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: CreateBaseScreenRemotePluginSandboxOptions) {
    this.element = options.target.ownerDocument.createElement('iframe');
    this.element.sandbox.add('allow-scripts');
    this.element.src = options.moduleUrl;
    this.element.addEventListener('load', this.handleLoad);
    this.#ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
    this.#timeout = setTimeout(
      () => this.finish(failure('REMOTE_PLUGIN_TIMEOUT', 'Remote plugin timed out.')),
      options.timeoutMs,
    );
    options.target.appendChild(this.element);
    globalThis.addEventListener('message', this.handleMessage);
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
    this.element.removeEventListener('load', this.handleLoad);
    globalThis.removeEventListener('message', this.handleMessage);
    this.element.remove();
    this.finish(failure('REMOTE_PLUGIN_DISPOSED', 'Remote plugin sandbox was disposed.'));
  }

  private readonly handleLoad = (): void => {
    this.element.contentWindow?.postMessage(
      { protocolVersion: 1, type: 'base-screen-init' },
      this.options.expectedOrigin,
    );
  };

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (this.#status === 'disposed' || event.source !== this.element.contentWindow) {
      return;
    }
    if (event.origin !== this.options.expectedOrigin) {
      this.finish(failure('REMOTE_PLUGIN_ORIGIN_INVALID', 'Remote plugin origin is invalid.'));
      return;
    }
    const parsed = parseScreenJsonValue(event.data, { maxBytes: 64 * 1024 });
    if (
      !parsed.ok ||
      parsed.value === null ||
      Array.isArray(parsed.value) ||
      typeof parsed.value !== 'object'
    ) {
      this.finish(
        failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.'),
      );
      return;
    }
    const message = parsed.value as Record<string, unknown>;
    if (message.protocolVersion !== 1 || typeof message.type !== 'string') {
      this.finish(
        failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.'),
      );
      return;
    }
    if (message.type === 'ready') {
      this.finish({ ok: true, value: null, diagnostics: [] });
    } else if (
      message.type === 'emit-event' &&
      isIdentifier(message.name) &&
      Object.hasOwn(message, 'payload')
    ) {
      this.options.onEvent?.({ name: message.name, payload: message.payload });
    } else {
      this.finish(
        failure('REMOTE_PLUGIN_PROTOCOL_INVALID', 'Remote plugin protocol message is invalid.'),
      );
    }
  };

  private finish(result: ScreenParseResult<null>): void {
    if (this.#resolveReady === undefined) {
      return;
    }
    if (result.ok) {
      this.#status = 'ready';
    } else if (this.#status !== 'disposed') {
      this.#status = 'failed';
    }
    if (this.#timeout !== undefined) {
      clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
    this.#resolveReady(result);
    this.#resolveReady = undefined;
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
}

function failure(code: ScreenDiagnostic['code'], message: string): ScreenParseResult<null> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

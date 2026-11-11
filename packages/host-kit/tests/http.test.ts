import { describe, expect, it } from 'vitest';
import { createHostKitHttp, toAbortSignal, toHostKitSearch } from '../src/index.js';

interface MockReply {
  readonly ok: boolean;
  readonly status: number;
  readonly body?: unknown;
}

function fetchReturning(reply: MockReply): typeof fetch {
  return (async () =>
    ({
      ok: reply.ok,
      status: reply.status,
      json: async () => {
        if (reply.body === undefined) throw new Error('no body');
        return reply.body;
      },
    }) as Response) as typeof fetch;
}

describe('createHostKitHttp', () => {
  it('parses a successful JSON body', async () => {
    const http = createHostKitHttp({
      baseUrl: 'http://x/api/',
      fetch: fetchReturning({ ok: true, status: 200, body: { hello: 1 } }),
    });
    const result = await http.request<{ hello: number }>('/screens');
    expect(result).toEqual({ ok: true, data: { hello: 1 } });
  });

  it('maps the unified error body to code/message/status', async () => {
    const http = createHostKitHttp({
      baseUrl: 'http://x/api',
      fetch: fetchReturning({
        ok: false,
        status: 409,
        body: { error: 'REVISION_CONFLICT', message: 'conflict' },
      }),
    });
    const result = await http.request('/screens/1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: 'REVISION_CONFLICT', message: 'conflict', status: 409 });
    }
  });

  it('falls back to HTTP_<status> when the error body is not shaped', async () => {
    const http = createHostKitHttp({
      baseUrl: 'http://x/api',
      fetch: fetchReturning({ ok: false, status: 500 }),
    });
    const result = await http.request('/screens');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('HTTP_500');
  });

  it('normalizes abort to ABORTED with status 0', async () => {
    const http = createHostKitHttp({
      baseUrl: 'http://x/api',
      fetch: (async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as typeof fetch,
    });
    const result = await http.request('/screens');
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toEqual({ code: 'ABORTED', message: '请求已取消。', status: 0 });
  });

  it('normalizes network failure to NETWORK with status 0', async () => {
    const http = createHostKitHttp({
      baseUrl: 'http://x/api',
      fetch: (async () => {
        throw new Error('boom');
      }) as typeof fetch,
    });
    const result = await http.request('/screens');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NETWORK');
  });
});

describe('toHostKitSearch', () => {
  it('drops undefined and empty values', () => {
    expect(toHostKitSearch({ a: '1', b: undefined, c: '', d: 2 })).toBe('?a=1&d=2');
    expect(toHostKitSearch({ a: undefined })).toBe('');
  });
});

describe('toAbortSignal', () => {
  it('returns undefined for undefined input', () => {
    expect(toAbortSignal(undefined)).toBeUndefined();
  });

  it('bridges an already-aborted source', () => {
    const controller = new AbortController();
    controller.abort();
    expect(toAbortSignal(controller.signal)?.aborted).toBe(true);
  });

  it('propagates a later abort', () => {
    const controller = new AbortController();
    const bridged = toAbortSignal(controller.signal);
    expect(bridged?.aborted).toBe(false);
    controller.abort();
    expect(bridged?.aborted).toBe(true);
  });
});

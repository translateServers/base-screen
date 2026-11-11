import { describe, expect, it } from 'vitest';
import { createHttpProjectAdapter } from '../src/index.js';

const DOCUMENT = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { relations: [] },
};

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body?: unknown;
}

function routingFetch(handler: (call: Call) => { ok: boolean; status: number; body?: unknown }): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: Call = { url, method, ...(body === undefined ? {} : { body }) };
    calls.push(call);
    const reply = handler(call);
    return {
      ok: reply.ok,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  };
  return { fetch: fetchImpl, calls };
}

const SCREEN = { id: 'p1', name: '演示', revision: 3, document: DOCUMENT };

describe('createHttpProjectAdapter', () => {
  it('loads, migrates and builds an envelope', async () => {
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: { screen: SCREEN } }));
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api', fetch });
    const result = await adapter.load({ projectId: 'p1', signal: new AbortController().signal });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        projectId: 'p1',
        revision: '3',
        name: '演示',
        description: null,
        metadata: {},
      });
    }
  });

  it('maps load failure to PROJECT_UNAVAILABLE', async () => {
    const { fetch } = routingFetch(() => ({
      ok: false,
      status: 404,
      body: { error: 'NOT_FOUND', message: 'missing' },
    }));
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api', fetch });
    const result = await adapter.load({ projectId: 'p1', signal: new AbortController().signal });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }] });
  });

  it('rejects the whole load when migration fails', async () => {
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: { screen: SCREEN } }));
    const adapter = createHttpProjectAdapter({
      baseUrl: 'http://x/api',
      fetch,
      migrate: () => ({
        ok: false,
        document: undefined,
        decisions: [],
        diagnostics: [{ severity: 'error', code: 'PROJECT_UNAVAILABLE', path: [], message: 'bad' }],
      }),
    });
    const result = await adapter.load({ projectId: 'p1', signal: new AbortController().signal });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }] });
  });

  it('saves with numeric revision and maps conflict to PROJECT_CONFLICT', async () => {
    const { fetch, calls } = routingFetch(() => ({
      ok: false,
      status: 409,
      body: { error: 'REVISION_CONFLICT', message: 'stale' },
    }));
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api', fetch });
    const result = await adapter.save({
      projectId: 'p1',
      revision: '3',
      document: DOCUMENT as never,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'PROJECT_CONFLICT', path: ['revision'] }],
    });
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.body).toMatchObject({ revision: 3 });
  });

  it('returns the updated envelope on successful save', async () => {
    const { fetch } = routingFetch(() => ({
      ok: true,
      status: 200,
      body: { screen: { ...SCREEN, revision: 4 } },
    }));
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api', fetch });
    const result = await adapter.save({
      projectId: 'p1',
      revision: '3',
      document: DOCUMENT as never,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.revision).toBe('4');
  });

  it('declares publish unsupported', () => {
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api' });
    expect(adapter.capabilities).toEqual({ publish: false });
  });
});

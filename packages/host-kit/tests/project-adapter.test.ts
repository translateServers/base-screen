import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createHostProjectAdapter,
  createHttpProjectAdapter,
  type HostKitOperationResult,
} from '../src/index.js';

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

describe('createHostProjectAdapter', () => {
  const envelope = {
    projectId: 'p1',
    revision: 'etag:abc/+',
    name: '业务项目',
    description: null,
    metadata: {},
    document: DOCUMENT,
  };
  const ok = <T>(data: T): HostKitOperationResult<T> => ({ ok: true, data });

  it('复用业务函数并保留 opaque revision，读取仍迁移并校验', async () => {
    const migrated = vi.fn((input: unknown) => {
      const parsed = parseScreenDocument(input);
      return parsed.ok
        ? { ok: true as const, document: parsed.value, decisions: [], diagnostics: [] }
        : {
            ok: false as const,
            document: undefined,
            decisions: [],
            diagnostics: parsed.diagnostics,
          };
    });
    const adapter = createHostProjectAdapter({
      migrate: migrated,
      load: {
        execute: async (_request, signal) => {
          expect(signal).toBeInstanceOf(AbortSignal);
          return ok({ saved: envelope });
        },
        response: (payload) => payload.saved,
      },
      save: {
        execute: async (request) => {
          expect(request.revision).toBe('etag:abc/+');
          return ok(envelope);
        },
      },
    });
    const loaded = await adapter.load({ projectId: 'p1', signal: new AbortController().signal });
    expect(loaded).toMatchObject({ ok: true, value: envelope });
    expect(migrated).toHaveBeenCalledTimes(1);
    if (!loaded.ok) throw new Error('加载失败');
    expect(
      await adapter.save({ ...loaded.value, signal: new AbortController().signal }),
    ).toMatchObject({ ok: true, value: envelope });
    expect(migrated).toHaveBeenCalledTimes(1);
  });

  it('保存 observer 无法通过 request.document 修改调用者文档', async () => {
    const parsed = parseScreenDocument(DOCUMENT);
    if (!parsed.ok) throw new Error('文档无效');
    const observer = vi.fn();
    const adapter = createHostProjectAdapter({
      load: { execute: async () => ok(envelope) },
      save: { execute: async (request) => ok({ ...envelope, document: request.document }) },
      onSaveResult: (event) => {
        observer(event);
        expect('signal' in event.request).toBe(false);
        Object.assign(event.request.document.canvas, { width: 1 });
      },
    });
    const result = await adapter.save({
      projectId: 'p1',
      revision: 'opaque',
      document: parsed.value,
      signal: new AbortController().signal,
    });
    expect(observer).toHaveBeenCalledTimes(1);
    expect(parsed.value.canvas.width).toBe(1920);
    expect(result).toMatchObject({ ok: true, value: { document: { canvas: { width: 1920 } } } });
  });

  it('业务冲突错误与无效保存信封都经过统一处理', async () => {
    const parsed = parseScreenDocument(DOCUMENT);
    if (!parsed.ok) throw new Error('文档无效');
    for (const code of ['REVISION_CONFLICT', 'OTHER']) {
      const adapter = createHostProjectAdapter({
        load: { execute: async () => ok(envelope) },
        save: {
          execute: async () => ({ ok: false, error: { code, message: 'stale', status: 409 } }),
        },
      });
      expect(
        await adapter.save({
          projectId: 'p1',
          revision: 'opaque',
          document: parsed.value,
          signal: new AbortController().signal,
        }),
      ).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'PROJECT_CONFLICT', path: ['revision'] }],
      });
    }
    const invalid = createHostProjectAdapter({
      load: { execute: async () => ok(envelope) },
      save: { execute: async () => ok({ ...envelope, document: null }) },
    });
    expect(
      (
        await invalid.save({
          projectId: 'p1',
          revision: 'opaque',
          document: parsed.value,
          signal: new AbortController().signal,
        })
      ).ok,
    ).toBe(false);
  });

  it('取消桥接、异步失败与观察抛错都不泄漏异常', async () => {
    const controller = new AbortController();
    const observed = vi.fn();
    const adapter = createHostProjectAdapter({
      load: {
        execute: async (_request, signal) => {
          controller.abort();
          expect(signal.aborted).toBe(true);
          throw new DOMException('cancelled', 'AbortError');
        },
      },
      save: {
        execute: async () => {
          throw new Error('offline');
        },
      },
      onLoadResult: observed,
      onSaveResult: () => {
        throw new Error('日志错误');
      },
    });
    expect(await adapter.load({ projectId: 'p1', signal: controller.signal })).toEqual({
      ok: false,
      diagnostics: [],
    });
    expect(observed).not.toHaveBeenCalled();
    const parsed = parseScreenDocument(DOCUMENT);
    if (!parsed.ok) throw new Error('文档无效');
    expect(
      await adapter.save({
        projectId: 'p1',
        revision: 'opaque',
        document: parsed.value,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }] });
  });
});

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

  it('reuses custom backend requests and envelopes without coercing opaque revisions', async () => {
    const envelope = {
      projectId: 'p/1',
      revision: 'etag:abc/+',
      name: '已有项目',
      description: '说明',
      document: DOCUMENT,
      metadata: { owner: 'host' },
    };
    const { fetch, calls } = routingFetch(() => ({
      ok: true,
      status: 200,
      body: { result: envelope },
    }));
    const unwrap = (payload: unknown) => {
      if (payload === null || typeof payload !== 'object' || !('result' in payload)) {
        throw new Error('响应格式无效');
      }
      return payload.result;
    };
    const adapter = createHttpProjectAdapter({
      baseUrl: 'http://x/existing',
      fetch,
      mapping: {
        load: {
          request: ({ projectId }) => ({
            path: '/lookup',
            method: 'POST',
            body: { key: projectId },
          }),
          response: unwrap,
        },
        save: {
          request: ({ projectId, revision, document }) => ({
            path: `/project/${encodeURIComponent(projectId)}`,
            method: 'PATCH',
            body: { etag: revision, content: document },
          }),
          response: unwrap,
        },
      },
    });
    const loaded = await adapter.load({ projectId: 'p/1', signal: new AbortController().signal });
    expect(loaded).toMatchObject({ ok: true, value: envelope });
    const document = parseScreenDocument(DOCUMENT);
    if (!document.ok) throw new Error('测试文档无效');
    expect(
      await adapter.save({
        projectId: 'p/1',
        revision: 'etag:abc/+',
        document: document.value,
        signal: new AbortController().signal,
      }),
    ).toMatchObject({ ok: true, value: envelope });
    expect(calls).toEqual([
      { url: 'http://x/existing/lookup', method: 'POST', body: { key: 'p/1' } },
      {
        url: 'http://x/existing/project/p%2F1',
        method: 'PATCH',
        body: { etag: 'etag:abc/+', content: document.value },
      },
    ]);
  });

  it('validates default and mapped save envelopes instead of trusting HTTP JSON', async () => {
    const document = parseScreenDocument(DOCUMENT);
    if (!document.ok) throw new Error('测试文档无效');
    for (const body of [
      null,
      {},
      { screen: { ...SCREEN, revision: {} } },
      { screen: { ...SCREEN, document: null } },
    ]) {
      const { fetch } = routingFetch(() => ({ ok: true, status: 200, body }));
      const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api', fetch });
      expect(
        (await adapter.load({ projectId: 'p1', signal: new AbortController().signal })).ok,
      ).toBe(false);
      expect(
        (
          await adapter.save({
            projectId: 'p1',
            revision: '3',
            document: document.value,
            signal: new AbortController().signal,
          })
        ).ok,
      ).toBe(false);
    }
    const { fetch } = routingFetch(() => ({ ok: true, status: 200, body: {} }));
    const adapter = createHttpProjectAdapter({
      baseUrl: 'http://x/api',
      fetch,
      mapping: {
        load: {
          response: () => {
            throw new Error('无效 envelope');
          },
        },
        save: { response: () => ({ projectId: 'p1', revision: 3, document: DOCUMENT }) },
      },
    });
    expect((await adapter.load({ projectId: 'p1', signal: new AbortController().signal })).ok).toBe(
      false,
    );
    expect(
      (
        await adapter.save({
          projectId: 'p1',
          revision: '3',
          document: document.value,
          signal: new AbortController().signal,
        })
      ).ok,
    ).toBe(false);
  });

  it('bridges cancellation for custom project requests', async () => {
    const controller = new AbortController();
    const adapter = createHttpProjectAdapter({
      baseUrl: 'http://x/api',
      fetch: async (_input, init) => {
        expect(init?.signal?.aborted).toBe(false);
        controller.abort();
        expect(init?.signal?.aborted).toBe(true);
        throw new DOMException('aborted', 'AbortError');
      },
      mapping: { load: { request: () => ({ path: '/custom', method: 'POST' }) } },
    });
    expect(await adapter.load({ projectId: 'p1', signal: controller.signal })).toEqual({
      ok: false,
      diagnostics: [],
    });
  });

  it.each(['load', 'save'] as const)(
    '%s returns diagnostics for a throwing request mapper',
    async (operation) => {
      const { fetch, calls } = routingFetch(() => ({
        ok: true,
        status: 200,
        body: { screen: SCREEN },
      }));
      const project = parseScreenDocument(DOCUMENT);
      if (!project.ok) throw new Error('测试文档无效');
      const adapter = createHttpProjectAdapter({
        baseUrl: 'http://x/api',
        fetch,
        mapping: {
          [operation]: {
            request: () => {
              throw new Error('请求投影失败');
            },
          },
        },
      });
      const request = {
        projectId: 'p1',
        revision: '3',
        document: project.value,
        signal: new AbortController().signal,
      };
      expect(await adapter[operation](request)).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'PROJECT_UNAVAILABLE' }],
      });
      expect(calls).toHaveLength(0);
    },
  );

  it.each(['load', 'save'] as const)(
    '%s treats cancellation during request or response projection as empty diagnostics',
    async (operation) => {
      const project = parseScreenDocument(DOCUMENT);
      if (!project.ok) throw new Error('测试文档无效');
      for (const stage of ['request', 'response'] as const) {
        for (const throws of [false, true]) {
          const controller = new AbortController();
          const { fetch, calls } = routingFetch(() => ({
            ok: true,
            status: 200,
            body: { screen: SCREEN },
          }));
          const adapter = createHttpProjectAdapter({
            baseUrl: 'http://x/api',
            fetch,
            mapping: {
              [operation]: {
                [stage]: () => {
                  controller.abort();
                  if (throws) throw new Error('取消中的投影');
                  return stage === 'request' ? { path: '/custom' } : null;
                },
              },
            },
          });
          const request = {
            projectId: 'p1',
            revision: '3',
            document: project.value,
            signal: controller.signal,
          };
          expect(await adapter[operation](request)).toEqual({ ok: false, diagnostics: [] });
          expect(calls).toHaveLength(stage === 'request' ? 0 : 1);
        }
      }
    },
  );

  it('declares publish unsupported', () => {
    const adapter = createHttpProjectAdapter({ baseUrl: 'http://x/api' });
    expect(adapter.capabilities).toEqual({ publish: false });
  });
});

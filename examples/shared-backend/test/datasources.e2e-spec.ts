// 独立测试库：本 spec 会大量建/删 DataSource 行，与 app.e2e-spec 共用 test.db 会让
// 它的「目录恰好 4 条内置」断言偶发失败（jest 并行跑文件）。迁移由 global-setup 预置。
process.env.DATABASE_URL = 'file:../data/test.ds-api.db';
// A23 用注入阈值：300 ms 足以让「超时→SIGKILL→重建」跑完，又不让 CI 真等 3 s
process.env.SQLITE_TIMEOUT_MS = '300';

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  makeTempDatasourceDir,
  removeTempDatasourceDir,
  waitForRunnerExit,
} from './support/temp-dir';

/**
 * 数据源管理与 SQL 安全边界的 HTTP 层验收（PRD A1 / A5–A8 / A11 / A13–A22）。
 *
 * 为什么全部走真实 AppModule + 真实 HTTP：A20/A21 的价值在于「词法守卫 → 执行器 →
 * 文件真的没变」这条完整链路；A5/A8/A13 需要真实的上游 HTTP（本地起一个 127.0.0.1
 * 的测试服务，不连外网，也不依赖 127.0.0.1:9 之外的"意外可达"）。
 */

const TOKEN = 'super-secret-token-123';
const PRESS_ROWS = Array.from({ length: 12 }, (_unused, index) => ({
  t: `2026-03-01T0${Math.floor(index / 6)}:0${index % 6}:00.000Z`,
  device: index % 2 === 0 ? 'PRESS-01' : 'PRESS-02',
  value: 70 + index / 10,
}));

/** 上游按 pathname 分派；`hits` 用于断言「空 URL 不发请求」（A5）。 */
const hits = new Map<string, number>();

/** 上游最后一次收到的请求头（按 pathname）。用于断言 header 注入没有真的发出去。 */
const seenHeaders = new Map<string, import('node:http').IncomingHttpHeaders>();

function bump(pathname: string): void {
  hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
}

function hitsOf(pathname: string): number {
  return hits.get(pathname) ?? 0;
}

function sendJson(
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
): void {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(text);
}

let upstream: Server;
let app: INestApplication;
let prisma: PrismaService;
let directory = '';
let upstreamBase = '';

interface FileSnapshot {
  readonly sha256: string;
  readonly mtimeMs: number;
}

function snapshot(file: string): FileSnapshot {
  return {
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    mtimeMs: statSync(file).mtimeMs,
  };
}

function sqlConfig(
  sql: string,
  params: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return { v: 1, mode: 'sql', file: 'workshop.db', sql, params };
}

function tableConfig(
  columns: readonly { readonly name: string; readonly declaredType?: string }[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    v: 1,
    mode: 'table',
    file: 'workshop.db',
    table: 'devices',
    columns: columns.map((column) => ({
      name: column.name,
      declaredType: column.declaredType ?? '',
    })),
    params: [],
    ...extra,
  };
}

async function createDatasource(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await request(app.getHttpServer()).post('/api/datasources').send(body);
  return response.body as Record<string, unknown>;
}

beforeAll(async () => {
  directory = makeTempDatasourceDir('base-screen-ds-api-');
  process.env.DATASOURCE_DIR = directory;

  upstream = createServer((incoming, response) => {
    const pathname = (incoming.url ?? '/').split('?')[0] ?? '/';
    bump(pathname);
    seenHeaders.set(pathname, incoming.headers);
    switch (pathname) {
      case '/ok':
      case '/never':
        sendJson(response, 200, PRESS_ROWS);
        return;
      case '/secured':
        if (incoming.headers['x-api-key'] === TOKEN) {
          sendJson(response, 200, PRESS_ROWS);
          return;
        }
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      case '/unauthorized':
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      case '/boom':
        sendJson(response, 500, { error: 'boom' });
        return;
      case '/text':
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('"hello"');
        return;
      case '/empty':
        sendJson(response, 200, []);
        return;
      case '/infer':
        sendJson(response, 200, [
          { a: 1, b: 'x', c: true, d: '2026-01-02T03:04:05Z', e: { k: 1 } },
        ]);
        return;
      case '/rows':
        sendJson(response, 200, { rows: [{ v: 1 }, { v: 2 }] });
        return;
      case '/loop':
        response.writeHead(302, { location: '/loop' });
        response.end();
        return;
      default:
        sendJson(response, 404, { error: 'not found' });
    }
  });
  await new Promise<void>((resolve) => {
    upstream.listen(0, '127.0.0.1', () => resolve());
  });
  const address = upstream.address();
  const port = address !== null && typeof address === 'object' ? address.port : 0;
  upstreamBase = `http://127.0.0.1:${port}`;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  prisma = app.get(PrismaService, { strict: false });
  await prisma.dataSource.deleteMany({});
});

afterAll(async () => {
  await prisma.dataSource.deleteMany({});
  await app.close();
  await new Promise<void>((resolve) => {
    upstream.close(() => resolve());
  });
  await waitForRunnerExit();
  removeTempDatasourceDir(directory);
});

describe('A1 · 台账列表', () => {
  it('lists custom first (updatedAt desc) and the four builtin entries last', async () => {
    const staticBody = {
      name: 'A1 Static',
      description: '',
      type: 'static',
      config: { v: 1, columns: ['crew', 'output'], rows: [['甲班', 120]] },
    };
    const first = await createDatasource(staticBody);
    expect(first.datasetId).toBe('custom.a1-static');
    // 空说明必须落 null（契约 text.min(1) 不接受空串）
    expect(first.description).toBeNull();
    expect(first.status).toBe('ready');
    expect(first.configSummary).toBe('2 列 · 1 行');
    expect(first.refCount).toBe(0);
    expect(first.refScreens).toEqual([]);
    expect((first.fields as { id: string }[]).map((field) => field.id)).toEqual(['crew', 'output']);

    const second = await createDatasource({ ...staticBody, name: 'A1 Second' });
    expect(second.datasetId).toBe('custom.a1-second');
  }, 20_000);

  it('returns the mixed list with builtin entries at the bottom', async () => {
    const response = await request(app.getHttpServer()).get('/api/datasources').expect(200);
    const body = response.body as {
      items: { datasetId: string; type: string; status: string; refCount: number }[];
      total: number;
    };
    expect(body.total).toBe(body.items.length);
    expect(body.items.filter((item) => item.type === 'builtin')).toHaveLength(4);
    // 内置在最后
    const firstBuiltinIndex = body.items.findIndex((item) => item.type === 'builtin');
    expect(body.items.slice(firstBuiltinIndex).every((item) => item.type === 'builtin')).toBe(true);
    const builtin = body.items.find((item) => item.datasetId === 'monitor.devices');
    expect(builtin).toMatchObject({ type: 'builtin', status: 'builtin' });
    expect(typeof builtin?.refCount).toBe('number');
  });
});

describe('A5 · REST 测试连接的五类结果', () => {
  async function testRest(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await request(app.getHttpServer())
      .post('/api/datasources/test')
      .send({ type: 'rest', config })
      .expect(200);
    return response.body as Record<string, unknown>;
  }

  it('classifies unreachable / unauthorized / upstream error / invalid shape', async () => {
    const unreachable = await testRest({
      v: 1,
      url: 'http://127.0.0.1:9/none',
      headers: [],
      params: [],
    });
    expect(unreachable).toMatchObject({ ok: false, code: 'UNREACHABLE' });
    expect(String(unreachable.message)).toContain('地址不可达');
    expect(String(unreachable.message)).toContain('检查 URL');

    const unauthorized = await testRest({
      v: 1,
      url: `${upstreamBase}/unauthorized`,
      headers: [],
      params: [],
    });
    expect(unauthorized).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(String(unauthorized.message)).toContain('鉴权失败');

    const upstreamError = await testRest({
      v: 1,
      url: `${upstreamBase}/boom`,
      headers: [],
      params: [],
    });
    expect(upstreamError).toMatchObject({ ok: false, code: 'UPSTREAM_ERROR' });
    expect(String(upstreamError.message)).toContain('上游返回 500');

    const invalid = await testRest({ v: 1, url: `${upstreamBase}/text`, headers: [], params: [] });
    expect(invalid).toMatchObject({ ok: false, code: 'INVALID_SHAPE' });
    expect(String(invalid.message)).toContain('返回格式不符');

    const empty = await testRest({ v: 1, url: `${upstreamBase}/empty`, headers: [], params: [] });
    expect(empty).toMatchObject({ ok: false, code: 'INVALID_SHAPE' });
  });

  it('rejects an empty URL with INVALID_REQUEST and never opens a connection', async () => {
    const before = hitsOf('/never');
    await request(app.getHttpServer())
      .post('/api/datasources/test')
      .send({ type: 'rest', config: { v: 1, url: '', headers: [], params: [] } })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
        expect(String(response.body.message)).toContain('请求地址');
      });
    expect(hitsOf('/never')).toBe(before);
  });

  it('reports the success shape with rowCount and fields', async () => {
    const ok = await testRest({ v: 1, url: `${upstreamBase}/ok`, headers: [], params: [] });
    expect(ok).toMatchObject({ ok: true, rowCount: 12, truncated: false });
    expect((ok.fields as { id: string }[]).map((field) => field.id)).toEqual([
      't',
      'device',
      'value',
    ]);
  });

  it('stops after three redirects', async () => {
    const looped = await testRest({ v: 1, url: `${upstreamBase}/loop`, headers: [], params: [] });
    expect(looped).toMatchObject({ ok: false, code: 'UNREACHABLE' });
    expect(String(looped.message)).toContain('重定向次数');
  });
});

describe('A6 / A7 · 保存即取数', () => {
  it('saves an unreachable REST source as error (201) and keeps it out of the catalog', async () => {
    const created = await createDatasource({
      name: 'A6 不可达',
      type: 'rest',
      config: { v: 1, url: 'http://127.0.0.1:9/none', headers: [], params: [] },
    });
    expect(created).toMatchObject({ datasetId: 'custom.a6', status: 'error' });
    expect((created.lastTest as { ok: boolean; code: string }).ok).toBe(false);
    expect((created.lastTest as { code: string }).code).toBe('UNREACHABLE');

    const catalog = await request(app.getHttpServer()).get('/api/datasets').expect(200);
    const ids = (catalog.body.items as { datasetId: string }[]).map((item) => item.datasetId);
    expect(ids).not.toContain('custom.a6');
  }, 20_000);

  it('turns ready once the config is fixed by PUT', async () => {
    const updated = await request(app.getHttpServer())
      .put('/api/datasources/custom.a6')
      .send({
        name: 'A6 不可达',
        type: 'rest',
        config: { v: 1, url: `${upstreamBase}/ok`, headers: [], params: [] },
      })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'ready' });
    expect((updated.body.lastTest as { rowCount: number }).rowCount).toBe(12);

    const catalog = await request(app.getHttpServer()).get('/api/datasets').expect(200);
    const entry = (catalog.body.items as { datasetId: string; groupId: string }[]).find(
      (item) => item.datasetId === 'custom.a6',
    );
    expect(entry).toMatchObject({ groupId: 'custom' });
  }, 20_000);
});

describe('A8 · REST 字段推断', () => {
  it('infers fields in first-appearance order with the right types', async () => {
    const created = await createDatasource({
      name: 'A8 推断',
      type: 'rest',
      config: { v: 1, url: `${upstreamBase}/infer`, headers: [], params: [] },
    });
    const fields = created.fields as { id: string; valueType: string }[];
    expect(fields.map((field) => field.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(fields.map((field) => field.valueType)).toEqual([
      'number',
      'string',
      'boolean',
      'date',
      'string',
    ]);
    // 嵌套对象被降级成 JSON 字符串，单元格仍是标量
    const preview = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({
        type: 'rest',
        config: { v: 1, url: `${upstreamBase}/infer`, headers: [], params: [] },
      })
      .expect(200);
    const row = (preview.body.rows as Record<string, unknown>[])[0];
    expect(typeof row?.e).toBe('string');
    expect(row?.e).toBe('{"k":1}');
  }, 20_000);

  it('accepts the {rows:[...]} envelope too', async () => {
    const created = await createDatasource({
      name: 'A8 Envelope',
      type: 'rest',
      config: { v: 1, url: `${upstreamBase}/rows`, headers: [], params: [] },
    });
    expect(created.status).toBe('ready');
    expect(created.datasetId).toBe('custom.a8-envelope');
    expect((created.fields as { id: string }[]).map((field) => field.id)).toEqual(['v']);
  }, 20_000);
});

describe('A11 · 内置只读', () => {
  it('rejects PUT / DELETE with BUILTIN_READONLY', async () => {
    await request(app.getHttpServer())
      .put('/api/datasources/monitor.devices')
      .send({ name: 'x', type: 'static', config: { v: 1, columns: ['a'], rows: [[1]] } })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'BUILTIN_READONLY' });
      });

    await request(app.getHttpServer())
      .delete('/api/datasources/monitor.devices')
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'BUILTIN_READONLY' });
      });
  });

  it('answers builtin test requests with BUILTIN_NO_CONNECTION', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/datasources/test')
      .send({ type: 'builtin' })
      .expect(200);
    expect(draft.body).toMatchObject({
      ok: true,
      code: 'BUILTIN_NO_CONNECTION',
      message: '内置数据集，无需连接',
    });

    const stored = await request(app.getHttpServer())
      .post('/api/datasources/monitor.devices/test')
      .expect(200);
    expect(stored.body).toMatchObject({ ok: true, code: 'BUILTIN_NO_CONNECTION' });

    // 详情可读，且是只读形状
    const detail = await request(app.getHttpServer())
      .get('/api/datasources/monitor.devices')
      .expect(200);
    expect(detail.body).toMatchObject({ type: 'builtin', status: 'builtin', config: null });
    expect((detail.body.fields as unknown[]).length).toBe(5);
  });
});

describe('A13 · 凭据只出不进', () => {
  // 注意：必须在使用时构造（beforeAll 才拿到 upstream 端口）；describe 回调跑在 beforeAll 之前
  function securedConfig(): Record<string, unknown> {
    return {
      v: 1,
      url: `${upstreamBase}/secured`,
      headers: [{ name: 'X-API-Key', value: TOKEN }],
      params: [],
    };
  }

  it('never returns the header value and keeps it when PUT sends an empty string', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/datasources')
      .send({ name: 'A13 Secured', type: 'rest', config: securedConfig() });
    expect({ status: created.status, body: created.body }).toMatchObject({ status: 201 });
    expect(created.text).not.toContain(TOKEN);
    expect(created.body).toMatchObject({ status: 'ready' });

    const datasetId = (created.body as { datasetId: string }).datasetId;
    const list = await request(app.getHttpServer()).get('/api/datasources').expect(200);
    expect(list.text).not.toContain(TOKEN);

    const detail = await request(app.getHttpServer())
      .get(`/api/datasources/${datasetId}`)
      .expect(200);
    expect(detail.text).not.toContain(TOKEN);
    const config = detail.body.config as {
      headers: { name: string; valueMasked: string; hasValue: boolean }[];
    };
    expect(config.headers).toEqual([
      { name: 'X-API-Key', valueMasked: '••••••••', hasValue: true },
    ]);

    // 传空串 = 保留原值
    const updated = await request(app.getHttpServer())
      .put(`/api/datasources/${datasetId}`)
      .send({
        name: 'A13 Secured',
        type: 'rest',
        config: { ...securedConfig(), headers: [{ name: 'X-API-Key', value: '' }] },
      })
      .expect(200);
    expect(updated.text).not.toContain(TOKEN);
    expect(updated.body).toMatchObject({ status: 'ready' });

    // 用已保存配置测试：上游必须收到原 token
    const before = hitsOf('/secured');
    const tested = await request(app.getHttpServer())
      .post(`/api/datasources/${datasetId}/test`)
      .expect(200);
    expect(tested.text).not.toContain(TOKEN);
    expect(tested.body).toMatchObject({ ok: true, rowCount: 12 });
    expect(hitsOf('/secured')).toBe(before + 1);
  }, 30_000);
});

describe('A14 / A15 · 预览与静态上限', () => {
  it('previews 20 rows but reports the true row count', async () => {
    const rows = Array.from({ length: 30 }, (_unused, index) => [`crew-${index}`, index]);
    const staticPreview = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({
        type: 'static',
        config: { v: 1, columns: ['crew', 'output'], rows },
      })
      .expect(200);
    expect(staticPreview.body).toMatchObject({ ok: true, rowCount: 30, truncated: false });
    expect((staticPreview.body.rows as unknown[]).length).toBe(20);
    expect(typeof (staticPreview.body as { durationMs: unknown }).durationMs).toBe('number');

    const sqlitePreview = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig('SELECT * FROM work_logs') })
      .expect(200);
    expect(sqlitePreview.body).toMatchObject({ ok: true, rowCount: 500, truncated: true });
    expect((sqlitePreview.body.rows as unknown[]).length).toBe(20);
  }, 20_000);

  it('rejects 201 static rows / oversized payloads with TOO_LARGE and nested cells with INVALID_SHAPE', async () => {
    await request(app.getHttpServer())
      .post('/api/datasources')
      .send({
        name: 'A15 太大',
        type: 'static',
        config: {
          v: 1,
          columns: ['a'],
          rows: Array.from({ length: 201 }, (_unused, index) => [`v${index}`]),
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'TOO_LARGE' });
      });

    await request(app.getHttpServer())
      .post('/api/datasources')
      .send({
        name: 'A15 嵌套',
        type: 'static',
        config: { v: 1, columns: ['a'], rows: [[{ nested: true }]] },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_SHAPE' });
      });
  });
});

describe('A16 / A17 · 受管目录与路径守卫', () => {
  it('lists only managed .db files (workshop.db present, host databases excluded)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/datasources/database-files')
      .expect(200);
    const names = (response.body.files as { name: string }[]).map((file) => file.name);
    expect(names).toContain('workshop.db');
    for (const host of [
      'screens.db',
      'test.db',
      'smoke-react.db',
      'smoke-vanilla.db',
      'smoke-vue.db',
    ]) {
      expect(names).not.toContain(host);
    }
    expect(response.text).not.toContain(directory);
  });

  it('rejects every path escape with PATH_NOT_ALLOWED and leaks no absolute path', async () => {
    const escapes = ['../screens.db', 'C:\\Windows\\x.db', '/etc/passwd', '..%2Fscreens.db'];
    for (const name of escapes) {
      const response = await request(app.getHttpServer())
        .get(`/api/datasources/database-files/${encodeURIComponent(name)}/tables`)
        .expect(400);
      expect(response.body).toMatchObject({ error: 'PATH_NOT_ALLOWED' });
      expect(response.text).not.toContain('/etc/passwd');
      expect(response.text).not.toContain(directory);
      expect(/[A-Za-z]:[\\/]/.test(response.text)).toBe(false);
    }
  });
});

describe('A18 · 表模式', () => {
  it('exposes table columns with declared types and marks BLOB unsupported', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/datasources/database-files/workshop.db/tables')
      .expect(200);
    const body = response.body as {
      tables: { name: string; kind: string }[];
      columns: Record<string, { name: string; declaredType: string; supported: boolean }[]>;
    };
    expect(body.tables.map((table) => table.name)).toEqual([
      'device_photos',
      'devices',
      'v_fault_devices',
      'work_logs',
    ]);
    expect(body.tables.find((table) => table.name === 'v_fault_devices')?.kind).toBe('view');
    const photos = body.columns.device_photos ?? [];
    expect(photos.find((column) => column.name === 'photo')).toMatchObject({
      declaredType: 'BLOB',
      supported: false,
    });
    // devices 表本身没有 BLOB 列（否则 SELECT * FROM devices 会被弃用）
    expect((body.columns.devices ?? []).every((column) => column.supported)).toBe(true);
  });

  it('previews a table projection in the selected order with schema-derived types', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({
        type: 'sqlite',
        config: tableConfig([
          { name: 'id', declaredType: 'TEXT' },
          { name: 'name', declaredType: 'TEXT' },
          { name: 'load', declaredType: 'REAL' },
        ]),
      })
      .expect(200);
    const body = response.body as {
      ok: boolean;
      rowCount: number;
      fields: { id: string; valueType: string }[];
      rows: Record<string, unknown>[];
    };
    expect(body.ok).toBe(true);
    expect(body.rowCount).toBe(24);
    expect(body.fields.map((field) => field.id)).toEqual(['id', 'name', 'load']);
    expect(body.fields.map((field) => field.valueType)).toEqual(['string', 'string', 'number']);
    expect(typeof body.rows[0]?.load).toBe('number');
  }, 20_000);

  it('previews a view and returns only fault rows (A19 的 ≥1 且 <24)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({
        type: 'sqlite',
        config: {
          v: 1,
          mode: 'table',
          file: 'workshop.db',
          table: 'v_fault_devices',
          columns: [
            { name: 'id', declaredType: 'TEXT' },
            { name: 'name', declaredType: 'TEXT' },
            { name: 'line', declaredType: 'TEXT' },
          ],
          params: [],
        },
      })
      .expect(200);
    const body = response.body as { rowCount: number; rows: unknown[] };
    expect(body.rowCount).toBe(6);
    expect(body.rowCount).toBeLessThan(24);
  }, 20_000);

  it('rejects a BLOB column submitted past the UI with INVALID_REQUEST', async () => {
    await request(app.getHttpServer())
      .post('/api/datasources')
      .send({
        name: 'A18 二进制列',
        type: 'sqlite',
        config: {
          v: 1,
          mode: 'table',
          file: 'workshop.db',
          table: 'device_photos',
          columns: [{ name: 'photo', declaredType: 'BLOB' }],
          params: [],
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
        expect(String(response.body.message)).toContain('二进制列');
      });
  }, 20_000);

  it('rejects an unknown table and an unknown column', async () => {
    await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({
        type: 'sqlite',
        config: { ...tableConfig([{ name: 'id' }]), table: 'nope' },
      })
      // 配置类错误（表不存在）一律 4xx：与「测试没通」区分开（Minor-7）
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'TABLE_NOT_FOUND' });
      });

    await request(app.getHttpServer())
      .post('/api/datasources')
      .send({
        name: 'A18 未知列',
        type: 'sqlite',
        config: tableConfig([{ name: 'nope' }]),
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });
  }, 20_000);
});

describe('A19 · SQL 模式的错误分类', () => {
  function previewSql(
    sql: string,
    params: readonly Record<string, unknown>[] = [],
    values: Record<string, unknown> = {},
  ): request.Test {
    return request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig(sql, params), values });
  }

  const statusParam = {
    name: 'status',
    label: '状态',
    valueType: 'string',
    required: true,
  };

  it('binds :name parameters and returns only matching rows', async () => {
    const response = await previewSql(
      'SELECT id, name, status FROM devices WHERE status = :status',
      [statusParam],
      { status: 'fault' },
    ).expect(200);
    const body = response.body as { rowCount: number; rows: { status: string }[] };
    expect(body.rowCount).toBe(6);
    expect(body.rows.every((row) => row.status === 'fault')).toBe(true);
  }, 20_000);

  it('reports MISSING_PARAMETER for a required parameter without a value', async () => {
    const response = await previewSql('SELECT id FROM devices WHERE status = :status', [
      statusParam,
    ]).expect(400);
    expect(response.body).toMatchObject({ error: 'MISSING_PARAMETER' });
    expect(String((response.body as { message: string }).message)).toContain(':status');
  }, 20_000);

  it('reports UNDECLARED_PARAMETER, DUPLICATE_COLUMN, empty result and BLOB results', async () => {
    const undeclared = await previewSql('SELECT id FROM devices WHERE status = :nope').expect(400);
    expect(undeclared.body).toMatchObject({ error: 'UNDECLARED_PARAMETER' });
    expect(String((undeclared.body as { message: string }).message)).toContain(':nope');

    const duplicated = await previewSql('SELECT id, id FROM devices').expect(400);
    expect(duplicated.body).toMatchObject({ error: 'DUPLICATE_COLUMN' });

    const empty = await previewSql("SELECT id FROM devices WHERE status = 'nope'").expect(200);
    expect(empty.body).toMatchObject({ ok: false, code: 'INVALID_SHAPE' });
    expect(String((empty.body as { message: string }).message)).toContain('没有返回任何行');

    const blob = await previewSql('SELECT * FROM device_photos').expect(200);
    expect(blob.body).toMatchObject({ ok: false, code: 'INVALID_SHAPE' });
    expect(String((blob.body as { message: string }).message)).toContain('二进制列');
    expect(String((blob.body as { message: string }).message)).not.toContain('\u0000');

    // devices 没有 BLOB 列：SQL 模式最常用的演示语句必须能过
    const devices = await previewSql('SELECT * FROM devices').expect(200);
    expect((devices.body as { ok: boolean }).ok).toBe(true);
  }, 30_000);
});

describe('参数值类型（Minor-4）', () => {
  it('rejects object/array parameter values instead of stringifying them', async () => {
    const config = sqlConfig('SELECT id FROM devices WHERE status = :status', [
      { name: 'status', label: '状态', valueType: 'string', required: true },
    ]);
    for (const bad of [{ nested: 1 }, [1, 2]]) {
      await request(app.getHttpServer())
        .post('/api/datasources/preview')
        .send({ type: 'sqlite', config, values: { status: bad } })
        .expect(400)
        .expect((response) => {
          expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
          expect(String(response.body.message)).toContain(':status');
        });
    }
    // 对照组：标量照常通过（否则上面的 400 可能是别的原因）
    await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config, values: { status: 'fault' } })
      .expect(200);
  }, 20_000);
});

describe('A20 · 只读（HTTP 两条路径 + 文件不变）', () => {
  const writeStatements: readonly string[] = [
    "UPDATE devices SET name='x'",
    'DELETE FROM devices',
    'DROP TABLE devices',
    "ATTACH DATABASE '/tmp/e.db' AS e",
    'PRAGMA journal_mode=DELETE',
    'WITH x AS (SELECT 1) DELETE FROM devices',
  ];

  it('rejects all six write statements on the preview path and leaves the file untouched', async () => {
    const file = join(directory, 'workshop.db');
    const before = snapshot(file);
    for (const sql of writeStatements) {
      const response = await request(app.getHttpServer())
        .post('/api/datasources/preview')
        .send({ type: 'sqlite', config: sqlConfig(sql) })
        // 安全类错误一律 4xx（A17/A20 的「越权路径给 400」）
        .expect(400);
      expect(response.body).toMatchObject({ error: 'READONLY_VIOLATION' });
    }
    expect(snapshot(file)).toEqual(before);
  }, 30_000);

  it('rejects a stored write statement on the /api/datasets query path too', async () => {
    const file = join(directory, 'workshop.db');
    const before = snapshot(file);
    // 直接写库模拟"绕过保存校验"的行（R4：执行前必须重新过词法检查）
    await prisma.dataSource.create({
      data: {
        datasetId: 'custom.write-attempt',
        name: 'A20 写语句',
        description: null,
        type: 'sqlite',
        config: JSON.stringify(sqlConfig('DELETE FROM devices')),
        status: 'ready',
        lastTest: null,
        fields: JSON.stringify([{ id: 'id', label: 'id', valueType: 'string', nullable: true }]),
      },
    });
    for (const sql of writeStatements) {
      await prisma.dataSource.update({
        where: { datasetId: 'custom.write-attempt' },
        data: { config: JSON.stringify(sqlConfig(sql)) },
      });
      const response = await request(app.getHttpServer())
        .get('/api/datasets/custom.write-attempt/query')
        .expect(400);
      expect(response.body).toMatchObject({ error: 'READONLY_VIOLATION' });
    }
    expect(snapshot(file)).toEqual(before);
    const devices = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig('SELECT count(*) AS total FROM devices') })
      .expect(200);
    expect((devices.body.rows as { total: number }[])[0]?.total).toBe(24);
  }, 30_000);
});

describe('A21 · 单语句与注释', () => {
  function previewSql(sql: string): request.Test {
    return request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig(sql) });
  }

  it('rejects a second statement', async () => {
    const response = await previewSql('SELECT 1; DROP TABLE devices').expect(400);
    expect(response.body).toMatchObject({ error: 'MULTI_STATEMENT' });
  }, 20_000);

  it('accepts semicolons inside literals and comments, and a single trailing semicolon', async () => {
    for (const sql of ["SELECT ';' AS x", 'SELECT 1 -- ; DROP', 'SELECT 1;']) {
      const response = await previewSql(sql).expect(200);
      expect((response.body as { ok: boolean }).ok).toBe(true);
    }
  }, 20_000);

  it('reports an unclosed comment as INVALID_SHAPE', async () => {
    const response = await previewSql('SELECT 1 /* 未闭合').expect(200);
    expect(response.body).toMatchObject({ ok: false, code: 'INVALID_SHAPE' });
    expect(String((response.body as { message: string }).message)).toContain('注释');
  }, 20_000);
});

describe('A23 · 超时的 HTTP 映射', () => {
  const runaway =
    'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c';

  it('reports QUERY_TIMEOUT on preview (200) and on the contract path (500)', async () => {
    const preview = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig(runaway) })
      .expect(200);
    expect(preview.body).toMatchObject({ ok: false, code: 'QUERY_TIMEOUT' });
    expect(String((preview.body as { message: string }).message)).toContain('查询超时');

    // 契约路径必须是 **500**：宿主把 400/422 映射成 HOST_DATASET_PARAMETER_INVALID、
    // 5xx 映射成 HOST_DATASET_UNAVAILABLE。超时若给 422，屏上会显示「参数错误」，
    // 把值班员引去改参数；500 才走「保留上一帧 + 角标 + 离线」这条诚实降级。
    await prisma.dataSource.create({
      data: {
        datasetId: 'custom.runaway',
        name: 'A23 超时',
        description: null,
        type: 'sqlite',
        config: JSON.stringify(sqlConfig(runaway)),
        status: 'ready',
        lastTest: null,
        fields: JSON.stringify([{ id: 'n', label: 'n', valueType: 'number', nullable: true }]),
      },
    });
    const contract = await request(app.getHttpServer())
      .get('/api/datasets/custom.runaway/query')
      .expect(500);
    expect(contract.body).toMatchObject({ error: 'QUERY_TIMEOUT' });
    expect(String((contract.body as { message: string }).message)).toContain('查询超时');

    // 三条路由的口径（PRD 修订）：
    //   契约 `/datasets/:id/query` → 500；`/datasources/preview` → 200 + ok:false；
    //   `/datasources/:id/test`（已存配置）→ 200 + ok:false
    const storedTest = await request(app.getHttpServer())
      .post('/api/datasources/custom.runaway/test')
      .expect(200);
    expect(storedTest.body).toMatchObject({ ok: false, code: 'QUERY_TIMEOUT' });

    // 超时没有污染连接：同进程随后的普通预览仍然成功
    const after = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig('SELECT count(*) AS total FROM devices') })
      .expect(200);
    expect((after.body as { ok: boolean }).ok).toBe(true);
  }, 30_000);
});

describe('A22 · 截断（管理与契约两条路径）', () => {
  it('caps a 600-row table at 500 and reports truncation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: sqlConfig('SELECT * FROM work_logs') })
      .expect(200);
    expect(response.body).toMatchObject({ ok: true, rowCount: 500, truncated: true });
  }, 20_000);

  it('caps the contract path at 500 rows with totalRowCount=500', async () => {
    const created = await createDatasource({
      name: 'A22 截断',
      type: 'sqlite',
      config: sqlConfig('SELECT * FROM work_logs'),
    });
    expect(created).toMatchObject({ status: 'ready' });
    const datasetId = created.datasetId as string;
    const response = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .expect(200);
    const body = response.body as { rows: unknown[]; totalRowCount: number; fields: unknown[] };
    expect(body.rows).toHaveLength(500);
    expect(body.totalRowCount).toBe(500);
    // 键集恰为三键（多一个 truncated 都会让宿主判 HOST_DATASET_INVALID）
    expect(Object.keys(response.body as object).sort()).toEqual([
      'fields',
      'rows',
      'totalRowCount',
    ]);
  }, 30_000);
});

describe('S5 附加 · header 注入（PRD 未写，按失败关闭评估）', () => {
  it('rejects CRLF in a header name as INVALID_REQUEST without calling upstream', async () => {
    const before = hitsOf('/ok');
    const response = await request(app.getHttpServer())
      .post('/api/datasources/test')
      .send({
        type: 'rest',
        config: {
          v: 1,
          url: `${upstreamBase}/ok`,
          headers: [{ name: 'X-Bad\r\nInjected', value: 'v' }],
          params: [],
        },
      })
      .expect(400);
    expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
    // 表单不合法 → 不发请求
    expect(hitsOf('/ok')).toBe(before);
  });

  it('fails closed on CRLF in a header value and never forwards the injected header', async () => {
    const before = hitsOf('/ok');
    const response = await request(app.getHttpServer())
      .post('/api/datasources/test')
      .send({
        type: 'rest',
        config: {
          v: 1,
          url: `${upstreamBase}/ok`,
          headers: [{ name: 'X-Custom', value: 'v\r\nX-Injected: 1' }],
          params: [],
        },
      })
      // 修好之后：CRLF 在表单校验阶段就被拒（400 INVALID_REQUEST），不再落到 fetch 层
      // 被误分类成 UNREACHABLE。
      .expect(400);
    expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
    expect(String((response.body as { message?: string }).message)).not.toContain('X-Injected');
    // 关键不变量：注入头一个字节都不能到上游（请求在发出前就被拒）
    expect(seenHeaders.get('/ok')?.['x-injected']).toBeUndefined();
    expect(hitsOf('/ok')).toBe(before);
  });
});

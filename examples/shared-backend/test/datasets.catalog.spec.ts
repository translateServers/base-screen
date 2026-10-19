// 独立测试库：本 spec 建/删 DataSource 行并断言目录内容，避免并行测试互相污染。
process.env.DATABASE_URL = 'file:../data/test.ds-catalog.db';

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
 * `/api/datasets` 的合并层验收（A2 / A3 / A4 / A24 + `DATASET_NOT_READY`）。
 *
 * 这些断言的共同点：**契约形状**。多一个键、`description` 是空串而不是 null、
 * 未 ready 时返回 200 + 空字段，都会让宿主的 `parseScreenDataset*` 判
 * `HOST_DATASET_INVALID`，值班员看到的就是空白面板而不是明确的降级。
 */

let app: INestApplication;
let prisma: PrismaService;
let directory = '';

function staticConfig(
  rows: readonly (readonly (string | number | boolean | null)[])[],
): Record<string, unknown> {
  const width = rows[0]?.length ?? 0;
  const columns = Array.from({ length: width }, (_unused, index) => `c${index}`);
  return { v: 1, columns, rows };
}

function sqlConfig(
  sql: string,
  params: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return { v: 1, mode: 'sql', file: 'workshop.db', sql, params };
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await request(app.getHttpServer()).post('/api/datasources').send(body);
  if (response.status !== 201) {
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body as Record<string, unknown>;
}

beforeAll(async () => {
  directory = makeTempDatasourceDir('base-screen-ds-catalog-');
  process.env.DATASOURCE_DIR = directory;
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
  await waitForRunnerExit();
  removeTempDatasourceDir(directory);
});

describe('A2 · 目录合并', () => {
  it('merges ready custom entries into the catalog with the custom group', async () => {
    const noDescription = await post({
      name: 'A2 Static',
      description: '',
      type: 'static',
      config: staticConfig([['甲班', 120]]),
    });
    const described = await post({
      name: 'A2 Described',
      description: '带说明的静态数据源',
      type: 'static',
      config: staticConfig([['乙班', 98]]),
    });
    // 未 ready 的不进目录
    const failing = await post({
      name: 'A2 Failing',
      type: 'rest',
      config: { v: 1, url: 'http://127.0.0.1:9/none', headers: [], params: [] },
    });
    expect(failing.status).toBe('error');

    const response = await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ limit: 50 })
      .expect(200);
    const body = response.body as {
      items: { datasetId: string; description: string | null; groupId: string }[];
      groups: { id: string; name: string }[];
    };
    const ids = body.items.map((item) => item.datasetId);
    expect(ids).toContain(noDescription.datasetId);
    expect(ids).toContain(described.datasetId);
    expect(ids).not.toContain(failing.datasetId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(body.groups).toContainEqual({ id: 'custom', name: '自定义数据源' });

    const empty = body.items.find((item) => item.datasetId === noDescription.datasetId);
    // 空说明必须是 null（契约 text.min(1) 不接受空串）
    expect(empty?.description).toBeNull();
    expect(empty?.groupId).toBe('custom');
    // 内置条目仍在
    expect(ids).toContain('monitor.devices');
  }, 20_000);

  it('keeps the old query filter working (告警 只命中 monitor.alarms)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ query: '告警' })
      .expect(200);
    const body = response.body as { items: { datasetId: string }[]; groups: { id: string }[] };
    expect(body.items.map((item) => item.datasetId)).toEqual(['monitor.alarms']);
    expect(body.groups.map((group) => group.id)).toEqual(['alarm']);
  });

  it('derives groups from the filtered set, before pagination (limit=1 也能看到 custom)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ limit: 1 })
      .expect(200);
    const body = response.body as { items: unknown[]; groups: { id: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.groups.map((group) => group.id)).toContain('custom');
  });

  it('still rejects an out-of-range limit with INVALID_LIMIT', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ limit: 999 })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_LIMIT' });
      });
  });
});

describe('A3 · 自建 describe 与内置同构', () => {
  it('returns fields/parameters and the same fields as query', async () => {
    const created = await post({
      name: 'A3 Static',
      description: null,
      type: 'static',
      config: staticConfig([
        ['甲班', 120, true],
        ['乙班', 98, false],
      ]),
    });
    const datasetId = created.datasetId as string;

    const described = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}`)
      .expect(200);
    const body = described.body as {
      datasetId: string;
      groupId: string;
      fields: { id: string; label: string; valueType: string; nullable: boolean }[];
      parameters: unknown[];
    };
    expect(body.datasetId).toBe(datasetId);
    expect(body.groupId).toBe('custom');
    expect(body.fields.map((field) => field.id)).toEqual(['c0', 'c1', 'c2']);
    expect(body.fields.map((field) => field.valueType)).toEqual(['string', 'number', 'boolean']);
    expect(body.fields.every((field) => field.nullable === true)).toBe(true);
    expect(body.fields.every((field) => field.label.length > 0)).toBe(true);
    expect(body.parameters).toEqual([]);

    const queried = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .expect(200);
    expect(queried.body.fields).toEqual(described.body.fields);
    expect(Object.keys(queried.body as object).sort()).toEqual(['fields', 'rows', 'totalRowCount']);
  }, 20_000);
});

describe('A4 · 动态参数', () => {
  it('accepts declared parameters and rejects undeclared ones', async () => {
    const created = await post({
      name: 'A4 Sql',
      type: 'sqlite',
      config: sqlConfig('SELECT id, name, status FROM devices WHERE status = :status', [
        {
          name: 'status',
          label: '状态',
          valueType: 'string',
          required: true,
          defaultValue: 'fault',
        },
      ]),
    });
    const datasetId = created.datasetId as string;

    // 声明过的参数：200，且真的按参数取数（默认值 fault → 6 行）
    const ok = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .query({ status: 'fault' })
      .expect(200);
    const okBody = ok.body as { rows: { status: string }[]; totalRowCount: number };
    expect(okBody.totalRowCount).toBe(6);
    expect(okBody.rows.every((row) => row.status === 'fault')).toBe(true);

    // 换一个值：结果随之变化（证明绑定生效，不是恒等于默认值）
    const running = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .query({ status: 'running' })
      .expect(200);
    const runningBody = running.body as { rows: { status: string }[]; totalRowCount: number };
    expect(runningBody.totalRowCount).toBeGreaterThan(0);
    expect(runningBody.rows.every((row) => row.status === 'running')).toBe(true);

    // 未声明参数：400（不是 200 + 忽略）
    await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .query({ bogus: '1' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'UNDECLARED_PARAMETER' });
      });
  }, 20_000);

  it('keeps the builtin DTO whitelist intact (componentId 仍 400)', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', componentId: 'c-1' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });

    // 合法查询仍稳定
    const ok = await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', limit: 5 })
      .expect(200);
    expect((ok.body.rows as unknown[]).length).toBe(5);
  });

  it('saves a required-parameter source as error instead of blocking the save (R1)', async () => {
    const created = await post({
      name: 'A4 Required',
      type: 'sqlite',
      config: sqlConfig('SELECT id FROM devices WHERE status = :status', [
        { name: 'status', label: '状态', valueType: 'string', required: true },
      ]),
    });
    // 必填且无默认值 → 单笔试跑没有值 → MISSING_PARAMETER 落 lastTest，但保存本身成功
    expect(created).toMatchObject({ status: 'error' });
    expect((created.lastTest as { code: string }).code).toBe('MISSING_PARAMETER');
    await request(app.getHttpServer())
      .get(`/api/datasets/${created.datasetId as string}/query`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'DATASET_NOT_READY' });
      });
  }, 20_000);
});

describe('DATASET_NOT_READY（PRD §8.4）', () => {
  it('404s both describe and query for a datasource that is not ready', async () => {
    const failing = await post({
      name: 'NR Rest',
      type: 'rest',
      config: { v: 1, url: 'http://127.0.0.1:9/none', headers: [], params: [] },
    });
    const datasetId = failing.datasetId as string;

    for (const path of [`/api/datasets/${datasetId}`, `/api/datasets/${datasetId}/query`]) {
      await request(app.getHttpServer())
        .get(path)
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({ error: 'DATASET_NOT_READY' });
          expect(String(response.body.message)).toContain('尚未就绪');
        });
    }
  }, 20_000);

  it('404s when status is ready but fields are empty', async () => {
    await prisma.dataSource.create({
      data: {
        datasetId: 'custom.empty-fields',
        name: '空字段',
        description: null,
        type: 'static',
        config: JSON.stringify({ v: 1, columns: ['a'], rows: [[1]] }),
        status: 'ready',
        lastTest: null,
        fields: JSON.stringify([]),
      },
    });
    for (const path of [
      '/api/datasets/custom.empty-fields',
      '/api/datasets/custom.empty-fields/query',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({ error: 'DATASET_NOT_READY' });
        });
    }
  });

  it('404s UNKNOWN_DATASET for a datasetId that does not exist at all', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/custom.nope')
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'UNKNOWN_DATASET' });
      });
  });
});

describe('A24 · SQLite 联动', () => {
  it('exposes a ready sqlite source end to end (catalog → describe → query)', async () => {
    const created = await post({
      name: 'A24 Devices',
      type: 'sqlite',
      config: {
        v: 1,
        mode: 'table',
        file: 'workshop.db',
        table: 'devices',
        columns: [
          { name: 'id', declaredType: 'TEXT' },
          { name: 'name', declaredType: 'TEXT' },
          { name: 'status', declaredType: 'TEXT' },
        ],
        filters: [{ column: 'status', param: 'status' }],
        params: [{ name: 'status', label: '状态', valueType: 'string', required: false }],
      },
    });
    const datasetId = created.datasetId as string;
    expect(created).toMatchObject({ status: 'ready' });

    const catalog = await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ limit: 50 })
      .expect(200);
    const entry = (catalog.body.items as { datasetId: string; groupId: string }[]).find(
      (item) => item.datasetId === datasetId,
    );
    expect(entry).toMatchObject({ groupId: 'custom' });

    const described = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}`)
      .expect(200);
    // 用「已存配置」预览：与 describe 的字段必须同源（同一份落库 fields）
    const stored = await request(app.getHttpServer())
      .get(`/api/datasources/${datasetId}`)
      .expect(200);
    const preview = await request(app.getHttpServer())
      .post('/api/datasources/preview')
      .send({ type: 'sqlite', config: (stored.body as { config: unknown }).config })
      .expect(200);
    // describe 的字段与预览列一致（同一份落库字段）
    const describeFields = (described.body.fields as { id: string }[]).map((field) => field.id);
    const previewFields = (preview.body.fields as { id: string }[]).map((field) => field.id);
    expect(describeFields).toEqual(previewFields);

    const filtered = await request(app.getHttpServer())
      .get(`/api/datasets/${datasetId}/query`)
      .query({ status: 'fault' })
      .expect(200);
    const body = filtered.body as {
      rows: { id: string; status: string }[];
      fields: unknown[];
      totalRowCount: number;
    };
    expect(body.totalRowCount).toBe(6);
    expect(body.rows.every((row) => row.status === 'fault')).toBe(true);
    expect(typeof body.rows[0]?.id).toBe('string');
    expect(Object.keys(filtered.body as object).sort()).toEqual([
      'fields',
      'rows',
      'totalRowCount',
    ]);
  }, 30_000);

  it('truncates a table-mode query at 500 rows without writing LIMIT', async () => {
    const created = await post({
      name: 'A24 Logs',
      type: 'sqlite',
      config: {
        v: 1,
        mode: 'table',
        file: 'workshop.db',
        table: 'work_logs',
        columns: [
          { name: 'id', declaredType: 'TEXT' },
          { name: 'throughput', declaredType: 'INTEGER' },
        ],
        params: [],
      },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/datasets/${created.datasetId as string}/query`)
      .expect(200);
    const body = response.body as { rows: unknown[]; totalRowCount: number };
    expect(body.rows).toHaveLength(500);
    expect(body.totalRowCount).toBe(500);
  }, 30_000);
});

// 独立测试库：本 spec 断言种子屏与告警绑定，避免并行 e2e 共享 test.db 时 ensureSeed 竞态。
process.env.DATABASE_URL = 'file:../data/test.app.db';

import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * e2e 走真实 AppModule（含全局管道/过滤器/拦截器）与独立 SQLite 测试库
 * （DATABASE_URL 见文件顶部，迁移由 test/global-setup.ts 应用）。
 */
describe('host api (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.screen.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  it('answers the health probe', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('lists the seeded screens', async () => {
    const response = await request(app.getHttpServer()).get('/api/screens').expect(200);

    const names = (response.body.screens as { name: string }[]).map((item) => item.name);
    expect(names).toContain('默认销售大屏');
    expect(names).toContain('系统监控大屏');
    expect(names).toContain('实时告警演示大屏');
    expect(names).toContain('空气质量监测大屏');
  });

  it('runs the create / update / conflict / delete lifecycle', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/screens')
      .send({ name: 'e2e-生命周期大屏' })
      .expect(201);
    const screen = created.body.screen as { id: string; revision: number };
    createdIds.push(screen.id);
    expect(screen.revision).toBe(1);

    const loaded = await request(app.getHttpServer()).get(`/api/screens/${screen.id}`).expect(200);
    const document = loaded.body.screen.document as Record<string, unknown>;
    expect(document).toMatchObject({ canvas: { width: 1920 } });

    const saved = await request(app.getHttpServer())
      .put(`/api/screens/${screen.id}`)
      .send({
        document: { ...document, canvas: { width: 1280, height: 720, backgroundColor: '#000000' } },
        revision: screen.revision,
      })
      .expect(200);
    expect(saved.body.screen.revision).toBe(2);

    await request(app.getHttpServer())
      .put(`/api/screens/${screen.id}`)
      .send({ document, revision: 1 })
      .expect(409)
      .expect((response) => {
        expect(response.body.error).toBe('REVISION_CONFLICT');
        expect(typeof response.body.message).toBe('string');
      });

    await request(app.getHttpServer()).patch(`/api/screens/${screen.id}`).send({}).expect(404);

    await request(app.getHttpServer()).delete(`/api/screens/${screen.id}`).expect(200);
    await request(app.getHttpServer()).get(`/api/screens/${screen.id}`).expect(404);
  });

  it('rejects an invalid canonical document with DOCUMENT_INVALID', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/screens')
      .send({ name: 'e2e-非法文档' })
      .expect(201);
    createdIds.push(created.body.screen.id as string);

    await request(app.getHttpServer())
      .put(`/api/screens/${created.body.screen.id}`)
      .send({ document: { canvas: 'nope' }, revision: 1 })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe('DOCUMENT_INVALID');
      });
  });

  it('serves seeded alarm bindings and persists page-authored overrides per screen', async () => {
    const list = await request(app.getHttpServer()).get('/api/screens').expect(200);
    const alarm = (list.body.screens as { id: string; name: string }[]).find(
      (item) => item.name === '实时告警演示大屏',
    );
    expect(alarm).toBeDefined();
    if (alarm === undefined) return;

    const seeded = await request(app.getHttpServer())
      .get(`/api/screens/${alarm.id}/alarm-bindings`)
      .expect(200);
    expect(seeded.body.bindings['alarm.open']['kpi-alarm-value']).toEqual({
      warning: { color: '#fa8c16' },
      critical: { color: '#f5222d' },
    });

    const authored = {
      'alarm.open': {
        'kpi-level-warning-value': { warning: { color: '#00aa00' } },
      },
    };
    const saved = await request(app.getHttpServer())
      .put(`/api/screens/${alarm.id}/alarm-bindings`)
      .send({ bindings: authored })
      .expect(200);
    expect(saved.body.bindings).toEqual(authored);

    const reread = await request(app.getHttpServer())
      .get(`/api/screens/${alarm.id}/alarm-bindings`)
      .expect(200);
    expect(reread.body.bindings).toEqual(authored);

    // 结构不合法必须 400，且不覆盖已保存的配置。
    await request(app.getHttpServer())
      .put(`/api/screens/${alarm.id}/alarm-bindings`)
      .send({ bindings: { 'alarm.open': { card: { warning: { color: 1 } } } } })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe('ALARM_BINDINGS_INVALID');
      });
    const intact = await request(app.getHttpServer())
      .get(`/api/screens/${alarm.id}/alarm-bindings`)
      .expect(200);
    expect(intact.body.bindings).toEqual(authored);

    // 恢复种子值，避免这条用例污染同一测试库里的其它断言。
    await request(app.getHttpServer())
      .put(`/api/screens/${alarm.id}/alarm-bindings`)
      .send({ bindings: seeded.body.bindings })
      .expect(200);
  });

  it('returns empty alarm bindings for a new screen and rejects unknown screens', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/screens')
      .send({ name: 'e2e-告警绑定' })
      .expect(201);
    const id = created.body.screen.id as string;
    createdIds.push(id);

    const empty = await request(app.getHttpServer())
      .get(`/api/screens/${id}/alarm-bindings`)
      .expect(200);
    expect(empty.body.bindings).toEqual({});

    await request(app.getHttpServer()).get('/api/screens/missing/alarm-bindings').expect(404);
    await request(app.getHttpServer())
      .put('/api/screens/missing/alarm-bindings')
      .send({ bindings: {} })
      .expect(404);
  });

  it('serves deterministic metric series and fails closed on unknown metrics', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/metrics/series?metric=cpu_usage&points=3')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/metrics/series?metric=cpu_usage&points=3')
      .expect(200);

    expect(second.body).toEqual(first.body);
    expect(first.body.points).toHaveLength(3);
    expect(first.body.unit).toBe('%');

    await request(app.getHttpServer())
      .get('/api/metrics/series?metric=nope&points=3')
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe('UNKNOWN_METRIC');
      });
  });

  it('serves deterministic rankings and fails closed on unknown dimensions', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/metrics/ranking?dimension=region&limit=4')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/metrics/ranking?dimension=region&limit=4')
      .expect(200);

    expect(second.body).toEqual(first.body);
    expect(first.body.items).toHaveLength(4);
    expect(first.body.items[0]).toMatchObject({ name: '华东', value: 1284 });

    await request(app.getHttpServer())
      .get('/api/metrics/ranking?dimension=nope')
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe('UNKNOWN_DIMENSION');
      });
  });

  it('normalizes validation failures', async () => {
    await request(app.getHttpServer()).post('/api/screens').send({}).expect(400);
    await request(app.getHttpServer()).post('/api/screens').send({ name: '' }).expect(400);
  });

  /**
   * 数据集接口的 HTTP 层断言（PRD §6.1 / §6.3）：形状、错误码映射与 `?fail=500` 注入
   * 只有走真实管道（ValidationPipe + AllExceptionsFilter）才验证得到。
   */
  it('serves the dataset catalog with query / groupId / limit', async () => {
    const all = await request(app.getHttpServer()).get('/api/datasets').expect(200);
    expect((all.body.items as unknown[]).length).toBe(4);
    expect((all.body.groups as { id: string }[]).map((group) => group.id)).toEqual([
      'production',
      'alarm',
    ]);

    const filtered = await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ query: '告警' })
      .expect(200);
    expect((filtered.body.items as { datasetId: string }[]).map((item) => item.datasetId)).toEqual([
      'monitor.alarms',
    ]);
    expect((filtered.body.groups as { id: string }[]).map((group) => group.id)).toEqual(['alarm']);
  });

  it('serves the dataset definition and a deterministic query', async () => {
    const described = await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices')
      .expect(200);
    expect((described.body.fields as unknown[]).length).toBe(5);
    expect((described.body.parameters as unknown[]).length).toBe(2);
    expect(
      (described.body.parameters as { allowedValues?: readonly unknown[] }[])[0]?.allowedValues,
    ).toEqual(['LINE-A', 'LINE-B', 'LINE-C']);

    const first = await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', limit: 48 })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', limit: 48 })
      .expect(200);

    // 同参数两次响应必须字节级一致（例外只有 ?fail= 注入）。
    expect(second.text).toBe(first.text);
    expect((first.body.fields as unknown[]).length).toBe(5);
    expect(first.body.fields).toEqual(described.body.fields);
    expect((first.body.rows as unknown[]).length).toBe(48);
    expect(first.body.totalRowCount).toBe(48);
    expect(
      (first.body.rows as { status: string }[]).filter((row) => row.status === 'fault'),
    ).toHaveLength(3);

    // 合法空集：200 且 rows 为空，不是错误。
    const empty = await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-C' })
      .expect(200);
    expect(empty.body.rows).toEqual([]);
    expect(empty.body.totalRowCount).toBe(0);
  });

  it('maps illegal dataset parameters to stable error codes', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-Z' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'UNKNOWN_LINE' });
      });

    await request(app.getHttpServer())
      .get('/api/datasets/monitor.alarms/query')
      .query({ line: 'LINE-A', window: 0 })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_WINDOW' });
      });

    await request(app.getHttpServer())
      .get('/api/datasets/monitor.alarms/query')
      .query({ line: 'LINE-A', level: 'fatal' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'UNKNOWN_LEVEL' });
      });

    await request(app.getHttpServer())
      .get('/api/datasets/monitor.pipeline/query')
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'MISSING_PARAMETER' });
      });

    // 未声明的参数被 forbidNonWhitelisted 拒绝（端口不下发 componentId）。
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', componentId: 'c-1' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });

    await request(app.getHttpServer())
      .get('/api/datasets/monitor.nope')
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'UNKNOWN_DATASET' });
      });
  });

  it('injects a 500 through the dataset query only outside production', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', fail: '500' })
      .expect(500)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INJECTED_FAILURE' });
        expect(typeof response.body.message).toBe('string');
      });

    // 未知的注入模式按未声明参数处理，不会静默成功。
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', fail: 'nope' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });
  });

  /**
   * 故障注入**只挂在 query 上**（架构 §4.5）：`list` / `describe` 没有 `fail` 字段，
   * 因此 `?fail=500` 在这两条路由上必须被 `forbidNonWhitelisted` 拒成 400，而不是
   * 悄悄生效。若将来有人把 `fail` 加进 `ListDatasetsDto`，数据面板会整体空白，
   * 断言的就不再是「查询失败」而是「面板坏了」——这条断言就是那道护栏。
   */
  it('keeps the failure injection off the catalog and definition routes', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets')
      .query({ fail: '500' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });

    // 不带开关时同一条 query 必须成功：500 只在 `?fail=500` 下出现。
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A' })
      .expect(200);
  });

  /**
   * `describe` 也必须拒绝未声明的 query 参数（B3）：没有 `@Query()` 时 Nest 不跑
   * ValidationPipe，`?bogus=1` 会被静默忽略成 200，`?fail=500` 甚至会"漏"到面板路径上。
   */
  it('rejects undeclared parameters on the definition route', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices')
      .query({ bogus: '1' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });

    // 故障注入只属于 query 路由：即使开关打开，describe 上的 `?fail=500` 也是 400。
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices')
      .query({ fail: '500' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });

    // 不带任何参数时仍然 200。
    await request(app.getHttpServer()).get('/api/datasets/monitor.devices').expect(200);
  });

  /**
   * 取值域（`limit` 区间）刻意**不**放进 DTO，否则越界会退化成笼统的 `INVALID_REQUEST`，
   * 而契约承诺的是 `INVALID_LIMIT`。DTO 只做形状校验（是不是整数），区间由 service
   * 失败关闭地判定。
   */
  it('reports out-of-range limits with the domain code, not the shape code', async () => {
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', limit: 999 })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_LIMIT' });
      });

    // 形状非法（不是整数）才走 DTO 的 INVALID_REQUEST。
    await request(app.getHttpServer())
      .get('/api/datasets/monitor.devices/query')
      .query({ line: 'LINE-A', limit: 'forty-eight' })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({ error: 'INVALID_REQUEST' });
      });
  });
});

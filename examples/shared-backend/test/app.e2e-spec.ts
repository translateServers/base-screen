import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * e2e 走真实 AppModule（含全局管道/过滤器/拦截器）与真实 SQLite 测试库
 * （DATABASE_URL 见 test/setup-env.ts，迁移由 test/global-setup.ts 应用）。
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
});

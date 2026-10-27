import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TYPE = 'host.online.kpi-e2e';
const CODE = 'class OnlineKpi extends HTMLElement {}\nexport default OnlineKpi;\n';

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: TYPE,
    tagName: 'host-online-kpi-e2e-build1',
    name: '在线 KPI 测试',
    libraryVisible: true,
    ...overrides,
  };
}

describe('online material packages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let packageId = '';
  let screenId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
    await prisma.materialPackage.deleteMany();
  });

  afterAll(async () => {
    if (screenId !== '') await prisma.screen.deleteMany({ where: { id: screenId } });
    await prisma.materialPackage.deleteMany();
    await app.close();
  });

  it('rejects reserved types, mismatched manifests, and non-module code', async () => {
    const server = app.getHttpServer();
    const reserved = await request(server)
      .post('/api/material-packages')
      .send({
        type: 'base.image',
        name: '保留类型',
        manifest: manifest({ type: 'base.image', name: '保留类型' }),
        code: CODE,
      })
      .expect(400);
    expect(reserved.body.error).toBe('INVALID_REQUEST');

    const mismatch = await request(server)
      .post('/api/material-packages')
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest({ type: 'host.online.other' }),
        code: CODE,
      })
      .expect(400);
    expect(mismatch.body.error).toBe('MATERIAL_MANIFEST_INVALID');

    const noExport = await request(server)
      .post('/api/material-packages')
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest(),
        code: 'class OnlineKpi extends HTMLElement {}',
      })
      .expect(400);
    expect(noExport.body.error).toBe('MATERIAL_CODE_INVALID');
  });

  it('creates, updates with revision lock, and toggles visibility', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/material-packages')
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest(),
        code: CODE,
      })
      .expect(201);
    packageId = created.body.package.id as string;
    expect(created.body.package).toMatchObject({
      type: TYPE,
      revision: 1,
      manifest: expect.objectContaining({ libraryVisible: true }),
    });

    const duplicate = await request(server)
      .post('/api/material-packages')
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest(),
        code: CODE,
      })
      .expect(409);
    expect(duplicate.body.error).toBe('MATERIAL_TYPE_EXISTS');

    const stale = await request(server)
      .put(`/api/material-packages/${packageId}`)
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest(),
        code: CODE,
        revision: 99,
      })
      .expect(409);
    expect(stale.body.error).toBe('REVISION_CONFLICT');

    const updated = await request(server)
      .put(`/api/material-packages/${packageId}`)
      .send({
        type: TYPE,
        name: '在线 KPI 测试',
        manifest: manifest({ tagName: 'host-online-kpi-e2e-build2' }),
        code: CODE.replace('OnlineKpi', 'OnlineKpiV2'),
        revision: 1,
      })
      .expect(200);
    expect(updated.body.package.revision).toBe(2);
    expect(updated.body.package.manifest.tagName).toBe('host-online-kpi-e2e-build2');

    const hidden = await request(server)
      .patch(`/api/material-packages/${packageId}/visibility`)
      .send({ visible: false })
      .expect(200);
    expect(hidden.body.package.manifest.libraryVisible).toBe(false);

    const shown = await request(server)
      .patch(`/api/material-packages/${packageId}/visibility`)
      .send({ visible: true })
      .expect(200);
    expect(shown.body.package.manifest.libraryVisible).toBe(true);

    const list = await request(server).get('/api/material-packages').expect(200);
    expect(list.body.packages).toHaveLength(1);
  });

  it('blocks deletion while a screen references the material type', async () => {
    const server = app.getHttpServer();
    screenId = randomUUID();
    await prisma.screen.create({
      data: {
        id: screenId,
        name: '引用在线物料的大屏',
        document: JSON.stringify({
          canvas: { width: 100, height: 100, backgroundColor: '#000000' },
          components: [{ id: 'online-1', type: TYPE }],
          variables: [],
          blueprint: { relations: [] },
        }),
      },
    });

    const blocked = await request(server).delete(`/api/material-packages/${packageId}`).expect(409);
    expect(blocked.body.error).toBe('MATERIAL_IN_USE');
    expect(blocked.body.refScreens).toEqual([{ id: screenId, name: '引用在线物料的大屏' }]);

    await prisma.screen.delete({ where: { id: screenId } });
    screenId = '';

    await request(server).delete(`/api/material-packages/${packageId}`).expect(200);
    await request(server).get('/api/material-packages').expect(200).expect({ packages: [] });
  });
});

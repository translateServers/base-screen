import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAssetPng } from '../src/assets/asset-images';
import { AssetsService } from '../src/assets/assets.service';
import { PrismaService } from '../src/prisma/prisma.service';

const ASSET_DIR = resolve(process.env.ASSET_DIR ?? 'data/assets/test');
const PNG = createAssetPng({
  width: 32,
  height: 24,
  top: [12, 32, 52],
  bottom: [206, 222, 228],
  accent: [245, 227, 189],
});

describe('host assets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let assetId = '';
  let screenId = '';

  beforeAll(async () => {
    await rm(ASSET_DIR, { recursive: true, force: true });
    await mkdir(ASSET_DIR, { recursive: true });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService, { strict: false });
    await prisma.asset.deleteMany();
  });

  afterAll(async () => {
    if (screenId !== '') await prisma.screen.deleteMany({ where: { id: screenId } });
    await prisma.asset.deleteMany();
    await rm(ASSET_DIR, { recursive: true, force: true });
    await app.close();
  });

  it('starts empty and rejects non-bitmap or spoofed uploads', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/assets').expect(200).expect({ assets: [], total: 0 });

    const unsupported = await request(server)
      .post('/api/assets')
      .attach('file', Buffer.from('vector'), {
        filename: 'icon.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
    expect(unsupported.body.error).toBe('ASSET_TYPE_UNSUPPORTED');

    const spoofed = await request(server)
      .post('/api/assets')
      .attach('file', Buffer.from('not a png'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(spoofed.body.error).toBe('ASSET_CONTENT_INVALID');
  });

  it('uploads an image, serves its content, and exposes no URL in identities', async () => {
    const server = app.getHttpServer();
    const uploaded = await request(server)
      .post('/api/assets')
      .attach('file', PNG, { filename: 'demo.png', contentType: 'image/png' })
      .expect(201);

    assetId = uploaded.body.asset.id as string;
    expect(uploaded.body.asset).toMatchObject({
      name: 'demo',
      mimeType: 'image/png',
      byteSize: PNG.length,
      referenceCount: 0,
    });
    expect(uploaded.body.asset.contentPath).toBe(`/assets/${assetId}/content`);
    expect(uploaded.body.asset).not.toHaveProperty('url');

    const content = await request(server)
      .get(`/api/assets/${assetId}/content`)
      .expect(200)
      .expect('Content-Type', /image\/png/);
    expect(Buffer.isBuffer(content.body)).toBe(true);
    if (Buffer.isBuffer(content.body)) expect(content.body.equals(PNG)).toBe(true);

    const list = await request(server).get('/api/assets').expect(200);
    expect(list.body.assets).toHaveLength(1);
    expect(list.body.assets[0].referenceCount).toBe(0);
  });

  it('blocks deletion while a saved screen references the asset', async () => {
    const server = app.getHttpServer();
    screenId = randomUUID();
    await prisma.screen.create({
      data: {
        id: screenId,
        name: '引用素材的大屏',
        document: JSON.stringify({
          canvas: { width: 100, height: 100, backgroundColor: '#000000' },
          components: [
            {
              id: 'image-1',
              type: 'base.image',
              dataSource: {
                type: 'host-resource',
                resourceType: 'host_image',
                resourceId: assetId,
                params: {},
                binding: null,
              },
            },
          ],
          variables: [],
          blueprint: { relations: [] },
        }),
      },
    });

    const list = await request(server).get('/api/assets').expect(200);
    expect(list.body.assets[0].referenceCount).toBe(1);

    const blocked = await request(server).delete(`/api/assets/${assetId}`).expect(409);
    expect(blocked.body.error).toBe('ASSET_IN_USE');
    expect(blocked.body.refScreens).toEqual([{ id: screenId, name: '引用素材的大屏' }]);

    await prisma.screen.delete({ where: { id: screenId } });
    screenId = '';

    // 画布背景是 URL 例外：宿主用自己的稳定内容路径识别引用并继续保护。
    screenId = randomUUID();
    await prisma.screen.create({
      data: {
        id: screenId,
        name: '用素材做背景的大屏',
        document: JSON.stringify({
          canvas: {
            width: 100,
            height: 100,
            backgroundColor: '#000000',
            backgroundImage: `/api/assets/${assetId}/content`,
          },
          components: [],
          variables: [],
          blueprint: { relations: [] },
        }),
      },
    });
    const backgroundBlocked = await request(server).delete(`/api/assets/${assetId}`).expect(409);
    expect(backgroundBlocked.body.refScreens).toEqual([
      { id: screenId, name: '用素材做背景的大屏' },
    ]);

    await prisma.screen.delete({ where: { id: screenId } });
    screenId = '';

    await request(server).delete(`/api/assets/${assetId}`).expect(200);
    await request(server).get(`/api/assets/${assetId}/content`).expect(404);
    await request(server).get('/api/assets').expect(200).expect({ assets: [], total: 0 });
  });

  it('keeps temporary uploads scoped to their screen and renews them on save', async () => {
    const server = app.getHttpServer();
    screenId = randomUUID();
    await prisma.screen.create({
      data: {
        id: screenId,
        name: '临时素材宿主',
        document: JSON.stringify(emptyScreenDocument()),
      },
    });

    const uploaded = await request(server)
      .post(`/api/assets?scope=temporary&screenId=${screenId}`)
      .attach('file', PNG, { filename: 'temp.png', contentType: 'image/png' })
      .expect(201);
    const tempId = uploaded.body.asset.id as string;
    expect(uploaded.body.asset).toMatchObject({
      temporary: true,
      screenId,
      screenName: '临时素材宿主',
      referenceCount: 0,
    });
    expect(typeof uploaded.body.asset.expiresAt).toBe('string');

    // 默认列表只返回公共素材；设计器按 screenId 取公共 + 本屏临时。
    await request(server).get('/api/assets').expect(200).expect({ assets: [], total: 0 });
    const visible = await request(server).get(`/api/assets?screenId=${screenId}`).expect(200);
    expect(visible.body.assets.map((asset: { id: string }) => asset.id)).toEqual([tempId]);
    const admin = await request(server).get('/api/assets?scope=temporary').expect(200);
    expect(admin.body.assets[0]).toMatchObject({
      id: tempId,
      screenId,
      screenName: '临时素材宿主',
    });

    // 冲突参数与缺失 screenId 都拒绝。
    await request(server).get(`/api/assets?scope=temporary&screenId=${screenId}`).expect(400);
    await request(server)
      .post('/api/assets?scope=temporary')
      .attach('file', PNG, { filename: 'bad.png', contentType: 'image/png' })
      .expect(400);
    await request(server)
      .post(`/api/assets?scope=public&screenId=${screenId}`)
      .attach('file', PNG, { filename: 'bad.png', contentType: 'image/png' })
      .expect(400);

    await request(server)
      .get(`/api/assets/${tempId}/content`)
      .expect(200)
      .expect('Cache-Control', 'no-store');

    // 保存引用 temp 素材的文档：续期并进入引用保护。
    await prisma.asset.update({
      where: { id: tempId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const document = emptyScreenDocument();
    document.components.push({
      id: 'image-1',
      type: 'base.image',
      dataSource: {
        type: 'host-resource',
        resourceType: 'host_image',
        resourceId: tempId,
        params: {},
        binding: null,
      },
    });
    await request(server)
      .put(`/api/screens/${screenId}`)
      .send({ document, revision: 1 })
      .expect(200);
    const renewed = await prisma.asset.findUnique({ where: { id: tempId } });
    expect(renewed?.expiresAt?.getTime() ?? 0).toBeGreaterThan(Date.now());
    const referenced = await request(server).get('/api/assets?scope=temporary').expect(200);
    expect(referenced.body.assets[0].referenceCount).toBe(1);
    await request(server).delete(`/api/assets/${tempId}`).expect(409);

    // 过期但被引用：sweep 续期而不是删除。
    await prisma.asset.update({
      where: { id: tempId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await app.get(AssetsService).sweepExpiredTemporaryAssets();
    expect(await prisma.asset.findUnique({ where: { id: tempId } })).not.toBeNull();

    // 删除大屏后回收该屏未再被引用的临时素材。
    await request(server).delete(`/api/screens/${screenId}`).expect(200);
    screenId = '';
    expect(await prisma.asset.findUnique({ where: { id: tempId } })).toBeNull();
    expect(existsSync(resolve(ASSET_DIR, `${tempId}.png`))).toBe(false);
    await request(server)
      .get('/api/assets?scope=temporary')
      .expect(200)
      .expect({ assets: [], total: 0 });
  });

  it('sweeps expired unreferenced temporary assets but keeps public assets', async () => {
    const server = app.getHttpServer();
    const publicUpload = await request(server)
      .post('/api/assets')
      .attach('file', PNG, { filename: 'public.png', contentType: 'image/png' })
      .expect(201);
    const publicId = publicUpload.body.asset.id as string;
    screenId = randomUUID();
    await prisma.screen.create({
      data: {
        id: screenId,
        name: '临时素材回收',
        document: JSON.stringify(emptyScreenDocument()),
      },
    });
    const tempUpload = await request(server)
      .post(`/api/assets?scope=temporary&screenId=${screenId}`)
      .attach('file', PNG, { filename: 'expired.png', contentType: 'image/png' })
      .expect(201);
    const tempId = tempUpload.body.asset.id as string;
    await prisma.asset.update({
      where: { id: tempId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const removed = await app.get(AssetsService).sweepExpiredTemporaryAssets();
    expect(removed).toBe(1);
    expect(await prisma.asset.findUnique({ where: { id: tempId } })).toBeNull();
    expect(existsSync(resolve(ASSET_DIR, `${tempId}.png`))).toBe(false);
    expect(await prisma.asset.findUnique({ where: { id: publicId } })).not.toBeNull();

    await request(server).delete(`/api/screens/${screenId}`).expect(200);
    screenId = '';
    await request(server).delete(`/api/assets/${publicId}`).expect(200);
  });

  it('does not resolve unknown or path-like ids', async () => {
    await request(app.getHttpServer()).get('/api/assets/unknown/content').expect(404);
    await request(app.getHttpServer()).get('/api/assets/..%2F..%2Fscreens.db/content').expect(404);
  });
});

function emptyScreenDocument(): {
  canvas: { width: number; height: number; backgroundColor: string };
  components: unknown[];
  variables: unknown[];
  blueprint: { relations: unknown[] };
} {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
  };
}

import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createAssetPng } from '../src/assets/asset-images';
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
    await request(server).get('/api/assets').expect(200).expect({ assets: [] });

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
          blueprint: { rules: [] },
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
          blueprint: { rules: [] },
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
    await request(server).get('/api/assets').expect(200).expect({ assets: [] });
  });

  it('does not resolve unknown or path-like ids', async () => {
    await request(app.getHttpServer()).get('/api/assets/unknown/content').expect(404);
    await request(app.getHttpServer()).get('/api/assets/..%2F..%2Fscreens.db/content').expect(404);
  });
});

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type AssetPngSpec, createAssetPng } from './asset-images';
import { hostAssetDir } from './assets.service';

interface DemoAssetSpec extends AssetPngSpec {
  readonly name: string;
}

const DEMO_ASSETS: readonly DemoAssetSpec[] = [
  {
    name: '海岸晨雾',
    width: 640,
    height: 400,
    top: [12, 32, 52],
    bottom: [206, 222, 228],
    accent: [245, 227, 189],
  },
  {
    name: '城市夜色',
    width: 640,
    height: 400,
    top: [8, 16, 28],
    bottom: [24, 48, 70],
    accent: [240, 201, 135],
  },
  {
    name: '沙丘纹理',
    width: 640,
    height: 400,
    top: [233, 227, 215],
    bottom: [182, 168, 145],
    accent: [245, 227, 189],
  },
  {
    name: '极光',
    width: 640,
    height: 400,
    top: [6, 26, 28],
    bottom: [20, 68, 74],
    accent: [123, 196, 168],
  },
  {
    name: '暖光车间',
    width: 640,
    height: 400,
    top: [28, 18, 13],
    bottom: [98, 50, 30],
    accent: [243, 192, 125],
  },
  {
    name: '远山',
    width: 640,
    height: 400,
    top: [205, 223, 233],
    bottom: [159, 182, 196],
    accent: [255, 255, 255],
  },
];

/** 空素材库时生成一组确定性演示图片；ASSET_SEED=0 可关闭（测试隔离用）。 */
@Injectable()
export class AssetSeedService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.ASSET_SEED === '0') return;
    // 只以公共素材判断是否已播种：临时素材不应阻止演示素材补种。
    if ((await this.prisma.asset.count({ where: { temporary: false } })) > 0) return;
    await mkdir(hostAssetDir(), { recursive: true });
    for (const spec of DEMO_ASSETS) {
      const id = randomUUID();
      const png = createAssetPng(spec);
      await writeFile(resolve(hostAssetDir(), `${id}.png`), png);
      await this.prisma.asset.create({
        data: {
          id,
          name: spec.name,
          mimeType: 'image/png',
          extension: '.png',
          byteSize: png.length,
        },
      });
    }
    new Logger('AssetSeed').log(`Seeded ${DEMO_ASSETS.length} demo assets.`);
  }
}

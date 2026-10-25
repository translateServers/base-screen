import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Asset as AssetRecord } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSET_MAX_BYTES,
  ASSET_MIME_EXTENSIONS,
  type AssetReference,
  type AssetShape,
  HOST_ASSET_RESOURCE_TYPE,
  type UploadedAssetFile,
} from './asset.types';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 与 datasource-path 同一解析口径：dev / dist / ts-jest 都落在包内 data/。 */
export function hostAssetDir(): string {
  const configured = process.env.ASSET_DIR;
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim());
  return resolve(__dirname, '..', '..', 'data', 'assets');
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<readonly AssetShape[]> {
    const [rows, screens] = await Promise.all([
      this.prisma.asset.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.screen.findMany({ select: { document: true } }),
    ]);
    const documents: unknown[] = [];
    for (const screen of screens) {
      try {
        documents.push(JSON.parse(screen.document));
      } catch {
        // 损坏文档由大屏读取路径负责报错；素材列表不为它伪造引用。
      }
    }
    return rows.map((row) =>
      toAssetShape(row, documents.filter((document) => referencesAsset(document, row.id)).length),
    );
  }

  async content(id: string): Promise<{ readonly buffer: Buffer; readonly asset: AssetShape }> {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (row === null) throw assetNotFound();
    const absolutePath = resolve(hostAssetDir(), `${row.id}${row.extension}`);
    if (!existsSync(absolutePath)) throw assetNotFound();
    return { buffer: await readFile(absolutePath), asset: toAssetShape(row) };
  }

  async upload(file: UploadedAssetFile | undefined): Promise<AssetShape> {
    if (file === undefined) {
      throw new BadRequestException({
        error: 'ASSET_FILE_REQUIRED',
        message: '请选择要上传的图片文件。',
      });
    }
    try {
      const buffer = await readFile(file.path);
      const extension = ASSET_MIME_EXTENSIONS.get(file.mimetype);
      if (extension === undefined) {
        throw new BadRequestException({
          error: 'ASSET_TYPE_UNSUPPORTED',
          message: '只支持 PNG / JPEG / WebP / GIF 图片。',
        });
      }
      if (file.size <= 0 || buffer.length === 0) {
        throw new BadRequestException({ error: 'ASSET_FILE_EMPTY', message: '图片文件为空。' });
      }
      if (file.size > ASSET_MAX_BYTES || buffer.length > ASSET_MAX_BYTES) {
        throw new BadRequestException({
          error: 'ASSET_TOO_LARGE',
          message: `图片不能超过 ${ASSET_MAX_BYTES / 1024 / 1024} MB。`,
        });
      }
      if (!matchesImageSignature(buffer, file.mimetype)) {
        throw new BadRequestException({
          error: 'ASSET_CONTENT_INVALID',
          message: '文件内容与声明的图片类型不一致。',
        });
      }

      const id = randomUUID();
      const name = displayName(file.originalname);
      await this.ensureDirectory();
      const absolutePath = resolve(hostAssetDir(), `${id}${extension}`);
      await writeFile(absolutePath, buffer);
      try {
        const row = await this.prisma.asset.create({
          data: {
            id,
            name,
            mimeType: file.mimetype,
            extension,
            byteSize: buffer.length,
          },
        });
        return toAssetShape(row);
      } catch (error) {
        await rm(absolutePath, { force: true });
        throw error;
      }
    } finally {
      await rm(file.path, { force: true });
    }
  }

  async remove(id: string): Promise<{ readonly deleted: true; readonly id: string }> {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (row === null) throw assetNotFound();
    const references = await this.screenReferences(id);
    if (references.length > 0) {
      throw new ConflictException({
        error: 'ASSET_IN_USE',
        message: '素材正被大屏引用，先替换引用后再删除。',
        refScreens: references,
      });
    }
    await this.prisma.asset.delete({ where: { id } });
    await rm(resolve(hostAssetDir(), `${row.id}${row.extension}`), { force: true });
    return { deleted: true, id };
  }

  /** 宿主自己的引用扫描：文档里的 host-resource 身份是唯一的引用依据。 */
  async screenReferences(assetId: string): Promise<readonly AssetReference[]> {
    const screens = await this.prisma.screen.findMany({
      select: { id: true, name: true, document: true },
    });
    const references: AssetReference[] = [];
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        continue;
      }
      if (referencesAsset(document, assetId)) {
        references.push({ id: screen.id, name: screen.name });
      }
    }
    return references;
  }

  async ensureDirectory(): Promise<void> {
    await mkdir(hostAssetDir(), { recursive: true });
  }
}

function toAssetShape(row: AssetRecord, referenceCount = 0): AssetShape {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    contentPath: `/assets/${encodeURIComponent(row.id)}/content`,
    referenceCount,
    createdAt: row.createdAt.toISOString(),
  };
}

function assetNotFound(): NotFoundException {
  return new NotFoundException({ error: 'ASSET_NOT_FOUND', message: '素材不存在或已被删除。' });
}

function displayName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const withoutExtension = base.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
  const bounded = [...cleaned].slice(0, 120).join('');
  return bounded.length > 0 ? bounded : '未命名素材';
}

function matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
  }
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function referencesAsset(value: unknown, assetId: string): boolean {
  if (Array.isArray(value)) return value.some((item) => referencesAsset(item, assetId));
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const isHostResource =
    (record.type === 'host-resource' || record.kind === 'host-resource') &&
    record.resourceType === HOST_ASSET_RESOURCE_TYPE &&
    record.resourceId === assetId;
  if (isHostResource) return true;
  // 画布背景是 URL 例外，但宿主仍可通过自己的稳定内容路径识别并保护它。
  const canvas = record.canvas;
  if (canvas !== null && typeof canvas === 'object') {
    const backgroundImage = (canvas as Record<string, unknown>).backgroundImage;
    if (
      typeof backgroundImage === 'string' &&
      backgroundImage.includes(`/assets/${encodeURIComponent(assetId)}/content`)
    ) {
      return true;
    }
  }
  return Object.values(record).some((child) => referencesAsset(child, assetId));
}

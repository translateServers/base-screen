import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Asset as AssetRecord } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ASSET_MAX_BYTES,
  ASSET_MIME_EXTENSIONS,
  ASSET_TEMPORARY_TTL_MS,
  type AssetReference,
  type AssetScope,
  type AssetShape,
  HOST_ASSET_RESOURCE_TYPE,
  type UploadedAssetFile,
} from './asset.types';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ASSET_CONTENT_URL_PATTERN = /\/assets\/([^/?#]+)\/content/g;

export interface AssetListQuery {
  readonly scope?: AssetScope;
  readonly screenId?: string;
  /** 名称关键字；不传或空串表示不筛。 */
  readonly q?: string;
  /** 分页：两者都不传时返回全量（素材库面板依赖这个行为）。 */
  readonly limit?: number;
  readonly offset?: number;
}

export interface AssetUploadOptions {
  readonly scope?: AssetScope;
  readonly screenId?: string;
}

/** 与 datasource-path 同一解析口径：dev / dist / ts-jest 都落在包内 data/。 */
export function hostAssetDir(): string {
  const configured = process.env.ASSET_DIR;
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim());
  return resolve(__dirname, '..', '..', 'data', 'assets');
}

/**
 * 从 Screen Document 收集素材引用：组件 `host_image` 身份 + 画布背景 URL。
 * 删除保护、续期与过期清理必须共用这一份扫描口径。
 */
export function collectReferencedAssetIds(value: unknown): ReadonlySet<string> {
  const ids = new Set<string>();
  collectReferencedAssetIdsInto(value, ids);
  return ids;
}

function collectReferencedAssetIdsInto(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedAssetIdsInto(item, ids);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const isHostResource =
    (record.type === 'host-resource' || record.kind === 'host-resource') &&
    record.resourceType === HOST_ASSET_RESOURCE_TYPE &&
    typeof record.resourceId === 'string';
  if (isHostResource) ids.add(record.resourceId as string);

  const canvas = record.canvas;
  if (canvas !== null && typeof canvas === 'object') {
    const backgroundImage = (canvas as Record<string, unknown>).backgroundImage;
    if (typeof backgroundImage === 'string') {
      for (const match of backgroundImage.matchAll(ASSET_CONTENT_URL_PATTERN)) {
        const encodedId = match[1];
        if (encodedId === undefined) continue;
        try {
          ids.add(decodeURIComponent(encodedId));
        } catch {
          // 畸形编码不构成引用，交给宿主 UI 的 URL 校验处理。
        }
      }
    }
  }
  for (const child of Object.values(record)) collectReferencedAssetIdsInto(child, ids);
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger('AssetsService');

  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AssetListQuery = {},
  ): Promise<{ readonly assets: readonly AssetShape[]; readonly total: number }> {
    const temporaryOnly = query.scope === 'temporary';
    if (temporaryOnly && query.screenId !== undefined) {
      throw new BadRequestException({
        error: 'ASSET_SCOPE_INVALID',
        message: '临时素材列表不能同时指定大屏；后台查看用 scope=temporary。',
      });
    }
    if (query.scope === 'public' && query.screenId !== undefined) {
      throw new BadRequestException({
        error: 'ASSET_SCOPE_INVALID',
        message: '公共素材列表不能按大屏过滤。',
      });
    }
    if (query.screenId !== undefined) await this.requireScreen(query.screenId);

    const scopeWhere =
      query.screenId !== undefined
        ? { OR: [{ temporary: false }, { temporary: true, screenId: query.screenId }] }
        : temporaryOnly
          ? { temporary: true }
          : { temporary: false };
    // 关键字只按名称做包含匹配：素材没有标签体系，搜说明会搜出用户想不到的结果。
    const where =
      query.q === undefined || query.q.trim() === ''
        ? scopeWhere
        : { AND: [scopeWhere, { name: { contains: query.q.trim() } }] };
    const paging =
      query.limit === undefined
        ? {}
        : { take: query.limit, ...(query.offset === undefined ? {} : { skip: query.offset }) };

    const [rows, total, screens] = await Promise.all([
      this.prisma.asset.findMany({ where, orderBy: { createdAt: 'desc' }, ...paging }),
      // 只在分页时统计总数：全量调用方自己就有数组长度，多一次 count 没意义。
      query.limit === undefined ? Promise.resolve(undefined) : this.prisma.asset.count({ where }),
      this.prisma.screen.findMany({
        select: { id: true, name: true, document: true },
      }),
    ]);

    const referenceCounts = new Map<string, number>();
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        // 损坏文档由大屏读取路径负责报错；素材列表不为它伪造引用。
        continue;
      }
      for (const assetId of collectReferencedAssetIds(document)) {
        referenceCounts.set(assetId, (referenceCounts.get(assetId) ?? 0) + 1);
      }
    }
    const screenNames = new Map(screens.map((screen) => [screen.id, screen.name]));
    const assets = rows.map((row) =>
      toAssetShape(
        row,
        referenceCounts.get(row.id) ?? 0,
        row.screenId === null ? null : (screenNames.get(row.screenId) ?? null),
      ),
    );
    // 分页调用方要「共多少项」；全量调用方拿到的 total 就等于数组长度。
    return { assets, total: total ?? assets.length };
  }

  async content(id: string): Promise<{ readonly buffer: Buffer; readonly asset: AssetShape }> {
    const row = await this.prisma.asset.findUnique({ where: { id } });
    if (row === null) throw assetNotFound();
    const absolutePath = resolve(hostAssetDir(), `${row.id}${row.extension}`);
    if (!existsSync(absolutePath)) throw assetNotFound();
    return { buffer: await readFile(absolutePath), asset: toAssetShape(row) };
  }

  async upload(
    file: UploadedAssetFile | undefined,
    options: AssetUploadOptions = {},
  ): Promise<AssetShape> {
    if (file === undefined) {
      throw new BadRequestException({
        error: 'ASSET_FILE_REQUIRED',
        message: '请选择要上传的图片文件。',
      });
    }
    try {
      const temporary = options.scope === 'temporary';
      const screenId = temporary ? options.screenId : undefined;
      if (temporary && screenId === undefined) {
        throw new BadRequestException({
          error: 'ASSET_SCOPE_INVALID',
          message: '临时上传必须指定 screenId。',
        });
      }
      if (!temporary && options.screenId !== undefined) {
        throw new BadRequestException({
          error: 'ASSET_SCOPE_INVALID',
          message: '只有 scope=temporary 的上传可以指定 screenId。',
        });
      }
      const screenName = screenId === undefined ? null : await this.requireScreen(screenId);
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
            temporary,
            screenId: screenId ?? null,
            expiresAt: temporary ? new Date(Date.now() + ASSET_TEMPORARY_TTL_MS) : null,
          },
        });
        return toAssetShape(row, 0, screenName);
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

  /** 宿主自己的引用扫描：文档里的 host-resource 身份与背景 URL 是唯一依据。 */
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
      if (collectReferencedAssetIds(document).has(assetId)) {
        references.push({ id: screen.id, name: screen.name });
      }
    }
    return references;
  }

  /** 保存大屏后为仍被文档引用的临时素材续期；公共素材不受影响。 */
  async renewTemporaryAssets(document: unknown): Promise<void> {
    const ids = [...collectReferencedAssetIds(document)];
    if (ids.length === 0) return;
    await this.prisma.asset.updateMany({
      where: { id: { in: ids }, temporary: true },
      data: { expiresAt: new Date(Date.now() + ASSET_TEMPORARY_TTL_MS) },
    });
  }

  /** 删除大屏后回收该屏绑定、且不再被任何剩余大屏引用的临时素材。 */
  async deleteTemporaryAssetsForScreen(screenId: string): Promise<number> {
    const candidates = await this.prisma.asset.findMany({
      where: { temporary: true, screenId },
    });
    if (candidates.length === 0) return 0;
    const referenced = await this.referencedAssetIds();
    const removable = candidates.filter((row) => !referenced.has(row.id));
    await this.deleteAssetsWithFiles(removable);
    return removable.length;
  }

  /**
   * 过期回收：被已保存大屏引用的临时素材续期；无引用的删除行与文件。
   * 绑定屏已不存在或 screenId 为空的临时素材同样视为可回收候选。
   */
  async sweepExpiredTemporaryAssets(now = new Date()): Promise<number> {
    const [candidates, screens] = await Promise.all([
      this.prisma.asset.findMany({ where: { temporary: true } }),
      this.prisma.screen.findMany({ select: { id: true, document: true } }),
    ]);
    if (candidates.length === 0) return 0;
    const screenIds = new Set(screens.map((screen) => screen.id));
    const referenced = new Set<string>();
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        continue;
      }
      for (const assetId of collectReferencedAssetIds(document)) referenced.add(assetId);
    }

    const renewIds: string[] = [];
    const removable: AssetRecord[] = [];
    for (const asset of candidates) {
      const expired = asset.expiresAt === null || asset.expiresAt.getTime() <= now.getTime();
      const orphaned = asset.screenId === null || !screenIds.has(asset.screenId);
      if (!expired && !orphaned) continue;
      if (referenced.has(asset.id)) {
        if (expired) renewIds.push(asset.id);
        continue;
      }
      removable.push(asset);
    }

    if (renewIds.length > 0) {
      await this.prisma.asset.updateMany({
        where: { id: { in: renewIds } },
        data: { expiresAt: new Date(now.getTime() + ASSET_TEMPORARY_TTL_MS) },
      });
    }
    await this.deleteAssetsWithFiles(removable);
    return removable.length;
  }

  async ensureDirectory(): Promise<void> {
    await mkdir(hostAssetDir(), { recursive: true });
  }

  private async requireScreen(screenId: string): Promise<string> {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: { name: true },
    });
    if (screen === null) {
      throw new NotFoundException({ error: 'SCREEN_NOT_FOUND', message: '大屏不存在。' });
    }
    return screen.name;
  }

  private async referencedAssetIds(): Promise<ReadonlySet<string>> {
    const screens = await this.prisma.screen.findMany({ select: { document: true } });
    const referenced = new Set<string>();
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        continue;
      }
      for (const assetId of collectReferencedAssetIds(document)) referenced.add(assetId);
    }
    return referenced;
  }

  private async deleteAssetsWithFiles(rows: readonly AssetRecord[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.asset.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    await Promise.all(
      rows.map((row) =>
        rm(resolve(hostAssetDir(), `${row.id}${row.extension}`), { force: true }).catch((error) => {
          this.logger.warn(`删除临时素材文件失败：${row.id}${row.extension}`, error);
        }),
      ),
    );
  }
}

function toAssetShape(
  row: AssetRecord,
  referenceCount = 0,
  screenName: string | null = null,
): AssetShape {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    contentPath: `/assets/${encodeURIComponent(row.id)}/content`,
    referenceCount,
    temporary: row.temporary,
    screenId: row.screenId,
    screenName,
    expiresAt: row.expiresAt?.toISOString() ?? null,
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

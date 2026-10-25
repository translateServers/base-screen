import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { MaterialPackage as MaterialPackageRecord } from '../generated/prisma-client';
import { PrismaService } from '../prisma/prisma.service';
import type { SaveMaterialPackageDto, UpdateMaterialPackageDto } from './dto/material-package.dto';
import { ONLINE_MATERIAL_TYPE_PATTERN } from './dto/material-package.dto';
import {
  MAX_MATERIAL_CODE_BYTES,
  MAX_MATERIAL_MANIFEST_BYTES,
  type MaterialPackageReference,
  type MaterialPackageShape,
  ONLINE_MATERIAL_TYPE_PREFIX,
} from './material-package.types';

const TAG_NAME_PATTERN = /^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/;
const MAX_NAME_LENGTH = 80;

@Injectable()
export class MaterialPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<readonly MaterialPackageShape[]> {
    const rows = await this.prisma.materialPackage.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(toShape);
  }

  async create(dto: SaveMaterialPackageDto): Promise<MaterialPackageShape> {
    const manifest = normalizeManifest(dto);
    const existing = await this.prisma.materialPackage.findUnique({ where: { type: dto.type } });
    if (existing !== null) {
      throw new ConflictException({
        error: 'MATERIAL_TYPE_EXISTS',
        message: '该物料类型已存在；请编辑已有机型或换一个类型。',
      });
    }
    const row = await this.prisma.materialPackage.create({
      data: {
        type: dto.type,
        name: dto.name.trim(),
        code: dto.code,
        manifest: JSON.stringify(manifest),
      },
    });
    return toShape(row);
  }

  async update(id: string, dto: UpdateMaterialPackageDto): Promise<MaterialPackageShape> {
    const row = await this.findRow(id);
    if (dto.type !== row.type) {
      throw new BadRequestException({
        error: 'MATERIAL_TYPE_IMMUTABLE',
        message: '物料类型是文档身份，创建后不可修改。',
      });
    }
    if (dto.revision !== row.revision) {
      throw new ConflictException({
        error: 'REVISION_CONFLICT',
        message: '该物料包已被其他人更新，请刷新后重试。',
      });
    }
    const manifest = normalizeManifest(dto);
    const updated = await this.prisma.materialPackage.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        code: dto.code,
        manifest: JSON.stringify(manifest),
        revision: { increment: 1 },
      },
    });
    return toShape(updated);
  }

  async setVisibility(id: string, visible: boolean): Promise<MaterialPackageShape> {
    const row = await this.findRow(id);
    const manifest = readManifest(row);
    const updated = await this.prisma.materialPackage.update({
      where: { id },
      data: {
        manifest: JSON.stringify({ ...manifest, libraryVisible: visible }),
        revision: { increment: 1 },
      },
    });
    return toShape(updated);
  }

  async remove(id: string): Promise<{ readonly deleted: true; readonly id: string }> {
    const row = await this.findRow(id);
    const references = await this.screenReferences(row.type);
    if (references.length > 0) {
      throw new ConflictException({
        error: 'MATERIAL_IN_USE',
        message: '该物料仍被大屏引用，建议先下架（libraryVisible: false）而不是删除。',
        refScreens: references,
      });
    }
    await this.prisma.materialPackage.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** 文档里的 `component.type` 是物料引用的唯一依据。 */
  async screenReferences(materialType: string): Promise<readonly MaterialPackageReference[]> {
    const screens = await this.prisma.screen.findMany({
      select: { id: true, name: true, document: true },
    });
    const references: MaterialPackageReference[] = [];
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        continue;
      }
      if (documentReferencesType(document, materialType)) {
        references.push({ id: screen.id, name: screen.name });
      }
    }
    return references;
  }

  private async findRow(id: string): Promise<MaterialPackageRecord> {
    const row = await this.prisma.materialPackage.findUnique({ where: { id } });
    if (row === null) {
      throw new NotFoundException({
        error: 'MATERIAL_PACKAGE_NOT_FOUND',
        message: '在线物料包不存在或已被删除。',
      });
    }
    return row;
  }
}

function normalizeManifest(dto: SaveMaterialPackageDto): Readonly<Record<string, unknown>> {
  if (
    !ONLINE_MATERIAL_TYPE_PATTERN.test(dto.type) ||
    !dto.type.startsWith(ONLINE_MATERIAL_TYPE_PREFIX)
  ) {
    throw new BadRequestException({
      error: 'MATERIAL_TYPE_RESERVED',
      message: '在线物料类型必须使用 host.online.* 命名空间。',
    });
  }
  if (dto.name.trim().length === 0 || dto.name.trim().length > MAX_NAME_LENGTH) {
    throw new BadRequestException({
      error: 'MATERIAL_MANIFEST_INVALID',
      message: `物料名称必须为 1..${MAX_NAME_LENGTH} 个字符。`,
    });
  }
  const manifest = dto.manifest;
  if (
    manifest.type !== dto.type ||
    manifest.name !== dto.name.trim() ||
    typeof manifest.tagName !== 'string' ||
    !TAG_NAME_PATTERN.test(manifest.tagName)
  ) {
    throw new BadRequestException({
      error: 'MATERIAL_MANIFEST_INVALID',
      message: 'Manifest 的 type / name / tagName 与物料包不一致或格式非法。',
    });
  }
  const manifestText = JSON.stringify(manifest);
  if (Buffer.byteLength(manifestText, 'utf8') > MAX_MATERIAL_MANIFEST_BYTES) {
    throw new BadRequestException({
      error: 'MATERIAL_MANIFEST_TOO_LARGE',
      message: 'Manifest 超过 64 KiB。',
    });
  }
  if (Buffer.byteLength(dto.code, 'utf8') > MAX_MATERIAL_CODE_BYTES) {
    throw new BadRequestException({
      error: 'MATERIAL_CODE_TOO_LARGE',
      message: 'ESM 代码超过 200 KiB。',
    });
  }
  if (!/\bexport\s+default\b/.test(dto.code)) {
    throw new BadRequestException({
      error: 'MATERIAL_CODE_INVALID',
      message: 'ESM 代码必须 default export Custom Element 构造器。',
    });
  }
  return { ...manifest, libraryVisible: manifest.libraryVisible !== false };
}

function readManifest(row: MaterialPackageRecord): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.manifest);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function documentReferencesType(value: unknown, materialType: string): boolean {
  if (Array.isArray(value)) return value.some((item) => documentReferencesType(item, materialType));
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type === materialType) return true;
  return Object.values(record).some((child) => documentReferencesType(child, materialType));
}

function toShape(row: MaterialPackageRecord): MaterialPackageShape {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    code: row.code,
    manifest: readManifest(row),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

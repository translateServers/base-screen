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
import type { MaterialAttestation } from './material-attestation.service';
import { MaterialAttestationService } from './material-attestation.service';
import {
  MAX_MATERIAL_CODE_BYTES,
  MAX_MATERIAL_MANIFEST_BYTES,
  type MaterialPackageReference,
  type MaterialPackageShape,
  ONLINE_MATERIAL_TYPE_PREFIX,
} from './material-package.types';

const TAG_NAME_PATTERN = /^[a-z][a-z0-9._-]*-[a-z0-9._-]+$/;
/** L3 隔离代码物料的包代码里有这一行（ADR-0117 §3.6）；检测用，不解析规格。 */
const ISOLATED_SOURCE_EXPORT = /\bexport\s+const\s+source\s*=/;
/**
 * 组件工坊的规格模块（ADR-0105 / ADR-0116）：首行是固定标记，导出 `spec`（代码物料另导出 `render`，
 * L2 模板物料只有 `spec`）。宿主按规格加载，没有 default export。标记与宿主 `component-workshop.ts` 一致。
 */
const SPEC_MODULE_HEADER = '// base-screen spec material module (ADR-0105)';
const MAX_NAME_LENGTH = 80;

@Injectable()
export class MaterialPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attestation: MaterialAttestationService,
  ) {}

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
    const attestation = this.signIfIsolated(dto.code, dto.attestationMeta);
    const row = await this.prisma.materialPackage.create({
      data: {
        type: dto.type,
        name: dto.name.trim(),
        code: dto.code,
        manifest: JSON.stringify(manifest),
        attestation: attestation === undefined ? null : JSON.stringify(attestation),
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
    const attestation = this.signIfIsolated(dto.code, dto.attestationMeta);
    const updated = await this.prisma.materialPackage.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        code: dto.code,
        manifest: JSON.stringify(manifest),
        attestation: attestation === undefined ? null : JSON.stringify(attestation),
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

  /** 供 `GET /material-packages/public-key` 转发，不单独开路由到签名服务。 */
  publicKeyJwk(): Record<string, unknown> {
    return this.attestation.publicKeyJwk();
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

  /**
   * 只对 L3 隔离代码物料签名（ADR-0117 D11）；发布一律人工点按钮，所以审核人固定为
   * `component-workshop`，模型/提示哈希只在「让智能体起草」后发布时由前端带上（S5）。
   */
  private signIfIsolated(
    code: string,
    meta: { readonly model?: string; readonly promptHash?: string } | undefined,
  ): MaterialAttestation | undefined {
    if (!ISOLATED_SOURCE_EXPORT.test(code)) return undefined;
    return this.attestation.sign({
      code,
      reviewer: 'component-workshop',
      ...(meta?.model === undefined ? {} : { model: meta.model }),
      ...(meta?.promptHash === undefined ? {} : { promptHash: meta.promptHash }),
    });
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
  if (!isSpecMaterialModule(dto.code) && !/\bexport\s+default\b/.test(dto.code)) {
    throw new BadRequestException({
      error: 'MATERIAL_CODE_INVALID',
      message:
        'ESM 代码必须 default export Custom Element 构造器，或是组件工坊的规格模块（导出 spec）。',
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

function readAttestation(row: MaterialPackageRecord): Record<string, unknown> | undefined {
  if (row.attestation === null || row.attestation === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(row.attestation);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
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
  const attestation = readAttestation(row);
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    code: row.code,
    manifest: readManifest(row),
    revision: row.revision,
    ...(attestation === undefined ? {} : { attestation }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isSpecMaterialModule(code: string): boolean {
  return code.startsWith(SPEC_MODULE_HEADER) && /\bexport\s+const\s+spec\s*=/.test(code);
}

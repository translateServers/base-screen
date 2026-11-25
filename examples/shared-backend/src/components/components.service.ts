import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ComponentDraft as ComponentDraftRecord,
  ComponentFragment as ComponentFragmentRecord,
} from '../generated/prisma-client';
import { ONLINE_MATERIAL_TYPE_PREFIX } from '../material-packages/material-package.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ComponentDraftShape,
  type ComponentFragmentShape,
  type ComponentScreenReference,
  MAX_COMPONENT_SOURCE_BYTES,
  MAX_FRAGMENT_DEFINITION_BYTES,
} from './component.types';
import {
  type CreateComponentFragmentDto,
  isComponentDraftType,
  isComponentFragmentId,
  type SaveComponentDraftDto,
  type UpdateComponentFragmentDto,
} from './dto/component.dto';

const MAX_DISPLAY_LENGTH = 256;

/**
 * 组件库存储（ADR-0106）：原子组件草稿、组合与引用统计。
 *
 * 只存取 JSON 与源码，不执行、不解析规格——规格编译、体检与分片解析在宿主前端经 plugin-sdk /
 * plugin-core 完成（与 MaterialPackage 的分工一致）。已发布的原子组件仍归 MaterialPackage。
 */
@Injectable()
export class ComponentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- 原子组件草稿 ----

  async listDrafts(): Promise<readonly ComponentDraftShape[]> {
    const rows = await this.prisma.componentDraft.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.map(toDraftShape);
  }

  /** 新建（revision 0）或按乐观锁更新；草稿与已发布版本互不影响。 */
  async saveDraft(type: string, dto: SaveComponentDraftDto): Promise<ComponentDraftShape> {
    assertDraftType(type);
    if (Buffer.byteLength(dto.source, 'utf8') > MAX_COMPONENT_SOURCE_BYTES) {
      throw new BadRequestException({
        error: 'COMPONENT_SOURCE_TOO_LARGE',
        message: '组件源码超过 200 KiB。',
      });
    }
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException({
        error: 'COMPONENT_NAME_INVALID',
        message: '组件名称不能为空。',
      });
    }
    const existing = await this.prisma.componentDraft.findUnique({ where: { type } });
    if (existing === null) {
      if (dto.revision !== 0) throw revisionConflict();
      const row = await this.prisma.componentDraft.create({
        data: { type, name, source: dto.source },
      });
      return toDraftShape(row);
    }
    if (dto.revision !== existing.revision) throw revisionConflict();
    const row = await this.prisma.componentDraft.update({
      where: { type },
      data: { name, source: dto.source, revision: { increment: 1 } },
    });
    return toDraftShape(row);
  }

  /** 幂等：草稿不存在也视为成功（发布后清草稿、放弃草稿共用这一条）。 */
  async removeDraft(type: string): Promise<{ readonly deleted: true; readonly type: string }> {
    assertDraftType(type);
    await this.prisma.componentDraft.deleteMany({ where: { type } });
    return { deleted: true, type };
  }

  // ---- 组合 ----

  async listFragments(): Promise<readonly ComponentFragmentShape[]> {
    const rows = await this.prisma.componentFragment.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows.flatMap((row) => {
      const shape = toFragmentShape(row);
      return shape === undefined ? [] : [shape];
    });
  }

  async createFragment(dto: CreateComponentFragmentDto): Promise<ComponentFragmentShape> {
    const meta = readFragmentMeta(dto.definition);
    const existing = await this.prisma.componentFragment.findUnique({ where: { id: meta.id } });
    if (existing !== null) {
      throw new ConflictException({
        error: 'COMPONENT_FRAGMENT_EXISTS',
        message: '同 id 的组合已存在，请换一个 id 或编辑已有组合。',
      });
    }
    const row = await this.prisma.componentFragment.create({
      data: { id: meta.id, name: meta.name, category: meta.category, definition: meta.json },
    });
    return requireFragmentShape(row);
  }

  async updateFragment(
    id: string,
    dto: UpdateComponentFragmentDto,
  ): Promise<ComponentFragmentShape> {
    const meta = readFragmentMeta(dto.definition);
    if (meta.id !== id) {
      throw new BadRequestException({
        error: 'COMPONENT_FRAGMENT_ID_IMMUTABLE',
        message: '组合 id 是物料库条目身份，创建后不可修改。',
      });
    }
    const existing = await this.prisma.componentFragment.findUnique({ where: { id } });
    if (existing === null) throw fragmentNotFound();
    if (existing.revision !== dto.revision) throw revisionConflict();
    const row = await this.prisma.componentFragment.update({
      where: { id },
      data: {
        name: meta.name,
        category: meta.category,
        definition: meta.json,
        revision: { increment: 1 },
      },
    });
    return requireFragmentShape(row);
  }

  /** 组合插入即展开，文档里没有引用关系，删除不做引用保护（ADR-0100 §2.1）。 */
  async removeFragment(id: string): Promise<{ readonly deleted: true; readonly id: string }> {
    const existing = await this.prisma.componentFragment.findUnique({ where: { id } });
    if (existing === null) throw fragmentNotFound();
    await this.prisma.componentFragment.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ---- 引用 ----

  /**
   * 在线物料 type → 引用它的大屏。一次扫描全部大屏文档（组件库列表的引用数），
   * 判据与 MaterialPackagesService 的删除保护一致：文档里出现 `type` 值即算引用。
   */
  async references(): Promise<Readonly<Record<string, readonly ComponentScreenReference[]>>> {
    const screens = await this.prisma.screen.findMany({
      select: { id: true, name: true, document: true },
    });
    const result: Record<string, ComponentScreenReference[]> = {};
    for (const screen of screens) {
      let document: unknown;
      try {
        document = JSON.parse(screen.document);
      } catch {
        continue;
      }
      const types = new Set<string>();
      collectTypes(document, types);
      for (const type of types) {
        if (!type.startsWith(ONLINE_MATERIAL_TYPE_PREFIX)) continue;
        (result[type] ??= []).push({ id: screen.id, name: screen.name });
      }
    }
    return result;
  }
}

function assertDraftType(type: string): void {
  if (!isComponentDraftType(type)) {
    throw new BadRequestException({
      error: 'MATERIAL_TYPE_RESERVED',
      message: '原子组件类型必须使用 host.online.* 命名空间。',
    });
  }
}

function revisionConflict(): ConflictException {
  return new ConflictException({
    error: 'REVISION_CONFLICT',
    message: '该组件已被其他会话更新，请重新载入后再保存。',
  });
}

function fragmentNotFound(): NotFoundException {
  return new NotFoundException({
    error: 'COMPONENT_FRAGMENT_NOT_FOUND',
    message: '组合不存在或已被删除。',
  });
}

function readFragmentMeta(definition: Record<string, unknown>): {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly json: string;
} {
  const { id, name, category } = definition;
  if (typeof id !== 'string' || !isComponentFragmentId(id)) {
    throw new BadRequestException({
      error: 'COMPONENT_FRAGMENT_INVALID',
      message: '组合 id 不合法。',
    });
  }
  if (!isDisplayText(name) || !isDisplayText(category)) {
    throw new BadRequestException({
      error: 'COMPONENT_FRAGMENT_INVALID',
      message: `组合名称与分类为 1..${MAX_DISPLAY_LENGTH} 个字符。`,
    });
  }
  if (!Array.isArray(definition.nodes) || definition.nodes.length === 0) {
    throw new BadRequestException({
      error: 'COMPONENT_FRAGMENT_INVALID',
      message: '组合至少包含一个节点。',
    });
  }
  const json = JSON.stringify(definition);
  if (Buffer.byteLength(json, 'utf8') > MAX_FRAGMENT_DEFINITION_BYTES) {
    throw new BadRequestException({
      error: 'COMPONENT_FRAGMENT_TOO_LARGE',
      message: '组合定义超过 96 KiB。',
    });
  }
  return { id, name: name.trim(), category: category.trim(), json };
}

function isDisplayText(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && [...value].length <= MAX_DISPLAY_LENGTH
  );
}

function collectTypes(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, out);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'type' && typeof child === 'string') out.add(child);
    else collectTypes(child, out);
  }
}

function toDraftShape(row: ComponentDraftRecord): ComponentDraftShape {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    source: row.source,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFragmentShape(row: ComponentFragmentRecord): ComponentFragmentShape | undefined {
  let definition: unknown;
  try {
    definition = JSON.parse(row.definition);
  } catch {
    return undefined;
  }
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition))
    return undefined;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    definition: definition as Record<string, unknown>,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function requireFragmentShape(row: ComponentFragmentRecord): ComponentFragmentShape {
  const shape = toFragmentShape(row);
  if (shape === undefined) {
    throw new BadRequestException({
      error: 'COMPONENT_FRAGMENT_INVALID',
      message: '组合定义无法解析。',
    });
  }
  return shape;
}

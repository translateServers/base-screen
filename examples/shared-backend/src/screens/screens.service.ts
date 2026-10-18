import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import type { Screen } from '../generated/prisma-client';
// 必须是值导入：Nest 的构造器注入依赖 emitDecoratorMetadata 产出 paramtypes，
// 用 `import type` 会把该引用擦除，导致 DI 解析不到 PrismaService。
import { PrismaService } from '../prisma/prisma.service';
import type { ScreenShape, ScreenSummaryShape } from './screen.types';
import { validateScreenDocumentInput } from './screen-document-guard';
import { SEED_SCREENS, serializeStarterDocument } from './starter-document';

@Injectable()
export class ScreensService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /** 空库时幂等播种：dev / start / 测试三种入口行为一致。 */
  async onModuleInit(): Promise<void> {
    await this.ensureSeed();
  }

  async ensureSeed(): Promise<void> {
    const count = await this.prisma.screen.count();
    if (count > 0) return;
    await this.prisma.screen.createMany({
      data: SEED_SCREENS.map((screen) => ({
        name: screen.name,
        document: screen.serialize(),
      })),
    });
  }

  async list(): Promise<readonly ScreenSummaryShape[]> {
    const rows = await this.prisma.screen.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, revision: true, updatedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      revision: row.revision,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async create(name: string): Promise<ScreenShape> {
    const row = await this.prisma.screen.create({
      data: { name, document: serializeStarterDocument() },
    });
    return toShape(row);
  }

  async get(id: string): Promise<ScreenShape> {
    const row = await this.prisma.screen.findUnique({ where: { id } });
    if (row === null) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: `Screen not found: ${id}` });
    }
    return toShape(row);
  }

  /**
   * 宿主侧乐观锁：revision 不匹配即拒绝，Base Screen 不做并发控制。
   * 写入前做有界结构校验（见 screen-document-guard.ts）：宿主持有的是不透明 JSON，
   * 权威的 canonical 校验在宿主前端与设计器提交路径上完成。
   */
  async update(id: string, document: unknown, expectedRevision: number): Promise<ScreenShape> {
    const row = await this.prisma.screen.findUnique({ where: { id } });
    if (row === null) {
      throw new NotFoundException({ error: 'NOT_FOUND', message: `Screen not found: ${id}` });
    }
    if (row.revision !== expectedRevision) {
      throw new ConflictException({
        error: 'REVISION_CONFLICT',
        message: 'The screen changed since it was loaded.',
      });
    }
    const validation = validateScreenDocumentInput(document);
    if (!validation.ok) {
      throw new BadRequestException({
        error: 'DOCUMENT_INVALID',
        message: `Screen Document rejected: ${validation.reason}`,
      });
    }
    const updated = await this.prisma.screen.update({
      where: { id },
      data: { document: validation.serialized, revision: { increment: 1 } },
    });
    return toShape(updated);
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.screen.delete({ where: { id } });
    } catch (error: unknown) {
      if (isRecordNotFound(error)) {
        throw new NotFoundException({ error: 'NOT_FOUND', message: `Screen not found: ${id}` });
      }
      throw error;
    }
  }
}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

function toShape(row: Screen): ScreenShape {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    document: JSON.parse(row.document) as unknown,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

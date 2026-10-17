import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScreensModule } from '../src/screens/screens.module';
import { ScreensService } from '../src/screens/screens.service';

interface ScreenRow {
  id: string;
  name: string;
  document: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const DOCUMENT_INPUT = {
  canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};

const DOCUMENT_TEXT = JSON.stringify(DOCUMENT_INPUT);

function createPrismaMock() {
  return {
    screen: {
      count: jest.fn<Promise<number>, []>(),
      createMany: jest.fn<Promise<{ count: number }>, [{ data: unknown[] }]>(),
      create: jest.fn<Promise<ScreenRow>, [{ data: unknown }]>(),
      findMany: jest.fn<Promise<ScreenRow[]>, [unknown]>(),
      findUnique: jest.fn<Promise<ScreenRow | null>, [unknown]>(),
      update: jest.fn<Promise<ScreenRow>, [{ data: Record<string, unknown> }]>(),
      delete: jest.fn<Promise<ScreenRow>, [unknown]>(),
    },
  };
}

function row(overrides: Partial<ScreenRow> = {}): ScreenRow {
  return {
    id: 'screen-1',
    name: '测试大屏',
    document: DOCUMENT_TEXT,
    revision: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

async function createService(prisma: ReturnType<typeof createPrismaMock>): Promise<ScreensService> {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, ScreensModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma as unknown as PrismaService)
    .compile();
  return moduleRef.get(ScreensService);
}

describe('ScreensService', () => {
  it('seeds two starter screens on an empty database', async () => {
    const prisma = createPrismaMock();
    prisma.screen.count.mockResolvedValue(0);
    prisma.screen.createMany.mockResolvedValue({ count: 2 });
    const service = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screen.createMany).toHaveBeenCalledTimes(1);
    const argument = prisma.screen.createMany.mock.calls[0]?.[0];
    const seeded = (argument?.data ?? []) as { name: string; document: string }[];
    expect(seeded.map((item) => item.name)).toEqual(['默认销售大屏', '系统监控大屏']);
    expect(JSON.parse(seeded[0]!.document)).toMatchObject({ canvas: { width: 1920 } });
  });

  it('does not seed when the database already has rows', async () => {
    const prisma = createPrismaMock();
    prisma.screen.count.mockResolvedValue(2);
    const service = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screen.createMany).not.toHaveBeenCalled();
  });

  it('lists summaries without documents', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue([row()]);
    const service = await createService(prisma);

    await expect(service.list()).resolves.toEqual([
      {
        id: 'screen-1',
        name: '测试大屏',
        revision: 3,
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('rejects a stale revision with a conflict', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row({ revision: 4 }));
    const service = await createService(prisma);

    await expect(service.update('screen-1', DOCUMENT_INPUT, 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an invalid canonical document', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    const service = await createService(prisma);

    await expect(service.update('screen-1', { canvas: 'nope' }, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores the canonical serialization and increments the revision', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    prisma.screen.update.mockImplementation((argument) =>
      Promise.resolve(row({ revision: 4, document: String(argument.data.document) })),
    );
    const service = await createService(prisma);

    await service.update('screen-1', DOCUMENT_INPUT, 3);

    const argument = prisma.screen.update.mock.calls[0]?.[0];
    expect(argument?.data.revision).toEqual({ increment: 1 });
    expect(JSON.parse(String(argument?.data.document))).toMatchObject({ canvas: { width: 1920 } });
  });

  it('maps an unknown id to not found on read and delete', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(null);
    prisma.screen.delete.mockRejectedValue({ code: 'P2025' });
    const service = await createService(prisma);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

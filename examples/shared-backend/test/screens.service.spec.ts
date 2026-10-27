import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AssetsService } from '../src/assets/assets.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ScreensModule } from '../src/screens/screens.module';
import { ScreensService } from '../src/screens/screens.service';
import { SEED_SCREENS } from '../src/screens/starter-document';

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
  blueprint: { relations: [] },
};

const DOCUMENT_TEXT = JSON.stringify(DOCUMENT_INPUT);

function createPrismaMock() {
  const findFirst = jest.fn<Promise<{ id: string } | null>, [unknown]>();
  findFirst.mockResolvedValue(null);
  const upsert = jest.fn<Promise<unknown>, [unknown]>();
  upsert.mockResolvedValue({});
  return {
    screen: {
      count: jest.fn<Promise<number>, []>(),
      createMany: jest.fn<Promise<{ count: number }>, [{ data: unknown[] }]>(),
      create: jest.fn<Promise<ScreenRow>, [{ data: unknown }]>(),
      // 播种只读 `name`，列表读整行：mock 用 Partial 覆盖两种调用形状。
      findMany: jest.fn<Promise<Array<Partial<ScreenRow>>>, [unknown]>(),
      findFirst,
      findUnique: jest.fn<Promise<ScreenRow | null>, [unknown]>(),
      update: jest.fn<Promise<ScreenRow>, [{ data: Record<string, unknown> }]>(),
      delete: jest.fn<Promise<ScreenRow>, [unknown]>(),
    },
    screenAlarmBinding: {
      findUnique: jest.fn<Promise<{ config: string } | null>, [unknown]>(),
      upsert,
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

function createAssetsMock() {
  return {
    renewTemporaryAssets: jest.fn<Promise<void>, [unknown]>(),
    deleteTemporaryAssetsForScreen: jest.fn<Promise<number>, [string]>(),
  };
}

async function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  assets = createAssetsMock(),
): Promise<{ service: ScreensService; assets: ReturnType<typeof createAssetsMock> }> {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, ScreensModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma as unknown as PrismaService)
    .overrideProvider(AssetsService)
    .useValue(assets)
    .compile();
  return { service: moduleRef.get(ScreensService), assets };
}

describe('ScreensService', () => {
  it('seeds five starter screens on an empty database', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue([]);
    prisma.screen.createMany.mockResolvedValue({ count: 5 });
    prisma.screen.findFirst.mockResolvedValue({ id: 'screen-alarm' });
    prisma.screenAlarmBinding.upsert.mockResolvedValue({});
    const { service } = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screen.createMany).toHaveBeenCalledTimes(1);
    const argument = prisma.screen.createMany.mock.calls[0]?.[0];
    const seeded = (argument?.data ?? []) as { name: string; document: string }[];
    expect(seeded.map((item) => item.name)).toEqual([
      '默认销售大屏',
      '系统监控大屏',
      '生产监控大屏',
      '实时告警演示大屏',
      '空气质量监测大屏',
    ]);
    const demo = JSON.parse(seeded[0]!.document) as {
      canvas: { width: number; height: number };
      components: Array<{ type: string }>;
    };
    const starter = JSON.parse(seeded[1]!.document) as {
      components: Array<{ type: string }>;
    };
    expect(demo.canvas).toMatchObject({ width: 1920, height: 1080 });
    // 成品文档是密集版式：约 50 个组件，含四类插件物料与宿主读数。
    expect(demo.components.length).toBeGreaterThan(40);
    expect(demo.components.filter((item) => item.type === 'board.digital-flop')).toHaveLength(4);
    expect(demo.components.some((item) => item.type === 'plugin.echarts')).toBe(true);
    expect(demo.components.some((item) => item.type === 'board.scroll-board')).toBe(true);
    // 第二个种子保留最小卡片文档，继续覆盖宿主自有物料这条路径。
    expect(starter.components.some((item) => item.type === 'host-app.metric-value')).toBe(true);
    // 第三个种子是数据层成品：数据集物料与四个 dataSource 类型都必须在场。
    const monitor = JSON.parse(seeded[2]!.document) as {
      canvas: { width: number; height: number };
      components: Array<{ type: string; dataSource: { type: string } | null }>;
      variables: Array<{ id: string }>;
    };
    expect(monitor.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(monitor.components.length).toBeGreaterThan(40);
    expect(monitor.components.some((item) => item.type === 'board.status-grid')).toBe(true);
    expect(monitor.components.some((item) => item.type === 'board.pipeline')).toBe(true);
    expect(
      new Set(
        monitor.components
          .map((item) => item.dataSource?.type)
          .filter((type): type is string => type !== undefined),
      ),
    ).toEqual(new Set(['static', 'dataset', 'variable', 'host-resource']));
    expect(monitor.variables.map((item) => item.id)).toEqual([
      'line',
      'window',
      'severity',
      'clock',
      'notice',
      'status',
    ]);
    // 第四个种子是告警演示屏：流水 + KPI + 等级色块，且组件 id 对齐宿主 alarm 绑定。
    const alarm = JSON.parse(seeded[3]!.document) as {
      canvas: { width: number; height: number };
      components: Array<{
        id: string;
        type: string;
        dataSource: { type: string; datasetId?: string; resourceId?: string } | null;
      }>;
      blueprint: { relations: Array<{ id: string }> };
    };
    expect(alarm.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(alarm.components.filter((item) => item.type === 'board.digital-flop')).toHaveLength(4);
    expect(
      alarm.components.filter(
        (item) => item.type === 'board.digital-flop' && item.dataSource?.type === 'host-resource',
      ),
    ).toHaveLength(4);
    expect(alarm.components.find((item) => item.id === 'alarm-stream')?.dataSource?.datasetId).toBe(
      'monitor.alarms',
    );
    // 这两个 id 是宿主 `alarm.open` 绑定的落点，改名等于让告警推送失去目标。
    expect(alarm.components.some((item) => item.id === 'kpi-alarm-value')).toBe(true);
    expect(alarm.components.some((item) => item.id === 'top-notice')).toBe(true);
    expect(alarm.blueprint.relations.map((relation) => relation.id)).toEqual([
      'rule-line',
      'rule-severity',
    ]);
    // 第五个种子是真实数据案例：三个共享 SQLite 实例 + 三处蓝图联动。
    const air = JSON.parse(seeded[4]!.document) as {
      canvas: { width: number; height: number };
      components: Array<{
        type: string;
        dataSource: { type: string } | null;
        dataValue?: { kind: string; dataSourceId?: string };
      }>;
      dataSources?: Array<{
        id: string;
        source: { kind: string; datasetId?: string };
        params: Record<string, unknown>;
      }>;
      variables: Array<{ id: string }>;
      blueprint: { relations: Array<{ source: { componentId: string } }> };
    };
    expect(air.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(air.components.length).toBeGreaterThan(40);
    expect(air.components.some((item) => item.type === 'board.scroll-board')).toBe(true);
    expect(air.components.some((item) => item.type === 'board.digital-flop')).toBe(true);
    expect(air.components.some((item) => item.type === 'board.capsule-progress')).toBe(true);
    expect(air.components.some((item) => item.type === 'plugin.echarts')).toBe(true);
    expect(
      new Set(
        air.components
          .map((item) => item.dataSource?.type)
          .filter((type): type is string => type !== undefined),
      ),
    ).toEqual(new Set(['static', 'variable']));
    expect(air.dataSources?.map((item) => item.source.datasetId)).toEqual([
      'custom.air-live',
      'custom.air-trend',
      'custom.air-rank',
    ]);
    expect(
      new Set(
        air.components
          .map((item) => item.dataValue?.dataSourceId)
          .filter((id): id is string => id !== undefined),
      ),
    ).toEqual(new Set(['live', 'trend', 'rank']));
    expect(
      air.components.filter((item) => item.dataValue?.kind === 'data-source-field').length,
    ).toBeGreaterThanOrEqual(15);
    expect(air.variables.map((item) => item.id)).toEqual(['city', 'hours']);
    expect(air.blueprint.relations.map((relation) => relation.source.componentId)).toEqual([
      'city-board',
      'window-24-text',
      'window-48-text',
    ]);
  });

  // 旧实现是「空库才播种」，新增种子在已有开发库里永远不出现。现在按名字补齐：
  // 只插缺失的那几张，已有行（可能被用户改过）一律不碰。
  it('tops up only the starter screens the database is missing', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue([{ name: '默认销售大屏' }, { name: '系统监控大屏' }]);
    prisma.screen.createMany.mockResolvedValue({ count: 3 });
    const { service } = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screen.createMany).toHaveBeenCalledTimes(1);
    const argument = prisma.screen.createMany.mock.calls[0]?.[0];
    const seeded = (argument?.data ?? []) as { name: string }[];
    expect(seeded.map((item) => item.name)).toEqual([
      '生产监控大屏',
      '实时告警演示大屏',
      '空气质量监测大屏',
    ]);
  });

  it('does not seed when every seed name already exists', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue(SEED_SCREENS.map((screen) => ({ name: screen.name })));
    const { service } = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screen.createMany).not.toHaveBeenCalled();
  });

  it('seeds the alarm demo binding only when the row is missing', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue(SEED_SCREENS.map((screen) => ({ name: screen.name })));
    prisma.screen.findFirst.mockResolvedValue({ id: 'screen-alarm' });
    const { service } = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screenAlarmBinding.upsert).toHaveBeenCalledTimes(1);
    const argument = prisma.screenAlarmBinding.upsert.mock.calls[0]?.[0] as
      | { where: { screenId: string }; create: { config: string }; update: unknown }
      | undefined;
    expect(argument?.where).toEqual({ screenId: 'screen-alarm' });
    // `update: {}` 是不覆盖已有行的关键：用户清空后保存的 `{}` 不会在重启时复活。
    expect(argument?.update).toEqual({});
    expect(JSON.parse(argument?.create.config ?? '{}')).toMatchObject({
      'alarm.open': {
        'kpi-alarm-value': { warning: { color: '#fa8c16' } },
      },
    });
  });

  it('skips binding seeding when the alarm screen does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue(SEED_SCREENS.map((screen) => ({ name: screen.name })));
    prisma.screen.findFirst.mockResolvedValue(null);
    const { service } = await createService(prisma);

    await service.ensureSeed();

    expect(prisma.screenAlarmBinding.upsert).not.toHaveBeenCalled();
  });

  it('reads an unconfigured screen as empty bindings', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    prisma.screenAlarmBinding.findUnique.mockResolvedValue(null);
    const { service } = await createService(prisma);

    await expect(service.getAlarmBindings('screen-1')).resolves.toEqual({});
  });

  it('reads persisted bindings and fails closed on corrupt rows', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    prisma.screenAlarmBinding.findUnique.mockResolvedValue({
      config: JSON.stringify({ 'alarm.open': { card: { warning: { color: '#f00' } } } }),
    });
    const { service } = await createService(prisma);

    await expect(service.getAlarmBindings('screen-1')).resolves.toEqual({
      'alarm.open': { card: { warning: { color: '#f00' } } },
    });

    prisma.screenAlarmBinding.findUnique.mockResolvedValue({ config: '{"oops":1}' });
    await expect(service.getAlarmBindings('screen-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('rejects malformed alarm bindings before any write', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    const { service } = await createService(prisma);

    for (const bindings of [
      { 'alarm.open': { card: { fatal: { color: '#f00' } } } },
      { 'alarm.open': { card: { warning: { color: 1 } } } },
      { 'alarm.open': { card: { warning: {} } } },
      { 'alarm.open': { card: {} } },
      [],
    ]) {
      await expect(service.updateAlarmBindings('screen-1', bindings)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(prisma.screenAlarmBinding.upsert).not.toHaveBeenCalled();
  });

  it('upserts valid bindings and returns the stored shape', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    const { service } = await createService(prisma);
    const bindings = {
      'alarm.open': { card: { warning: { color: '#fa8c16', fontWeight: '700' } } },
    };

    await expect(service.updateAlarmBindings('screen-1', bindings)).resolves.toEqual(bindings);
    const argument = prisma.screenAlarmBinding.upsert.mock.calls[0]?.[0] as
      | { where: { screenId: string }; create: { config: string }; update: { config: string } }
      | undefined;
    expect(argument?.where).toEqual({ screenId: 'screen-1' });
    expect(JSON.parse(argument?.create.config ?? '{}')).toEqual(bindings);
    expect(JSON.parse(argument?.update.config ?? '{}')).toEqual(bindings);
  });

  it('rejects binding reads and writes for an unknown screen', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(null);
    const { service } = await createService(prisma);

    await expect(service.getAlarmBindings('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateAlarmBindings('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists summaries without documents', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findMany.mockResolvedValue([row()]);
    const { service } = await createService(prisma);

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
    const { service } = await createService(prisma);

    await expect(service.update('screen-1', DOCUMENT_INPUT, 3)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an invalid canonical document', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    const { service } = await createService(prisma);

    await expect(service.update('screen-1', { canvas: 'nope' }, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores the canonical serialization, increments the revision, and renews temporary assets', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(row());
    prisma.screen.update.mockImplementation((argument) =>
      Promise.resolve(row({ revision: 4, document: String(argument.data.document) })),
    );
    const { service, assets } = await createService(prisma);

    await service.update('screen-1', DOCUMENT_INPUT, 3);

    const argument = prisma.screen.update.mock.calls[0]?.[0];
    expect(argument?.data.revision).toEqual({ increment: 1 });
    expect(JSON.parse(String(argument?.data.document))).toMatchObject({ canvas: { width: 1920 } });
    expect(assets.renewTemporaryAssets).toHaveBeenCalledWith(DOCUMENT_INPUT);
  });

  it('does not fail a successful save when temporary asset renewal fails', async () => {
    const prisma = createPrismaMock();
    const assets = createAssetsMock();
    assets.renewTemporaryAssets.mockRejectedValue(new Error('db down'));
    prisma.screen.findUnique.mockResolvedValue(row());
    prisma.screen.update.mockResolvedValue(row({ revision: 4 }));
    const { service } = await createService(prisma, assets);

    await expect(service.update('screen-1', DOCUMENT_INPUT, 3)).resolves.toMatchObject({
      revision: 4,
    });
  });

  it('cleans temporary assets after deleting a screen', async () => {
    const prisma = createPrismaMock();
    prisma.screen.delete.mockResolvedValue(row());
    const { service, assets } = await createService(prisma);

    await service.remove('screen-1');

    expect(assets.deleteTemporaryAssetsForScreen).toHaveBeenCalledWith('screen-1');
  });

  it('does not fail a successful delete when temporary asset cleanup fails', async () => {
    const prisma = createPrismaMock();
    const assets = createAssetsMock();
    assets.deleteTemporaryAssetsForScreen.mockRejectedValue(new Error('db down'));
    prisma.screen.delete.mockResolvedValue(row());
    const { service } = await createService(prisma, assets);

    await expect(service.remove('screen-1')).resolves.toBeUndefined();
  });

  it('maps an unknown id to not found on read and delete', async () => {
    const prisma = createPrismaMock();
    prisma.screen.findUnique.mockResolvedValue(null);
    prisma.screen.delete.mockRejectedValue({ code: 'P2025' });
    const { service, assets } = await createService(prisma);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(assets.deleteTemporaryAssetsForScreen).not.toHaveBeenCalled();
  });
});

// 独立测试库：本 spec 建/删 DataSource 与 Screen 行，避免与 app.e2e-spec 的
// 「目录恰好 4 条内置」断言并行互相污染。迁移由 global-setup 预置。
process.env.DATABASE_URL = 'file:../data/test.ds-service.db';

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatasourceFilesService } from '../src/datasources/datasource-files.service';
import { DatasourceReferenceService } from '../src/datasources/datasource-reference.service';
import { DatasourceRuntime } from '../src/datasources/datasource-runtime';
import { DatasourceSeedService } from '../src/datasources/datasource-seed.service';
import { DatasourcesService } from '../src/datasources/datasources.service';
import type { SaveDatasourceDto } from '../src/datasources/dto/datasource.dto';
import type { Screen } from '../src/generated/prisma-client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SqliteExecutorService } from '../src/sqlite/sqlite-executor.service';

/**
 * 管理服务的分层测试（A1 排序 / A9 引用统计 / A10 删除保护 / A12 唯一性 / P0-15 播种）。
 *
 * 这里**不起 HTTP**：这些断言关心的是服务行为与库里的落地结果（`refScreens` 的形状、
 * 409 的附加字段、`custom.ds-<n>` 的序号），走 HTTP 只会把失败原因搅进管道层。
 * 需要真实上游/真实 SQLite 的部分在 `datasources.e2e-spec.ts` 与 `datasets.catalog.spec.ts`。
 *
 * 静态数据源是本 spec 的主力：它不依赖文件与网络，`ready` 与字段推断一步到位。
 */

let moduleRef: TestingModule;
let service: DatasourcesService;
let seed: DatasourceSeedService;
let prisma: PrismaService;

function staticBody(name: string, description: string | null = null): SaveDatasourceDto {
  return {
    name,
    description,
    type: 'static',
    config: {
      v: 1,
      columns: ['crew', 'output'],
      rows: [
        ['甲班', 120],
        ['乙班', 98],
      ],
    },
  };
}

/** 造一份只含数据源引用的 canonical 文档（引用扫描只看 `dataSource.datasetId`）。 */
function documentWith(datasetIds: readonly string[]): string {
  return JSON.stringify({
    canvas: { width: 1920, height: 1080, backgroundColor: '#0b1020' },
    components: datasetIds.map((datasetId, index) => ({
      id: `cmp-${index}`,
      type: 'base.text',
      name: `文本 ${index}`,
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 100, height: 40 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: {},
      style: {},
      dataSource: { type: 'dataset', datasetId, params: {}, binding: null },
    })),
  });
}

async function createScreen(name: string, datasetIds: readonly string[]): Promise<Screen> {
  return prisma.screen.create({ data: { name, document: documentWith(datasetIds) } });
}

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [
      PrismaService,
      SqliteExecutorService,
      { provide: ConfigService, useValue: new ConfigService() },
      DatasourceRuntime,
      DatasourceFilesService,
      DatasourceReferenceService,
      DatasourcesService,
      DatasourceSeedService,
    ],
  }).compile();
  service = moduleRef.get(DatasourcesService);
  seed = moduleRef.get(DatasourceSeedService);
  prisma = moduleRef.get(PrismaService);
  await prisma.dataSource.deleteMany({});
  await prisma.screen.deleteMany({});
});

afterAll(async () => {
  await prisma.dataSource.deleteMany({});
  await prisma.screen.deleteMany({});
  await moduleRef.close();
});

describe('A9 · 引用统计', () => {
  it('counts screens that reference the dataset, once per screen', async () => {
    const created = await service.create(staticBody('A9 Ref'));
    const first = await createScreen('A9 屏一', [created.datasetId]);
    let detail = await service.detail(created.datasetId);
    expect(detail.refCount).toBe(1);
    expect(detail.refScreens).toEqual([
      { id: first.id, name: 'A9 屏一', updatedAt: first.updatedAt.toISOString() },
    ]);

    // 同一屏里引用两次仍算 1（refCount 是「多少张屏在用」）
    await prisma.screen.update({
      where: { id: first.id },
      data: { document: documentWith([created.datasetId, created.datasetId]) },
    });
    detail = await service.detail(created.datasetId);
    expect(detail.refCount).toBe(1);

    const second = await createScreen('A9 屏二', [created.datasetId]);
    detail = await service.detail(created.datasetId);
    expect(detail.refCount).toBe(2);
    expect(detail.refScreens.map((screen) => screen.id)).toEqual([first.id, second.id]);

    // 列表也带引用数（A1 要求列表含 refCount/refScreens）
    const list = await service.list('all', 'A9 Ref', 10, 0);
    expect(list.items[0]).toMatchObject({ datasetId: created.datasetId, refCount: 2 });
    // catalogVisibleCount 只数「ready 且字段非空」的自建，与 total 不是一回事
    expect(list.catalogVisibleCount).toBeGreaterThanOrEqual(1);
    expect(list.catalogVisibleCount).toBeLessThanOrEqual(46);
  }, 20_000);

  it('ignores variable parameters and non-dataset sources', async () => {
    const created = await service.create(staticBody('A9 Ignore'));
    const document = JSON.stringify({
      components: [
        {
          id: 'cmp-a',
          dataSource: {
            type: 'dataset',
            datasetId: created.datasetId,
            // params 里引用的是变量，不是数据源
            params: { status: { kind: 'variable', variableId: 'var-1' } },
            binding: null,
          },
        },
        { id: 'cmp-b', dataSource: { type: 'variable', variableId: 'var-1' } },
        { id: 'cmp-c', dataSource: null },
      ],
    });
    await prisma.screen.create({ data: { name: 'A9 变量屏', document } });
    const detail = await service.detail(created.datasetId);
    expect(detail.refCount).toBe(1);
  }, 20_000);
});

describe('A10 · 删除保护', () => {
  it('refuses to delete a referenced datasource and keeps it in the list', async () => {
    const created = await service.create(staticBody('A10 Used'));
    const screen = await createScreen('A10 屏', [created.datasetId]);

    let conflict: unknown = null;
    try {
      await service.remove(created.datasetId);
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(ConflictException);
    if (conflict instanceof ConflictException) {
      const response = conflict.getResponse() as Record<string, unknown>;
      expect(response).toMatchObject({ error: 'DATASOURCE_IN_USE' });
      expect(String(response.message)).toContain('1 张大屏');
      expect(response.refScreens).toEqual([
        { id: screen.id, name: 'A10 屏', updatedAt: screen.updatedAt.toISOString() },
      ]);
    }

    const list = await service.list('all', 'A10 Used', 10, 0);
    expect(list.items).toHaveLength(1);
  }, 20_000);

  it('deletes an unreferenced datasource', async () => {
    const created = await service.create(staticBody('A10 Free'));
    await expect(service.remove(created.datasetId)).resolves.toEqual({
      deleted: true,
      datasetId: created.datasetId,
    });
    let notFound: unknown = null;
    try {
      await service.detail(created.datasetId);
    } catch (error) {
      notFound = error;
    }
    expect(notFound).toBeInstanceOf(NotFoundException);
  }, 20_000);
});

describe('A12 · datasetId 生成与唯一性', () => {
  it('generates slugs for ASCII names and custom.ds-<n> for non-ASCII ones', async () => {
    const ascii = await service.create(staticBody('Press Line A'));
    expect(ascii.datasetId).toBe('custom.press-line-a');

    const chinese = await service.create(staticBody('车间设备台账'));
    expect(chinese.datasetId).toBe('custom.ds-1');

    const second = await service.create(staticBody('空压机'));
    expect(second.datasetId).toBe('custom.ds-2');
  }, 20_000);

  it('answers 409 with a suggested id and never creates a suffixed row', async () => {
    const before = await service.list('all', undefined, 200, 0);
    let conflict: unknown = null;
    try {
      await service.create(staticBody('Press Line A'));
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(ConflictException);
    if (conflict instanceof ConflictException) {
      const response = conflict.getResponse() as Record<string, unknown>;
      expect(response).toMatchObject({
        error: 'DATASOURCE_ID_CONFLICT',
        suggestedId: 'custom.press-line-a-2',
      });
      expect(String(response.message)).toContain('custom.press-line-a-2');
    }
    const after = await service.list('all', undefined, 200, 0);
    // 库里没有自动生成带后缀的新行
    expect(after.total).toBe(before.total);
  }, 20_000);

  it('stores an empty description as null', async () => {
    const created = await service.create(staticBody('A12 Empty Description', '   '));
    expect(created.description).toBeNull();
    const detail = await service.detail(created.datasetId);
    expect(detail.description).toBeNull();
  }, 20_000);
});

describe('A1 · 列表排序与内置投影', () => {
  it('puts custom rows first (updatedAt desc) and builtin rows last', async () => {
    const older = await service.create(staticBody('A1 Older'));
    const newer = await service.create(staticBody('A1 Newer'));
    // 触碰 older 让它成为最近更新的一条
    await service.update(older.datasetId, staticBody('A1 Older Renamed'));

    const list = await service.list('all', 'A1 ', 100, 0);
    const ids = list.items.map((item) => item.datasetId);
    expect(ids.indexOf('custom.a1-older-renamed')).toBeLessThan(ids.indexOf('custom.a1-newer'));
    expect(newer.datasetId).toBe('custom.a1-newer');

    const all = await service.list('all', undefined, 200, 0);
    const builtin = all.items.filter((item) => item.type === 'builtin');
    expect(builtin).toHaveLength(4);
    expect(all.items.slice(all.items.length - 4).every((item) => item.type === 'builtin')).toBe(
      true,
    );
    expect(builtin[0]).toMatchObject({ status: 'builtin', configSummary: '', lastTest: null });

    // type 过滤：只看内置
    const onlyBuiltin = await service.list('builtin', undefined, 200, 0);
    expect(onlyBuiltin.total).toBe(4);
    const onlyStatic = await service.list('static', undefined, 200, 0);
    expect(onlyStatic.items.every((item) => item.type === 'static')).toBe(true);
  }, 30_000);

  it('refuses to edit or delete builtin entries', async () => {
    await expect(service.update('monitor.devices', staticBody('改名'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.remove('monitor.devices')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('P0-15 · 示例数据源播种', () => {
  it('seeds two examples once, with the REST one staying draft', async () => {
    const created = await seed.ensureSeed();
    expect(created).toBe(2);

    const press = await service.detail('custom.example-press');
    expect(press).toMatchObject({ type: 'rest', status: 'draft', name: '示例 · 压力接口' });
    expect(press.lastTest).toBeNull();
    expect(press.fields).toEqual([]);

    const roster = await service.detail('custom.example-roster');
    expect(roster).toMatchObject({ type: 'static', status: 'ready' });
    expect(roster.fields.map((field) => field.id)).toEqual([
      'crew',
      'leader',
      'onDuty',
      'shiftStart',
    ]);
    expect(roster.fields.map((field) => field.valueType)).toEqual([
      'string',
      'string',
      'boolean',
      'date',
    ]);

    // 幂等：第二次什么都不建
    await expect(seed.ensureSeed()).resolves.toBe(0);
  }, 20_000);
});

describe('Q2 · 设计器目录上限', () => {
  it('caps catalogVisibleCount at 46 while total still counts every row', async () => {
    for (let index = 0; index < 47; index += 1) {
      await service.create(staticBody(`Q2 Cap ${index}`));
    }
    const list = await service.list('all', 'Q2 Cap', 200, 0);
    // total = 当前筛选下的条目数（分页用），不能拿它猜目录可见性
    expect(list.total).toBe(47);
    // 目录上限 = 契约 items 50 - 内置 4；超出部分只在管理页可见
    expect(list.catalogVisibleCount).toBe(46);
  }, 120_000);
});

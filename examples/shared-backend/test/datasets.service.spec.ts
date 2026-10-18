import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DATASET_DEFINITIONS } from '../src/datasets/dataset-definitions';
import { DatasetsService } from '../src/datasets/datasets.service';

/**
 * 数据集契约的离线断言（PRD §6.3 / §6.4，架构 §7-T01 验收 ①–⑧ 的 jest 版本）。
 *
 * 这里刻意只打 Service，不起 HTTP：错误码是 Service 抛出的业务异常，HTTP 状态由
 * `AllExceptionsFilter` 映射，两者分开验证比走 e2e 更快也更稳定。
 */
describe('DatasetsService', () => {
  async function createService(): Promise<DatasetsService> {
    const moduleRef = await Test.createTestingModule({
      providers: [DatasetsService],
    }).compile();
    return moduleRef.get(DatasetsService);
  }

  it('lists every dataset with the two groups, without leaking fields', async () => {
    const service = await createService();

    const catalog = service.list(undefined, undefined, 20);

    expect(catalog.items.map((item) => item.datasetId)).toEqual([
      'monitor.devices',
      'monitor.alarms',
      'monitor.pipeline',
      'monitor.crew',
    ]);
    expect(catalog.groups.map((group) => group.id)).toEqual(['production', 'alarm']);
    // 目录条目只有四个键：字段/参数属于 describe，不混进列表响应。
    expect(Object.keys(catalog.items[0] ?? {}).sort()).toEqual([
      'datasetId',
      'description',
      'groupId',
      'name',
    ]);
  });

  it('filters the catalog with a case-insensitive substring query', async () => {
    const service = await createService();

    const chinese = service.list('告警', undefined, 20);
    expect(chinese.items.map((item) => item.datasetId)).toEqual(['monitor.alarms']);
    // groups 由命中条目反推：只剩 alarm 一组。
    expect(chinese.groups.map((group) => group.id)).toEqual(['alarm']);

    expect(service.list('MONITOR', undefined, 20).items).toHaveLength(4);
    expect(service.list('monitor.dev', undefined, 20).items.map((item) => item.datasetId)).toEqual([
      'monitor.devices',
    ]);
    expect(service.list('设备', undefined, 20).items.map((item) => item.datasetId)).toEqual([
      'monitor.devices',
    ]);
  });

  it('honours limit and groupId on the catalog', async () => {
    const service = await createService();

    expect(service.list(undefined, undefined, 2).items).toHaveLength(2);
    expect(service.list(undefined, 'alarm', 20).items.map((item) => item.datasetId)).toEqual([
      'monitor.alarms',
    ]);
    expect(service.list(undefined, 'nope', 20)).toEqual({ groups: [], items: [] });
  });

  it('describes monitor.devices with 5 fields and 2 parameters', async () => {
    const service = await createService();

    const definition = service.describe('monitor.devices');

    expect(definition.datasetId).toBe('monitor.devices');
    expect(definition.fields.map((field) => field.id)).toEqual([
      'id',
      'name',
      'line',
      'status',
      'load',
    ]);
    // 契约没有 enum 类型：状态/等级的枚举语义只放在 parameters.allowedValues 上。
    expect(definition.fields.every((field) => field.valueType === 'string')).toBe(false);
    expect(
      definition.fields.filter((field) => field.id === 'status').map((field) => field.valueType),
    ).toEqual(['string']);
    expect(definition.parameters.map((parameter) => parameter.name)).toEqual(['line', 'limit']);

    const line = definition.parameters[0];
    expect(line?.required).toBe(true);
    expect(line?.defaultValue).toBe('LINE-A');
    expect(line?.allowedValues).toEqual(['LINE-A', 'LINE-B', 'LINE-C']);

    const limit = definition.parameters[1];
    expect(limit?.minimum).toBe(1);
    expect(limit?.maximum).toBe(48);
    expect(limit?.defaultValue).toBe(48);
  });

  it('describes monitor.alarms with the all/critical/warning/info whitelist', async () => {
    const service = await createService();

    const definition = service.describe('monitor.alarms');

    expect(definition.fields).toHaveLength(8);
    const level = definition.parameters.find((parameter) => parameter.name === 'level');
    // allowedValues 必须含 all，否则 level ← severity（severity='all'）会被基座拒绝。
    expect(level?.allowedValues).toEqual(['all', 'critical', 'warning', 'info']);
    expect(level?.required).toBe(false);

    const window = definition.parameters.find((parameter) => parameter.name === 'window');
    expect(window?.minimum).toBe(1);
    expect(window?.maximum).toBe(1440);
    expect(window?.defaultValue).toBe(60);
  });

  it('keeps describe.fields byte-identical to query.fields for every dataset', async () => {
    const service = await createService();

    const paramsByDataset: Readonly<Record<string, Record<string, string | number>>> = {
      'monitor.devices': { line: 'LINE-A' },
      'monitor.alarms': { line: 'LINE-A' },
      'monitor.pipeline': { line: 'LINE-A' },
      'monitor.crew': { line: 'LINE-A' },
    };

    for (const definition of DATASET_DEFINITIONS) {
      const described = service.describe(definition.datasetId);
      const result = service.query(
        definition.datasetId,
        paramsByDataset[definition.datasetId] ?? {},
      );
      expect(result.fields).toEqual(described.fields);
      expect(JSON.stringify(result.fields)).toBe(JSON.stringify(described.fields));
    }
  });

  it('returns 48 LINE-A devices of which exactly 3 are faulted', async () => {
    const service = await createService();

    const result = service.query('monitor.devices', { line: 'LINE-A', limit: 48 });

    expect(result.rows).toHaveLength(48);
    expect(result.totalRowCount).toBe(48);
    const rows = result.rows as readonly Record<string, string | number | null>[];
    expect(rows.filter((row) => row.status === 'fault')).toHaveLength(3);
    expect(rows.every((row) => row.line === 'LINE-A')).toBe(true);
    // 行键 = 字段 id，顺序与 describe 一致。
    expect(Object.keys(rows[0] ?? {})).toEqual(['id', 'name', 'line', 'status', 'load']);
    expect(rows[0]?.id).toBe('LINE-A-01');
    expect(rows[2]?.status).toBe('fault');
  });

  it('returns 36 LINE-B devices with a single fault', async () => {
    const service = await createService();

    const result = service.query('monitor.devices', { line: 'LINE-B' });
    const rows = result.rows as readonly Record<string, string | number | null>[];

    expect(result.totalRowCount).toBe(36);
    expect(rows.filter((row) => row.status === 'fault')).toHaveLength(1);
  });

  it('treats LINE-C as a legal empty result instead of a failure', async () => {
    const service = await createService();

    const devices = service.query('monitor.devices', { line: 'LINE-C' });
    expect(devices.rows).toEqual([]);
    expect(devices.totalRowCount).toBe(0);
    expect(devices.fields).toHaveLength(5);

    expect(service.query('monitor.pipeline', { line: 'LINE-C' }).rows).toEqual([]);
    expect(service.query('monitor.alarms', { line: 'LINE-C' }).totalRowCount).toBe(0);
  });

  it('truncates rows with limit but keeps totalRowCount as the filtered total', async () => {
    const service = await createService();

    const devices = service.query('monitor.devices', { line: 'LINE-A', limit: 10 });
    expect(devices.rows).toHaveLength(10);
    expect(devices.totalRowCount).toBe(48);

    const alarms = service.query('monitor.alarms', { line: 'LINE-A', window: 60, limit: 5 });
    expect(alarms.rows).toHaveLength(5);
    expect(alarms.totalRowCount).toBe(14);
  });

  it('serves LINE-A alarms newest first with 2 critical inside a 60 minute window', async () => {
    const service = await createService();

    const result = service.query('monitor.alarms', { line: 'LINE-A', window: 60 });
    const rows = result.rows as readonly Record<string, string | number | null>[];

    expect(rows).toHaveLength(14);
    expect(result.totalRowCount).toBe(14);
    expect(rows.filter((row) => row.level === 'critical')).toHaveLength(2);

    const times = rows.map((row) => Date.parse(String(row.t)));
    expect(times.every((time, index) => index === 0 || time <= times[index - 1]!)).toBe(true);

    // 时间窗确实在切窗：放大到一天能看到更多早期事件。
    expect(service.query('monitor.alarms', { line: 'LINE-A', window: 1440 }).totalRowCount).toBe(
      19,
    );
  });

  it('filters alarms by level and rejects an unknown level', async () => {
    const service = await createService();

    expect(
      service.query('monitor.alarms', { line: 'LINE-A', window: 60, level: 'critical' })
        .totalRowCount,
    ).toBe(2);
    expect(
      service.query('monitor.alarms', { line: 'LINE-A', window: 60, level: 'info' }).totalRowCount,
    ).toBe(7);
    expect(
      service.query('monitor.alarms', { line: 'LINE-A', window: 60, level: 'all' }).totalRowCount,
    ).toBe(14);

    expect(
      errorCode(() => service.query('monitor.alarms', { line: 'LINE-A', level: 'fatal' })),
    ).toBe('UNKNOWN_LEVEL');
  });

  it('returns the six LINE-A stages in declaration order with the third faulted', async () => {
    const service = await createService();

    const result = service.query('monitor.pipeline', { line: 'LINE-A' });
    const rows = result.rows as readonly Record<string, string | number | null>[];

    expect(result.totalRowCount).toBe(6);
    expect(rows.map((row) => row.name)).toEqual(['下料', '冲压', '焊装', '涂装', '总装', '检测']);
    expect(rows[2]?.status).toBe('fault');
    expect(rows[2]?.throughput).toBe(0);
  });

  it('serves monitor.crew sorted by output descending', async () => {
    const service = await createService();

    const result = service.query('monitor.crew', { line: 'LINE-A', limit: 6 });
    const rows = result.rows as readonly Record<string, string | number | null>[];

    expect(result.totalRowCount).toBe(6);
    expect(rows.map((row) => row.crew)).toEqual(['甲班', '乙班', '丙班', '丁班', '戊班', '己班']);
    const outputs = rows.map((row) => Number(row.output));
    expect(outputs.every((value, index) => index === 0 || value <= outputs[index - 1]!)).toBe(true);
    expect(service.query('monitor.crew', { line: 'LINE-A', limit: 3 }).rows).toHaveLength(3);
  });

  it('rejects unknown datasets, lines, windows and limits closed', async () => {
    const service = await createService();

    expect(errorCode(() => service.describe('monitor.nope'))).toBe('UNKNOWN_DATASET');
    expect(errorCode(() => service.query('monitor.nope', { line: 'LINE-A' }))).toBe(
      'UNKNOWN_DATASET',
    );
    expect(errorCode(() => service.query('monitor.devices', { line: 'LINE-Z' }))).toBe(
      'UNKNOWN_LINE',
    );
    expect(errorCode(() => service.query('monitor.devices', { line: '' }))).toBe('UNKNOWN_LINE');
    expect(errorCode(() => service.query('monitor.alarms', { line: 'LINE-A', window: 0 }))).toBe(
      'INVALID_WINDOW',
    );
    expect(errorCode(() => service.query('monitor.alarms', { line: 'LINE-A', window: 1441 }))).toBe(
      'INVALID_WINDOW',
    );
    expect(errorCode(() => service.query('monitor.devices', { line: 'LINE-A', limit: 0 }))).toBe(
      'INVALID_LIMIT',
    );
    expect(errorCode(() => service.query('monitor.devices', { line: 'LINE-A', limit: 49 }))).toBe(
      'INVALID_LIMIT',
    );
    expect(errorCode(() => service.list(undefined, undefined, 0))).toBe('INVALID_LIMIT');
    expect(errorCode(() => service.list(undefined, undefined, 51))).toBe('INVALID_LIMIT');
  });

  it('requires the line parameter when the dataset declares no default', async () => {
    const service = await createService();

    expect(errorCode(() => service.query('monitor.pipeline', {}))).toBe('MISSING_PARAMETER');
    expect(errorCode(() => service.query('monitor.alarms', {}))).toBe('MISSING_PARAMETER');
    // devices 的 line 有默认值，不传也能查询（供单接口试调）。
    expect(service.query('monitor.devices', {}).totalRowCount).toBe(48);
  });

  it('produces byte-identical responses for the same parameters', async () => {
    const service = await createService();
    const parameters = { line: 'LINE-A', window: 240, level: 'warning', limit: 10 } as const;

    const first = service.query('monitor.alarms', parameters);
    const second = service.query('monitor.alarms', parameters);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(service.query('monitor.devices', { line: 'LINE-A' }))).toBe(
      JSON.stringify(service.query('monitor.devices', { line: 'LINE-A' })),
    );
  });
});

/** 取出业务异常里的 `error` 码；没有抛异常时返回 undefined（便于断言「不该抛」）。 */
function errorCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error: unknown) {
    if (!(error instanceof HttpException)) throw error;
    const payload: unknown = error.getResponse();
    if (typeof payload !== 'object' || payload === null) return undefined;
    const code = (payload as { readonly error?: unknown }).error;
    return typeof code === 'string' ? code : undefined;
  }
}

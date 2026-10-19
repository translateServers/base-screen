import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { DatasetValueType } from '../src/datasets/dataset-definitions';
import { coerceCell } from '../src/datasets/dataset-inference';
import {
  queryTimeoutMessage,
  SqliteExecutionError,
  SqliteExecutorService,
} from '../src/sqlite/sqlite-executor.service';
import { inspectSql } from '../src/sqlite/sqlite-sql-guard';

/**
 * 执行器的 e2e：真起子进程、真打开库文件（A20–A23）。
 *
 * 为什么不用 `AppModule`：这里验证的是执行层本身的行为（超时、截断、进程健康、只读），
 * 起一整套 Nest + Prisma 只会把失败原因搅在一起。HTTP 层的 A20–A23 由 T03 的
 * `datasources.e2e-spec.ts` 覆盖，两者共用同一份执行器实现。
 *
 * 超时用**注入的 300 ms**（`SQLITE_TIMEOUT_MS`）而不是真等 3 s：A23 关心的是
 * 「超时后同进程仍能服务」，而不是那 3 秒本身。
 */

jest.setTimeout(60_000);

const WORKSHOP_FILE = 'workshop.db';
const ATTACH_FILE = 'attached.db';

/** A23 的跑飞查询：无限自增 CTE，`count(*)` 永远不会返回。 */
const RUNAWAY_SQL =
  'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c';

/** A20 的六种写语句。 */
const WRITE_STATEMENTS: readonly string[] = [
  "UPDATE devices SET name='x'",
  'DELETE FROM devices',
  'DROP TABLE devices',
  'ATTACH_PLACEHOLDER',
  'PRAGMA journal_mode=DELETE',
  'WITH x AS (SELECT 1) DELETE FROM devices',
];

interface FileSnapshot {
  readonly sha256: string;
  readonly mtimeMs: number;
}

function snapshot(file: string): FileSnapshot {
  return {
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    mtimeMs: statSync(file).mtimeMs,
  };
}

let executor!: SqliteExecutorService;
let directory = '';
let databaseFile = '';
let seedCreated = false;
const envBackup = new Map<string, string | undefined>();

beforeAll(async () => {
  for (const key of ['DATASOURCE_DIR', 'SQLITE_TIMEOUT_MS', 'SQLITE_RUNNER_POOL']) {
    envBackup.set(key, process.env[key]);
  }
  directory = mkdtempSync(join(tmpdir(), 'base-screen-sqlite-'));
  process.env.DATASOURCE_DIR = directory;
  process.env.SQLITE_TIMEOUT_MS = '300';
  process.env.SQLITE_RUNNER_POOL = '1';
  databaseFile = join(directory, WORKSHOP_FILE);

  executor = new SqliteExecutorService(new ConfigService());
  await executor.onModuleInit();
  const seeded = await executor.seedWorkshop(databaseFile);
  seedCreated = seeded.created;
});

afterAll(async () => {
  await executor.onModuleDestroy();
  for (const [key, value] of envBackup) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

describe('ping（启动自检）', () => {
  it('reports the sqlite version and the required APIs', async () => {
    const info = await executor.ping();
    expect(info.sqliteVersion).toMatch(/^3\.\d+\.\d+/);
    expect(info.nodeVersion).toBe(process.version);
    expect(info.apis.columns).toBe(true);
    expect(info.apis.iterate).toBe(true);
    expect(info.apis.setAllowBareNamedParameters).toBe(true);
    expect(info.apis.setReadBigInts).toBe(true);
  });

  it('is cached (a second call does not respawn a process)', async () => {
    const first = await executor.ping();
    const second = await executor.ping();
    expect(second).toBe(first);
    expect(executor.poolUsage).toBe(1);
  });
});

describe('workshop.db（演示库）', () => {
  it('creates the demo database once and skips it afterwards', async () => {
    expect(seedCreated).toBe(true);
    expect(existsSync(databaseFile)).toBe(true);
    const again = await executor.seedWorkshop(databaseFile);
    expect(again.created).toBe(false);
    expect(again.tables).toEqual([]);
  });

  it('seeds 24 devices with exactly 6 fault rows', async () => {
    const counts = await executor.query({
      file: databaseFile,
      sql: 'SELECT count(*) AS total, sum(CASE WHEN status = :fault THEN 1 ELSE 0 END) AS faults FROM devices',
      params: { fault: 'fault' },
    });
    const row = counts.rows[0];
    expect(row?.total).toBe(24);
    expect(row?.faults).toBe(6);
  });

  it('seeds 600 work logs with strictly increasing ISO timestamps', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT count(*) AS total, min(t) AS firstT, max(t) AS lastT FROM work_logs',
    });
    const row = result.rows[0];
    expect(row?.total).toBe(600);
    expect(row?.firstT).toBe('2026-01-01T00:00:00.000Z');
    expect(row?.lastT).toBe('2026-01-01T09:59:00.000Z');
  });

  it('excludes sqlite_% objects and exposes the fault view', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT id, name, line FROM v_fault_devices ORDER BY id',
    });
    expect(result.rowCount).toBe(6);
    expect(result.columns.map((column) => column.name)).toEqual(['id', 'name', 'line']);
  });
});

describe('describe（表结构）', () => {
  it('lists tables and views, and marks BLOB columns unsupported (A18)', async () => {
    const schema = await executor.describe(databaseFile);
    expect(schema.tables.map((table) => table.name)).toEqual([
      'device_photos',
      'devices',
      'v_fault_devices',
      'work_logs',
    ]);
    expect(schema.tables.find((table) => table.name === 'v_fault_devices')?.kind).toBe('view');
    expect(schema.tables.find((table) => table.name === 'devices')?.kind).toBe('table');

    const photos = schema.columns.device_photos ?? [];
    const photoColumn = photos.find((column) => column.name === 'photo');
    expect(photoColumn?.declaredType).toBe('BLOB');
    expect(photoColumn?.supported).toBe(false);

    const devices = schema.columns.devices ?? [];
    expect(devices.every((column) => column.supported)).toBe(true);
    expect(devices.find((column) => column.name === 'load')?.declaredType).toBe('REAL');
    expect(devices.find((column) => column.name === 'id')?.declaredType).toBe('TEXT');
  });

  it('fails with INVALID_SHAPE for a missing file and never leaks the path', async () => {
    let caught: unknown = null;
    try {
      await executor.describe(join(directory, 'missing.db'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqliteExecutionError);
    if (caught instanceof SqliteExecutionError) {
      expect(caught.code).toBe('INVALID_SHAPE');
      expect(caught.message).not.toContain(directory);
    }
  });

  it('marks BLOB cells as null and reports the column', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT id, photo FROM device_photos ORDER BY id',
    });
    expect(result.rowCount).toBe(2);
    expect(result.blobColumns).toEqual(['photo']);
    expect(result.rows[0]?.photo).toBeNull();
    expect(result.rows[0]?.id).toBe('P-001');
  });
});

describe('A22 · 行数截断', () => {
  it('truncates a 600-row table to 500 without rewriting the SQL', async () => {
    const result = await executor.query({ file: databaseFile, sql: 'SELECT * FROM work_logs' });
    expect(result.rowCount).toBe(500);
    expect(result.rows).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it('does not flag truncation when the table is smaller than the limit', async () => {
    const result = await executor.query({ file: databaseFile, sql: 'SELECT * FROM devices' });
    expect(result.rowCount).toBe(24);
    expect(result.truncated).toBe(false);
  });

  it('honours an explicit smaller maxRows (preview path)', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT * FROM work_logs',
      maxRows: 20,
    });
    expect(result.rowCount).toBe(20);
    expect(result.truncated).toBe(true);
  });
});

describe('命名参数与单元格类型', () => {
  it('binds :name parameters', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT id, name, status FROM devices WHERE status = :status ORDER BY id',
      params: { status: 'fault' },
    });
    expect(result.rowCount).toBe(6);
    for (const row of result.rows) expect(row.status).toBe('fault');
  });

  it('rejects an undeclared parameter instead of silently binding null', async () => {
    let caught: unknown = null;
    try {
      await executor.query({
        file: databaseFile,
        sql: 'SELECT id FROM devices',
        params: { bogus: 1 },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqliteExecutionError);
    if (caught instanceof SqliteExecutionError) expect(caught.code).toBe('UNDECLARED_PARAMETER');
  });

  it('coerces cells by declared field types exactly like dataset-inference', async () => {
    const sql = 'SELECT id, load, status FROM devices ORDER BY id LIMIT 5';
    const auto = await executor.query({ file: databaseFile, sql });
    const fieldTypes: Record<string, DatasetValueType> = {
      id: 'number',
      load: 'string',
      status: 'string',
    };
    const typed = await executor.query({ file: databaseFile, sql, fieldTypes });
    expect(typed.rows).toHaveLength(auto.rows.length);

    for (const [index, autoRow] of auto.rows.entries()) {
      const typedRow = typed.rows[index];
      expect(typedRow).toBeDefined();
      if (typedRow === undefined) continue;
      for (const column of ['id', 'load', 'status']) {
        const valueType = fieldTypes[column] ?? 'string';
        // 执行器（.cjs）与 dataset-inference.ts 是两份实现，这里用真实数据断言规则一致
        expect(typedRow[column]).toStrictEqual(coerceCell(autoRow[column], valueType));
      }
    }
    // id 是文本，按 number 强制后应为 null（不是 NaN，也不是 0）
    expect(typed.rows[0]?.id).toBeNull();
    // load 是 REAL，按 string 强制后应为字符串
    expect(typeof typed.rows[0]?.load).toBe('string');
  });

  it('projects missing columns as null instead of undefined (contract safety)', async () => {
    const result = await executor.query({
      file: databaseFile,
      sql: 'SELECT id FROM devices ORDER BY id LIMIT 1',
      fieldTypes: { id: 'string', ghost: 'string' },
    });
    // 结果集里没有 ghost 列：执行器不会凭空造键，投影由主进程的 projectRows 补齐
    expect(result.rows[0]).not.toHaveProperty('ghost');
  });
});

describe('A20 · 只读（两条路径）', () => {
  it('rejects all six write statements and leaves the file byte-identical', async () => {
    const attachSql = `ATTACH DATABASE '${join(directory, ATTACH_FILE)}' AS e`;
    const statements = WRITE_STATEMENTS.map((sql) =>
      sql === 'ATTACH_PLACEHOLDER' ? attachSql : sql,
    );
    const before = snapshot(databaseFile);

    // 路径 1：词法守卫（预览 / 保存都先过它）——写语句根本走不到驱动
    for (const sql of statements) {
      const guarded = inspectSql({ sql });
      expect(guarded.ok).toBe(false);
      if (guarded.ok) continue;
      expect(guarded.code).toBe('READONLY_VIOLATION');
    }
    expect(snapshot(databaseFile)).toEqual(before);

    // 路径 2：绕过守卫直连驱动（纵深防御）——写操作被 SQLite 自身拒绝
    const expectations: Readonly<Record<string, string>> = {
      "UPDATE devices SET name='x'": 'READONLY_VIOLATION',
      'DELETE FROM devices': 'READONLY_VIOLATION',
      'DROP TABLE devices': 'READONLY_VIOLATION',
      [attachSql]: 'INVALID_SHAPE',
      // 只读连接上 `PRAGMA journal_mode=DELETE` 是读操作、会正常返回（实测），文件不变
      'PRAGMA journal_mode=DELETE': 'ALLOWED',
      'WITH x AS (SELECT 1) DELETE FROM devices': 'READONLY_VIOLATION',
    };
    for (const sql of statements) {
      const expected = expectations[sql] ?? 'READONLY_VIOLATION';
      if (expected === 'ALLOWED') {
        const result = await executor.query({ file: databaseFile, sql });
        expect(result.rowCount).toBeLessThanOrEqual(1);
        continue;
      }
      let caught: unknown = null;
      try {
        await executor.query({ file: databaseFile, sql });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SqliteExecutionError);
      if (caught instanceof SqliteExecutionError) expect(caught.code).toBe(expected);
    }

    // 文件一个字节都不变、mtime 也不变；ATTACH 没有顺手创建出目标库文件
    expect(snapshot(databaseFile)).toEqual(before);
    expect(existsSync(join(directory, ATTACH_FILE))).toBe(false);
    const stillThere = await executor.query({
      file: databaseFile,
      sql: 'SELECT count(*) AS total FROM devices',
    });
    expect(stillThere.rows[0]?.total).toBe(24);
  });
});

describe('A23 · 硬超时与进程健康', () => {
  it('kills a runaway query and keeps serving afterwards', async () => {
    expect(executor.timeoutMs).toBe(300);

    const started = Date.now();
    let caught: unknown = null;
    try {
      await executor.query({ file: databaseFile, sql: RUNAWAY_SQL });
    } catch (error) {
      caught = error;
    }
    const elapsedMs = Date.now() - started;

    expect(caught).toBeInstanceOf(SqliteExecutionError);
    if (caught instanceof SqliteExecutionError) {
      expect(caught.code).toBe('QUERY_TIMEOUT');
      expect(caught.message).toContain('查询超时');
      expect(caught.message).toBe(queryTimeoutMessage(300));
    }
    // 300 ms 注入阈值 + 冷启动余量，远小于真等 3 s
    expect(elapsedMs).toBeLessThan(5_000);

    // 超时之后同一个执行器实例仍能正常服务（子进程已懒重建）
    const after = await executor.query({
      file: databaseFile,
      sql: 'SELECT count(*) AS total FROM devices',
    });
    expect(after.rows[0]?.total).toBe(24);
    expect(executor.poolUsage).toBe(1);
  });

  it('keeps the default 3 s timeout when SQLITE_TIMEOUT_MS is absent', () => {
    const saved = process.env.SQLITE_TIMEOUT_MS;
    delete process.env.SQLITE_TIMEOUT_MS;
    try {
      const fresh = new SqliteExecutorService(new ConfigService());
      expect(fresh.timeoutMs).toBe(3000);
      expect(queryTimeoutMessage(3000)).toBe('查询超时（3s）。请缩小范围、加索引或减少 JOIN。');
    } finally {
      if (saved === undefined) delete process.env.SQLITE_TIMEOUT_MS;
      else process.env.SQLITE_TIMEOUT_MS = saved;
    }
  });
});

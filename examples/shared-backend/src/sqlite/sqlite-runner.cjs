'use strict';

/**
 * SQLite 只读执行器（fork 子进程）——**全仓唯一 import `node:sqlite` 的文件**。
 *
 * 为什么是独立进程而不是同进程执行（架构 §0.2 实验 3 的实测结论）：
 * 1. `node:sqlite` **没有 `interrupt()`**，`timeout` 选项只是 busy-timeout，不是查询超时；
 * 2. 跑飞的查询（`WITH RECURSIVE` 无限自增）不是"慢"，而是持续分配临时 B 树，最终把
 *    整个后端进程打挂——`worker_threads.terminate()` 也救不了卡在 native `sqlite3_step`
 *    的线程（实验 3a 里子线程连带主进程被 SIGTERM）；
 * 3. 只有"独立进程 + SIGKILL"能同时满足「3 s 硬超时」与「超时后主进程仍健康」。
 *    实测：稳态 0.45 ms/次（含 IPC），跑飞查询 3 s 精确 SIGKILL，主进程不受影响。
 *
 * 为什么单语句校验要自己做（实验 2）：`prepare('SELECT 1; DROP TABLE devices')` 会**成功**
 * 并且只执行第一条，静默吞掉后面的写语句。驱动不拦多语句，因此词法检查在
 * `sqlite-sql-guard.ts`（主进程）里，本文件只做"纵深防御"的第二层：连接以
 * `readOnly: true` 打开，任何写操作被 SQLite 自身拒绝，文件 SHA-256 与 mtime 不变。
 *
 * 协议：JSON over `process.send` / `process.on('message')`
 *   req  { id, op:'ping'|'describe'|'query'|'seedWorkshop', file?, sql?, params?, maxRows?, maxBytes?, fieldTypes? }
 *   res  { id, ok:true, ... }
 *      | { id, ok:false, code, message }
 */

const fs = require('node:fs');
const path = require('node:path');

/** 默认返回上限；执行器会多读一行用于判断 truncated。 */
const DEFAULT_MAX_ROWS = 500;
/** 单次结果内存上限（PRD S7），与契约整包上限一致。 */
const DEFAULT_MAX_BYTES = 1024 * 1024;
/** 连接缓存条数（LRU）：示例里同时只会用到一两个库文件。 */
const CONNECTION_CACHE_LIMIT = 2;

/**
 * 面向用户的中文文案（白名单）。
 *
 * **绝不直出 `err.message`**：SQLite 的引擎文本会带绝对路径与库内部结构
 * （`unable to open database file: C:\...`），而 PRD A17 要求响应体与错误信息里
 * 不出现任何绝对路径。
 */
const MESSAGES = {
  SQLITE_UNAVAILABLE: '当前 Node 运行时缺少 node:sqlite，无法执行 SQLite 数据源。',
  FILE_MISSING: '数据库文件不存在，请刷新文件列表后重试。',
  OPEN_FAILED: '无法以只读方式打开该数据库文件，请确认它是有效的 SQLite 文件。',
  READONLY: '数据源只允许读取。请使用 SELECT 查询；写操作请在数据库客户端里执行。',
  TABLE_NOT_FOUND: '表或视图不存在（可能已被删除），请重新选表。',
  UNKNOWN_COLUMN: 'SQL 引用了不存在的列，请检查列名。',
  DUPLICATE_COLUMN: '结果集有重名列，请用 AS 起别名。',
  SYNTAX: 'SQL 语法有误，请检查语句。',
  UNKNOWN_PARAMETER: 'SQL 使用了未声明的参数，请先在参数区声明。',
  INVALID_SHAPE: '数据库执行失败，请检查 SQL 与表结构。',
  INTERNAL: '数据源执行进程内部错误。',
  UNKNOWN_OP: '不支持的操作。',
};

/** 领域错误：带稳定错误码，由 IPC 原样回传（主进程再映射 HTTP）。 */
class RunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// node:sqlite 的懒加载与能力自检（R1：实验性 API，缺失要报明确错误而不是 undefined）
// ---------------------------------------------------------------------------

/** @type {null | Record<string, unknown>} */
let sqliteModule = null;
let sqliteModuleError = '';

function loadSqlite() {
  if (sqliteModule !== null) return sqliteModule;
  if (sqliteModuleError !== '') {
    throw new RunnerError(
      'SQLITE_UNAVAILABLE',
      `${MESSAGES.SQLITE_UNAVAILABLE}（${sqliteModuleError}）`,
    );
  }
  try {
    // eslint-disable-next-line global-require
    sqliteModule = require('node:sqlite');
  } catch (error) {
    sqliteModuleError = error && error.code ? String(error.code) : 'require failed';
    throw new RunnerError(
      'SQLITE_UNAVAILABLE',
      `${MESSAGES.SQLITE_UNAVAILABLE}（${sqliteModuleError}）`,
    );
  }
  return sqliteModule;
}

/** 取第一行（`iterate()` 是 22.5 起的核心 API，优先用它而不是 `get()`）。 */
function firstRow(statement, params) {
  const iterator = params === undefined ? statement.iterate() : statement.iterate(params);
  try {
    for (const row of iterator) return row;
    return null;
  } finally {
    closeIterator(iterator);
  }
}

function allRows(statement, params) {
  const rows = [];
  const iterator = params === undefined ? statement.iterate() : statement.iterate(params);
  try {
    for (const row of iterator) rows.push(row);
  } finally {
    closeIterator(iterator);
  }
  return rows;
}

/** 提前 break / 抛错时释放 statement 上的读锁（缺了它 close 会等）。 */
function closeIterator(iterator) {
  if (iterator && typeof iterator.return === 'function') {
    try {
      iterator.return();
    } catch {
      /* 已结束的迭代器 return 会抛，忽略 */
    }
  }
}

function readSqliteVersion() {
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(':memory:');
  try {
    const row = firstRow(db.prepare('SELECT sqlite_version() AS version'));
    return row && row.version !== null && row.version !== undefined ? String(row.version) : '';
  } finally {
    db.close();
  }
}

/**
 * API 面自检：Node 22 与 24 之间 `node:sqlite` 仍是实验特性，缺哪个方法必须**启动即报**，
 * 而不是等第一次查询时报 "undefined is not a function"（R1 的缓解 ②）。
 */
function inspectApi() {
  const mod = loadSqlite();
  const hasDatabaseSync = typeof mod.DatabaseSync === 'function';
  const apis = {
    prepare: false,
    columns: false,
    iterate: false,
    setAllowBareNamedParameters: false,
    setReadBigInts: false,
  };
  if (!hasDatabaseSync) {
    return { apis, sqliteVersion: '' };
  }
  const db = new mod.DatabaseSync(':memory:');
  try {
    const statement = db.prepare('SELECT 1 AS one');
    apis.prepare = typeof db.prepare === 'function';
    apis.columns = typeof statement.columns === 'function';
    apis.iterate = typeof statement.iterate === 'function';
    apis.setAllowBareNamedParameters = typeof statement.setAllowBareNamedParameters === 'function';
    apis.setReadBigInts = typeof statement.setReadBigInts === 'function';
  } finally {
    db.close();
  }
  return { apis, sqliteVersion: readSqliteVersion() };
}

// ---------------------------------------------------------------------------
// 只读连接池（每个文件只开一次，LRU 2）
// ---------------------------------------------------------------------------

/** @type {Map<string, { db: import('node:sqlite').DatabaseSync, mode: string }>} */
const connections = new Map();

function openReadOnly(file) {
  if (typeof file !== 'string' || file === '') {
    throw new RunnerError('INVALID_SHAPE', MESSAGES.OPEN_FAILED);
  }
  const cached = connections.get(file);
  if (cached !== undefined) {
    // LRU：命中后移到队尾
    connections.delete(file);
    connections.set(file, cached);
    return cached;
  }
  if (!fs.existsSync(file)) {
    throw new RunnerError('INVALID_SHAPE', MESSAGES.FILE_MISSING);
  }
  const { DatabaseSync } = loadSqlite();
  /** @type {{ db: import('node:sqlite').DatabaseSync, mode: string }} */
  let entry;
  try {
    entry = { db: new DatabaseSync(file, { readOnly: true }), mode: 'readonly' };
  } catch {
    // R3：WAL 模式库缺 -shm 时只读打开可能失败。`immutable=1` 不做加锁与 WAL 检查，
    // 语义上仍是只读（不写文件），仅用于让演示能打开这类库；打不开就明确失败。
    try {
      entry = {
        db: new DatabaseSync(`file:${file}?immutable=1`, { readOnly: true }),
        mode: 'immutable',
      };
    } catch {
      throw new RunnerError('INVALID_SHAPE', MESSAGES.OPEN_FAILED);
    }
  }
  connections.set(file, entry);
  evictConnections(file);
  return entry;
}

function evictConnections(keepKey) {
  while (connections.size > CONNECTION_CACHE_LIMIT) {
    const oldestKey = connections.keys().next().value;
    if (typeof oldestKey !== 'string' || oldestKey === keepKey) return;
    const evicted = connections.get(oldestKey);
    connections.delete(oldestKey);
    if (evicted !== undefined) {
      try {
        evicted.db.close();
      } catch {
        /* 关闭失败不影响后续请求 */
      }
    }
  }
}

function closeAllConnections() {
  for (const [key, entry] of connections) {
    connections.delete(key);
    try {
      entry.db.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// 单元格归一与类型强制
// ---------------------------------------------------------------------------

function isBinary(value) {
  return value instanceof Uint8Array || (ArrayBuffer.isView(value) && typeof value !== 'string');
}

function safeJson(value) {
  try {
    const text = JSON.stringify(value);
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}

function bigintToNumber(value) {
  if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(value);
  }
  return null;
}

function toNumberCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return bigintToNumber(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isIsoDateString(value) {
  if (typeof value !== 'string' || ISO_DATE_PATTERN.test(value) === false) return false;
  return Number.isNaN(Date.parse(value)) === false;
}

function toBooleanCell(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') return true;
    if (lowered === 'false' || lowered === '0') return false;
  }
  return null;
}

function toDateCell(value) {
  if (typeof value === 'string') return isIsoDateString(value) ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * 按**落库字段**的 valueType 强制单元格类型（保证契约的 `validCell` 永远通过）。
 *
 * 与主进程 `src/datasets/dataset-inference.ts` 的 `coerceCell` **规则必须完全一致**
 * （本文件是 .cjs，无法 import TS，因此是刻意的双实现）；`test/sqlite-executor.e2e-spec.ts`
 * 用真实数据做一致性断言，任何一侧漂移都会红。
 */
function coerceCell(value, valueType) {
  if (value === null || value === undefined) return null;
  if (typeof valueType !== 'string') return autoCell(value);
  switch (valueType) {
    case 'string':
      if (isBinary(value)) return null;
      if (typeof value === 'object') return safeJson(value);
      if (typeof value === 'bigint') return value.toString();
      return String(value);
    case 'number':
      return toNumberCell(value);
    case 'boolean':
      return toBooleanCell(value);
    case 'date':
      return toDateCell(value);
    default:
      return autoCell(value);
  }
}

/** 未声明字段类型时的自动归一（执行器直连路径与 describe 用）。 */
function autoCell(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') {
    const asNumber = bigintToNumber(value);
    return asNumber === null ? value.toString() : asNumber;
  }
  if (typeof value === 'string') return value;
  if (isBinary(value)) return null;
  if (typeof value === 'object') return safeJson(value);
  return null;
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

function configureStatement(statement) {
  if (typeof statement.setAllowBareNamedParameters === 'function') {
    statement.setAllowBareNamedParameters(true);
  }
  // 大整数默认抛 ERR_OUT_OF_RANGE（实验 2 第 7 条），必须先开 BigInt 再逐列归一。
  if (typeof statement.setReadBigInts === 'function') {
    statement.setReadBigInts(true);
  }
}

function readColumns(statement) {
  if (typeof statement.columns !== 'function') return [];
  const raw = statement.columns();
  if (Array.isArray(raw) === false) return [];
  return raw.map((entry) => {
    const record = entry !== null && typeof entry === 'object' ? entry : {};
    const name =
      typeof record.name === 'string' && record.name !== ''
        ? record.name
        : String(record.column || '');
    const declaredType = typeof record.type === 'string' ? record.type : '';
    if (name === '') throw new RunnerError('INVALID_SHAPE', MESSAGES.INVALID_SHAPE);
    return { name, declaredType };
  });
}

function assertNoDuplicateColumns(columns) {
  const seen = new Set();
  for (const column of columns) {
    if (seen.has(column.name)) {
      throw new RunnerError('DUPLICATE_COLUMN', `${MESSAGES.DUPLICATE_COLUMN}（${column.name}）`);
    }
    seen.add(column.name);
  }
}

function normalizeParams(params) {
  if (params === null || typeof params !== 'object') return null;
  // 用 null 原型：参数名可以合法地叫 `__proto__`（`[A-Za-z_][A-Za-z0-9_]*` 能匹配），
  // 普通对象上赋值会改原型而不是加自有键，参数就静默丢了。
  const bound = Object.create(null);
  let count = 0;
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (typeof value === 'string' || typeof value === 'number') {
      bound[key] = value;
      count += 1;
    } else if (typeof value === 'boolean') {
      bound[key] = value ? 1 : 0;
      count += 1;
    }
  }
  return count === 0 ? null : bound;
}

function clampPositiveInteger(value, fallback) {
  if (typeof value !== 'number' || Number.isFinite(value) === false) return fallback;
  const truncated = Math.trunc(value);
  return truncated > 0 ? truncated : fallback;
}

function runQuery(request) {
  const started = Date.now();
  const { db } = openReadOnly(request.file);
  let statement;
  try {
    statement = db.prepare(request.sql);
  } catch (error) {
    throw mapSqliteError(error);
  }
  configureStatement(statement);
  const columns = readColumns(statement);
  assertNoDuplicateColumns(columns);
  const fieldTypes =
    request.fieldTypes !== null && typeof request.fieldTypes === 'object' ? request.fieldTypes : {};
  const maxRows = clampPositiveInteger(request.maxRows, DEFAULT_MAX_ROWS);
  const maxBytes = clampPositiveInteger(request.maxBytes, DEFAULT_MAX_BYTES);
  const params = normalizeParams(request.params);

  const rows = [];
  /** @type {string[]} */
  const blobColumns = [];
  let truncated = false;
  let bytes = 0;
  let iterator;
  try {
    iterator = params === null ? statement.iterate() : statement.iterate(params);
  } catch (error) {
    throw mapSqliteError(error);
  }
  try {
    for (const raw of iterator) {
      // 多读一行：读满上限后仍有产出 → 结果被截断（不需要改写用户 SQL）
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      // 行对象用 null 原型构造，规避列名为 `__proto__` 时静默丢键
      const row = Object.create(null);
      for (const column of columns) {
        const original = raw[column.name];
        if (isBinary(original) && blobColumns.indexOf(column.name) < 0)
          blobColumns.push(column.name);
        row[column.name] = coerceCell(original, fieldTypes[column.name]);
      }
      const size = Buffer.byteLength(JSON.stringify(row), 'utf8');
      if (bytes + size > maxBytes) {
        truncated = true;
        break;
      }
      bytes += size;
      rows.push(row);
    }
  } catch (error) {
    throw mapSqliteError(error);
  } finally {
    closeIterator(iterator);
  }

  return {
    columns,
    rows,
    truncated,
    blobColumns,
    rowCount: rows.length,
    bytes,
    ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// 表结构枚举
// ---------------------------------------------------------------------------

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function describeFile(request) {
  const started = Date.now();
  const { db } = openReadOnly(request.file);
  const objects = allRows(
    db.prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ),
  );
  const tables = [];
  const columns = Object.create(null);
  for (const object of objects) {
    const name = String(object.name);
    const kind = object.type === 'view' ? 'view' : 'table';
    tables.push({ name, kind });
    let info = [];
    try {
      // 实测：`PRAGMA table_info(...)` 可以 prepare，返回 name/type/notnull/pk
      info = allRows(db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`));
    } catch {
      info = [];
    }
    columns[name] = info.map((column) => {
      const declaredType =
        column.type === null || column.type === undefined ? '' : String(column.type);
      return {
        name: String(column.name),
        declaredType,
        // 二进制列不可勾选（PRD §8.3）：勾进去 query 会被「结果含二进制列」拒绝
        supported: declaredType.trim().toUpperCase().indexOf('BLOB') < 0,
      };
    });
  }
  return { tables, columns, ms: Date.now() - started };
}

// ---------------------------------------------------------------------------
// 演示库 workshop.db（启动时幂等生成）
// ---------------------------------------------------------------------------

const DEVICE_COUNT = 24;
/** 8 个一周期的状态序列，含 2 个 fault → 24 行恰好 6 个 fault（A19：≥1 且 < 24）。 */
const DEVICE_STATUS_CYCLE = [
  'running',
  'running',
  'fault',
  'standby',
  'running',
  'fault',
  'offline',
  'running',
];
const LINE_CYCLE = ['LINE-A', 'LINE-B', 'LINE-C'];
/** 600 行 > 500，用于演示 S3 的行数截断。 */
const WORK_LOG_COUNT = 600;
const WORK_LOG_STATUS_CYCLE = ['ok', 'ok', 'warn', 'ok', 'fail'];
const WORK_LOG_START_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const WORK_LOG_STEP_MS = 60 * 1000;

const WORKSHOP_DDL = [
  `CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT,
    line TEXT,
    status TEXT,
    load REAL
  )`,
  `CREATE TABLE work_logs (
    id TEXT PRIMARY KEY,
    device_id TEXT,
    t TEXT,
    status TEXT,
    throughput INTEGER,
    defect_rate REAL
  )`,
  // A18 要求表结构接口里有一列标 supported:false，但 devices 不能加 BLOB
  // （否则 `SELECT * FROM devices` 会被「结果含二进制列」拒绝，破坏演示），故单开一张表。
  `CREATE TABLE device_photos (
    id TEXT PRIMARY KEY,
    device_id TEXT,
    taken_at TEXT,
    photo BLOB
  )`,
  `CREATE VIEW v_fault_devices AS
    SELECT id, name, line FROM devices WHERE status = 'fault'`,
];

function padNumber(value, width) {
  return String(value).padStart(width, '0');
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function insertDevices(db) {
  const statement = db.prepare(
    'INSERT INTO devices (id, name, line, status, load) VALUES (:id, :name, :line, :status, :load)',
  );
  for (let index = 0; index < DEVICE_COUNT; index += 1) {
    statement.run({
      id: `D-${padNumber(index + 1, 3)}`,
      name: `${index + 1} 号冲压机`,
      line: LINE_CYCLE[index % LINE_CYCLE.length],
      status: DEVICE_STATUS_CYCLE[index % DEVICE_STATUS_CYCLE.length],
      // REAL 列：40.0–95.7 之间，两位小数且不出现浮点尾巴
      load: roundTo(40 + ((index * 7) % 55) + (index % 3) * 0.37, 2),
    });
  }
}

function insertWorkLogs(db) {
  const statement = db.prepare(
    'INSERT INTO work_logs (id, device_id, t, status, throughput, defect_rate) VALUES (:id, :deviceId, :t, :status, :throughput, :defectRate)',
  );
  for (let index = 0; index < WORK_LOG_COUNT; index += 1) {
    statement.run({
      id: `W-${padNumber(index + 1, 4)}`,
      deviceId: `D-${padNumber((index % DEVICE_COUNT) + 1, 3)}`,
      // 严格递增的 ISO 时间串：演示 date 类型与排序
      t: new Date(WORK_LOG_START_MS + index * WORK_LOG_STEP_MS).toISOString(),
      status: WORK_LOG_STATUS_CYCLE[index % WORK_LOG_STATUS_CYCLE.length],
      throughput: 100 + ((index * 13) % 400),
      defectRate: roundTo((index % 37) / 1000, 3),
    });
  }
}

function insertDevicePhotos(db) {
  const statement = db.prepare(
    'INSERT INTO device_photos (id, device_id, taken_at, photo) VALUES (:id, :deviceId, :takenAt, :photo)',
  );
  for (let index = 0; index < 2; index += 1) {
    // 16 字节占位，而不是真实图片：演示的是「二进制列不可勾选」，不是图片查看器
    const photo = Buffer.alloc(16, index === 0 ? 0x11 : 0x22);
    statement.run({
      id: `P-${padNumber(index + 1, 3)}`,
      deviceId: `D-${padNumber(index + 1, 3)}`,
      takenAt: new Date(Date.UTC(2026, 2, 1, 8 + index, 0, 0)).toISOString(),
      photo,
    });
  }
}

/**
 * 幂等生成演示库：文件存在就**什么都不做**（用户可能改过，不覆盖、不校验内容）。
 *
 * 这是全仓唯一以写模式打开 SQLite 的地方，且只在「文件缺失 + 启动时」发生一次。
 * 故意用默认 journal 模式（DELETE）而**不是 WAL**：只读打开 WAL 库在缺 `-shm` 时
 * 可能失败（R3），演示库不该自带这个坑。
 */
function seedWorkshop(request) {
  const file = request.file;
  if (typeof file !== 'string' || file === '') {
    throw new RunnerError('INVALID_SHAPE', MESSAGES.OPEN_FAILED);
  }
  if (fs.existsSync(file)) return { created: false, tables: [] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = loadSqlite();
  const db = new DatabaseSync(file);
  try {
    db.exec('BEGIN');
    for (const statement of WORKSHOP_DDL) db.exec(statement);
    insertDevices(db);
    insertWorkLogs(db);
    insertDevicePhotos(db);
    db.exec('COMMIT');
    return {
      created: true,
      tables: allRows(
        db.prepare(
          "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        ),
      ).map((row) => ({ name: String(row.name), kind: row.type === 'view' ? 'view' : 'table' })),
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* 事务可能已自动回滚 */
    }
    throw error;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// 错误映射与 IPC
// ---------------------------------------------------------------------------

function mapSqliteError(error) {
  const raw = error && error.message ? String(error.message) : '';
  const lowered = raw.toLowerCase();
  if (
    lowered.indexOf('readonly') >= 0 ||
    lowered.indexOf('read-only') >= 0 ||
    lowered.indexOf('attempt to write') >= 0
  ) {
    return new RunnerError('READONLY_VIOLATION', MESSAGES.READONLY);
  }
  if (lowered.indexOf('no such table') >= 0) {
    return new RunnerError('TABLE_NOT_FOUND', MESSAGES.TABLE_NOT_FOUND);
  }
  if (lowered.indexOf('no such column') >= 0) {
    return new RunnerError('UNKNOWN_COLUMN', MESSAGES.UNKNOWN_COLUMN);
  }
  if (lowered.indexOf('unknown named parameter') >= 0) {
    return new RunnerError('UNDECLARED_PARAMETER', MESSAGES.UNKNOWN_PARAMETER);
  }
  if (lowered.indexOf('syntax error') >= 0) {
    return new RunnerError('INVALID_SHAPE', MESSAGES.SYNTAX);
  }
  return new RunnerError('INVALID_SHAPE', MESSAGES.INVALID_SHAPE);
}

function errorCodeOf(error) {
  if (error instanceof RunnerError) return error.code;
  return 'INTERNAL_ERROR';
}

function errorMessageOf(error) {
  if (error instanceof RunnerError) return error.message;
  // 非领域错误一律不透传引擎/Node 原始文本（可能含绝对路径）
  return MESSAGES.INTERNAL;
}

function send(payload) {
  if (process.connected === false) return;
  try {
    process.send(payload);
  } catch {
    /* 父进程已消失：静默退出即可 */
  }
}

function dispatch(message) {
  switch (message.op) {
    case 'ping': {
      const { apis, sqliteVersion } = inspectApi();
      const missing = Object.keys(apis).filter((key) => apis[key] !== true);
      if (missing.length > 0) {
        throw new RunnerError(
          'SQLITE_UNAVAILABLE',
          `${MESSAGES.SQLITE_UNAVAILABLE}（缺少 API: ${missing.join(', ')}）`,
        );
      }
      return { sqliteVersion, nodeVersion: process.version, apis };
    }
    case 'query':
      return runQuery(message);
    case 'describe':
      return describeFile(message);
    case 'seedWorkshop':
      return seedWorkshop(message);
    default:
      throw new RunnerError('INVALID_SHAPE', MESSAGES.UNKNOWN_OP);
  }
}

process.on('message', (message) => {
  if (message === null || typeof message !== 'object') return;
  const id = message.id;
  if (typeof id !== 'number') return;
  try {
    const payload = dispatch(message);
    send({ id, ok: true, ...payload });
  } catch (error) {
    // 非领域错误（实现 bug）比领域错误更需要线索：只写 stderr（父进程按 debug 级别记录），
    // 绝不进 IPC 响应——响应文案必须白名单化，否则引擎文本会把绝对路径带出去。
    if (error instanceof RunnerError === false) {
      try {
        process.stderr.write(`${error && error.stack ? String(error.stack) : String(error)}\n`);
      } catch {
        /* stderr 已关闭 */
      }
    }
    send({ id, ok: false, code: errorCodeOf(error), message: errorMessageOf(error) });
  }
});

// 进程级兜底：任何未捕获异常都让父进程收到明确失败并让位（懒重建），
// 而不是留一个"半死"的进程继续接请求。
process.on('uncaughtException', (error) => {
  send({ id: -1, ok: false, code: 'INTERNAL_ERROR', message: errorMessageOf(error) });
  process.exit(1);
});

process.on('unhandledRejection', () => {
  send({ id: -1, ok: false, code: 'INTERNAL_ERROR', message: MESSAGES.INTERNAL });
  process.exit(1);
});

// 父进程退出/被 SIGKILL 时 IPC 断开：释放连接后自行退出，避免留下孤儿进程。
process.on('disconnect', () => {
  closeAllConnections();
  process.exit(0);
});

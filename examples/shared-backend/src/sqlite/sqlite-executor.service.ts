import { type ChildProcess, fork } from 'node:child_process';
import { join } from 'node:path';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AirQualityHourlyRow, AirQualityLatestRow } from '../datasets/air-quality-snapshot';
import type { DatasetValueType } from '../datasets/dataset-definitions';
import {
  type CellScalar,
  DEFAULT_SQLITE_RUNNER_POOL,
  DEFAULT_SQLITE_TIMEOUT_MS,
  MAX_RESULT_BYTES,
  MAX_RESULT_ROWS,
} from '../datasources/datasource.types';

/**
 * SQLite 执行器（主进程侧）：常驻 `fork` 子进程池 + FIFO 队列 + 硬超时（架构 §4.1）。
 *
 * 三条关键设计：
 * 1. **每个子进程一次只跑一个请求**（请求按 FIFO 分配），因此「超时」这件事永远不会
 *    被排队时间污染——`timeoutMs` 从**派发**开始计时，排队不计。
 * 2. **超时只能 SIGKILL**：`node:sqlite` 没有 `interrupt()`（实验 2），`Promise.race`
 *    会把连接永久占住（实验 4c）。杀死子进程后该槽位从池里移除，下一个请求懒重建
 *    （实测冷启动约 150 ms，稳态 0.45 ms/次）。
 * 3. **超时可注入**：构造参数来自 `SQLITE_TIMEOUT_MS`，A23 用 300 ms 的实例断言
 *    「超时后同进程仍可服务」，不必真等 3 s；生产默认仍是 3000 ms。
 *
 * 池大小与超时的来源都是 `ConfigService`（不是构造参数），这样 Nest DI 与
 * 单测都能用同一套入口：单测 `new ConfigService()` 前改 `process.env` 即可。
 */

/** 执行器协议里的错误码（与 runner 的返回码一一对应）。 */
export type SqliteErrorCode =
  | 'QUERY_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'READONLY_VIOLATION'
  | 'TABLE_NOT_FOUND'
  | 'UNKNOWN_COLUMN'
  | 'DUPLICATE_COLUMN'
  | 'INVALID_SHAPE'
  | 'UNDECLARED_PARAMETER'
  | 'SQLITE_UNAVAILABLE';

const RUNNER_ERROR_CODES: ReadonlySet<string> = new Set<SqliteErrorCode>([
  'READONLY_VIOLATION',
  'TABLE_NOT_FOUND',
  'UNKNOWN_COLUMN',
  'DUPLICATE_COLUMN',
  'INVALID_SHAPE',
  'UNDECLARED_PARAMETER',
  'SQLITE_UNAVAILABLE',
]);

/** 领域错误：`code` 是稳定错误码，由上层（Service）映射成 HTTP 状态与响应体。 */
export class SqliteExecutionError extends Error {
  readonly code: SqliteErrorCode;

  constructor(code: SqliteErrorCode, message: string) {
    super(message);
    this.name = 'SqliteExecutionError';
    this.code = code;
  }
}

const MESSAGES = {
  crashed: '数据源执行进程异常，已重建，请重试。',
  unavailable: 'SQLite 执行器不可用，无法执行数据源查询。',
  disposed: '执行器已关闭，无法再执行查询。',
  invalidPayload: '数据源执行进程返回了无法识别的结果。',
} as const;

/** 超时文案：3 s → 「查询超时（3s）」；注入的 300 ms → 「查询超时（0.3s）」。 */
export function queryTimeoutMessage(timeoutMs: number): string {
  const seconds = timeoutMs % 1000 === 0 ? String(timeoutMs / 1000) : (timeoutMs / 1000).toFixed(1);
  return `查询超时（${seconds}s）。请缩小范围、加索引或减少 JOIN。`;
}

/** 控制类操作（ping / describe / describe 表结构 / 建库）的超时：与查询超时解耦。 */
const CONTROL_TIMEOUT_MS = 15_000;

/** runner 文件名：与编译产物同目录（`nest-cli.json` 的 assets 保证 .cjs 进 dist）。 */
const RUNNER_FILE_NAME = 'sqlite-runner.cjs';

export interface SqliteColumnInfo {
  readonly name: string;
  readonly declaredType: string;
}

export interface SqliteTableColumn {
  readonly name: string;
  readonly declaredType: string;
  /** 二进制列（BLOB）不可勾选，`supported:false`。 */
  readonly supported: boolean;
}

export interface SqliteTableInfo {
  readonly name: string;
  readonly kind: 'table' | 'view';
}

export interface SqliteQueryRequest {
  /** 已校验过的绝对路径（路径守卫在 `datasource-path.ts`）。 */
  readonly file: string;
  readonly sql: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** 返回行数上限，默认 500（PRD S3）。 */
  readonly maxRows?: number;
  /** 结果字节预算（PRD S7），默认 1 MiB。 */
  readonly maxBytes?: number;
  /** 落库字段的 valueType：给了就按它强制类型，保证契约 validCell 通过。 */
  readonly fieldTypes?: Readonly<Record<string, DatasetValueType>>;
  readonly timeoutMs?: number;
}

export interface SqliteQueryResult {
  readonly columns: readonly SqliteColumnInfo[];
  readonly rows: readonly Readonly<Record<string, CellScalar>>[];
  readonly truncated: boolean;
  readonly rowCount: number;
  readonly durationMs: number;
  /** 命中的二进制列（执行器已把单元格置 null）。 */
  readonly blobColumns: readonly string[];
}

export interface SqliteDescribeResult {
  readonly tables: readonly SqliteTableInfo[];
  readonly columns: Readonly<Record<string, readonly SqliteTableColumn[]>>;
}

export interface SqlitePingInfo {
  readonly sqliteVersion: string;
  readonly nodeVersion: string;
  readonly apis: Readonly<Record<string, boolean>>;
}

export interface SqliteSeedResult {
  readonly created: boolean;
  readonly tables: readonly SqliteTableInfo[];
}

interface QueuedRequest {
  readonly payload: Record<string, unknown>;
  readonly timeoutMs: number;
  readonly resolve: (payload: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
}

interface InFlightRequest {
  readonly slot: RunnerSlot;
  readonly timeoutMs: number;
  readonly resolve: (payload: Record<string, unknown>) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

/** 池里的一个槽位：一个子进程 + 是否在跑请求 + 是否已预热完成。 */
class RunnerSlot {
  readonly child: ChildProcess;
  busy = false;
  /**
   * 预热握手（`op:'ping'`）是否已完成。
   *
   * 只有 ready 的槽位才会被分配请求：子进程冷启动约 150 ms，如果从"派发"就开始计 3 s
   * 超时，一次冷启动就吃掉大半预算（并行跑测试时足以把一次普通查询判成超时）。
   * 预热用控制超时（15 s），不计入任何查询的预算。
   */
  ready = false;

  constructor(child: ChildProcess) {
    this.child = child;
  }
}

@Injectable()
export class SqliteExecutorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqliteExecutorService.name);
  private readonly runnerPath = join(__dirname, RUNNER_FILE_NAME);
  private readonly poolSize: number;
  private readonly queryTimeoutMs: number;
  private readonly slots: RunnerSlot[] = [];
  private readonly queue: QueuedRequest[] = [];
  private readonly inFlight = new Map<number, InFlightRequest>();
  private nextRequestId = 1;
  private disposed = false;
  private pingPromise: Promise<SqlitePingInfo> | null = null;
  private cachedPing: SqlitePingInfo | null = null;

  constructor(config: ConfigService) {
    this.poolSize = readPositiveInt(
      config.get<unknown>('SQLITE_RUNNER_POOL'),
      DEFAULT_SQLITE_RUNNER_POOL,
    );
    this.queryTimeoutMs = readPositiveInt(
      config.get<unknown>('SQLITE_TIMEOUT_MS'),
      DEFAULT_SQLITE_TIMEOUT_MS,
    );
  }

  /** 当前生效的单次查询超时（毫秒）。测试用它断言注入生效。 */
  get timeoutMs(): number {
    return this.queryTimeoutMs;
  }

  /** 启动自检：`op:'ping'` 验证 `node:sqlite` 与所需 API 都在（R1），缺失即启动失败。 */
  async onModuleInit(): Promise<void> {
    await this.ping();
  }

  async onModuleDestroy(): Promise<void> {
    this.dispose();
  }

  /** 幂等自检：成功结果缓存，失败后允许重试（不缓存失败的 Promise）。 */
  async ping(): Promise<SqlitePingInfo> {
    if (this.cachedPing !== null) return this.cachedPing;
    if (this.pingPromise === null) {
      this.pingPromise = this.runPing().catch((error: unknown) => {
        this.pingPromise = null;
        throw error;
      });
    }
    return this.pingPromise;
  }

  private async runPing(): Promise<SqlitePingInfo> {
    const payload = await this.request({ op: 'ping' }, CONTROL_TIMEOUT_MS);
    const apis = readBooleanRecord(payload.apis);
    const missing = Object.entries(apis)
      .filter(([, available]) => available !== true)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new SqliteExecutionError(
        'SQLITE_UNAVAILABLE',
        `${MESSAGES.unavailable}（缺少 API: ${missing.join(', ')}）`,
      );
    }
    const info: SqlitePingInfo = {
      sqliteVersion: typeof payload.sqliteVersion === 'string' ? payload.sqliteVersion : 'unknown',
      nodeVersion: typeof payload.nodeVersion === 'string' ? payload.nodeVersion : process.version,
      apis,
    };
    this.cachedPing = info;
    this.logger.log(
      `SQLite 执行器就绪：node:sqlite ${info.sqliteVersion}（Node ${info.nodeVersion}，池 ${this.poolSize}，超时 ${this.queryTimeoutMs}ms）`,
    );
    return info;
  }

  /** 执行一条**已经过词法守卫**的只读查询。 */
  async query(request: SqliteQueryRequest): Promise<SqliteQueryResult> {
    const payload = await this.request(
      {
        op: 'query',
        file: request.file,
        sql: request.sql,
        params: request.params ?? {},
        maxRows: request.maxRows ?? MAX_RESULT_ROWS,
        maxBytes: request.maxBytes ?? MAX_RESULT_BYTES,
        fieldTypes: request.fieldTypes ?? {},
      },
      request.timeoutMs ?? this.queryTimeoutMs,
    );
    return toQueryResult(payload);
  }

  /** 枚举表/视图与列（表模式勾列、A18 的 `supported:false` 都依赖它）。 */
  async describe(file: string): Promise<SqliteDescribeResult> {
    const payload = await this.request({ op: 'describe', file }, CONTROL_TIMEOUT_MS);
    return {
      tables: readTables(payload.tables),
      columns: readColumnsByTable(payload.columns),
    };
  }

  /** 幂等生成演示库（文件存在即跳过）。 */
  async seedWorkshop(file: string): Promise<SqliteSeedResult> {
    const payload = await this.request({ op: 'seedWorkshop', file }, CONTROL_TIMEOUT_MS);
    return { created: payload.created === true, tables: readTables(payload.tables) };
  }

  /** 幂等生成真实空气质量快照库（文件存在即跳过）。 */
  async seedAirQuality(
    file: string,
    content: {
      readonly hourly: readonly AirQualityHourlyRow[];
      readonly latest: readonly AirQualityLatestRow[];
    },
  ): Promise<SqliteSeedResult> {
    const payload = await this.request(
      { op: 'seedAirQuality', file, hourly: content.hourly, latest: content.latest },
      CONTROL_TIMEOUT_MS,
    );
    return { created: payload.created === true, tables: readTables(payload.tables) };
  }

  /** 当前存活的子进程数（测试与日志用）。 */
  get poolUsage(): number {
    return this.slots.length;
  }

  private request(
    payload: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (this.disposed) {
      return Promise.reject(new SqliteExecutionError('INTERNAL_ERROR', MESSAGES.disposed));
    }
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.queue.push({ payload, timeoutMs, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const slot = this.acquireSlot();
      if (slot === null) return;
      const queued = this.queue.shift();
      if (queued === undefined) return;
      this.dispatch(slot, queued);
    }
  }

  private acquireSlot(): RunnerSlot | null {
    const free = this.slots.find((slot) => slot.busy === false && slot.ready);
    if (free !== undefined) return free;
    // 有槽位在预热：等它（预热结束时 handshake 会重新 pump），不要塞给它
    if (this.slots.some((slot) => slot.ready === false)) return null;
    if (this.slots.length >= this.poolSize) return null;
    this.spawnSlot();
    return null;
  }

  private spawnSlot(): void {
    try {
      const child = fork(this.runnerPath, [], {
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      });
      const slot = new RunnerSlot(child);
      this.slots.push(slot);
      child.on('message', (message: unknown) => {
        this.handleMessage(slot, message);
      });
      child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.handleExit(slot, code, signal);
      });
      child.on('error', (error: Error) => {
        this.logger.warn(`SQLite 执行器进程错误：${error.message}`);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        // runner 只会在真正出问题时写 stderr（ExperimentalWarning 已被 NODE_NO_WARNINGS 消掉）
        this.logger.debug(`sqlite-runner: ${chunk.toString().trim()}`);
      });
      this.handshake(slot);
    } catch {
      /* fork 失败：请求会在超时后被拒绝，日志由 exit/error 事件给出 */
    }
  }

  /**
   * 预热握手：子进程起来后先跑一次 `op:'ping'`，成功才把它标记为 ready。
   *
   * 失败（`node:sqlite` 缺失、API 面不完整、进程起不来）→ 失败关闭：把当前队列全部
   * 拒绝，而不是重启-失败-再重启地空转。
   */
  private handshake(slot: RunnerSlot): void {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    slot.busy = true;
    const timer = setTimeout(() => {
      this.handleTimeout(id);
    }, CONTROL_TIMEOUT_MS);
    timer.unref();
    this.inFlight.set(id, {
      slot,
      timeoutMs: CONTROL_TIMEOUT_MS,
      resolve: () => {
        slot.ready = true;
        this.pump();
      },
      reject: (error: Error) => {
        this.retireSlot(slot);
        this.logger.warn(`SQLite 执行器预热失败：${error.message}`);
        for (const queued of this.queue.splice(0)) queued.reject(error);
      },
      timer,
    });
    try {
      slot.child.send({ id, op: 'ping' });
    } catch {
      this.inFlight.delete(id);
      clearTimeout(timer);
      slot.busy = false;
      this.retireSlot(slot);
    }
  }

  private dispatch(slot: RunnerSlot, queued: QueuedRequest): void {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    slot.busy = true;
    // 从**派发**开始计时：排队时间不计入超时
    const timer = setTimeout(() => {
      this.handleTimeout(id);
    }, queued.timeoutMs);
    // 定时器 unref 只为避免 jest 报 open handle；子进程句柄本身会让事件循环存活
    timer.unref();
    this.inFlight.set(id, {
      slot,
      timeoutMs: queued.timeoutMs,
      resolve: queued.resolve,
      reject: queued.reject,
      timer,
    });
    try {
      slot.child.send({ id, ...queued.payload });
    } catch {
      this.inFlight.delete(id);
      clearTimeout(timer);
      slot.busy = false;
      queued.reject(new SqliteExecutionError('INTERNAL_ERROR', MESSAGES.crashed));
      this.pump();
    }
  }

  private handleMessage(slot: RunnerSlot, message: unknown): void {
    if (message === null || typeof message !== 'object') return;
    const record = message as Record<string, unknown>;
    const id = record.id;
    // 未知/迟到的 id 直接丢弃：超时被杀的子进程可能还会吐一条残留消息
    if (typeof id !== 'number') return;
    const entry = this.inFlight.get(id);
    if (entry === undefined) return;
    this.inFlight.delete(id);
    clearTimeout(entry.timer);
    slot.busy = false;
    if (record.ok === true) {
      entry.resolve(record);
    } else {
      entry.reject(
        new SqliteExecutionError(
          readErrorCode(record.code),
          typeof record.message === 'string' ? record.message : MESSAGES.invalidPayload,
        ),
      );
    }
    this.pump();
  }

  private handleTimeout(id: number): void {
    const entry = this.inFlight.get(id);
    if (entry === undefined) return;
    this.inFlight.delete(id);
    clearTimeout(entry.timer);
    // 先从池里移除再杀：否则 pump 可能立刻把下一个请求派给这个待死进程
    this.retireSlot(entry.slot);
    entry.slot.busy = false;
    try {
      entry.slot.child.kill('SIGKILL');
    } catch {
      /* 进程已退出 */
    }
    entry.reject(new SqliteExecutionError('QUERY_TIMEOUT', queryTimeoutMessage(entry.timeoutMs)));
    this.pump();
  }

  private handleExit(slot: RunnerSlot, code: number | null, signal: NodeJS.Signals | null): void {
    const wasActive = this.slots.includes(slot);
    this.retireSlot(slot);
    slot.busy = false;
    for (const [id, entry] of this.inFlight) {
      if (entry.slot !== slot) continue;
      this.inFlight.delete(id);
      clearTimeout(entry.timer);
      entry.reject(new SqliteExecutionError('INTERNAL_ERROR', MESSAGES.crashed));
    }
    if (this.disposed === false && wasActive) {
      const reason = signal === null ? `exit code ${code ?? 0}` : `signal ${signal}`;
      this.logger.warn(`SQLite 执行器进程退出（${reason}），下一个请求将懒重建。`);
    }
    this.pump();
  }

  private retireSlot(slot: RunnerSlot): void {
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
  }

  private dispose(): void {
    this.disposed = true;
    for (const queued of this.queue.splice(0)) {
      queued.reject(new SqliteExecutionError('INTERNAL_ERROR', MESSAGES.disposed));
    }
    for (const [id, entry] of this.inFlight) {
      this.inFlight.delete(id);
      clearTimeout(entry.timer);
      entry.reject(new SqliteExecutionError('INTERNAL_ERROR', MESSAGES.disposed));
    }
    for (const slot of this.slots.splice(0)) {
      try {
        slot.child.kill('SIGKILL');
      } catch {
        /* 进程已退出 */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// IPC 载荷解析（runner 是独立进程，返回值只能是 unknown，必须逐字段收窄）
// ---------------------------------------------------------------------------

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed) === false) return fallback;
  const truncated = Math.trunc(parsed);
  return truncated > 0 ? truncated : fallback;
}

function readErrorCode(value: unknown): SqliteErrorCode {
  if (typeof value === 'string' && RUNNER_ERROR_CODES.has(value)) {
    return value as SqliteErrorCode;
  }
  return 'INTERNAL_ERROR';
}

function readBooleanRecord(value: unknown): Readonly<Record<string, boolean>> {
  if (value === null || typeof value !== 'object') return {};
  const record: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry === true;
  }
  return record;
}

function isCellScalar(value: unknown): value is CellScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function readRows(value: unknown): readonly Readonly<Record<string, CellScalar>>[] {
  if (Array.isArray(value) === false) return [];
  const rows: Record<string, CellScalar>[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const row: Record<string, CellScalar> = Object.create(null);
    for (const [key, cell] of Object.entries(entry)) {
      row[key] = isCellScalar(cell) ? cell : null;
    }
    rows.push(row);
  }
  return rows;
}

function readColumns(value: unknown): readonly SqliteColumnInfo[] {
  if (Array.isArray(value) === false) return [];
  const columns: SqliteColumnInfo[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== 'string') continue;
    columns.push({
      name: record.name,
      declaredType: typeof record.declaredType === 'string' ? record.declaredType : '',
    });
  }
  return columns;
}

function readTables(value: unknown): readonly SqliteTableInfo[] {
  if (Array.isArray(value) === false) return [];
  const tables: SqliteTableInfo[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== 'string') continue;
    tables.push({ name: record.name, kind: record.kind === 'view' ? 'view' : 'table' });
  }
  return tables;
}

function readColumnsByTable(
  value: unknown,
): Readonly<Record<string, readonly SqliteTableColumn[]>> {
  if (value === null || typeof value !== 'object') return {};
  const result: Record<string, readonly SqliteTableColumn[]> = {};
  for (const [table, columns] of Object.entries(value)) {
    if (Array.isArray(columns) === false) {
      result[table] = [];
      continue;
    }
    const parsed: SqliteTableColumn[] = [];
    for (const entry of columns) {
      if (entry === null || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.name !== 'string') continue;
      parsed.push({
        name: record.name,
        declaredType: typeof record.declaredType === 'string' ? record.declaredType : '',
        supported: record.supported === true,
      });
    }
    result[table] = parsed;
  }
  return result;
}

function toQueryResult(payload: Record<string, unknown>): SqliteQueryResult {
  const rows = readRows(payload.rows);
  return {
    columns: readColumns(payload.columns),
    rows,
    truncated: payload.truncated === true,
    rowCount: typeof payload.rowCount === 'number' ? payload.rowCount : rows.length,
    durationMs: typeof payload.ms === 'number' ? payload.ms : 0,
    blobColumns: Array.isArray(payload.blobColumns)
      ? payload.blobColumns.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

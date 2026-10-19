import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatasetFieldDefinition } from '../datasets/dataset-definitions';
import {
  fieldsFromTableColumns,
  inferFieldsFromColumns,
  projectRows,
} from '../datasets/dataset-inference';
import { SqliteExecutionError, SqliteExecutorService } from '../sqlite/sqlite-executor.service';
import { buildTableQuery } from '../sqlite/sqlite-query-builder';
import { inspectSql } from '../sqlite/sqlite-sql-guard';
import {
  type DatasourceRow,
  DEFAULT_REST_TIMEOUT_MS,
  DEFAULT_SQLITE_TIMEOUT_MS,
  MAX_RESULT_ROWS,
  type ParameterDeclaration,
  type StoredDataSourceConfig,
  type StoredDataSourceType,
} from './datasource.types';
import { resolveDatabaseFile } from './datasource-path';
import { RestDatasourceExecutor } from './rest-datasource-executor';

/**
 * 统一取数入口（架构 §4.1）：管理侧的 test / preview / 已存测试，与契约侧的
 * `GET /api/datasets/:id/query` **走同一份实现**。
 *
 * 这是 A3/A24 的结构性保证：字段只在一个地方推断、单元格只在一个地方归一，
 * 因此「describe 的字段」与「query 的字段」不可能漂移——它们出自同一个 `fields` 数组。
 *
 * 失败一律返回 `{ok:false, code, message}`，不抛 HttpException：这一层不知道 HTTP
 * （管理侧的 test/preview 映射成 200/4xx，契约侧运行时失败映射成 4xx/5xx），
 * 文案与错误码表见架构 §4.6 与 `datasource-errors.ts`。
 */

export interface RuntimeRequest {
  readonly type: StoredDataSourceType;
  readonly config: StoredDataSourceConfig;
  /** 已解析的参数值；缺省即"没有值"。 */
  readonly values: Readonly<Record<string, string | number>>;
  /** 返回行数上限，默认 500（PRD S3）。 */
  readonly maxRows?: number;
  /**
   * 是否把「0 行」当失败，默认 `true`（失败关闭）。
   *
   * 保存/测试/预览走默认值：字段要靠首行推断，0 行推不出字段，不能算成功（PRD §8.3）。
   * 设计器查询走 `false`：字段已经落库，0 行是合法空结果（与内置数据集的空集语义一致）。
   */
  readonly requireRows?: boolean;
}

export interface RuntimeSuccess {
  readonly ok: true;
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly DatasourceRow[];
  /** 实际返回行数（≤ maxRows）。 */
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly durationMs: number;
}

export interface RuntimeFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly durationMs: number;
}

export type RuntimeResult = RuntimeSuccess | RuntimeFailure;

/** 空结果与二进制列的错误文案（PRD §9.2 白名单）。 */
export const RUNTIME_MESSAGES = {
  emptyResult: '查询没有返回任何行，请检查过滤条件。',
  nestedCell: '单元格只允许字符串、数字、布尔或 null。',
} as const;

export function blobColumnMessage(columns: readonly string[]): string {
  return `结果包含二进制列 \`${columns.join('`, `')}\`，只允许文本/数字列。请显式列出需要的列。`;
}

/**
 * 参数值解析：白名单 + 类型转换 + 必填检查（PRD §8.5 / A4）。
 *
 * - 未声明的键：`unknownCode`（契约侧用 `UNDECLARED_PARAMETER`，草稿侧用 `INVALID_REQUEST`）；
 * - 声明为 `number` 但转不成有限数 → `INVALID_REQUEST`；
 * - 必填但没值（未提交、空串）且无默认值 → `MISSING_PARAMETER`；
 * - 可选且无值 → 不出现在结果里（SQL 里对应命名参数按 NULL 绑定，表模式则整条过滤不加入）。
 */
export function resolveParameterValues(
  declarations: readonly ParameterDeclaration[],
  raw: Readonly<Record<string, unknown>>,
  unknownCode: 'UNDECLARED_PARAMETER' | 'INVALID_REQUEST',
):
  | { readonly ok: true; readonly values: Readonly<Record<string, string | number>> }
  | { readonly ok: false; readonly code: string; readonly message: string } {
  const declared = new Map(declarations.map((declaration) => [declaration.name, declaration]));
  for (const key of Object.keys(raw)) {
    if (declared.has(key) === false) {
      return {
        ok: false,
        code: unknownCode,
        message:
          unknownCode === 'UNDECLARED_PARAMETER'
            ? `未声明的参数 \`${key}\`，请检查数据源参数声明。`
            : `不支持的参数 \`${key}\`。`,
      };
    }
  }
  const values: Record<string, string | number> = {};
  for (const declaration of declarations) {
    const submitted = raw[declaration.name];
    // 只接受标量：对象/数组/函数一律拒绝。别静默 `String()` 成 `[object Object]` 再去
    // 绑定——那会把"参数类型错了"变成"查不到数据"，排查成本高得多。
    if (
      submitted !== undefined &&
      submitted !== null &&
      typeof submitted !== 'string' &&
      typeof submitted !== 'number' &&
      typeof submitted !== 'boolean'
    ) {
      return {
        ok: false,
        code: 'INVALID_REQUEST',
        message: `参数 \`:${declaration.name}\` 的值必须是字符串、数字或布尔。`,
      };
    }
    const hasSubmitted =
      submitted !== undefined && submitted !== null && String(submitted).trim() !== '';
    if (hasSubmitted) {
      if (declaration.valueType === 'number') {
        const parsed = typeof submitted === 'number' ? submitted : Number(String(submitted));
        if (Number.isFinite(parsed) === false) {
          return {
            ok: false,
            code: 'INVALID_REQUEST',
            message: `参数 \`:${declaration.name}\` 必须是数字。`,
          };
        }
        values[declaration.name] = parsed;
        continue;
      }
      values[declaration.name] = String(submitted);
      continue;
    }
    if (declaration.defaultValue !== undefined) {
      values[declaration.name] = declaration.defaultValue;
      continue;
    }
    if (declaration.required) {
      return {
        ok: false,
        code: 'MISSING_PARAMETER',
        message: `缺少必填参数 \`:${declaration.name}\`。`,
      };
    }
  }
  return { ok: true, values };
}

/** 多行结果的键并集（顺序 = 首次出现顺序，PRD §8.3）。 */
function collectColumnNames(rows: readonly Readonly<Record<string, unknown>>[]): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(key);
    }
  }
  return names;
}

/** 嵌套值降级：对象/数组 → JSON 字符串（契约只允许标量单元格）。 */
function flattenNestedValues(
  rows: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  return rows.map((row) => {
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      flat[key] =
        value !== null && typeof value === 'object' && value instanceof Uint8Array === false
          ? JSON.stringify(value)
          : value;
    }
    return flat;
  });
}

@Injectable()
export class DatasourceRuntime {
  private readonly rest = new RestDatasourceExecutor();
  private readonly sqliteTimeoutMs: number;
  private readonly restTimeoutMs: number;

  constructor(
    private readonly sqlite: SqliteExecutorService,
    config: ConfigService,
  ) {
    this.sqliteTimeoutMs = readPositiveInt(
      config.get<unknown>('SQLITE_TIMEOUT_MS'),
      DEFAULT_SQLITE_TIMEOUT_MS,
    );
    this.restTimeoutMs = readPositiveInt(
      config.get<unknown>('REST_TIMEOUT_MS'),
      DEFAULT_REST_TIMEOUT_MS,
    );
  }

  get timeouts(): { readonly sqliteMs: number; readonly restMs: number } {
    return { sqliteMs: this.sqliteTimeoutMs, restMs: this.restTimeoutMs };
  }

  /** 按类型分发取数。 */
  async execute(request: RuntimeRequest): Promise<RuntimeResult> {
    const maxRows = request.maxRows ?? MAX_RESULT_ROWS;
    const requireRows = request.requireRows !== false;
    switch (request.type) {
      case 'sqlite':
        return this.executeSqlite(request.config, request.values, maxRows, requireRows);
      case 'rest':
        return this.executeRest(request.config, request.values, maxRows);
      case 'static':
        return this.executeStatic(request.config, maxRows);
      default:
        return {
          ok: false,
          code: 'INVALID_REQUEST',
          message: '不支持的数据源类型。',
          durationMs: 0,
        };
    }
  }

  private async executeSqlite(
    config: StoredDataSourceConfig,
    values: Readonly<Record<string, string | number>>,
    maxRows: number,
    requireRows: boolean,
  ): Promise<RuntimeResult> {
    if (!('mode' in config)) {
      return { ok: false, code: 'INVALID_REQUEST', message: '配置类型不匹配。', durationMs: 0 };
    }
    const started = Date.now();
    const resolved = resolveDatabaseFile(config.file);
    if (resolved.ok === false) {
      return { ok: false, code: resolved.code, message: resolved.message, durationMs: 0 };
    }
    try {
      if (config.mode === 'table') {
        return await this.executeTable(config, resolved.absolutePath, values, maxRows, started);
      }
      return await this.executeSql(
        config,
        resolved.absolutePath,
        values,
        maxRows,
        requireRows,
        started,
      );
    } catch (error) {
      return {
        ok: false,
        code: errorCodeOf(error),
        message: error instanceof Error ? error.message : '数据库执行失败。',
        durationMs: Date.now() - started,
      };
    }
  }

  private async executeTable(
    config: Extract<StoredDataSourceConfig, { mode: 'table' }>,
    absolutePath: string,
    values: Readonly<Record<string, string | number>>,
    maxRows: number,
    started: number,
  ): Promise<RuntimeResult> {
    const schema = await this.sqlite.describe(absolutePath);
    const table = schema.tables.find((entry) => entry.name === config.table);
    if (table === undefined) {
      return {
        ok: false,
        code: 'TABLE_NOT_FOUND',
        message: `表 \`${config.table}\` 不存在（可能已被删除），请重新选表。`,
        durationMs: Date.now() - started,
      };
    }
    const availableColumns = (schema.columns[config.table] ?? []).map((column) => column.name);
    const requiredParams = config.params
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name);
    const built = buildTableQuery({
      table: config.table,
      columns: config.columns.map((column) => ({ name: column.name })),
      filters: config.filters ?? [],
      availableTables: schema.tables.map((entry) => entry.name),
      availableColumns,
      values,
      requiredParams,
    });
    if (built.ok === false) {
      return {
        ok: false,
        code: built.code,
        message: built.message,
        durationMs: Date.now() - started,
      };
    }
    const fields = fieldsFromTableColumns(config.columns);
    const fieldTypes: Record<string, DatasetFieldDefinition['valueType']> = {};
    for (const field of fields) fieldTypes[field.id] = field.valueType;

    let result;
    try {
      result = await this.sqlite.query({
        file: absolutePath,
        sql: built.sql,
        params: built.bound,
        maxRows,
        fieldTypes,
        timeoutMs: this.sqliteTimeoutMs,
      });
    } catch (error) {
      return {
        ok: false,
        code: errorCodeOf(error),
        message: error instanceof Error ? error.message : '数据库执行失败。',
        durationMs: Date.now() - started,
      };
    }
    // 表模式的字段来自库结构，因此 0 行是合法结果（过滤条件可能刚好没有匹配）
    if (
      result.blobColumns.length > 0 &&
      fields.some((field) => result.blobColumns.includes(field.id))
    ) {
      // 选中列里混进了二进制列（只能在绕过前端直接提交时发生）：明确拒绝而不是塞 null
      return {
        ok: false,
        code: 'INVALID_SHAPE',
        message: blobColumnMessage(result.blobColumns),
        durationMs: Date.now() - started,
      };
    }
    const rows = projectRows(result.rows, fields);
    return {
      ok: true,
      fields,
      rows,
      rowCount: rows.length,
      truncated: result.truncated,
      durationMs: Date.now() - started,
    };
  }

  private async executeSql(
    config: Extract<StoredDataSourceConfig, { mode: 'sql' }>,
    absolutePath: string,
    values: Readonly<Record<string, string | number>>,
    maxRows: number,
    requireRows: boolean,
    started: number,
  ): Promise<RuntimeResult> {
    // R4：保存时的校验不能替代执行前的校验（存进库的行也可能被手改）
    const guarded = inspectSql({
      sql: config.sql,
      declaredParams: config.params.map((parameter) => parameter.name),
    });
    if (guarded.ok === false) {
      return {
        ok: false,
        code: guarded.code,
        message: guarded.message,
        durationMs: Date.now() - started,
      };
    }
    const bound: Record<string, string | number> = {};
    for (const name of guarded.params) {
      const value = values[name];
      if (value !== undefined) bound[name] = value;
    }
    let result;
    try {
      result = await this.sqlite.query({
        file: absolutePath,
        sql: guarded.statement,
        params: bound,
        maxRows,
        timeoutMs: this.sqliteTimeoutMs,
      });
    } catch (error) {
      return {
        ok: false,
        code: errorCodeOf(error),
        message: error instanceof Error ? error.message : '数据库执行失败。',
        durationMs: Date.now() - started,
      };
    }
    if (result.blobColumns.length > 0) {
      return {
        ok: false,
        code: 'INVALID_SHAPE',
        message: blobColumnMessage(result.blobColumns),
        durationMs: Date.now() - started,
      };
    }
    if (result.rows.length === 0) {
      if (requireRows) {
        return {
          ok: false,
          code: 'INVALID_SHAPE',
          message: RUNTIME_MESSAGES.emptyResult,
          durationMs: Date.now() - started,
        };
      }
      // 设计器查询：字段已落库，0 行是合法空结果，字段按列名补齐（值全都不会出现）
      const emptyFields = inferFieldsFromColumns(
        result.columns.map((column) => column.name),
        null,
      );
      return {
        ok: true,
        fields: emptyFields,
        rows: [],
        rowCount: 0,
        truncated: false,
        durationMs: Date.now() - started,
      };
    }
    const columnNames = result.columns.map((column) => column.name);
    const firstRow = result.rows[0] ?? null;
    const fields = inferFieldsFromColumns(columnNames, firstRow);
    const rows = projectRows(result.rows, fields);
    return {
      ok: true,
      fields,
      rows,
      rowCount: rows.length,
      truncated: result.truncated,
      durationMs: Date.now() - started,
    };
  }

  private async executeRest(
    config: StoredDataSourceConfig,
    values: Readonly<Record<string, string | number>>,
    maxRows: number,
  ): Promise<RuntimeResult> {
    if (!('url' in config)) {
      return { ok: false, code: 'INVALID_REQUEST', message: '配置类型不匹配。', durationMs: 0 };
    }
    const result = await this.rest.execute({
      url: config.url,
      headers: config.headers,
      parameters: config.params,
      values,
      timeoutMs: this.restTimeoutMs,
      maxRows,
    });
    if (result.ok === false) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        durationMs: result.durationMs,
      };
    }
    const flattened = flattenNestedValues(result.rows);
    const columnNames = collectColumnNames(flattened);
    if (columnNames.length === 0) {
      return {
        ok: false,
        code: 'INVALID_SHAPE',
        message: '返回格式不符：行对象没有任何字段。',
        durationMs: result.durationMs,
      };
    }
    const fields = inferFieldsFromColumns(columnNames, flattened[0] ?? null);
    const rows = projectRows(flattened, fields);
    return {
      ok: true,
      fields,
      rows,
      rowCount: rows.length,
      truncated: result.truncated,
      durationMs: result.durationMs,
    };
  }

  private executeStatic(config: StoredDataSourceConfig, maxRows: number): RuntimeResult {
    if (!('rows' in config) || !('columns' in config)) {
      return { ok: false, code: 'INVALID_REQUEST', message: '配置类型不匹配。', durationMs: 0 };
    }
    if (config.rows.length === 0) {
      return {
        ok: false,
        code: 'INVALID_SHAPE',
        message: '静态数据源没有任何行，请至少填写 1 行。',
        durationMs: 0,
      };
    }
    const total = config.rows.length;
    const sourceRows: Record<string, CellScalarLike>[] = [];
    for (const row of config.rows) {
      const record: Record<string, CellScalarLike> = {};
      config.columns.forEach((column, index) => {
        record[column] = row[index] ?? null;
      });
      sourceRows.push(record);
    }
    const fields = inferFieldsFromColumns(config.columns, sourceRows[0] ?? null);
    const rows = projectRows(sourceRows, fields).slice(0, maxRows);
    return {
      ok: true,
      fields,
      rows,
      rowCount: rows.length,
      truncated: total > maxRows,
      durationMs: 0,
    };
  }
}

type CellScalarLike = string | number | boolean | null;

function errorCodeOf(error: unknown): string {
  // 执行器抛的是带稳定 code 的领域错误；其它异常按内部错误处理（文案不透传引擎文本）
  return error instanceof SqliteExecutionError ? error.code : 'INTERNAL_ERROR';
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed) === false) return fallback;
  const truncated = Math.trunc(parsed);
  return truncated > 0 ? truncated : fallback;
}

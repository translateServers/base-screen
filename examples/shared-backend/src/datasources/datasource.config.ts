import {
  type CellScalar,
  DATASOURCE_CONFIG_VERSION,
  MASKED_SECRET,
  MAX_DATASET_FIELDS,
  MAX_PARAMETERS,
  MAX_REST_HEADERS,
  MAX_STATIC_BYTES,
  MAX_STATIC_ROWS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_FILTERS,
  PARAMETER_NAME_PATTERN,
  type ParameterDeclaration,
  type RestConfig,
  type RestHeader,
  type SelectedColumn,
  type SqliteConfig,
  type SqliteSqlConfig,
  type SqliteTableConfig,
  type StaticConfig,
  type StoredDataSourceConfig,
  type StoredDataSourceType,
  type TableFilter,
} from './datasource.types';

/**
 * `config` 的读写、校验、脱敏与摘要（架构 §3.2 / §6）。
 *
 * 纯函数模块：不碰 fs、不碰 Prisma、不碰 Nest，因此可以直接单测，也被管理侧
 * （`DatasourcesService`）与契约侧（`CustomDatasetsService`）共用——**同一份校验**
 * 保证「能存进去的一定能读出来」。
 *
 * 失败一律带错误码（`INVALID_REQUEST` / `TOO_LARGE` / `INVALID_SHAPE`），文案是面向用户的
 * 可行动句子；调用方只负责把 code 映射成 HTTP 状态。
 */

export type ConfigFailureCode = 'INVALID_REQUEST' | 'TOO_LARGE' | 'INVALID_SHAPE';

export interface ConfigFailure {
  readonly ok: false;
  readonly code: ConfigFailureCode;
  readonly message: string;
}

export interface ConfigSuccess<T> {
  readonly ok: true;
  readonly config: T;
}

export type ConfigResult<T = StoredDataSourceConfig> = ConfigSuccess<T> | ConfigFailure;

/** 详情/编辑回填里的 header：值恒为固定 8 个点，只多一个「有没有值」。 */
export interface MaskedRestHeader {
  readonly name: string;
  readonly valueMasked: string;
  readonly hasValue: boolean;
}

/** 脱敏后的 REST config（GET 响应里只出现这个形状）。 */
export interface MaskedRestConfig {
  readonly v: number;
  readonly url: string;
  readonly headers: readonly MaskedRestHeader[];
  readonly params: readonly ParameterDeclaration[];
}

export type MaskedStoredConfig = SqliteConfig | MaskedRestConfig | StaticConfig;

function failure(code: ConfigFailureCode, message: string): ConfigFailure {
  return { ok: false, code, message };
}

/** 把 unknown 收窄成普通对象（数组与 null 都不算）。 */
export function readRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * 读取并校验 config。**只接受 `v:1`**（失败关闭，不做猜测性迁移）。
 *
 * @param type 落表类型（builtin 不落表，故不接受）
 * @param raw 请求体里的 config（`unknown`：JSON 可能给出任何东西）
 */
export function readConfig(type: StoredDataSourceType, raw: unknown): ConfigResult {
  const record = readRecord(raw);
  if (record === null) return failure('INVALID_REQUEST', '配置格式不正确。');
  if (record.v !== DATASOURCE_CONFIG_VERSION) {
    return failure(
      'INVALID_REQUEST',
      `配置版本不受支持（期望 v:${DATASOURCE_CONFIG_VERSION}），请刷新页面后重试。`,
    );
  }
  switch (type) {
    case 'sqlite':
      return readSqliteConfig(record);
    case 'rest':
      return readRestConfig(record);
    case 'static':
      return readStaticConfig(record);
    default:
      return failure('INVALID_REQUEST', '不支持的数据源类型。');
  }
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

function readSqliteConfig(record: Record<string, unknown>): ConfigResult<SqliteConfig> {
  const file = readString(record.file);
  if (file === null || file.trim() === '') {
    return failure('INVALID_REQUEST', '请选择数据库文件。');
  }
  const mode = record.mode;
  if (mode !== 'table' && mode !== 'sql') {
    return failure('INVALID_REQUEST', '请选择取数方式（表模式或 SQL 模式）。');
  }
  const params = readParameters(record.params);
  if (params.ok === false) return params;

  if (mode === 'table') {
    const table = readString(record.table);
    if (table === null || table.trim() === '') {
      return failure('INVALID_REQUEST', '请选择表或视图。');
    }
    const columns = readColumns(record.columns);
    if (columns.ok === false) return columns;
    const filters = readFilters(record.filters);
    if (filters.ok === false) return filters;
    const declared = new Set(params.config.map((parameter) => parameter.name));
    for (const filter of filters.config) {
      if (declared.has(filter.param) === false) {
        return failure(
          'INVALID_REQUEST',
          `过滤条件引用了未声明的参数 \`:${filter.param}\`，请先在参数区声明。`,
        );
      }
    }
    const config: SqliteTableConfig = {
      v: DATASOURCE_CONFIG_VERSION,
      mode: 'table',
      file: file.trim(),
      table: table.trim(),
      columns: columns.config,
      ...(filters.config.length > 0 ? { filters: filters.config } : {}),
      params: params.config,
    };
    return { ok: true, config };
  }

  const sql = readString(record.sql);
  if (sql === null || sql.trim() === '') {
    return failure('INVALID_REQUEST', '请填写 SQL 语句。');
  }
  const config: SqliteSqlConfig = {
    v: DATASOURCE_CONFIG_VERSION,
    mode: 'sql',
    file: file.trim(),
    sql: sql.trim(),
    params: params.config,
  };
  return { ok: true, config };
}

function readColumns(value: unknown): ConfigResult<readonly SelectedColumn[]> {
  if (Array.isArray(value) === false) {
    return failure('INVALID_REQUEST', '请至少勾选 1 列。');
  }
  if (value.length === 0) return failure('INVALID_REQUEST', '请至少勾选 1 列。');
  if (value.length > MAX_TABLE_COLUMNS) {
    return failure('INVALID_REQUEST', `最多只能勾选 ${MAX_TABLE_COLUMNS} 列。`);
  }
  const columns: SelectedColumn[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const record = readRecord(entry);
    const name = record === null ? null : readString(record.name);
    if (name === null || name.trim() === '') {
      return failure('INVALID_REQUEST', '列名不合法，请重新勾选。');
    }
    const trimmed = name.trim();
    if (seen.has(trimmed)) return failure('INVALID_REQUEST', `列 \`${trimmed}\` 被重复勾选。`);
    seen.add(trimmed);
    // declaredType 只是"客户端的看法"，保存时会被库里的真实声明类型覆盖
    const declaredType = record === null ? null : readString(record.declaredType);
    columns.push({ name: trimmed, declaredType: declaredType === null ? '' : declaredType });
  }
  return { ok: true, config: columns };
}

function readFilters(value: unknown): ConfigResult<readonly TableFilter[]> {
  if (value === undefined || value === null) return { ok: true, config: [] };
  if (Array.isArray(value) === false) {
    return failure('INVALID_REQUEST', '过滤条件格式不正确。');
  }
  if (value.length > MAX_TABLE_FILTERS) {
    return failure('INVALID_REQUEST', `最多只能添加 ${MAX_TABLE_FILTERS} 个过滤条件。`);
  }
  const filters: TableFilter[] = [];
  for (const entry of value) {
    const record = readRecord(entry);
    const column = record === null ? null : readString(record.column);
    const param = record === null ? null : readString(record.param);
    if (column === null || column.trim() === '' || param === null) {
      return failure('INVALID_REQUEST', '过滤条件的列或参数名不合法。');
    }
    if (PARAMETER_NAME_PATTERN.test(param.trim()) === false) {
      return failure(
        'INVALID_REQUEST',
        `参数名 \`${param}\` 不合法：只能字母或下划线开头，且只含字母、数字、下划线。`,
      );
    }
    filters.push({ column: column.trim(), param: param.trim() });
  }
  return { ok: true, config: filters };
}

function readParameters(value: unknown): ConfigResult<readonly ParameterDeclaration[]> {
  if (value === undefined || value === null) return { ok: true, config: [] };
  if (Array.isArray(value) === false) {
    return failure('INVALID_REQUEST', '参数声明格式不正确。');
  }
  if (value.length > MAX_PARAMETERS) {
    return failure('INVALID_REQUEST', `最多只能声明 ${MAX_PARAMETERS} 个参数。`);
  }
  const parameters: ParameterDeclaration[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const record = readRecord(entry);
    if (record === null) return failure('INVALID_REQUEST', '参数声明格式不正确。');
    const name = readString(record.name);
    if (name === null || PARAMETER_NAME_PATTERN.test(name) === false) {
      return failure(
        'INVALID_REQUEST',
        `参数名 \`${name ?? ''}\` 不合法：只能字母或下划线开头，且只含字母、数字、下划线。`,
      );
    }
    if (seen.has(name)) return failure('INVALID_REQUEST', `参数名 \`${name}\` 重复。`);
    seen.add(name);
    const valueType = record.valueType;
    if (valueType !== 'string' && valueType !== 'number') {
      return failure('INVALID_REQUEST', `参数 \`${name}\` 的类型必须是 string 或 number。`);
    }
    if (typeof record.required !== 'boolean') {
      return failure('INVALID_REQUEST', `参数 \`${name}\` 缺少「必填」标记。`);
    }
    const label = readString(record.label);
    const defaultRaw = record.defaultValue;
    if (
      defaultRaw !== undefined &&
      defaultRaw !== null &&
      typeof defaultRaw !== 'string' &&
      typeof defaultRaw !== 'number'
    ) {
      return failure('INVALID_REQUEST', `参数 \`${name}\` 的默认值必须是字符串或数字。`);
    }
    const defaultValue =
      typeof defaultRaw === 'string' || typeof defaultRaw === 'number' ? defaultRaw : undefined;
    parameters.push({
      name,
      label: label === null || label.trim() === '' ? name : label.trim(),
      valueType,
      required: record.required,
      ...(defaultValue === undefined ? {} : { defaultValue }),
    });
  }
  return { ok: true, config: parameters };
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

/** header 名：RFC 7230 token（不含空格、冒号与控制字符）。 */
const HEADER_NAME_PATTERN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

function readRestConfig(record: Record<string, unknown>): ConfigResult<RestConfig> {
  const url = readString(record.url);
  if (url === null || url.trim() === '') {
    return failure('INVALID_REQUEST', '请填写请求地址。');
  }
  const trimmedUrl = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return failure('INVALID_REQUEST', '请求地址不是合法的 URL。');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure('INVALID_REQUEST', '请求地址只支持 http:// 或 https://。');
  }
  const headers = readHeaders(record.headers);
  if (headers.ok === false) return headers;
  const params = readParameters(record.params);
  if (params.ok === false) return params;
  return {
    ok: true,
    config: {
      v: DATASOURCE_CONFIG_VERSION,
      url: trimmedUrl,
      headers: headers.config,
      params: params.config,
    },
  };
}

function readHeaders(value: unknown): ConfigResult<readonly RestHeader[]> {
  if (value === undefined || value === null) return { ok: true, config: [] };
  if (Array.isArray(value) === false) {
    return failure('INVALID_REQUEST', 'header 格式不正确。');
  }
  if (value.length > MAX_REST_HEADERS) {
    return failure('INVALID_REQUEST', `最多只能添加 ${MAX_REST_HEADERS} 个 header。`);
  }
  const headers: RestHeader[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const record = readRecord(entry);
    const name = record === null ? null : readString(record.name);
    if (name === null || HEADER_NAME_PATTERN.test(name) === false) {
      return failure(
        'INVALID_REQUEST',
        `header 名 \`${name ?? ''}\` 不合法：不能包含空格、冒号或中文。`,
      );
    }
    const lowered = name.toLowerCase();
    if (seen.has(lowered)) return failure('INVALID_REQUEST', `header \`${name}\` 重复。`);
    seen.add(lowered);
    const rawValue = record === null ? null : readString(record.value);
    headers.push({ name, value: rawValue === null ? '' : rawValue });
  }
  return { ok: true, config: headers };
}

/**
 * 编辑保存时的 header 合并（PRD A13 / §6）。
 *
 * 语义：值传空串或掩码占位 → **保留库中原值**（按 name 匹配；找不到同名则丢弃该条，
 * 因为它是"新建的但没填值"，属于表单错误）。传新值 → 覆盖。
 */
export function mergeRestHeaders(
  next: readonly RestHeader[],
  previous: readonly RestHeader[],
): ConfigResult<readonly RestHeader[]> {
  const merged: RestHeader[] = [];
  const previousByName = new Map(
    previous.map((header) => [header.name.toLowerCase(), header.value]),
  );
  for (const header of next) {
    const incoming = header.value;
    if (incoming !== '' && incoming !== MASKED_SECRET) {
      merged.push({ name: header.name, value: incoming });
      continue;
    }
    const stored = previousByName.get(header.name.toLowerCase());
    if (stored === undefined) {
      return failure('INVALID_REQUEST', `请填写 header \`${header.name}\` 的值。`);
    }
    merged.push({ name: header.name, value: stored });
  }
  return { ok: true, config: merged };
}

// ---------------------------------------------------------------------------
// 静态 JSON
// ---------------------------------------------------------------------------

function readStaticConfig(record: Record<string, unknown>): ConfigResult<StaticConfig> {
  const rawColumns = record.columns;
  if (Array.isArray(rawColumns) === false || rawColumns.length === 0) {
    return failure('INVALID_REQUEST', '请至少填写 1 列。');
  }
  if (rawColumns.length > MAX_DATASET_FIELDS) {
    return failure('INVALID_REQUEST', `最多只能有 ${MAX_DATASET_FIELDS} 列。`);
  }
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const entry of rawColumns) {
    const name = readString(entry);
    if (name === null || name.trim() === '') {
      return failure('INVALID_REQUEST', '列名不能为空。');
    }
    const trimmed = name.trim();
    if (seen.has(trimmed)) return failure('INVALID_REQUEST', `列名 \`${trimmed}\` 重复。`);
    seen.add(trimmed);
    columns.push(trimmed);
  }
  const rawRows = record.rows;
  if (Array.isArray(rawRows) === false || rawRows.length === 0) {
    return failure('INVALID_REQUEST', '请至少填写 1 行数据。');
  }
  if (rawRows.length > MAX_STATIC_ROWS) {
    return failure('TOO_LARGE', `最多 ${MAX_STATIC_ROWS} 行 / 64 KiB。`);
  }
  const rows: CellScalar[][] = [];
  for (const entry of rawRows) {
    if (Array.isArray(entry) === false) {
      return failure('INVALID_REQUEST', '每一行必须是数组。');
    }
    if (entry.length !== columns.length) {
      return failure('INVALID_REQUEST', `每行必须有 ${columns.length} 个单元格。`);
    }
    const row: CellScalar[] = [];
    for (const cell of entry) {
      if (cell === null) {
        row.push(null);
        continue;
      }
      if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
        row.push(cell);
        continue;
      }
      // 嵌套对象/数组：单元格只允许标量（PRD Q5），否则契约的 tabular 解析必失败
      return failure(
        'INVALID_SHAPE',
        '单元格只允许字符串、数字、布尔或 null，不能嵌套对象或数组。',
      );
    }
    rows.push(row);
  }
  const bytes = Buffer.byteLength(JSON.stringify({ columns, rows }), 'utf8');
  if (bytes > MAX_STATIC_BYTES) {
    return failure(
      'TOO_LARGE',
      `最多 ${MAX_STATIC_ROWS} 行 / 64 KiB（当前 ${Math.ceil(bytes / 1024)} KiB）。`,
    );
  }
  return { ok: true, config: { v: DATASOURCE_CONFIG_VERSION, columns, rows } };
}

// ---------------------------------------------------------------------------
// 摘要与脱敏
// ---------------------------------------------------------------------------

/** 列表/详情的 `configSummary`（PRD §8.1）：REST 只到 host+path，SQLite 只到文件名。 */
export function configSummary(config: StoredDataSourceConfig): string {
  if ('mode' in config) {
    return `${config.file} · ${config.mode === 'table' ? config.table : 'SQL'}`;
  }
  if ('url' in config) {
    try {
      const parsed = new URL(config.url);
      return `GET ${parsed.host}${parsed.pathname}`;
    } catch {
      // 理论上不可达（readConfig 已校验），失败关闭给一个不会泄露信息的兜底
      return 'GET';
    }
  }
  return `${config.columns.length} 列 · ${config.rows.length} 行`;
}

/** 参数声明（静态 JSON 没有参数：契约侧的 `parameters` 因此是空数组）。 */
export function configParameters(config: StoredDataSourceConfig): readonly ParameterDeclaration[] {
  return 'params' in config ? config.params : [];
}

/**
 * 读库里的 `config` 列：解析失败或校验失败都返回 null（坏行按"配置不可用"处理，
 * 而不是让整页 500）。**复用 `readConfig`**，因此库里存的值与接口收的值走同一套规则。
 */
export function readStoredConfig(
  type: StoredDataSourceType,
  serialized: string,
): StoredDataSourceConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  const result = readConfig(type, parsed);
  return result.ok ? result.config : null;
}

/**
 * 详情/编辑回填用的脱敏 config：REST 的 header 值换成固定 8 个点。
 *
 * 绝对路径本来就不在 config 里（SQLite 只存 basename），所以这里不需要额外处理路径。
 */
export function maskConfig(config: StoredDataSourceConfig): MaskedStoredConfig {
  if ('url' in config) {
    return {
      v: config.v,
      url: config.url,
      headers: config.headers.map((header) => ({
        name: header.name,
        valueMasked: MASKED_SECRET,
        hasValue: header.value !== '',
      })),
      params: config.params,
    };
  }
  return config;
}

/** 深比较：用于「config 没变且已 ready 时跳过取数」（架构 §3.4 的保存耗时约束）。 */
export function isSameConfig(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

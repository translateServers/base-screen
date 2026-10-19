import type {
  DatasetFieldDefinition,
  DatasetParameterDefinition,
  DatasetValueType,
} from '../datasets/dataset-definitions';

export type { DatasetFieldDefinition, DatasetParameterDefinition, DatasetValueType };

/**
 * 数据源台账的领域类型：管理侧（CRUD / 测试 / 预览）与取数侧（`/api/datasets` 合并）
 * 共用一份定义，避免「管理接口一种形状、契约接口另一种形状」。
 *
 * 三条贯穿本文件的不变量（PRD §8.3 / §13）：
 * 1. 自建字段一律 `nullable: true`——SQLite 是动态类型且允许 NULL，声明 `nullable:false`
 *    会让契约解析器在遇到一个 null 单元格时把整份响应判非法（`HOST_DATASET_INVALID`）。
 * 2. 单元格只允许标量（`string | number | boolean | null`）：嵌套对象/数组在 REST 侧
 *    降级成 JSON 字符串，在静态侧直接拒绝（PRD Q5）。
 * 3. `config` 带版本号 `v`，读取侧只接受已知版本（失败关闭，不做猜测性迁移）。
 */

/** 落表的数据源类型（内置 `builtin` 不入表，见 `DataSourceType`）。 */
export type StoredDataSourceType = 'sqlite' | 'rest' | 'static';

/** 对外可见的数据源类型（含只读的内置数据集）。 */
export type DataSourceType = StoredDataSourceType | 'builtin';

export const STORED_DATASOURCE_TYPES: readonly StoredDataSourceType[] = [
  'sqlite',
  'rest',
  'static',
];

/** 列表页 `?type=` 的取值域（PRD 9.1 #1）。 */
export const DATASOURCE_TYPE_FILTERS: readonly (DataSourceType | 'all')[] = [
  'all',
  'builtin',
  'rest',
  'static',
  'sqlite',
];

export function isStoredDataSourceType(value: unknown): value is StoredDataSourceType {
  return value === 'sqlite' || value === 'rest' || value === 'static';
}

export function isDataSourceType(value: unknown): value is DataSourceType {
  return value === 'builtin' || isStoredDataSourceType(value);
}

/** 落表的状态（内置条目的 `status` 是合成出来的 `builtin`，不入库）。 */
export type DataSourceStatus = 'draft' | 'ready' | 'error';

/** 列表/详情里展示的状态：落表三态 + 内置。 */
export type DataSourceStatusView = DataSourceStatus | 'builtin';

export const DATA_SOURCE_STATUSES: readonly DataSourceStatus[] = ['draft', 'ready', 'error'];

/** `config` 的版本号：读取侧只接受这一个值。 */
export const DATASOURCE_CONFIG_VERSION = 1;

/** 参数名（不含冒号）：也是 SQL 里 `:name` 的合法名字。 */
export const PARAMETER_NAME_PATTERN: RegExp = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** 参数值类型（PRD 8.5：只允许 string / number，布尔在本轮不暴露给 SQL 参数）。 */
export type ParameterValueType = 'string' | 'number';

/** 单元格：契约里 tabular 的单元格只允许标量与 null。 */
export type CellScalar = string | number | boolean | null;

/** 一行结果：键是字段 id。 */
export type DatasourceRow = Readonly<Record<string, CellScalar>>;

/** 规模上限（PRD §8.1 / §8.5 / §8.6 / §9.2）。 */
export const MAX_PARAMETERS = 10;
export const MAX_TABLE_COLUMNS = 32;
export const MAX_TABLE_FILTERS = 5;
export const MAX_REST_HEADERS = 10;
export const MAX_STATIC_ROWS = 200;
export const MAX_STATIC_BYTES = 64 * 1024;
export const MAX_DATASET_FIELDS = 256;
/** 单次取数最多返回 500 行（PRD S3）；执行器多读一行用于判断截断。 */
export const MAX_RESULT_ROWS = 500;
/** 预览只显示前 20 行，但 `rowCount` 仍是真实取值行数（上限 500）。 */
export const MAX_PREVIEW_ROWS = 20;
/** 单次结果内存上限 1 MiB（PRD S7），与契约整包上限一致。 */
export const MAX_RESULT_BYTES = 1024 * 1024;
export const DEFAULT_SQLITE_TIMEOUT_MS = 3000;
export const DEFAULT_REST_TIMEOUT_MS = 8000;
export const DEFAULT_SQLITE_RUNNER_POOL = 2;

/** 掩码值：固定 8 个点，与真实长度无关（长度本身也是信息，PRD §9.6）。 */
export const MASKED_SECRET = '••••••••';

/** 参数声明：SQL 模式与表模式过滤共用。 */
export interface ParameterDeclaration {
  /** 不含冒号。 */
  readonly name: string;
  /** 契约 `parameters[].label` 要求非空，保存时缺失回落 `name`。 */
  readonly label: string;
  readonly valueType: ParameterValueType;
  readonly required: boolean;
  /** 缺省值：`required` 为 true 时也允许有默认值（预览会用它）。 */
  readonly defaultValue?: string | number;
}

/** 表模式勾选的一列：声明类型用于字段类型映射（PRD §8.3）。 */
export interface SelectedColumn {
  readonly name: string;
  /** SQLite 的声明类型（`TEXT` / `REAL` / `BLOB` …），可为空串。 */
  readonly declaredType: string;
}

/** 表模式过滤条件：只做等值 `列 = :参数名`（PRD Q4）。 */
export interface TableFilter {
  readonly column: string;
  readonly param: string;
}

/** SQLite · 表模式配置。 */
export interface SqliteTableConfig {
  readonly v: typeof DATASOURCE_CONFIG_VERSION;
  readonly mode: 'table';
  /** 仅 basename，绝不存绝对路径（PRD §9.6）；例：`workshop.db`。 */
  readonly file: string;
  readonly table: string;
  /** 1..32 列，顺序 = 勾选顺序 = 字段顺序。 */
  readonly columns: readonly SelectedColumn[];
  /** 0..5 条等值过滤。 */
  readonly filters?: readonly TableFilter[];
  /** 0..10 条参数声明；`filters[].param` 必须在此声明。 */
  readonly params: readonly ParameterDeclaration[];
}

/** SQLite · SQL 模式配置。 */
export interface SqliteSqlConfig {
  readonly v: typeof DATASOURCE_CONFIG_VERSION;
  readonly mode: 'sql';
  readonly file: string;
  /** 单条 SELECT / WITH（保存与执行前都要重新过词法检查，PRD R4）。 */
  readonly sql: string;
  readonly params: readonly ParameterDeclaration[];
}

export type SqliteConfig = SqliteTableConfig | SqliteSqlConfig;

/** REST header：`value` 明文入库但**只出不进**（任何响应都不含真值）。 */
export interface RestHeader {
  readonly name: string;
  readonly value: string;
}

/** REST API 配置。 */
export interface RestConfig {
  readonly v: typeof DATASOURCE_CONFIG_VERSION;
  readonly url: string;
  readonly headers: readonly RestHeader[];
  readonly params: readonly ParameterDeclaration[];
}

/** 静态 JSON 配置：列顺序即字段顺序，单元格只允许标量。 */
export interface StaticConfig {
  readonly v: typeof DATASOURCE_CONFIG_VERSION;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly CellScalar[])[];
}

export type StoredDataSourceConfig = SqliteConfig | RestConfig | StaticConfig;

/** 最近一次测试结果（落库 `lastTest`）。 */
export interface LastTestResult {
  /** ISO 8601 UTC。 */
  readonly at: string;
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly durationMs?: number;
  readonly rowCount?: number;
  readonly truncated?: boolean;
}

/** 一次取数的统一产出：test / preview / query 三条路径共用。 */
export interface DatasourceExecutionOutcome {
  readonly fields: readonly DatasetFieldDefinition[];
  readonly rows: readonly DatasourceRow[];
  /** 实际返回行数（≤ 500），不是上游总行数。 */
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly durationMs: number;
}

/** 受管目录内单个库文件的元信息（只给文件名，不给目录）。 */
export interface DatabaseFileInfo {
  readonly name: string;
  readonly sizeBytes: number;
  /** ISO 8601 UTC。 */
  readonly modifiedAt: string;
}

/** 表/视图枚举结果。 */
export interface DatabaseTableInfo {
  readonly name: string;
  readonly kind: 'table' | 'view';
}

/** 表结构里的一列；`supported:false` 的是二进制列（不可勾选）。 */
export interface DatabaseColumnInfo {
  readonly name: string;
  readonly declaredType: string;
  readonly supported: boolean;
}

/** `GET /api/datasources/database-files/:name/tables` 的响应形状。 */
export interface DatabaseSchemaInfo {
  readonly tables: readonly DatabaseTableInfo[];
  readonly columns: Readonly<Record<string, readonly DatabaseColumnInfo[]>>;
}

/** 类型守卫：参数声明来自请求体（JSON），进入领域层前必须先收窄。 */
export function isParameterDeclaration(value: unknown): value is ParameterDeclaration {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const defaultValue = record.defaultValue;
  return (
    typeof record.name === 'string' &&
    PARAMETER_NAME_PATTERN.test(record.name) &&
    typeof record.label === 'string' &&
    (record.valueType === 'string' || record.valueType === 'number') &&
    typeof record.required === 'boolean' &&
    (defaultValue === undefined ||
      typeof defaultValue === 'string' ||
      typeof defaultValue === 'number')
  );
}

/**
 * 参数声明 → 契约的 `parameters[]`。
 *
 * 逐个字段显式拷贝而不是展开对象：请求体里的多余键（如前端误传的 `id`）不会漏进
 * `/api/datasets` 的响应，因为契约解析器用的是 strictObject——多一个键就整份判非法。
 */
export function parametersToDefinitions(
  declarations: readonly ParameterDeclaration[],
): readonly DatasetParameterDefinition[] {
  return declarations.map((declaration) => ({
    name: declaration.name,
    label: declaration.label.trim() === '' ? declaration.name : declaration.label,
    valueType: declaration.valueType,
    required: declaration.required,
    ...(declaration.defaultValue === undefined ? {} : { defaultValue: declaration.defaultValue }),
  }));
}

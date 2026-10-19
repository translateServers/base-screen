import {
  MAX_PARAMETERS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_FILTERS,
  PARAMETER_NAME_PATTERN,
} from '../datasources/datasource.types';

/**
 * 表模式 → 单条 SELECT 的 SQL 生成（架构 §4.2）。
 *
 * 安全约束（每一条都有对应测试）：
 * 1. **表名必须在 `sqlite_master` 的枚举结果里**，否则 `TABLE_NOT_FOUND`——用户不能在表名
 *    位置塞 `devices WHERE ...` 之类的东西。
 * 2. **列名必须在 `PRAGMA table_info` 的列集合里**（白名单）。
 * 3. **标识符用 `"` 包裹并把内部 `"` 双写**，因此列名含空格、引号、中文都安全；
 *    标识符里的控制字符（含 NUL）直接拒绝——SQLite 的标识符不能含 NUL。
 * 4. **值永不进 SQL 文本**：只生成 `"col" = :param` 并把值放进绑定对象。
 * 5. 空列集不允许保存，生成前再断言一次（0 列会得到 `SELECT  FROM` 这种语法错误）。
 *
 * 过滤只做等值（PRD Q4）；可选参数无值 → 该条件整条不加入 WHERE；必填参数无值 →
 * `MISSING_PARAMETER`。
 */

export interface TableQueryColumn {
  readonly name: string;
  readonly declaredType?: string;
}

export interface TableQueryFilter {
  readonly column: string;
  readonly param: string;
}

export interface TableQueryRequest {
  readonly table: string;
  readonly columns: readonly TableQueryColumn[];
  readonly filters?: readonly TableQueryFilter[];
  /** 受管库里存在的表/视图名（`sqlite_master` 枚举结果）。 */
  readonly availableTables: readonly string[];
  /** 所选表的列名（`PRAGMA table_info` 结果）。 */
  readonly availableColumns: readonly string[];
  /** 已解析的参数值；缺省 = 无值。 */
  readonly values: Readonly<Record<string, string | number>>;
  /** 必填参数名（无值时 MISSING_PARAMETER）。 */
  readonly requiredParams?: readonly string[];
}

export type TableQueryFailureCode =
  | 'TABLE_NOT_FOUND'
  | 'UNKNOWN_COLUMN'
  | 'INVALID_SHAPE'
  | 'MISSING_PARAMETER';

export interface TableQuerySuccess {
  readonly ok: true;
  readonly sql: string;
  readonly bound: Readonly<Record<string, string | number>>;
}

export interface TableQueryFailure {
  readonly ok: false;
  readonly code: TableQueryFailureCode;
  readonly message: string;
}

export type TableQueryResult = TableQuerySuccess | TableQueryFailure;

/**
 * 标识符引用：`"` 包裹 + 内部 `"` 双写。
 *
 * 例：`load` → `"load"`；`a"b` → `"a""b"`；`中文 列` → `"中文 列"`。
 */
export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** 标识符里不允许出现控制字符（含 NUL）——它们既不可读也不可安全引用。 */
function hasControlCharacter(value: string): boolean {
  // eslint 无关：只匹配 C0 控制字符与 DEL
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function buildTableQuery(request: TableQueryRequest): TableQueryResult {
  const table = request.table.trim();
  if (
    table === '' ||
    hasControlCharacter(table) ||
    request.availableTables.includes(table) === false
  ) {
    return failure(
      'TABLE_NOT_FOUND',
      `表 \`${table === '' ? '未选择' : table}\` 不存在（可能已被删除），请重新选表。`,
    );
  }

  const columns = request.columns;
  if (columns.length === 0) {
    return failure('INVALID_SHAPE', '至少选择 1 列，否则结果里没有任何可绑定字段。');
  }
  if (columns.length > MAX_TABLE_COLUMNS) {
    return failure('INVALID_SHAPE', `最多只能勾选 ${MAX_TABLE_COLUMNS} 列。`);
  }
  const selectedNames: string[] = [];
  for (const column of columns) {
    const name = column.name.trim();
    if (name === '' || hasControlCharacter(name)) {
      return failure('INVALID_SHAPE', '列名不合法，请重新勾选。');
    }
    if (request.availableColumns.includes(name) === false) {
      return failure('UNKNOWN_COLUMN', `列 \`${name}\` 不在表 \`${table}\` 里，请重新勾选。`);
    }
    if (selectedNames.includes(name)) {
      return failure('INVALID_SHAPE', `列 \`${name}\` 被重复勾选。`);
    }
    selectedNames.push(name);
  }

  const filters = request.filters ?? [];
  if (filters.length > MAX_TABLE_FILTERS) {
    return failure('INVALID_SHAPE', `最多只能添加 ${MAX_TABLE_FILTERS} 个过滤条件。`);
  }
  const requiredParams = new Set(request.requiredParams ?? []);
  const conditions: string[] = [];
  const bound: Record<string, string | number> = {};
  for (const filter of filters) {
    const column = filter.column.trim();
    const param = filter.param.trim();
    if (request.availableColumns.includes(column) === false) {
      return failure('UNKNOWN_COLUMN', `过滤列 \`${column}\` 不在表 \`${table}\` 里，请重新选择。`);
    }
    if (PARAMETER_NAME_PATTERN.test(param) === false) {
      return failure('INVALID_SHAPE', `过滤参数名 \`${param}\` 不合法（字母或下划线开头）。`);
    }
    const value = request.values[param];
    if (value === undefined) {
      if (requiredParams.has(param)) {
        return failure('MISSING_PARAMETER', `缺少必填参数 \`:${param}\`。`);
      }
      // 可选参数无值 → 该条件整条不加入 WHERE（PRD §8.5 表模式）
      continue;
    }
    conditions.push(`${quoteIdentifier(column)} = :${param}`);
    bound[param] = value;
  }

  const projection = selectedNames.map((name) => quoteIdentifier(name)).join(',');
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return { ok: true, sql: `SELECT ${projection} FROM ${quoteIdentifier(table)}${where}`, bound };
}

/** 参数声明数量上限（与前端表单文案共用同一个常量来源）。 */
export const PARAMETER_LIMIT = MAX_PARAMETERS;

function failure(code: TableQueryFailureCode, message: string): TableQueryFailure {
  return { ok: false, code, message };
}

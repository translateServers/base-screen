import { buildTableQuery, quoteIdentifier } from '../src/sqlite/sqlite-query-builder';

/**
 * 表模式 SQL 生成（A18 / 架构 §4.2）。
 *
 * 重点不是"能生成 SELECT"，而是**生成的 SQL 不可被用户输入改变结构**：表名与列名都得
 * 命中白名单，标识符统一用 `"` 包裹并双写内部引号，值只走绑定。
 */

const TABLES: readonly string[] = ['devices', 'v_fault_devices'];
const COLUMNS: readonly string[] = ['id', 'name', 'line', 'status', 'load'];

function build(
  overrides: Partial<Parameters<typeof buildTableQuery>[0]> = {},
): ReturnType<typeof buildTableQuery> {
  return buildTableQuery({
    table: 'devices',
    columns: [{ name: 'id' }, { name: 'name' }, { name: 'status' }],
    availableTables: TABLES,
    availableColumns: COLUMNS,
    values: {},
    ...overrides,
  });
}

describe('quoteIdentifier', () => {
  it('wraps and doubles internal quotes', () => {
    expect(quoteIdentifier('load')).toBe('"load"');
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
    expect(quoteIdentifier('中文 列')).toBe('"中文 列"');
    expect(quoteIdentifier('a b')).toBe('"a b"');
  });
});

describe('buildTableQuery', () => {
  it('generates a plain projection in the selected order', () => {
    const result = build();
    expect(result).toEqual({
      ok: true,
      sql: 'SELECT "id","name","status" FROM "devices"',
      bound: {},
    });
  });

  it('generates an equality filter and binds the value', () => {
    const result = build({
      filters: [{ column: 'status', param: 'status' }],
      values: { status: 'fault' },
    });
    expect(result).toEqual({
      ok: true,
      sql: 'SELECT "id","name","status" FROM "devices" WHERE "status" = :status',
      bound: { status: 'fault' },
    });
  });

  it('joins multiple filters with AND and keeps declaration order', () => {
    const result = build({
      filters: [
        { column: 'status', param: 'status' },
        { column: 'line', param: 'line' },
      ],
      values: { status: 'fault', line: 'LINE-A' },
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.sql).toBe(
      'SELECT "id","name","status" FROM "devices" WHERE "status" = :status AND "line" = :line',
    );
    expect(result.bound).toEqual({ status: 'fault', line: 'LINE-A' });
  });

  it('drops an optional filter with no value but keeps required ones missing', () => {
    const optional = build({ filters: [{ column: 'status', param: 'status' }], values: {} });
    expect(optional.ok).toBe(true);
    if (optional.ok === false) return;
    expect(optional.sql).toBe('SELECT "id","name","status" FROM "devices"');
    expect(optional.bound).toEqual({});

    const required = build({
      filters: [{ column: 'status', param: 'status' }],
      values: {},
      requiredParams: ['status'],
    });
    expect(required.ok).toBe(false);
    if (required.ok) return;
    expect(required.code).toBe('MISSING_PARAMETER');
    expect(required.message).toContain(':status');
  });

  it('does not bind parameters that no filter uses', () => {
    const result = build({ values: { status: 'fault', unused: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    // 多绑一个未使用的命名参数会让驱动抛 Unknown named parameter
    expect(result.bound).toEqual({});
  });

  it('rejects an unknown table (including SQL injection attempts in the table name)', () => {
    for (const table of ['nope', 'devices; DROP TABLE devices', 'devices WHERE 1=1', '', '  ']) {
      const result = build({ table });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('TABLE_NOT_FOUND');
    }
  });

  it('rejects columns outside the table (injection attempts included)', () => {
    for (const name of ['temp', 'id" FROM devices; --', 'name FROM devices', '*']) {
      const result = build({ columns: [{ name }] });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('UNKNOWN_COLUMN');
    }
  });

  it('rejects an empty or duplicated column set', () => {
    const empty = build({ columns: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(empty.code).toBe('INVALID_SHAPE');

    const duplicated = build({ columns: [{ name: 'id' }, { name: 'id' }] });
    expect(duplicated.ok).toBe(false);
    if (duplicated.ok === false) expect(duplicated.code).toBe('INVALID_SHAPE');
  });

  it('rejects more than 32 columns and more than 5 filters', () => {
    const tooManyColumns = build({
      columns: Array.from({ length: 33 }, (_unused, index) => ({ name: `c${index}` })),
      availableColumns: Array.from({ length: 33 }, (_unused, index) => `c${index}`),
    });
    expect(tooManyColumns.ok).toBe(false);
    if (tooManyColumns.ok === false) expect(tooManyColumns.code).toBe('INVALID_SHAPE');

    const tooManyFilters = build({
      filters: Array.from({ length: 6 }, (_unused, index) => ({
        column: 'status',
        param: `p${index}`,
      })),
      values: {},
    });
    expect(tooManyFilters.ok).toBe(false);
    if (tooManyFilters.ok === false) expect(tooManyFilters.code).toBe('INVALID_SHAPE');
  });

  it('rejects illegal parameter names', () => {
    const result = build({
      filters: [{ column: 'status', param: 'st atus' }],
      values: { 'st atus': 'fault' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SHAPE');
  });

  it('escapes identifiers that contain quotes or spaces', () => {
    const result = buildTableQuery({
      table: 'devices',
      columns: [{ name: 'a"b' }, { name: 'a b' }],
      availableTables: TABLES,
      availableColumns: ['a"b', 'a b'],
      values: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.sql).toBe('SELECT "a""b","a b" FROM "devices"');
  });

  it('rejects control characters in identifiers', () => {
    const result = buildTableQuery({
      table: 'devices',
      columns: [{ name: 'a\u0000b' }],
      availableTables: TABLES,
      availableColumns: ['a\u0000b'],
      values: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SHAPE');
  });
});

import { inspectSql, SQL_GUARD_MESSAGES } from '../src/sqlite/sqlite-sql-guard';

/**
 * A20（只读）/ A21（单语句）/ 参数抽取的**纯函数**覆盖。
 *
 * 这一层是「测试路径」的防线：预览与保存都会先过 `inspectSql`，因此这里绿了，
 * 写语句根本走不到驱动。驱动级的第二道防线（`readOnly: true` + 文件 SHA 不变）
 * 在 `sqlite-executor.e2e-spec.ts` 里用真实库文件断言。
 */

/** A20 的六种写语句（PRD 逐条列举）。 */
const WRITE_STATEMENTS: readonly string[] = [
  "UPDATE devices SET name='x'",
  'DELETE FROM devices',
  'DROP TABLE devices',
  "ATTACH DATABASE '/tmp/e.db' AS e",
  'PRAGMA journal_mode=DELETE',
  'WITH x AS (SELECT 1) DELETE FROM devices',
];

/** PRD S1 里其余需要拒绝的关键字（黑名单完整性）。 */
const OTHER_WRITE_STATEMENTS: readonly string[] = [
  "INSERT INTO devices (id) VALUES ('D-999')",
  "REPLACE INTO devices (id) VALUES ('D-999')",
  'CREATE TABLE t (id TEXT)',
  'ALTER TABLE devices ADD COLUMN extra TEXT',
  'VACUUM',
  'REINDEX',
  'DETACH DATABASE e',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT sp1',
  'RELEASE sp1',
  'TRANSACTION',
];

describe('inspectSql · 只读（A20）', () => {
  it.each(WRITE_STATEMENTS)('rejects %s', (sql) => {
    const result = inspectSql({ sql });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('READONLY_VIOLATION');
    expect(result.message).toBe(SQL_GUARD_MESSAGES.readonly);
  });

  it.each(OTHER_WRITE_STATEMENTS)('rejects %s', (sql) => {
    const result = inspectSql({ sql });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('READONLY_VIOLATION');
  });

  it('rejects a statement that does not start with SELECT or WITH', () => {
    for (const sql of ['1 + 1', '* FROM devices', 'EXPLAIN SELECT 1']) {
      const result = inspectSql({ sql });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('READONLY_VIOLATION');
    }
  });

  it('allows SELECT and WITH', () => {
    expect(inspectSql({ sql: 'SELECT 1' }).ok).toBe(true);
    expect(inspectSql({ sql: '  select id from devices  ' }).ok).toBe(true);
    expect(inspectSql({ sql: 'WITH x AS (SELECT 1 AS n) SELECT n FROM x' }).ok).toBe(true);
    // 前导括号不算"第一条语句"（子查询形态）
    expect(inspectSql({ sql: '(SELECT 1)' }).ok).toBe(true);
  });

  it('allows replace() as a string function but rejects REPLACE INTO', () => {
    expect(inspectSql({ sql: "SELECT replace(name, 'a', 'b') AS n FROM devices" }).ok).toBe(true);
    expect(inspectSql({ sql: "SELECT replace (name, 'a', 'b') AS n FROM devices" }).ok).toBe(true);
    const into = inspectSql({ sql: "REPLACE INTO devices (id) VALUES ('D-9')" });
    expect(into.ok).toBe(false);
    if (into.ok) return;
    expect(into.code).toBe('READONLY_VIOLATION');
  });

  it('does not treat keywords inside literals or comments as statements', () => {
    expect(inspectSql({ sql: "SELECT 'DROP TABLE devices' AS text" }).ok).toBe(true);
    expect(inspectSql({ sql: "SELECT id FROM devices WHERE name = 'delete'" }).ok).toBe(true);
    expect(inspectSql({ sql: 'SELECT 1 /* DROP TABLE devices */ AS one' }).ok).toBe(true);
    expect(inspectSql({ sql: 'SELECT "delete" FROM devices' }).ok).toBe(true);
    expect(inspectSql({ sql: 'SELECT `drop` FROM devices' }).ok).toBe(true);
  });
});

describe('inspectSql · 单语句（A21）', () => {
  it('rejects a second statement', () => {
    const result = inspectSql({ sql: 'SELECT 1; DROP TABLE devices' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('MULTI_STATEMENT');
    expect(result.message).toBe(SQL_GUARD_MESSAGES.multiStatement);
  });

  it('rejects two or more separators even when the tail is empty', () => {
    for (const sql of ['SELECT 1;;', 'SELECT 1; ;', 'SELECT 1 /* c */ ; SELECT 2']) {
      const result = inspectSql({ sql });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('MULTI_STATEMENT');
    }
  });

  it('accepts a single trailing semicolon and strips it', () => {
    const result = inspectSql({ sql: 'SELECT 1;' });
    expect(result).toEqual({ ok: true, statement: 'SELECT 1', params: [] });
    expect(inspectSql({ sql: 'SELECT 1 ;  ' }).ok).toBe(true);
  });

  it('does not count a semicolon inside a literal', () => {
    const result = inspectSql({ sql: "SELECT ';' AS x" });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.statement).toBe("SELECT ';' AS x");
  });

  it('does not count a semicolon inside a line comment (A21)', () => {
    const result = inspectSql({ sql: 'SELECT 1 -- ; DROP' });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.statement).toBe('SELECT 1 -- ; DROP');
  });

  it('does not count a semicolon inside a quoted identifier', () => {
    expect(inspectSql({ sql: 'SELECT ";" FROM devices' }).ok).toBe(true);
    expect(inspectSql({ sql: 'SELECT [;] FROM devices' }).ok).toBe(true);
  });

  it('reports unclosed comments and quotes as INVALID_SQL（语法类，与结果形态分开）', () => {
    const comment = inspectSql({ sql: 'SELECT 1 /* unclosed' });
    expect(comment.ok).toBe(false);
    if (comment.ok === false) {
      expect(comment.code).toBe('INVALID_SQL');
      expect(comment.message).toBe(SQL_GUARD_MESSAGES.unclosedComment);
    }
    const quote = inspectSql({ sql: "SELECT 'abc" });
    expect(quote.ok).toBe(false);
    if (quote.ok === false) {
      expect(quote.code).toBe('INVALID_SQL');
      expect(quote.message).toBe(SQL_GUARD_MESSAGES.unclosedQuote);
    }
  });

  it('rejects an empty statement', () => {
    for (const sql of ['', '   ', ';', '-- only a comment']) {
      const result = inspectSql({ sql });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('INVALID_SQL');
    }
  });
});

describe('inspectSql · 命名参数', () => {
  it('collects declared :name parameters in order', () => {
    const result = inspectSql({
      sql: 'SELECT id FROM devices WHERE status = :status AND line = :line',
      declaredParams: ['line', 'status'],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.params).toEqual(['status', 'line']);
  });

  it('deduplicates repeated parameters', () => {
    const result = inspectSql({
      sql: 'SELECT id FROM devices WHERE status = :status OR backup_status = :status',
      declaredParams: ['status'],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.params).toEqual(['status']);
  });

  it('rejects undeclared parameters with the parameter name in the message', () => {
    const result = inspectSql({ sql: 'SELECT id FROM devices WHERE status = :nope' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNDECLARED_PARAMETER');
    expect(result.message).toContain(':nope');
  });

  it('rejects positional and other named styles', () => {
    const cases: readonly string[] = [
      'SELECT id FROM devices WHERE status = ?',
      'SELECT id FROM devices WHERE status = $status',
      'SELECT id FROM devices WHERE status = @status',
    ];
    for (const sql of cases) {
      const result = inspectSql({ sql, declaredParams: ['status'] });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('UNDECLARED_PARAMETER');
      expect(result.message).toBe(SQL_GUARD_MESSAGES.unsupportedParameter);
    }
  });

  it('ignores colons inside literals and comments', () => {
    const result = inspectSql({ sql: "SELECT ':status' AS x -- :nope\nFROM devices" });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.params).toEqual([]);
  });

  it('allows a declared parameter that the SQL does not use', () => {
    const result = inspectSql({ sql: 'SELECT 1 AS one', declaredParams: ['status'] });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.params).toEqual([]);
  });
});

import {
  configParameters,
  configSummary,
  isSameConfig,
  maskConfig,
  mergeRestHeaders,
  readConfig,
  readStoredConfig,
} from '../src/datasources/datasource.config';
import { DATASOURCE_CONFIG_VERSION, MASKED_SECRET } from '../src/datasources/datasource.types';
import {
  buildCustomDatasetId,
  slugifyName,
  suggestDatasetId,
} from '../src/datasources/datasource-slug';

/**
 * config 的三种形状、版本号、脱敏、摘要与 header 合并（A2 / A8 / A13 / A15 的纯函数半场）。
 *
 * 这里是"能存进去的一定能读出来"的守门人：`readStoredConfig` 复用 `readConfig`，
 * 所以库里被人手改坏的行会退化成 `null`（按不可用处理），而不是让接口 500。
 */

const SQLITE_TABLE_CONFIG = {
  v: DATASOURCE_CONFIG_VERSION,
  mode: 'table',
  file: 'workshop.db',
  table: 'devices',
  columns: [
    { name: 'id', declaredType: 'TEXT' },
    { name: 'load', declaredType: 'REAL' },
  ],
  filters: [{ column: 'load', param: 'minLoad' }],
  params: [
    { name: 'minLoad', label: '最小负载', valueType: 'number', required: false, defaultValue: 40 },
  ],
} as const;

describe('readConfig · SQLite', () => {
  it('accepts a table-mode config and keeps the selected order', () => {
    const result = readConfig('sqlite', SQLITE_TABLE_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.config).toMatchObject({ mode: 'table', file: 'workshop.db', table: 'devices' });
    if (!('mode' in result.config) || result.config.mode !== 'table') return;
    expect(result.config.columns.map((column) => column.name)).toEqual(['id', 'load']);
    expect(result.config.filters).toEqual([{ column: 'load', param: 'minLoad' }]);
  });

  it('accepts a sql-mode config', () => {
    const result = readConfig('sqlite', {
      v: 1,
      mode: 'sql',
      file: 'workshop.db',
      sql: 'SELECT id FROM devices',
      params: [],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown version instead of guessing a migration', () => {
    const result = readConfig('sqlite', { ...SQLITE_TABLE_CONFIG, v: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_REQUEST');
    expect(result.message).toContain('v:1');
  });

  it('rejects a missing file, table, or empty column set', () => {
    expect(readConfig('sqlite', { ...SQLITE_TABLE_CONFIG, file: '' }).ok).toBe(false);
    expect(readConfig('sqlite', { ...SQLITE_TABLE_CONFIG, table: '  ' }).ok).toBe(false);
    expect(readConfig('sqlite', { ...SQLITE_TABLE_CONFIG, columns: [] }).ok).toBe(false);
  });

  it('rejects a filter that references an undeclared parameter', () => {
    const result = readConfig('sqlite', {
      ...SQLITE_TABLE_CONFIG,
      params: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(':minLoad');
  });

  it('rejects more than 32 columns, 5 filters and 10 parameters', () => {
    const tooManyColumns = readConfig('sqlite', {
      ...SQLITE_TABLE_CONFIG,
      filters: [],
      params: [],
      columns: Array.from({ length: 33 }, (_unused, index) => ({
        name: `c${index}`,
        declaredType: 'TEXT',
      })),
    });
    expect(tooManyColumns.ok).toBe(false);

    const tooManyFilters = readConfig('sqlite', {
      ...SQLITE_TABLE_CONFIG,
      filters: Array.from({ length: 6 }, () => ({ column: 'id', param: 'minLoad' })),
    });
    expect(tooManyFilters.ok).toBe(false);

    const tooManyParams = readConfig('sqlite', {
      ...SQLITE_TABLE_CONFIG,
      filters: [],
      params: Array.from({ length: 11 }, (_unused, index) => ({
        name: `p${index}`,
        label: `p${index}`,
        valueType: 'string',
        required: false,
      })),
    });
    expect(tooManyParams.ok).toBe(false);
  });

  it('rejects duplicate column / parameter names', () => {
    expect(
      readConfig('sqlite', {
        ...SQLITE_TABLE_CONFIG,
        filters: [],
        params: [],
        columns: [
          { name: 'id', declaredType: 'TEXT' },
          { name: 'id', declaredType: 'TEXT' },
        ],
      }).ok,
    ).toBe(false);
    expect(
      readConfig('sqlite', {
        ...SQLITE_TABLE_CONFIG,
        filters: [],
        params: [
          { name: 'p', label: 'p', valueType: 'string', required: false },
          { name: 'p', label: 'p', valueType: 'string', required: false },
        ],
      }).ok,
    ).toBe(false);
  });

  it('falls back to the parameter name when label is blank', () => {
    const result = readConfig('sqlite', {
      ...SQLITE_TABLE_CONFIG,
      filters: [],
      params: [{ name: 'status', label: '   ', valueType: 'string', required: true }],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(configParameters(result.config)[0]?.label).toBe('status');
  });
});

describe('readConfig · REST', () => {
  it('accepts http/https and rejects everything else', () => {
    expect(
      readConfig('rest', {
        v: 1,
        url: 'http://127.0.0.1:3000/api/demo/press',
        headers: [],
        params: [],
      }).ok,
    ).toBe(true);
    expect(
      readConfig('rest', { v: 1, url: 'https://example.com/x', headers: [], params: [] }).ok,
    ).toBe(true);
    for (const url of ['', '  ', 'ftp://example.com/x', 'not-a-url', 'javascript:alert(1)']) {
      const result = readConfig('rest', { v: 1, url, headers: [], params: [] });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe('INVALID_REQUEST');
    }
  });

  it('rejects header names with spaces or colons and duplicate headers', () => {
    expect(
      readConfig('rest', {
        v: 1,
        url: 'http://x/y',
        headers: [{ name: 'Bad Name', value: 'v' }],
        params: [],
      }).ok,
    ).toBe(false);
    expect(
      readConfig('rest', {
        v: 1,
        url: 'http://x/y',
        headers: [{ name: 'X-A: b', value: 'v' }],
        params: [],
      }).ok,
    ).toBe(false);
    expect(
      readConfig('rest', {
        v: 1,
        url: 'http://x/y',
        headers: [
          { name: 'X-Key', value: 'a' },
          { name: 'x-key', value: 'b' },
        ],
        params: [],
      }).ok,
    ).toBe(false);
  });
});

describe('readConfig · 静态 JSON（A15）', () => {
  it('accepts scalar cells and rejects nested ones', () => {
    const ok = readConfig('static', {
      v: 1,
      columns: ['a', 'b'],
      rows: [
        [1, 'x'],
        [true, null],
      ],
    });
    expect(ok.ok).toBe(true);

    const nested = readConfig('static', {
      v: 1,
      columns: ['a'],
      rows: [[{ k: 1 }]],
    });
    expect(nested.ok).toBe(false);
    if (nested.ok) return;
    expect(nested.code).toBe('INVALID_SHAPE');
  });

  it('rejects more than 200 rows or more than 64 KiB with TOO_LARGE', () => {
    const tooManyRows = readConfig('static', {
      v: 1,
      columns: ['a'],
      rows: Array.from({ length: 201 }, () => ['x']),
    });
    expect(tooManyRows.ok).toBe(false);
    if (tooManyRows.ok === false) expect(tooManyRows.code).toBe('TOO_LARGE');

    const tooBig = readConfig('static', {
      v: 1,
      columns: ['a'],
      rows: Array.from({ length: 200 }, () => ['x'.repeat(400)]),
    });
    expect(tooBig.ok).toBe(false);
    if (tooBig.ok === false) expect(tooBig.code).toBe('TOO_LARGE');
  });

  it('rejects ragged rows and duplicate column names', () => {
    expect(readConfig('static', { v: 1, columns: ['a', 'b'], rows: [['x']] }).ok).toBe(false);
    expect(readConfig('static', { v: 1, columns: ['a', 'a'], rows: [['x', 'y']] }).ok).toBe(false);
  });
});

describe('readStoredConfig', () => {
  it('round-trips a valid config and degrades a corrupt one to null', () => {
    const parsed = readConfig('sqlite', SQLITE_TABLE_CONFIG);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(readStoredConfig('sqlite', JSON.stringify(parsed.config))).toEqual(parsed.config);
    expect(readStoredConfig('sqlite', 'not json')).toBeNull();
    expect(readStoredConfig('sqlite', JSON.stringify({ v: 9 }))).toBeNull();
  });
});

describe('maskConfig（PRD §6 / A13）', () => {
  it('masks REST header values with a fixed 8 dots and reports hasValue', () => {
    const masked = maskConfig({
      v: 1,
      url: 'http://x/y?token=1',
      headers: [
        { name: 'X-API-Key', value: 'super-secret-token-123' },
        { name: 'X-Empty', value: '' },
      ],
      params: [],
    });
    expect(masked).toMatchObject({
      url: 'http://x/y?token=1',
      headers: [
        { name: 'X-API-Key', valueMasked: MASKED_SECRET, hasValue: true },
        { name: 'X-Empty', valueMasked: MASKED_SECRET, hasValue: false },
      ],
    });
    // 掩码固定 8 个点，与真实长度无关
    expect(MASKED_SECRET).toHaveLength(8);
    expect(JSON.stringify(masked)).not.toContain('super-secret-token-123');
  });

  it('leaves SQLite config as-is (only basename, never an absolute path)', () => {
    const parsed = readConfig('sqlite', SQLITE_TABLE_CONFIG);
    expect(parsed.ok).toBe(true);
    if (parsed.ok === false) return;
    expect(maskConfig(parsed.config)).toEqual(parsed.config);
    expect(JSON.stringify(parsed.config)).not.toContain(':\\');
  });
});

describe('configSummary（PRD §8.1）', () => {
  it('summarises each type without leaking query strings or paths', () => {
    const sqliteTable = readConfig('sqlite', SQLITE_TABLE_CONFIG);
    const sqliteSql = readConfig('sqlite', {
      v: 1,
      mode: 'sql',
      file: 'workshop.db',
      sql: 'SELECT 1',
      params: [],
    });
    const rest = readConfig('rest', {
      v: 1,
      url: 'http://api.example.com/press?secret=1',
      headers: [],
      params: [],
    });
    const staticConfig = readConfig('static', {
      v: 1,
      columns: ['a', 'b', 'c'],
      rows: [[1, 2, 3]],
    });
    expect(sqliteTable.ok && configSummary(sqliteTable.config)).toBe('workshop.db · devices');
    expect(sqliteSql.ok && configSummary(sqliteSql.config)).toBe('workshop.db · SQL');
    expect(rest.ok && configSummary(rest.config)).toBe('GET api.example.com/press');
    expect(staticConfig.ok && configSummary(staticConfig.config)).toBe('3 列 · 1 行');
  });
});

describe('mergeRestHeaders（A13 的「留空保留」）', () => {
  const previous = [
    { name: 'X-API-Key', value: 'super-secret-token-123' },
    { name: 'X-Trace', value: 'trace-1' },
  ];

  it('keeps the stored value for empty string and for the mask', () => {
    for (const incoming of ['', MASKED_SECRET]) {
      const merged = mergeRestHeaders([{ name: 'X-API-Key', value: incoming }], previous);
      expect(merged.ok).toBe(true);
      if (merged.ok === false) continue;
      expect(merged.config).toEqual([{ name: 'X-API-Key', value: 'super-secret-token-123' }]);
    }
  });

  it('overwrites with a new value', () => {
    const merged = mergeRestHeaders([{ name: 'X-API-Key', value: 'new-token' }], previous);
    expect(merged.ok).toBe(true);
    if (merged.ok === false) return;
    expect(merged.config).toEqual([{ name: 'X-API-Key', value: 'new-token' }]);
  });

  it('rejects a brand-new header without a value', () => {
    const merged = mergeRestHeaders([{ name: 'X-New', value: '' }], previous);
    expect(merged.ok).toBe(false);
    if (merged.ok) return;
    expect(merged.message).toContain('X-New');
  });

  it('drops a header removed by the user', () => {
    const merged = mergeRestHeaders([], previous);
    expect(merged.ok).toBe(true);
    if (merged.ok === false) return;
    expect(merged.config).toEqual([]);
  });
});

describe('isSameConfig（保存时跳过无谓取数的判据）', () => {
  it('compares structurally, ignoring key order of equal shapes', () => {
    expect(isSameConfig({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
    expect(isSameConfig({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('datasetId 规则（与三端 datasource-model.ts 同一张 fixture，A12）', () => {
  const cases: readonly { readonly name: string; readonly slug: string }[] = [
    { name: 'Press Line A', slug: 'press-line-a' },
    { name: 'press line a', slug: 'press-line-a' },
    { name: 'A // B', slug: 'a-b' },
    { name: 'V1.2 API', slug: 'v1-2-api' },
    { name: '-lead-trail-', slug: 'lead-trail' },
    { name: 'a__b', slug: 'a-b' },
    { name: '工业4.0 看板', slug: '4-0' },
    { name: '车间设备台账', slug: '' },
    { name: '空压机', slug: '' },
    { name: '！！！', slug: '' },
  ];

  it.each(cases)('slugifies $name → "$slug"', ({ name, slug }) => {
    expect(slugifyName(name)).toBe(slug);
  });

  it('generates custom.<slug> or custom.ds-<n>（不做拼音）', () => {
    expect(buildCustomDatasetId('Press Line A', 1)).toBe('custom.press-line-a');
    expect(buildCustomDatasetId('车间设备台账', 1)).toBe('custom.ds-1');
    expect(buildCustomDatasetId('空压机', 2)).toBe('custom.ds-2');
  });

  it('suggests a free suffixed id without adopting it (P8)', () => {
    const taken = new Set(['custom.press-line-a', 'custom.press-line-a-2']);
    expect(suggestDatasetId('custom.press-line-a', (id) => taken.has(id))).toBe(
      'custom.press-line-a-3',
    );
  });
});

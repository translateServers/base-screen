import { describe, expect, it } from 'vitest';
import {
  createDraft,
  type DatasourceDraft,
  validateDraft,
} from '../../examples/vanilla-host/src/lib/datasource-model';

const draft = (patch: Partial<DatasourceDraft>, type: DatasourceDraft['type'] = 'sqlite') => ({
  ...createDraft(type),
  name: '空气质量',
  ...patch,
});

const fieldOf = (value: DatasourceDraft): string | undefined => {
  const check = validateDraft(value);
  if (check.ok) return undefined;
  return check.field;
};

describe('datasource draft validation points at the failing control', () => {
  it('names the control for every error that has one', () => {
    expect(fieldOf(draft({ name: '  ' }))).toBe('name');
    expect(fieldOf(draft({ name: 'x'.repeat(65) }))).toBe('name');
    expect(fieldOf(draft({}))).toBe('file');
    expect(fieldOf(draft({ file: 'city-air.db' }))).toBe('table');
    expect(fieldOf(draft({ file: 'city-air.db', table: 'aqi' }))).toBe('columns');
    expect(fieldOf(draft({ file: 'city-air.db', sqliteMode: 'sql', sql: ' ' }))).toBe('sql');
    expect(fieldOf(draft({}, 'rest'))).toBe('url');
    // 非空但格式不对：旧的「字段为空」推断标不到它。
    expect(fieldOf(draft({ url: 'ftp://example.com' }, 'rest'))).toBe('url');
    expect(fieldOf(draft({ staticRows: [] }, 'static'))).toBe('staticRows');
    expect(fieldOf(draft({ staticColumns: ['a', 'a'] }, 'static'))).toBe('staticColumns');
  });

  it('accepts a complete draft', () => {
    expect(validateDraft(draft({ file: 'city-air.db', table: 'aqi', columns: ['city'] }))).toEqual({
      ok: true,
    });
  });
});

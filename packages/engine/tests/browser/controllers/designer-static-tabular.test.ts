import { describe, expect, it } from 'vitest';
import {
  coerceDesignerStaticCell,
  parseDesignerTsv,
} from '../../../src/browser/controllers/designer-static-tabular.js';

describe('designer static tabular authoring', () => {
  it('infers headers and number, boolean, date, and string columns from TSV', () => {
    const result = parseDesignerTsv(
      'name\tamount\tenabled\tday\nNorth\t42\ttrue\t2026-08-23\nSouth\t36\tfalse\t2026-08-24',
      true,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        fields: [
          { id: 'name', valueType: 'string' },
          { id: 'amount', valueType: 'number' },
          { id: 'enabled', valueType: 'boolean' },
          { id: 'day', valueType: 'date' },
        ],
        rows: [
          { name: 'North', amount: 42, enabled: true, day: '2026-08-23' },
          { name: 'South', amount: 36, enabled: false, day: '2026-08-24' },
        ],
      },
    });
  });

  it('uses generated column names when the first row is data', () => {
    const result = parseDesignerTsv('North\t42\nSouth\t36', false);
    expect(result).toMatchObject({
      ok: true,
      value: {
        fields: [{ id: 'column_1' }, { id: 'column_2' }],
        rows: [
          { column_1: 'North', column_2: 42 },
          { column_1: 'South', column_2: 36 },
        ],
      },
    });
  });

  it('rejects invalid cell edits without coercing them', () => {
    expect(coerceDesignerStaticCell('abc', 'number', false)).toBeUndefined();
    expect(coerceDesignerStaticCell('', 'number', true)).toBeNull();
    expect(coerceDesignerStaticCell('false', 'boolean', false)).toBe(false);
  });
});

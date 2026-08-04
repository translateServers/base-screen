import { parseScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createMinimalScreenDocument, createSingleComponentDocument } from './index.js';

describe('screen document fixtures', () => {
  it('minimal fixture parses', () => {
    const result = parseScreenDocument(createMinimalScreenDocument());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('single component fixture parses with overrides', () => {
    const result = parseScreenDocument(
      createSingleComponentDocument({ id: 'custom-id', name: '自定义名称' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.components[0]?.id).toBe('custom-id');
      expect(result.value.components[0]?.name).toBe('自定义名称');
    }
  });
});

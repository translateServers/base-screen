import { describe, expect, it } from 'vitest';
import {
  evaluateScreenHostResourceParameters,
  extractScreenHostResourceVariableDependencies,
  validateScreenHostResourceBinding,
} from '../../src/index.js';

describe('host dataset Core helpers', () => {
  it('R3 evaluates literals and variables into detached ordinary JSON', () => {
    const params = {
      limit: { kind: 'literal' as const, value: 20 },
      tenant: { kind: 'variable' as const, name: 'tenant' },
    };
    const result = evaluateScreenHostResourceParameters(params, { tenant: { id: 'a' } });
    expect(result).toEqual({
      ok: true,
      value: { params: { limit: 20, tenant: { id: 'a' } }, dependencies: ['tenant'] },
      diagnostics: [],
    });
    if (result.ok) expect(result.value.params.tenant).not.toBe(params.tenant);
    expect(extractScreenHostResourceVariableDependencies(params)).toEqual(['tenant']);
  });

  it('R3 fails closed for a missing variable or an invalid role binding', () => {
    expect(
      evaluateScreenHostResourceParameters({ tenant: { kind: 'variable', name: 'missing' } }, {}),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_PARAMETER_INVALID' }] });
    expect(
      validateScreenHostResourceBinding(
        { fields: { measures: ['name'] } },
        [{ id: 'name', label: '名称', valueType: 'string' }],
        [{ id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] }],
      ),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_BINDING_INVALID' }] });
  });
});

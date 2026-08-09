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

  it('R8 optional parameters keep unset/literal/variable authoring states and only persist present items', () => {
    const params = {
      region: { kind: 'literal' as const, value: '华东' },
      tenant: { kind: 'variable' as const, name: 'tenant' },
    };
    const evaluated = evaluateScreenHostResourceParameters(params, { tenant: 't-1' });
    expect(evaluated.ok).toBe(true);
    if (evaluated.ok) {
      // 只对 params 中已存在的项求值；未声明的可选参数不产生任何持久化项。
      expect(evaluated.value.params).toEqual({ region: '华东', tenant: 't-1' });
      expect(evaluateScreenHostResourceParameters({}, {}).ok).toBe(true);
    }
  });

  it('R6 preserves nullable/unit/format in the binding projection detached from the source', () => {
    const field = {
      id: 'amount',
      label: '金额',
      valueType: 'number' as const,
      nullable: false,
      unit: '元',
      format: '#,##0.00',
    };
    const result = validateScreenHostResourceBinding(
      { fields: { measures: ['amount'] } },
      [field],
      [{ id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number'] }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const projected = result.value.fields.measures![0]!;
    expect(projected).toEqual(field);
    expect(projected).not.toBe(field);
    field.nullable = true;
    field.unit = '已修改';
    field.format = '#,##0.000';
    expect(projected).toEqual({
      id: 'amount',
      label: '金额',
      valueType: 'number',
      nullable: false,
      unit: '元',
      format: '#,##0.00',
    });
  });

  it('R6 omits absent field metadata keys in the binding projection', () => {
    const result = validateScreenHostResourceBinding(
      { fields: { measures: ['name'] } },
      [{ id: 'name', label: '名称', valueType: 'string' }],
      [{ id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['string'] }],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields.measures).toStrictEqual([
      { id: 'name', label: '名称', valueType: 'string' },
    ]);
  });
});

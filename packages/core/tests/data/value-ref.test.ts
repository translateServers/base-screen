import type { ScreenJsonValue, ScreenValueRef } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  collectScreenValueRefDependencies,
  evaluateScreenValueRef,
  validateScreenDataBinding,
  type ScreenValueRefEnvironment,
} from '../../src/index.js';

const diagnostic = {
  severity: 'error' as const,
  code: 'HOST_RESOURCE_UNAVAILABLE' as const,
  path: [],
  message: 'Host resource is unavailable.',
};

function environment(
  overrides: Partial<ScreenValueRefEnvironment> = {},
): ScreenValueRefEnvironment {
  return {
    variableValues: {},
    dataSourceValues: new Map<string, ScreenJsonValue>(),
    dataSourceErrors: new Map(),
    ...overrides,
  };
}

describe('evaluateScreenValueRef · inline', () => {
  it('returns a detached copy of the literal value', () => {
    const ref: ScreenValueRef = { kind: 'inline', value: { region: 'north' } };
    const result = evaluateScreenValueRef(ref, environment());

    expect(result).toEqual({ kind: 'value', value: { region: 'north' } });
    if (result.kind !== 'value') return;
    expect(result.value).not.toBe(ref.value);
  });

  it('keeps null and scalar literals intact', () => {
    expect(evaluateScreenValueRef({ kind: 'inline', value: null }, environment())).toEqual({
      kind: 'value',
      value: null,
    });
    expect(evaluateScreenValueRef({ kind: 'inline', value: 0 }, environment())).toEqual({
      kind: 'value',
      value: 0,
    });
  });
});

describe('evaluateScreenValueRef · variable', () => {
  it('reads the current variable value', () => {
    const result = evaluateScreenValueRef(
      { kind: 'variable', variableId: 'region' },
      environment({ variableValues: { region: 'north' } }),
    );
    expect(result).toEqual({ kind: 'value', value: 'north' });
  });

  it('fails (not pending) when the variable has no value', () => {
    expect(
      evaluateScreenValueRef({ kind: 'variable', variableId: 'missing' }, environment()),
    ).toEqual({ kind: 'failed', dataSourceId: null, reason: 'variable-missing' });
  });
});

describe('evaluateScreenValueRef · data-source-field', () => {
  it('is pending while the instance has neither a value nor an error', () => {
    expect(
      evaluateScreenValueRef(
        { kind: 'data-source-field', dataSourceId: 'orders', path: [] },
        environment(),
      ),
    ).toEqual({ kind: 'pending', dataSourceId: 'orders' });
  });

  it('fails when the instance reports an error, even if a stale value is still cached', () => {
    const result = evaluateScreenValueRef(
      { kind: 'data-source-field', dataSourceId: 'orders', path: [] },
      environment({
        dataSourceValues: new Map<string, ScreenJsonValue>([['orders', { rows: [] }]]),
        dataSourceErrors: new Map([['orders', diagnostic]]),
      }),
    );
    expect(result).toEqual({
      kind: 'failed',
      dataSourceId: 'orders',
      reason: 'data-source-error',
    });
  });

  it('projects the whole result when the path is empty', () => {
    const value = { rows: [{ total: 3 }] };
    const result = evaluateScreenValueRef(
      { kind: 'data-source-field', dataSourceId: 'orders', path: [] },
      environment({ dataSourceValues: new Map([['orders', value]]) }),
    );
    expect(result).toEqual({ kind: 'value', value });
    if (result.kind !== 'value') return;
    expect(result.value).not.toBe(value);
  });

  it('drills down object fields', () => {
    // `path` 段词法与 Blueprint 表达式路径同源（`[A-Za-z_][A-Za-z0-9_]{0,127}`），
    // 因此只能寻址对象字段，数组下标不在取值引用的路径语言里。
    const env = environment({
      dataSourceValues: new Map<string, ScreenJsonValue>([
        ['orders', { summary: { total: 7 }, rows: [{ total: 3 }] }],
      ]),
    });
    expect(
      evaluateScreenValueRef(
        { kind: 'data-source-field', dataSourceId: 'orders', path: ['summary', 'total'] },
        env,
      ),
    ).toEqual({ kind: 'value', value: 7 });
    expect(
      evaluateScreenValueRef(
        { kind: 'data-source-field', dataSourceId: 'orders', path: ['rows'] },
        env,
      ),
    ).toEqual({ kind: 'value', value: [{ total: 3 }] });
  });

  it('returns an undefined value (not an error) when the field is missing this round', () => {
    const env = environment({
      dataSourceValues: new Map<string, ScreenJsonValue>([['orders', { rows: [] }]]),
    });
    expect(
      evaluateScreenValueRef(
        { kind: 'data-source-field', dataSourceId: 'orders', path: ['summary', 'total'] },
        env,
      ),
    ).toEqual({ kind: 'value', value: undefined });
  });

  it('fails when the projected result exceeds the byte budget', () => {
    const env = environment({
      dataSourceValues: new Map<string, ScreenJsonValue>([['orders', { note: 'x'.repeat(2_000) }]]),
    });
    expect(
      evaluateScreenValueRef(
        { kind: 'data-source-field', dataSourceId: 'orders', path: [] },
        env,
        1_024,
      ),
    ).toEqual({ kind: 'failed', dataSourceId: 'orders', reason: 'value-invalid' });
  });

  it('does not distinguish paths in its failure or pending identity', () => {
    // 语义断言：同一实例的两个字段共享一次请求，差别只在投影，不在身份。
    const pendingA = evaluateScreenValueRef(
      { kind: 'data-source-field', dataSourceId: 'orders', path: ['a'] },
      environment(),
    );
    const pendingB = evaluateScreenValueRef(
      { kind: 'data-source-field', dataSourceId: 'orders', path: ['b', 'c'] },
      environment(),
    );
    expect(pendingA).toEqual(pendingB);
  });
});

describe('collectScreenValueRefDependencies', () => {
  it('collects one ref, ignoring inline values', () => {
    expect(
      collectScreenValueRefDependencies({
        kind: 'data-source-field',
        dataSourceId: 'orders',
        path: ['rows'],
      }),
    ).toEqual({ variableIds: [], dataSourceIds: ['orders'] });
    expect(collectScreenValueRefDependencies({ kind: 'inline', value: 1 })).toEqual({
      variableIds: [],
      dataSourceIds: [],
    });
  });

  it('collects a named parameter map, de-duplicated and sorted', () => {
    expect(
      collectScreenValueRefDependencies({
        b: { kind: 'data-source-field', dataSourceId: 'tenants', path: [] },
        a: { kind: 'variable', variableId: 'region' },
        c: { kind: 'data-source-field', dataSourceId: 'tenants', path: ['x'] },
        d: { kind: 'variable', variableId: 'page' },
      }),
    ).toEqual({ variableIds: ['page', 'region'], dataSourceIds: ['tenants'] });
  });

  it('treats a missing component value as no dependency', () => {
    expect(collectScreenValueRefDependencies(null)).toEqual({
      variableIds: [],
      dataSourceIds: [],
    });
    expect(collectScreenValueRefDependencies({})).toEqual({
      variableIds: [],
      dataSourceIds: [],
    });
  });
});

describe('validateScreenDataBinding', () => {
  const fields = [
    { id: 'name', label: '名称', valueType: 'string' as const },
    { id: 'amount', label: '金额', valueType: 'number' as const },
  ];
  const roles = [{ id: 'measures', minFields: 1, maxFields: 8, valueTypes: ['number' as const] }];

  it('projects selected fields detached from the source dataset', () => {
    const result = validateScreenDataBinding({ fields: { measures: ['amount'] } }, fields, roles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields).toEqual({ measures: [fields[1]] });
    expect(result.value.fields.measures?.[0]).not.toBe(fields[1]);
  });

  it('accepts a null binding only when the material declares no roles', () => {
    expect(validateScreenDataBinding(null, fields, [])).toEqual({
      ok: true,
      value: { fields: {} },
      diagnostics: [],
    });
    expect(validateScreenDataBinding(null, fields, roles)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_BINDING_INVALID' }],
    });
  });

  it('rejects a field whose value type the role cannot take', () => {
    expect(
      validateScreenDataBinding({ fields: { measures: ['name'] } }, fields, roles),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'HOST_DATASET_BINDING_INVALID' }] });
  });

  it('preserves nullable/unit/format in the projection, detached from the source', () => {
    const field = {
      id: 'amount',
      label: '金额',
      valueType: 'number' as const,
      nullable: false,
      unit: '元',
      format: '#,##0.00',
    };
    const result = validateScreenDataBinding({ fields: { measures: ['amount'] } }, [field], roles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const projected = result.value.fields.measures![0]!;
    expect(projected).toEqual(field);
    expect(projected).not.toBe(field);
    field.unit = '已修改';
    expect(projected).toEqual({
      id: 'amount',
      label: '金额',
      valueType: 'number',
      nullable: false,
      unit: '元',
      format: '#,##0.00',
    });
  });

  it('omits absent field metadata keys in the projection', () => {
    const result = validateScreenDataBinding({ fields: { measures: ['amount'] } }, fields, roles);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fields.measures).toStrictEqual([
      { id: 'amount', label: '金额', valueType: 'number' },
    ]);
  });

  it('rejects an undeclared role', () => {
    expect(validateScreenDataBinding({ fields: { unknown: [] } }, fields, roles)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'HOST_DATASET_BINDING_INVALID' }],
    });
  });
});

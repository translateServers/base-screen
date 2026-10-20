import { describe, expect, it } from 'vitest';
import {
  hostResourceParameterToValueRef,
  valueRefToHostResourceParameter,
} from '../../../src/browser/controllers/dataset/designer-data-source-authoring.js';

/**
 * 草稿参数（取值引用）与数据源事务（旧 `component.dataSource.params`）之间的**唯一**映射点。
 * 这层映射一旦口径不一，症状是「界面上选了变量、应用后参数变回字面值」。
 */
describe('数据集参数：取值引用 ⇄ 旧参数形态', () => {
  it('literal → inline，可逆', () => {
    const ref = hostResourceParameterToValueRef({ kind: 'literal', value: 3 });
    expect(ref).toEqual({ kind: 'inline', value: 3 });
    expect(valueRefToHostResourceParameter(ref)).toEqual({ kind: 'literal', value: 3 });
  });

  it('variable → variable，可逆', () => {
    const ref = hostResourceParameterToValueRef({ kind: 'variable', variableId: 'region' });
    expect(ref).toEqual({ kind: 'variable', variableId: 'region' });
    expect(valueRefToHostResourceParameter(ref)).toEqual({
      kind: 'variable',
      variableId: 'region',
    });
  });

  it('旧形态读进来保留值不做类型推断（null / 对象 / 数组都原样）', () => {
    for (const value of [null, { a: 1 }, [1, 2], 'text', false]) {
      expect(hostResourceParameterToValueRef({ kind: 'literal', value })).toEqual({
        kind: 'inline',
        value,
      });
    }
  });

  it('写回时旧形态表达不了的引用返回 undefined（调用方须 fail-closed）', () => {
    expect(
      valueRefToHostResourceParameter({
        kind: 'data-source-field',
        dataSourceId: 'orders',
        path: [],
      }),
    ).toBeUndefined();
  });
});

import type {
  ScreenDatasetDefinition,
  ScreenDocument,
  ScreenHostResourceParameter,
  ScreenValueRef,
} from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createDatasetDataSourceTransaction,
  createDesignerDatasetDraft,
  hostResourceParameterToValueRef,
  setDesignerDatasetParameter,
  valueRefToHostResourceParameter,
} from '../../../src/browser/controllers/dataset/designer-data-source-authoring.js';

/**
 * 草稿参数（取值引用）与数据源事务（旧 `component.dataSource.params`）之间的**唯一**映射点。
 * 这层映射一旦口径不一，症状是「界面上选了变量、应用后参数变回字面值」。
 *
 * 除了映射函数本身，这里还钉住三条链路：草稿读入、草稿写入、事务写回——
 * 它们是同一件事的三段，任何一段用错形态只有单测能发现（类型上都合法）。
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

const descriptor: ScreenDatasetDefinition = {
  datasetId: 'orders',
  name: '订单',
  description: null,
  fields: [{ id: 'amount', label: '金额', valueType: 'number' }],
  parameters: [
    { name: 'limit', label: '行数', valueType: 'number', required: true, defaultValue: 2 },
    { name: 'region', label: '区域', valueType: 'string', required: false },
  ],
};

const document: ScreenDocument = {
  canvas: { width: 960, height: 540, backgroundColor: '#000000' },
  components: [],
  variables: [
    {
      type: 'data-source',
      id: 'tenantRegion',
      name: 'tenantRegion',
      initialValue: null,
      sourceId: 'tenant-region',
      controlled: true,
    },
  ],
  blueprint: { relations: [] },
};

function datasetSource(params: Readonly<Record<string, ScreenHostResourceParameter>>) {
  return {
    type: 'dataset' as const,
    datasetId: 'orders',
    params,
    binding: { fields: {} },
  };
}

describe('数据集草稿：读入与写入都只经映射点', () => {
  it('旧文档读入 → 草稿是取值引用（默认值也以常量形态进草稿）', () => {
    const draft = createDesignerDatasetDraft(
      descriptor,
      datasetSource({ region: { kind: 'literal', value: 'north' } }),
    );
    expect(draft.params.region).toEqual({ kind: 'inline', value: 'north' });
    // limit 在文档里没有记录，退到定义默认值，同样是常量引用而不是裸值。
    expect(draft.params.limit).toEqual({ kind: 'inline', value: 2 });
  });

  it('setDesignerDatasetParameter 整体替换一个参数，不再按控件类型猜形态', () => {
    const draft = createDesignerDatasetDraft(descriptor, null);
    const next = setDesignerDatasetParameter(draft, 'region', {
      kind: 'variable',
      variableId: 'tenantRegion',
    });
    expect(next.params.region).toEqual({ kind: 'variable', variableId: 'tenantRegion' });
    expect(next.params.limit).toEqual(draft.params.limit);
    expect(draft.params.region).toBeUndefined();
  });
});

describe('数据源事务：草稿取值引用 → 文档旧形态', () => {
  function transactionWith(params: Readonly<Record<string, ScreenValueRef>>) {
    return createDatasetDataSourceTransaction({
      document,
      componentId: 'text-1',
      descriptor,
      draft: { datasetId: 'orders', params, fields: {} },
      roles: [],
    });
  }

  it('常量写回 literal，变量写回 variable', () => {
    const result = transactionWith({
      limit: { kind: 'inline', value: 5 },
      region: { kind: 'variable', variableId: 'tenantRegion' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      commands: [
        {
          type: 'update-components',
          componentIds: ['text-1'],
          patch: {
            // 旧形态写回时同时清掉新取值字段：契约禁止 dataSource 与 dataValue 并存。
            dataValue: null,
            dataSource: {
              type: 'dataset',
              datasetId: 'orders',
              params: {
                limit: { kind: 'literal', value: 5 },
                region: { kind: 'variable', variableId: 'tenantRegion' },
              },
              binding: null,
            },
          },
        },
      ],
    });
  });

  it('旧形态表达不了的取值引用 fail-closed 成 HOST_DATASET_PARAMETER_INVALID', () => {
    const result = transactionWith({
      limit: { kind: 'inline', value: 5 },
      region: { kind: 'data-source-field', dataSourceId: 'orders', path: ['rows'] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('HOST_DATASET_PARAMETER_INVALID');
  });

  it('引用一个不存在的变量 → HOST_DATASET_PARAMETER_INVALID', () => {
    const result = transactionWith({
      limit: { kind: 'inline', value: 5 },
      region: { kind: 'variable', variableId: 'gone' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('HOST_DATASET_PARAMETER_INVALID');
  });
});

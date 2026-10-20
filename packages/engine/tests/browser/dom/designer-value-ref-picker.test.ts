import { describe, expect, it } from 'vitest';
import {
  datasetParameterPickerInput,
  valueRefEquals,
} from '../../../src/browser/controllers/value-ref/designer-value-ref-picker-controller.js';
import {
  badgeOf,
  buildValueRefOptions,
  type DesignerValueRefPickerInput,
  type DesignerValueRefText,
  filterValueRefOptions,
  summarizeValueRef,
  VALUE_REF_SEARCH_DEBOUNCE_MS,
} from '../../../src/browser/dom/value-ref/designer-value-ref-types.js';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

const text: DesignerValueRefText = DESIGNER_UI_TEXT.data.ref;

const input: DesignerValueRefPickerInput = {
  allowedKinds: ['inline', 'variable'],
  current: { kind: 'variable', variableId: 'region' },
  variables: [
    { id: 'region', name: '区域' },
    { id: 'page', name: '页码' },
  ],
};

describe('取值选择器 · 纯逻辑', () => {
  it('去抖常量与素材搜索同量级（导出以固定探针阈值）', () => {
    expect(VALUE_REF_SEARCH_DEBOUNCE_MS).toBe(180);
  });

  it('摘要：有名字用名字，丢失目标时退回 id 而不是留空', () => {
    expect(summarizeValueRef({ kind: 'variable', variableId: 'region' }, input, text)).toEqual({
      badge: '变量',
      label: '区域',
    });
    expect(summarizeValueRef({ kind: 'variable', variableId: 'gone' }, input, text)).toEqual({
      badge: '变量',
      label: 'gone',
    });
    expect(summarizeValueRef(null, input, text)).toEqual({ badge: '', label: '选择取值' });
  });

  it('徽标按形态取文案', () => {
    expect(badgeOf('inline', text)).toBe('常量');
    expect(badgeOf('variable', text)).toBe('变量');
    expect(badgeOf('data-source-field', text)).toBe('数据源输出');
  });

  it('候选项按「常量 → 变量 → 数据源输出」分段顺序展开，且只含允许的形态', () => {
    const options = buildValueRefOptions(input, text);
    expect(options.map((option) => option.kind)).toEqual(['inline', 'variable', 'variable']);
    const onlyVariable = buildValueRefOptions({ ...input, allowedKinds: ['variable'] }, text);
    expect(onlyVariable.every((option) => option.kind === 'variable')).toBe(true);
  });

  it('没有预设候选时，常量项携带当前内联值（供内联编辑器接管）', () => {
    const options = buildValueRefOptions({ ...input, current: { kind: 'inline', value: 7 } }, text);
    expect(options[0]).toMatchObject({ kind: 'inline', value: { kind: 'inline', value: 7 } });
  });

  it('数据源输出按 excludedDataSourceIds 过滤（自引用不外露）', () => {
    const withFields: DesignerValueRefPickerInput = {
      ...input,
      allowedKinds: ['data-source-field'],
      fields: [
        { dataSourceId: 'self', label: '自身输出', path: [] },
        { dataSourceId: 'other', label: '其它输出', path: ['rows'] },
      ],
      excludedDataSourceIds: ['self'],
    };
    expect(buildValueRefOptions(withFields, text).map((option) => option.id)).toEqual([
      'field:other:rows',
    ]);
  });

  it('搜索按名称/徽标过滤，空串不过滤，大小写无关', () => {
    const options = buildValueRefOptions(input, text);
    expect(filterValueRefOptions(options, '')).toHaveLength(options.length);
    expect(filterValueRefOptions(options, '区').map((option) => option.label)).toEqual(['区域']);
    expect(filterValueRefOptions(options, 'VARI')).toHaveLength(0);
  });

  it('参数位入参阶段性只开 inline/variable，且带排除列表', () => {
    const parameterInput = datasetParameterPickerInput(
      { kind: 'inline', value: 1 },
      [{ id: 'region', name: '区域' }],
      ['self'],
    );
    expect(parameterInput.allowedKinds).toEqual(['inline', 'variable']);
    expect(parameterInput.excludedDataSourceIds).toEqual(['self']);
    expect(parameterInput.allowedKinds).not.toContain('data-source-field');
  });

  it('valueRefEquals 按形态逐一比较', () => {
    expect(valueRefEquals(null, null)).toBe(true);
    expect(valueRefEquals({ kind: 'inline', value: 1 }, { kind: 'inline', value: 1 })).toBe(true);
    expect(valueRefEquals({ kind: 'inline', value: 1 }, { kind: 'inline', value: 2 })).toBe(false);
    expect(
      valueRefEquals({ kind: 'variable', variableId: 'a' }, { kind: 'variable', variableId: 'b' }),
    ).toBe(false);
    expect(
      valueRefEquals(
        { kind: 'data-source-field', dataSourceId: 'x', path: ['rows'] },
        { kind: 'data-source-field', dataSourceId: 'x', path: ['rows'] },
      ),
    ).toBe(true);
    expect(
      valueRefEquals(
        { kind: 'data-source-field', dataSourceId: 'x', path: ['rows'] },
        { kind: 'data-source-field', dataSourceId: 'x', path: [] },
      ),
    ).toBe(false);
  });
});

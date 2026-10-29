import { describe, expect, it } from 'vitest';
import { matchDesignerParameterIntent } from '../../../../src/common/operations/intent/designer-parameter-intent.js';

describe('numeric intent parsing', () => {
  it('reads a font size request without calling a model', () => {
    expect(matchDesignerParameterIntent('字号改成 64')).toEqual({
      property: 'style.fontSize',
      value: 64,
      label: '字号',
    });
    expect(matchDesignerParameterIntent('字体大小调到 28px')).toEqual({
      property: 'style.fontSize',
      value: 28,
      label: '字号',
    });
  });

  it('reads size requests', () => {
    expect(matchDesignerParameterIntent('宽度设为 320')).toEqual({
      property: 'size.width',
      value: 320,
      label: '宽度',
    });
    expect(matchDesignerParameterIntent('高度 180 像素')).toEqual({
      property: 'size.height',
      value: 180,
      label: '高度',
    });
  });

  it('reads a color request', () => {
    expect(matchDesignerParameterIntent('颜色改成 #FF8800')).toEqual({
      property: 'style.color',
      value: '#ff8800',
      label: '颜色',
    });
  });

  it('does not guess when the sentence has no explicit value', () => {
    expect(matchDesignerParameterIntent('把 KPI 带压成两行')).toBeNull();
    expect(matchDesignerParameterIntent('字号再大一点')).toBeNull();
    expect(matchDesignerParameterIntent('')).toBeNull();
  });
});

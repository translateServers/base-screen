import { describe, expect, it } from 'vitest';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

describe('designer fixed Chinese terminology', () => {
  it('keeps the workbench tabs and project feedback in one fixed vocabulary', () => {
    expect(DESIGNER_UI_TEXT).toMatchObject({
      materials: '物料',
      layers: '图层',
      appearance: '样式',
      data: '数据',
      interaction: '交互',
      events: '事件',
      directDocument: '未关联项目',
      reloadRemote: '重新加载远端',
    });
    expect(DESIGNER_UI_TEXT.inspectorUi).toMatchObject({
      dataSource: '数据源',
      canvasConfiguration: '页面配置',
      componentConfiguration: '组件配置',
      batchConfiguration: '批量配置',
    });
    expect(DESIGNER_UI_TEXT.leftPanelCount(DESIGNER_UI_TEXT.materials, 9)).toBe('物料：9 项');
    expect(DESIGNER_UI_TEXT.inspectorUi.componentMeta('base.chart', '图表')).toBe(
      'base.chart ｜ 图表',
    );
  });
});

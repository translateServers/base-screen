import { describe, expect, it } from 'vitest';
import { DESIGNER_UI_TEXT } from '../../../src/common/ui-text/designer-ui-text.js';

describe('designer fixed Chinese terminology', () => {
  it('keeps the workbench tabs and project feedback in one fixed vocabulary', () => {
    expect(DESIGNER_UI_TEXT).toMatchObject({
      materials: '物料',
      layers: '图层',
      appearance: '外观',
      data: '数据',
      interaction: '交互',
      events: '事件',
      directDocument: '未关联项目',
      reloadRemote: '重新加载远端',
    });
  });
});

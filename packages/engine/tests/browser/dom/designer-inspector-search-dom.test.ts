import { describe, expect, it } from 'vitest';
import { inspectorSearchTabLabel } from '../../../src/browser/dom/designer-inspector-search-dom.js';

/**
 * 面包屑的页签段是纯文本：`data` 从字符串改成对象后，若把对象直接塞进模板串，
 * 渲染出来会是 `[object Object]`——类型层完全合法，只能靠这条断言兜住。
 */
describe('检查器搜索面包屑', () => {
  it('数据页签段是纯文本而不是对象的字符串化', () => {
    const label = inspectorSearchTabLabel('data');
    expect(label).toBe('数据');
    expect(label).not.toContain('[object Object]');
  });

  it('其它页签段同样保持纯文本', () => {
    for (const tab of ['appearance', 'interaction'] as const) {
      const label = inspectorSearchTabLabel(tab);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('[object Object]');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  type DesignerIntentCapabilityComponent,
  describeIntentCapability,
} from '../../../../src/common/operations/intent/designer-intent-capability.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

const { intent } = DESIGNER_UI_TEXT;

function bound(name: string): DesignerIntentCapabilityComponent {
  return { name, bound: true };
}

function unbound(name: string): DesignerIntentCapabilityComponent {
  return { name, bound: false };
}

describe('describeIntentCapability', () => {
  it('无选区时退回整屏口径，只说引擎能改的三类', () => {
    expect(describeIntentCapability([])).toBe(intent.capability.screen);
  });

  it('单组件已接数据：带上组件名，并允诺数据绑定', () => {
    const text = describeIntentCapability([bound('GMV 卡片')]);
    expect(text).toBe(intent.capability.component('GMV 卡片'));
    expect(text).toContain('数据绑定');
  });

  it('单组件未接数据：明说数据绑定不可改，不承诺做不到的事', () => {
    const text = describeIntentCapability([unbound('分割线')]);
    expect(text).toBe(intent.capability.componentUnbound('分割线'));
    expect(text).not.toContain('数据绑定；');
  });

  it('多选全部接数据：只承诺共有属性，逐项绑定交回检查器', () => {
    const text = describeIntentCapability([bound('A'), bound('B')]);
    expect(text).toBe(intent.capability.mixed(2));
  });

  it('多选中存在未接数据的组件：提示要说出这件事', () => {
    const text = describeIntentCapability([bound('A'), unbound('B'), bound('C')]);
    expect(text).toBe(intent.capability.mixedUnbound(3));
  });

  it('任何作用域都不承诺指标口径', () => {
    const all = [
      describeIntentCapability([]),
      describeIntentCapability([bound('A')]),
      describeIntentCapability([unbound('A')]),
      describeIntentCapability([bound('A'), unbound('B')]),
    ];
    for (const text of all) expect(text).toContain('不可改');
  });
});

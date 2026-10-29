import { describe, expect, it } from 'vitest';
import {
  type DesignerIntentCapabilityComponent,
  describeIntentCapability,
} from '../../../../src/common/operations/intent/designer-intent-capability.js';
import { DESIGNER_UI_TEXT } from '../../../../src/common/ui-text/designer-ui-text.js';

const { capability } = DESIGNER_UI_TEXT.intent;

function bound(name: string): DesignerIntentCapabilityComponent {
  return { name, bound: true };
}

function unbound(name: string): DesignerIntentCapabilityComponent {
  return { name, bound: false };
}

describe('describeIntentCapability', () => {
  it('无选区时退回整屏口径', () => {
    expect(describeIntentCapability([])).toEqual({
      allows: capability.screenAllows,
      blocks: capability.screenBlocks,
    });
  });

  it('单组件已接数据：允许数据绑定', () => {
    const result = describeIntentCapability([bound('GMV 卡片')]);
    expect(result.allows).toBe(capability.componentAllows);
    expect(result.allows).toContain('数据绑定');
    expect(result.blocks).toBe(capability.componentBlocks);
  });

  it('单组件未接数据：数据绑定进「不可改」，不承诺做不到的事', () => {
    const result = describeIntentCapability([unbound('分割线')]);
    expect(result.allows).toBe(capability.componentUnboundAllows);
    expect(result.allows).not.toContain('数据绑定');
    expect(result.blocks).toBe(capability.componentUnboundBlocks);
  });

  it('多选全部接数据：只承诺共有属性', () => {
    expect(describeIntentCapability([bound('A'), bound('B')])).toEqual({
      allows: capability.mixedAllows,
      blocks: capability.mixedBlocks,
    });
  });

  it('多选含未接数据的组件：不可改那栏要说出来', () => {
    const result = describeIntentCapability([bound('A'), unbound('B'), bound('C')]);
    expect(result.blocks).toBe(capability.mixedUnboundBlocks);
  });

  it('任何作用域的「不可改」都包含指标口径——它不在引擎可见范围内', () => {
    const all = [
      describeIntentCapability([]),
      describeIntentCapability([bound('A')]),
      describeIntentCapability([unbound('A')]),
      describeIntentCapability([bound('A'), unbound('B')]),
    ];
    for (const result of all) expect(result.blocks).toContain('指标口径');
  });

  it('「可改」与「不可改」不重叠：同一项不会同时出现在两栏', () => {
    const result = describeIntentCapability([bound('A')]);
    expect(result.allows).not.toBe(result.blocks);
    expect(result.blocks).not.toContain('样式');
  });
});

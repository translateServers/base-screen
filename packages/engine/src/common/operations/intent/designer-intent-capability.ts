import { DESIGNER_UI_TEXT } from '../../ui-text/designer-ui-text.js';

/**
 * 作用域内单个组件的能力事实。
 *
 * 只放引擎自己能判断的：有没有接数据。物料语义词（地图的「底图 / 图层 / 标注」之类）
 * 不进这里——引擎无从判断某条自然语言请求落在哪个属性上，写进提示就是承诺兑现不了的事。
 */
export interface DesignerIntentCapabilityComponent {
  readonly name: string;
  readonly bound: boolean;
}

/**
 * 能力边界拆成「能改什么 / 不能改什么」两栏。
 *
 * 合成一句话（「可改：A / B；不可改：C」）读起来像免责声明：用户扫过去只记住「有限制」，
 * 记不住到底能改什么。分栏之后，「不可改」那一栏才能被单独强调——尤其指标口径，它不在
 * 引擎可见范围内，任何作用域都不该被读成可以改。
 *
 * 任何作用域都只承诺引擎确实能改的三类：样式、布局、数据绑定；多选只承诺共有属性。
 */
export interface DesignerIntentCapability {
  readonly allows: string;
  readonly blocks: string;
}

export function describeIntentCapability(
  components: readonly DesignerIntentCapabilityComponent[],
): DesignerIntentCapability {
  const text = DESIGNER_UI_TEXT.intent.capability;
  if (components.length === 0) return { allows: text.screenAllows, blocks: text.screenBlocks };
  if (components.length === 1) {
    const only = components[0];
    if (only === undefined) return { allows: text.screenAllows, blocks: text.screenBlocks };
    return only.bound
      ? { allows: text.componentAllows, blocks: text.componentBlocks }
      : { allows: text.componentUnboundAllows, blocks: text.componentUnboundBlocks };
  }
  const unbound = components.some((component) => !component.bound);
  return unbound
    ? { allows: text.mixedAllows, blocks: text.mixedUnboundBlocks }
    : { allows: text.mixedAllows, blocks: text.mixedBlocks };
}

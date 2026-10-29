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
 * 能力提示随作用域变化。
 *
 * 任何作用域都只承诺引擎确实能改的三类：样式、布局、数据绑定。指标口径不在引擎可见
 * 范围内（归平台治理），因此无论选中什么都明说「不可改」。多选只承诺共有属性，逐项
 * 绑定交回检查器——一次意图请求不该被读成「批量改绑定」。
 */
export function describeIntentCapability(
  components: readonly DesignerIntentCapabilityComponent[],
): string {
  const text = DESIGNER_UI_TEXT.intent.capability;
  if (components.length === 0) return text.screen;
  if (components.length === 1) {
    const only = components[0];
    if (only === undefined) return text.screen;
    return only.bound ? text.component(only.name) : text.componentUnbound(only.name);
  }
  const unbound = components.some((component) => !component.bound);
  return unbound ? text.mixedUnbound(components.length) : text.mixed(components.length);
}

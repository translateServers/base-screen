import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS,
  BASE_SCREEN_REGISTERED_STYLE_KEYS,
  BASE_SCREEN_STYLE_KEY_DICTIONARY,
} from '../../packages/plugin-sdk/src/index';
import {
  FORBIDDEN_TEXT_PROPS,
  REGISTERED_STYLE_KEYS,
  STYLE_KEY_DICTIONARY,
  // @ts-expect-error -- 工具脚本为 .mjs，无类型声明；测试只消费它的导出。
} from '../../tooling/checks/material-atomicity.mjs';

/**
 * 样式键词典与描述性文案键有两份：源码门禁（评审落点）与 plugin-sdk（在线作者面体检，ADR-0105）。
 * 两份必须逐项相等，否则同一个物料在仓库里与在组件工坊里得到不同的结论。
 */
describe('material style keys stay in sync between the gate and the SDK', () => {
  it('shares the dictionary, the registered keys and the descriptive text keys', () => {
    expect([...BASE_SCREEN_STYLE_KEY_DICTIONARY].sort()).toEqual([...STYLE_KEY_DICTIONARY].sort());
    expect([...BASE_SCREEN_REGISTERED_STYLE_KEYS].sort()).toEqual(
      [...REGISTERED_STYLE_KEYS].sort(),
    );
    expect([...BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS].sort()).toEqual([...FORBIDDEN_TEXT_PROPS].sort());
  });
});

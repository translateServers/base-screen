import type { ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenFragmentDefinition,
  type BaseScreenPluginFragmentContribution,
  parseBaseScreenFragmentDefinition,
} from '@base-screen/plugin-core';

/**
 * 声明一个组合分片贡献（ADR-0100），放进插件清单的 `contributions`。
 *
 * 分片只组合已有物料、不新增渲染逻辑：标题、说明一律用 `base.text` 节点，卡片底板由外壳承担
 * （ADR-0100 F1–F3）。这里只做形状与元数据的失败关闭校验；引用的物料是否在 catalog 里、
 * `props`/`style` 是否满足各自 schema，由 Engine 在物料库展开时检查。
 */
export function defineBaseScreenFragment(
  definition: BaseScreenFragmentDefinition,
): ScreenParseResult<BaseScreenPluginFragmentContribution> {
  const parsed = parseBaseScreenFragmentDefinition(definition);
  if (!parsed.ok) return parsed;
  const contribution: BaseScreenPluginFragmentContribution = { kind: 'fragment', ...parsed.value };
  return { ok: true, value: Object.freeze(contribution), diagnostics: [] };
}

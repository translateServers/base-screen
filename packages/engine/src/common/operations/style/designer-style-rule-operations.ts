import type {
  ScreenComponentStyleRule,
  ScreenComponentStyleRuleOperator,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  MAX_STYLE_RULE_ID_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENTS,
  MAX_STYLE_RULES_PER_COMPONENT,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { validateBaseScreenMaterialStyle } from '@base-screen/plugin-core';

export const STYLE_RULE_OPERATORS: readonly ScreenComponentStyleRuleOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
];

/** 新规则草稿的默认形态：以数据本身为条件源、大于 0 时生效、不覆盖任何样式键。 */
export function createStyleRuleDraft(rules: readonly ScreenComponentStyleRule[]): {
  readonly id: string;
  readonly when: { readonly path: readonly string[]; readonly operator: 'gt'; readonly value: 0 };
  readonly style: Record<string, never>;
} {
  return { id: nextStyleRuleId(rules), when: { path: [], operator: 'gt', value: 0 }, style: {} };
}

function nextStyleRuleId(rules: readonly ScreenComponentStyleRule[]): string {
  const used = new Set(rules.map((rule) => rule.id));
  for (let index = 1; index <= MAX_STYLE_RULES_PER_COMPONENT; index++) {
    const candidate = `rule-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `rule-${rules.length + 1}`;
}

/**
 * 条件样式提交事务（ADR-0058）：对整份 rules 数组做结构性与逐规则 styleSchema 校验
 * （与 Renderer 同一合并假设：基础 style + 规则 style），合法才生成
 * `update-components`（patch styleRules 整体替换），恰一条历史记录。
 * 结构性非法（超限、重复 id、值缺失等）返回 undefined，由调用方按无效草稿处理。
 */
export function createStyleRulesTransaction(
  document: ScreenDocument,
  componentId: string,
  rules: readonly ScreenComponentStyleRule[],
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  const component = document.components.find((item) => item.id === componentId);
  const manifest = component === undefined ? undefined : catalog?.get(component.type)?.manifest;
  if (component === undefined || manifest === undefined) return undefined;
  if (rules.length > MAX_STYLE_RULES_PER_COMPONENT) return undefined;
  const seenIds = new Set<string>();
  for (const rule of rules) {
    if (
      !isValidRuleId(rule.id) ||
      seenIds.has(rule.id) ||
      !STYLE_RULE_OPERATORS.includes(rule.when.operator) ||
      !isValidRulePath(rule.when.path) ||
      (rule.when.operator === 'exists'
        ? rule.when.value !== undefined
        : rule.when.value === undefined)
    ) {
      return undefined;
    }
    seenIds.add(rule.id);
    const merged = validateBaseScreenMaterialStyle(
      { ...component.style, ...rule.style },
      manifest.styleSchema,
    );
    if (!merged.ok) return { ok: false, diagnostics: merged.diagnostics };
  }
  return {
    ok: true,
    value: {
      commands: [
        {
          type: 'update-components',
          componentIds: [componentId],
          patch: { styleRules: rules },
        },
      ],
    },
    diagnostics: [],
  };
}

function isValidRuleId(id: string): boolean {
  const length = [...id].length;
  return length >= 1 && length <= MAX_STYLE_RULE_ID_CODE_POINTS;
}

function isValidRulePath(path: readonly string[]): boolean {
  return (
    path.length <= MAX_STYLE_RULE_PATH_SEGMENTS &&
    path.every((segment) => {
      const length = [...segment].length;
      return length >= 1 && length <= MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS;
    })
  );
}

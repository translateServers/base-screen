import {
  MAX_STYLE_RULE_ID_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
  MAX_STYLE_RULE_PATH_SEGMENTS,
  MAX_STYLE_RULES_PER_COMPONENT,
  type ScreenComponentStyleRule,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';

export const DESIGNER_STYLE_RULE_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'exists',
] as const;

export type DesignerStyleRuleOperator = (typeof DESIGNER_STYLE_RULE_OPERATORS)[number];

/** 条件样式只能覆盖物料 styleSchema 里的颜色字段（首期范围，color/fillColor/...）。 */
export function designerStyleRuleColorKeys(
  catalog: BaseScreenMaterialCatalog | undefined,
  materialType: string,
): readonly string[] {
  const manifest = catalog?.get(materialType)?.manifest;
  if (manifest === undefined) return [];
  const keys = new Set<string>();
  for (const field of manifest.stylePanel ?? []) {
    if (field.control !== 'color') continue;
    if (manifest.styleSchema.properties[field.style]?.kind === 'string') {
      keys.add(field.style);
    }
  }
  // 条件着色最常见的目标是文字色：默认键优先 `color`，其余按 stylePanel 声明顺序。
  return [...keys].sort((left, right) => (left === 'color' ? -1 : right === 'color' ? 1 : 0));
}

export function parseDesignerStyleRulePath(input: string): readonly string[] | null {
  const trimmed = input.trim();
  if (trimmed === '') return [];
  const segments = trimmed.split('.').map((segment) => segment.trim());
  if (segments.length > MAX_STYLE_RULE_PATH_SEGMENTS) return null;
  for (const segment of segments) {
    if (segment === '' || [...segment].length > MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS) {
      return null;
    }
  }
  return segments;
}

export interface DesignerStyleRuleMessages {
  readonly invalid: string;
  readonly limit: (limit: number) => string;
}

const DEFAULT_MESSAGES: DesignerStyleRuleMessages = {
  invalid: 'Conditional style rule is invalid.',
  limit: (limit) => `At most ${limit} conditional style rules are allowed.`,
};

/** 比较值：先按 JSON 解析（数字/布尔/null/对象），失败则当字符串。 */
export function parseDesignerStyleRuleValue(input: string): ScreenJsonValue {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed) as ScreenJsonValue;
  } catch {
    return input;
  }
}

export function formatDesignerStyleRuleValue(value: ScreenJsonValue | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function nextDesignerStyleRuleId(rules: readonly ScreenComponentStyleRule[]): string {
  let index = 1;
  const taken = new Set(rules.map((rule) => rule.id));
  while (taken.has(`style-rule-${index}`)) index += 1;
  return `style-rule-${index}`.slice(0, MAX_STYLE_RULE_ID_CODE_POINTS);
}

export function moveDesignerStyleRule(
  rules: readonly ScreenComponentStyleRule[],
  ruleId: string,
  offset: -1 | 1,
): readonly ScreenComponentStyleRule[] | null {
  const index = rules.findIndex((rule) => rule.id === ruleId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= rules.length) return null;
  const next = [...rules];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * 条件样式整体替换事务。
 *
 * 规则数组必须保持 canonical 形状；合并后的完整 style 会过一次物料的 styleSchema，
 * 避免写进一个物料根本不认识的样式键（规则在渲染期才失败会表现为"改了没反应"）。
 */
export function createDesignerStyleRulesTransaction(
  document: ScreenDocument,
  componentId: string,
  rules: readonly ScreenComponentStyleRule[],
  catalog: BaseScreenMaterialCatalog | undefined,
  messages: DesignerStyleRuleMessages = DEFAULT_MESSAGES,
): ScreenParseResult<ScreenDocumentTransaction> {
  const component = document.components.find((candidate) => candidate.id === componentId);
  if (component === undefined) return failure(messages.invalid, ['components']);
  if (rules.length > MAX_STYLE_RULES_PER_COMPONENT) {
    return failure(messages.limit(MAX_STYLE_RULES_PER_COMPONENT), ['styleRules']);
  }
  const manifest = catalog?.get(component.type)?.manifest;
  if (manifest === undefined) {
    return failure(messages.invalid, ['styleRules']);
  }
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    if (
      rule.id === '' ||
      [...rule.id].length > MAX_STYLE_RULE_ID_CODE_POINTS ||
      seen.has(rule.id)
    ) {
      return failure(messages.invalid, ['styleRules', index, 'id']);
    }
    seen.add(rule.id);
    if (
      rule.when.path.length > MAX_STYLE_RULE_PATH_SEGMENTS ||
      rule.when.path.some(
        (segment) =>
          segment === '' || [...segment].length > MAX_STYLE_RULE_PATH_SEGMENT_CODE_POINTS,
      )
    ) {
      return failure(messages.invalid, ['styleRules', index, 'when']);
    }
    if (rule.when.operator === 'exists' && rule.when.value !== undefined) {
      return failure(messages.invalid, ['styleRules', index, 'when']);
    }
    if (rule.when.operator !== 'exists' && rule.when.value === undefined) {
      return failure(messages.invalid, ['styleRules', index, 'when']);
    }
    const keys = Object.keys(rule.style);
    if (keys.length === 0) {
      return failure(messages.invalid, ['styleRules', index, 'style']);
    }
    for (const key of keys) {
      if (manifest.styleSchema.properties[key]?.kind !== 'string') {
        return failure(messages.invalid, ['styleRules', index, 'style', key]);
      }
    }
    const validated = validateBaseScreenMaterialStyle(
      { ...component.style, ...rule.style },
      manifest.styleSchema,
    );
    if (!validated.ok) return validated;
  }
  return success({
    commands: [
      {
        type: 'update-components',
        componentIds: [componentId],
        patch: { styleRules: rules.map(cloneStyleRule) },
      },
    ],
  });
}

function cloneStyleRule(rule: ScreenComponentStyleRule): ScreenComponentStyleRule {
  return {
    id: rule.id,
    when: {
      path: [...rule.when.path],
      operator: rule.when.operator,
      ...(rule.when.value === undefined ? {} : { value: rule.when.value }),
    },
    style: { ...rule.style },
  };
}

function success<T>(value: T): ScreenParseResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(
  message: string,
  path: readonly (string | number)[] = [],
): ScreenParseResult<T> {
  const diagnostic: ScreenDiagnostic = {
    severity: 'error',
    code: 'CORE_COMMAND_INVALID',
    path,
    message,
  };
  return { ok: false, diagnostics: [diagnostic] };
}

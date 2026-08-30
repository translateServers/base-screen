import type {
  ScreenComponentStyleRule,
  ScreenComponentStyleRuleOperator,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction, ScreenInteractionState } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { getDesignerInspectorContext } from '../../../common/operations/designer-inspector.js';
import {
  createStyleRuleDraft,
  createStyleRulesTransaction,
  STYLE_RULE_OPERATORS,
} from '../../../common/operations/designer-style-rule-operations.js';
import { parseJsonDraft } from './designer-data-source-model.js';
import { isControl } from './designer-panel-transaction-utils.js';
import { parsePropertyControlValue } from './designer-property-transactions.js';

export function createStyleRuleEditTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (!isControl(target) || document === undefined) return undefined;
  const dataset = target.dataset;
  const pathMarker = dataset.styleRulePath;
  const operatorMarker = dataset.styleRuleOperator;
  const valueMarker = dataset.styleRuleValue;
  const styleMarker = dataset.styleRuleStyle;
  if (
    pathMarker === undefined &&
    operatorMarker === undefined &&
    valueMarker === undefined &&
    styleMarker === undefined
  ) {
    return undefined;
  }
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material' || context.manifest === undefined) return undefined;
  const component = context.component;
  const rules = component.styleRules ?? [];
  const replaceAt = (
    index: number,
    next: ScreenComponentStyleRule,
  ): ScreenParseResult<ScreenDocumentTransaction> | undefined =>
    createStyleRulesTransaction(
      document,
      component.id,
      rules.map((rule, position) => (position === index ? next : rule)),
      catalog,
    );

  if (pathMarker !== undefined) {
    const index = Number(pathMarker);
    const rule = rules[index];
    if (rule === undefined) return undefined;
    const path =
      target.value.trim() === '' ? [] : target.value.split('.').map((segment) => segment.trim());
    if (path.some((segment) => segment === '')) return undefined;
    return replaceAt(index, { ...rule, when: { ...rule.when, path } });
  }
  if (operatorMarker !== undefined) {
    const index = Number(operatorMarker);
    const rule = rules[index];
    const operator = target.value as ScreenComponentStyleRuleOperator;
    if (rule === undefined || !STYLE_RULE_OPERATORS.includes(operator)) return undefined;
    const when =
      operator === 'exists'
        ? { path: rule.when.path, operator }
        : {
            path: rule.when.path,
            operator,
            ...(rule.when.value === undefined ? {} : { value: rule.when.value }),
          };
    return replaceAt(index, { ...rule, when });
  }
  if (valueMarker !== undefined) {
    const index = Number(valueMarker);
    const rule = rules[index];
    if (rule === undefined) return undefined;
    const parsed = parseJsonDraft(target.value);
    if (parsed === undefined) return undefined;
    return replaceAt(index, { ...rule, when: { ...rule.when, value: parsed } });
  }
  if (styleMarker === undefined) return undefined;
  const separator = styleMarker.indexOf(':');
  const index = Number(styleMarker.slice(0, separator));
  const key = styleMarker.slice(separator + 1);
  const rule = rules[index];
  const schema = context.manifest.styleSchema.properties[key];
  if (
    rule === undefined ||
    schema === undefined ||
    !context.manifest.stylePanel.some((field) => field.style === key)
  ) {
    return undefined;
  }
  const parsed = parsePropertyControlValue(target, schema);
  if (parsed === undefined) return undefined;
  return replaceAt(index, { ...rule, style: { ...rule.style, [key]: parsed } });
}

/**
 * 条件样式添加/删除按钮事务（ADR-0058）：追加默认草稿或按索引移除，
 * 同样整份数组校验后恰一条事务提交。
 */
export function createStyleRuleClickTransaction(
  target: EventTarget | null,
  document: ScreenDocument | undefined,
  interaction: ScreenInteractionState,
  catalog: BaseScreenMaterialCatalog | undefined,
): ScreenParseResult<ScreenDocumentTransaction> | undefined {
  if (document === undefined) return undefined;
  const dataset = (target as { readonly dataset?: DOMStringMap } | null)?.dataset;
  if (dataset === undefined) return undefined;
  const add = dataset.styleRuleAdd;
  const remove = dataset.styleRuleRemove;
  if (add === undefined && remove === undefined) return undefined;
  const context = getDesignerInspectorContext(document, interaction, catalog);
  if (context.kind !== 'single-material') return undefined;
  const component = context.component;
  const rules = component.styleRules ?? [];
  const next =
    add !== undefined
      ? [...rules, createStyleRuleDraft(rules)]
      : rules.filter((_, position) => position !== Number(remove));
  return createStyleRulesTransaction(document, component.id, next, catalog);
}

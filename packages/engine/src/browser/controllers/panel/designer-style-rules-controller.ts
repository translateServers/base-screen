import type {
  ScreenComponentStyleRule,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import { MAX_STYLE_RULES_PER_COMPONENT } from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import {
  createDesignerStyleRulesTransaction,
  designerStyleRuleColorKeys,
  moveDesignerStyleRule,
  nextDesignerStyleRuleId,
  parseDesignerStyleRulePath,
  parseDesignerStyleRuleValue,
} from '../../../common/operations/style/designer-style-rules.js';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';

export interface DesignerStyleRulesCallbacks {
  readonly getDocument: () => ScreenDocument | undefined;
  readonly getCatalog: () => BaseScreenMaterialCatalog | undefined;
  readonly executeTransaction: (
    transaction: ScreenDocumentTransaction,
  ) => ScreenParseResult<ScreenDocument>;
  readonly emitDiagnostics: (diagnostics: readonly ScreenDiagnostic[]) => void;
}

interface StyleRuleTarget {
  readonly component: ScreenDocument['components'][number];
  readonly rules: readonly ScreenComponentStyleRule[];
  readonly ruleId: string | undefined;
}

export function handleDesignerStyleRuleClick(
  target: Element,
  callbacks: DesignerStyleRulesCallbacks,
): boolean {
  const action = target.closest<HTMLElement>('[data-style-rule-action]')?.dataset.styleRuleAction;
  if (action !== 'add' && action !== 'remove' && action !== 'up' && action !== 'down') {
    return false;
  }
  const scoped = resolveStyleRuleTarget(target, callbacks);
  if (scoped === null) return true;
  const { component, rules, ruleId } = scoped;
  if (action === 'add') {
    if (rules.length >= MAX_STYLE_RULES_PER_COMPONENT) {
      callbacks.emitDiagnostics([
        styleRuleDiagnostic(
          DESIGNER_UI_TEXT.propertiesPanel.styleRuleLimit(MAX_STYLE_RULES_PER_COMPONENT),
        ),
      ]);
      return true;
    }
    const colorKeys = designerStyleRuleColorKeys(callbacks.getCatalog(), component.type);
    const colorKey = colorKeys[0];
    if (colorKey === undefined) return true;
    const fallback = component.style[colorKey];
    commit(callbacks, component.id, [
      ...rules,
      {
        id: nextDesignerStyleRuleId(rules),
        when: { path: [], operator: 'exists' },
        style: { [colorKey]: typeof fallback === 'string' ? fallback : '#ffffff' },
      },
    ]);
    return true;
  }
  if (ruleId === undefined) return true;
  if (action === 'remove') {
    commit(
      callbacks,
      component.id,
      rules.filter((rule) => rule.id !== ruleId),
    );
    return true;
  }
  const moved = moveDesignerStyleRule(rules, ruleId, action === 'up' ? -1 : 1);
  if (moved !== null) commit(callbacks, component.id, moved);
  return true;
}

export function handleDesignerStyleRuleChange(
  target: Element,
  callbacks: DesignerStyleRulesCallbacks,
): boolean {
  if (typeof (target as { readonly closest?: unknown }).closest !== 'function') return false;
  const control = target.closest<HTMLElement>(
    '[data-style-rule-path], [data-style-rule-operator], [data-style-rule-value], [data-style-rule-style-key], [data-style-rule-color]',
  );
  if (control === null) return false;
  const scoped = resolveStyleRuleTarget(target, callbacks);
  if (scoped === null || scoped.ruleId === undefined) return true;
  const { component, rules, ruleId } = scoped;
  const rule = rules.find((candidate) => candidate.id === ruleId);
  if (rule === undefined) return true;
  const row = control.closest<HTMLElement>('[data-style-rule-id]');
  if (row === null) return true;
  let next: ScreenComponentStyleRule = rule;
  if (control.dataset.styleRulePath !== undefined) {
    const path = parseDesignerStyleRulePath((control as HTMLInputElement).value);
    if (path === null) {
      callbacks.emitDiagnostics([
        styleRuleDiagnostic(DESIGNER_UI_TEXT.propertiesPanel.styleRuleInvalid),
      ]);
      return true;
    }
    next = { ...rule, when: { ...rule.when, path } };
  } else if (control.dataset.styleRuleOperator !== undefined) {
    const operator = (control as HTMLSelectElement)
      .value as ScreenComponentStyleRule['when']['operator'];
    const valueInput = row.querySelector<HTMLInputElement>('[data-style-rule-value]');
    if (operator === 'exists') {
      next = { ...rule, when: { path: [...rule.when.path], operator } };
    } else {
      // 先落一个合法值（空串也可表达"匹配空值"），比较值编辑器随后才启用；
      // 若在这里等非空值，用户无法从 exists 切到 eq（输入框在 exists 下是禁用的）。
      next = {
        ...rule,
        when: {
          path: [...rule.when.path],
          operator,
          value: parseDesignerStyleRuleValue(valueInput?.value ?? ''),
        },
      };
    }
  } else if (control.dataset.styleRuleValue !== undefined) {
    if (rule.when.operator === 'exists') return true;
    next = {
      ...rule,
      when: {
        ...rule.when,
        value: parseDesignerStyleRuleValue((control as HTMLInputElement).value),
      },
    };
  } else {
    const colorKeys = designerStyleRuleColorKeys(callbacks.getCatalog(), component.type);
    const activeKey = colorKeyOf(rule, colorKeys);
    if (activeKey === undefined) return true;
    if (control.dataset.styleRuleStyleKey !== undefined) {
      const key = (control as HTMLSelectElement).value;
      if (key === activeKey) return true;
      const current = rule.style[activeKey];
      if (current === undefined) return true;
      const style = { ...rule.style };
      delete style[activeKey];
      style[key] = current;
      next = { ...rule, style };
    } else {
      const color = (control as HTMLInputElement).value;
      if (color === '') return true;
      next = { ...rule, style: { ...rule.style, [activeKey]: color } };
    }
  }
  const updated = rules.map((candidate) => (candidate.id === ruleId ? next : candidate));
  commit(callbacks, component.id, updated);
  return true;
}

function resolveStyleRuleTarget(
  target: Element,
  callbacks: DesignerStyleRulesCallbacks,
): StyleRuleTarget | null {
  const scope = target.closest<HTMLElement>('[data-style-rule-component]');
  const componentId = scope?.dataset.styleRuleComponent;
  const document = callbacks.getDocument();
  if (componentId === undefined || document === undefined) return null;
  const component = document.components.find((candidate) => candidate.id === componentId);
  if (component === undefined) return null;
  const ruleId = target.closest<HTMLElement>('[data-style-rule-id]')?.dataset.styleRuleId;
  return { component, rules: component.styleRules ?? [], ruleId };
}

function colorKeyOf(
  rule: ScreenComponentStyleRule,
  colorKeys: readonly string[],
): string | undefined {
  return Object.keys(rule.style).find((key) => colorKeys.includes(key)) ?? colorKeys[0];
}

function commit(
  callbacks: DesignerStyleRulesCallbacks,
  componentId: string,
  rules: readonly ScreenComponentStyleRule[],
): void {
  const document = callbacks.getDocument();
  if (document === undefined) return;
  const transaction = createDesignerStyleRulesTransaction(
    document,
    componentId,
    rules,
    callbacks.getCatalog(),
    {
      invalid: DESIGNER_UI_TEXT.propertiesPanel.styleRuleInvalid,
      limit: DESIGNER_UI_TEXT.propertiesPanel.styleRuleLimit,
    },
  );
  if (!transaction.ok) {
    callbacks.emitDiagnostics(transaction.diagnostics);
    return;
  }
  const result = callbacks.executeTransaction(transaction.value);
  if (!result.ok) callbacks.emitDiagnostics(result.diagnostics);
}

function styleRuleDiagnostic(message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'CORE_COMMAND_INVALID',
    path: ['styleRules'],
    message,
  };
}

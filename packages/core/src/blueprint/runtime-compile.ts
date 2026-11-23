import {
  deriveScreenBlueprintRules,
  readScreenVariableRecord,
  SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY,
  type ScreenBlueprintAction,
  type ScreenBlueprintRuleStep,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenParseResult,
  screenBlueprintRuleActions,
} from '@base-screen/contracts';
import { cloneCondition, cloneExpression, cloneValue, failure } from './runtime-json.js';
import type { ScreenBlueprintCapabilityIndex, ScreenBlueprintPlan } from './runtime-types.js';

// 能力 id 的唯一来源在 contracts；此处保留同名再导出以维持 core 的公共 API 形状。
export { SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY };

/**
 * 把节点图编译成运行时计划（ADR-0107 §2.3）：规则由 contracts 的 `deriveScreenBlueprintRules`
 * 从图派生（深度优先步骤树），这里只做能力门禁与深拷贝，未授权能力失败关闭。
 */
export function compileScreenBlueprint(
  document: ScreenDocument,
  capabilities: ScreenBlueprintCapabilityIndex = { hasBlueprintCapability: () => true },
): ScreenParseResult<ScreenBlueprintPlan> {
  const rules = deriveScreenBlueprintRules(document.blueprint);
  for (const rule of rules) {
    for (const capability of rule.requiredCapabilities ?? []) {
      if (!capabilities.hasBlueprintCapability(capability)) {
        return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', 'Blueprint capability is unavailable.');
      }
    }
    if (
      screenBlueprintRuleActions(rule).some((action) => action.type === 'component-visibility') &&
      !capabilities.hasBlueprintCapability(SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY)
    ) {
      return failure('BLUEPRINT_CAPABILITY_UNAVAILABLE', 'Blueprint capability is unavailable.');
    }
  }
  const initialVariables: Record<string, ScreenJsonValue> = {};
  for (const variable of document.variables) {
    const record = readScreenVariableRecord(variable);
    // 值取自数据源输出且受控的变量：运行时的初值以宿主响应为准，这里给 `null` 占位。
    initialVariables[record.id] = cloneValue(
      record.controlled && record.value.kind === 'data-source-field' ? null : record.initialValue,
    );
  }
  return {
    ok: true,
    value: {
      rules: rules.map((rule) => ({
        ...rule,
        trigger: { ...rule.trigger },
        ...(rule.requiredCapabilities === undefined
          ? {}
          : { requiredCapabilities: [...rule.requiredCapabilities] }),
        steps: cloneSteps(rule.steps),
      })),
      initialVariables,
    },
    diagnostics: [],
  };
}

function cloneSteps(steps: readonly ScreenBlueprintRuleStep[]): ScreenBlueprintRuleStep[] {
  return steps.map((step) =>
    step.type === 'action'
      ? { type: 'action', edgeId: step.edgeId, action: cloneAction(step.action) }
      : {
          type: 'condition',
          edgeId: step.edgeId,
          nodeId: step.nodeId,
          condition: cloneCondition(step.condition),
          yes: cloneSteps(step.yes),
          no: cloneSteps(step.no),
        },
  );
}

function cloneAction(action: ScreenBlueprintAction): ScreenBlueprintAction {
  switch (action.type) {
    case 'component-visibility':
      return {
        ...action,
        ...(action.transition === undefined ? {} : { transition: { ...action.transition } }),
      };
    case 'request-variable':
    case 'request-component-data':
    case 'page-navigation':
      return { ...action };
    case 'canvas-visibility':
      return action.payload === undefined
        ? { ...action }
        : { ...action, payload: cloneExpression(action.payload) };
    case 'set-variable':
      return { ...action, value: cloneExpression(action.value) };
    case 'emit-host-event':
    case 'host-action':
      return { ...action, payload: cloneExpression(action.payload) };
  }
}

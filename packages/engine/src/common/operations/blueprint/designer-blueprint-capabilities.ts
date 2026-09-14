import {
  SCREEN_BLUEPRINT_CAPABILITIES,
  type ScreenBlueprintRule,
  type ScreenBlueprintValueExpression,
} from '@base-screen/contracts';
import type { BaseScreenRuntimeContributionIndex } from '@base-screen/plugin-core';

export function normalizeDesignerBlueprintRuleCapabilities(
  rule: ScreenBlueprintRule,
): ScreenBlueprintRule {
  const capabilities = new Set<string>([
    rule.trigger.type === 'material-event'
      ? SCREEN_BLUEPRINT_CAPABILITIES.materialEvent
      : SCREEN_BLUEPRINT_CAPABILITIES.variableEvent,
  ]);
  if (rule.condition !== undefined) {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.condition);
    collectExpressionCapabilities(rule.condition.left, capabilities);
    if (rule.condition.right !== undefined) {
      collectExpressionCapabilities(rule.condition.right, capabilities);
    }
  }
  for (const action of rule.actions) {
    if (action.type === 'set-variable') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.setVariable);
      collectExpressionCapabilities(action.value, capabilities);
    } else if (action.type === 'emit-host-event') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.emitHostEvent);
      collectExpressionCapabilities(action.payload, capabilities);
    } else if (action.type === 'component-visibility') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.componentVisibility);
    } else if (action.type === 'host-action') {
      collectExpressionCapabilities(action.payload, capabilities);
    } else if (action.type === 'request-variable') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestVariable);
    } else if (action.type === 'request-component-data') {
      capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.requestComponentData);
    }
  }
  for (const capability of rule.requiredCapabilities ?? []) capabilities.add(capability);
  return { ...rule, requiredCapabilities: [...capabilities] };
}

export function hasDesignerBlueprintCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  capability: string,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(capability) === true;
  } catch {
    return false;
  }
}

/** 作者面用的宿主动作选项：由插件声明（ADR-0076），Engine 只做词表与可用性投影。 */
export interface DesignerBlueprintHostActionOption {
  readonly actionId: string;
  readonly name: string;
  readonly available: boolean;
}

/**
 * 枚举当前生效的插件宿主动作，供作者面生成动作选择器。
 *
 * 与 `dataResourceType` 的 `listResourceTypes` 同构：索引未实现枚举（宿主自建最小索引）时
 * 返回空数组，调用方据此退回自由文本输入，保持兼容。索引抛错同样降级为空表而不是崩掉
 * 作者面——诊断路径不应因插件索引异常而失效。
 */
export function listDesignerBlueprintHostActions(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
): readonly DesignerBlueprintHostActionOption[] {
  try {
    return (
      runtimeContributions?.listBlueprintActions?.().map((contribution) => ({
        actionId: contribution.id,
        name: contribution.name,
        available: true,
      })) ?? []
    );
  } catch {
    return [];
  }
}

/**
 * 解析一个 `host-action.actionId` 是否已被插件声明。
 *
 * 未声明即不可用：作者面据此渲染降级提示，避免作者配了一个永远执行不了的动作却看不出来。
 * 执行侧的门禁在 manager（未声明动作失败关闭），这里只是把同一事实透到作者面。
 */
export function isDesignerBlueprintHostActionDeclared(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  actionId: string,
): boolean {
  try {
    return runtimeContributions?.getBlueprintAction?.(actionId) !== undefined;
  } catch {
    return false;
  }
}

function collectExpressionCapabilities(
  expression: ScreenBlueprintValueExpression,
  capabilities: Set<string>,
): void {
  if (expression.kind === 'event-payload') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.eventPayload);
  } else if (expression.kind === 'variable') {
    capabilities.add(SCREEN_BLUEPRINT_CAPABILITIES.variable);
  } else if (expression.kind === 'array') {
    for (const item of expression.items) collectExpressionCapabilities(item, capabilities);
  } else if (expression.kind === 'object') {
    for (const item of Object.values(expression.properties)) {
      collectExpressionCapabilities(item, capabilities);
    }
  }
}

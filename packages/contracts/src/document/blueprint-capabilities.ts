/**
 * 蓝图能力词汇的唯一来源。能力 id 会写进 canonical 文档的 `requiredCapabilities`，
 * 同时被 plugin-manager 的授权判定表与 engine 的规则归一化消费；两处各自硬编码会
 * 在漂移时静默失效（规则声明了能力却授权不到），因此只在此处声明一次。
 *
 * `requiredCapabilities` 在 JSON Schema 中仍是自由字符串（新能力需先加入此表才能被
 * 宿主授权），这里的字面量联合是插件契约侧的收敛，不是文档校验的收窄。
 */
export const SCREEN_BLUEPRINT_CAPABILITY_IDS = [
  'blueprint.trigger.material-event',
  'blueprint.trigger.variable-event',
  'blueprint.value.event-payload',
  'blueprint.value.variable',
  'blueprint.condition.compare',
  'blueprint.action.set-variable',
  'blueprint.action.emit-host-event',
  'blueprint.action.component-visibility',
  'blueprint.action.request-variable',
  'blueprint.action.request-component-data',
] as const;

export type ScreenBlueprintCapabilityId = (typeof SCREEN_BLUEPRINT_CAPABILITY_IDS)[number];

/** 语义键 → 能力 id，供按语义取用的消费方（规则归一化等）使用。 */
export const SCREEN_BLUEPRINT_CAPABILITIES = {
  materialEvent: 'blueprint.trigger.material-event',
  variableEvent: 'blueprint.trigger.variable-event',
  eventPayload: 'blueprint.value.event-payload',
  variable: 'blueprint.value.variable',
  condition: 'blueprint.condition.compare',
  setVariable: 'blueprint.action.set-variable',
  emitHostEvent: 'blueprint.action.emit-host-event',
  componentVisibility: 'blueprint.action.component-visibility',
  requestVariable: 'blueprint.action.request-variable',
  requestComponentData: 'blueprint.action.request-component-data',
} as const satisfies Record<string, ScreenBlueprintCapabilityId>;

export const SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY = 'blueprint.trigger.material-event';
export const SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY =
  'blueprint.action.component-visibility';

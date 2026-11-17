import type { ScreenDocument } from '@base-screen/contracts';

export interface DesignerBlueprintNodePosition {
  readonly x: number;
  readonly y: number;
}

/** 业务系统是单例汇点；它不是文档组件，只出现在蓝图投影中。 */
export const HOST_BLUEPRINT_NODE_ID = 'host';

/** 实例就绪是单例源节点；存在 lifecycle 关系或布局里有钉固节点时出现。 */
export const LIFECYCLE_BLUEPRINT_NODE_ID = 'lifecycle';

const TIMER_NODE_PREFIX = 'timer:';

/** 定时器按间隔各自成节点：id 携带秒数，关系与布局都以此为准。 */
export function timerBlueprintNodeId(intervalSeconds: number): string {
  return `${TIMER_NODE_PREFIX}${intervalSeconds}`;
}

export function timerIntervalFromBlueprintNodeId(nodeId: string): number | undefined {
  if (!nodeId.startsWith(TIMER_NODE_PREFIX)) return undefined;
  const raw = Number(nodeId.slice(TIMER_NODE_PREFIX.length));
  return Number.isInteger(raw) && raw >= 1 && raw <= 86_400 ? raw : undefined;
}

export function componentBlueprintNodeId(componentId: string): string {
  return `component:${componentId}`;
}

export function variableBlueprintNodeId(variableId: string): string {
  return `variable:${variableId}`;
}

export function componentIdFromBlueprintNodeId(
  document: ScreenDocument,
  nodeId: string,
): string | undefined {
  if (!nodeId.startsWith('component:')) return undefined;
  const componentId = nodeId.slice('component:'.length);
  return document.components.some((component) => component.id === componentId)
    ? componentId
    : undefined;
}

export function variableIdFromBlueprintNodeId(
  document: ScreenDocument,
  nodeId: string,
): string | undefined {
  if (!nodeId.startsWith('variable:')) return undefined;
  const variableId = nodeId.slice('variable:'.length);
  return document.variables.some((variable) => variable.id === variableId) ? variableId : undefined;
}

import type { ScreenDocument } from '@base-screen/contracts';

export interface DesignerBlueprintNodePosition {
  readonly x: number;
  readonly y: number;
}

/** 业务系统是单例汇点；它不是文档组件，只出现在蓝图投影中。 */
export const HOST_BLUEPRINT_NODE_ID = 'host';

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

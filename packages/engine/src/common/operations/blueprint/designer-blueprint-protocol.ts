import {
  MAX_BLUEPRINT_NODE_NAME_CODE_POINTS,
  parseScreenJsonValue,
  SCREEN_BLUEPRINT_PORT_PATTERN,
  type ScreenBlueprintLayoutNode,
  type ScreenBlueprintLayoutViewport,
  type ScreenParseResult,
} from '@base-screen/contracts';
import {
  failure,
  firstUnknownField,
  isBoundedString,
  isCoordinate,
  isIdentifier,
  isNonNegativeInteger,
  isRecord,
  round,
  success,
} from './designer-blueprint-protocol-guards.js';
import type {
  BaseScreenBlueprintCanvasCommand,
  BaseScreenBlueprintCanvasNodePosition,
  BaseScreenBlueprintCanvasNodeUpdate,
  BaseScreenBlueprintCanvasSelection,
} from './designer-blueprint-protocol-types.js';

export * from './designer-blueprint-protocol-types.js';

const MAX_COMMAND_ID_LENGTH = 128;
const MAX_LAYOUT_NODES = 4096;
const MAX_SIMULATION_PAYLOAD_BYTES = 256 * 1024;
const MAX_NODE_NAME_LENGTH = MAX_BLUEPRINT_NODE_NAME_CODE_POINTS * 2;
const COMMON_FIELDS = new Set(['type', 'commandId', 'generation', 'documentRevision']);

export function parseBaseScreenBlueprintCanvasCommand(
  input: unknown,
): ScreenParseResult<BaseScreenBlueprintCanvasCommand> {
  if (!isRecord(input)) return failure([], 'Blueprint canvas command must be an object.');
  if (!isBoundedString(input.commandId, MAX_COMMAND_ID_LENGTH)) {
    return failure(['commandId'], 'Blueprint canvas command id is invalid.');
  }
  if (!isNonNegativeInteger(input.generation)) {
    return failure(['generation'], 'Blueprint canvas generation is invalid.');
  }
  if (!isNonNegativeInteger(input.documentRevision)) {
    return failure(['documentRevision'], 'Blueprint document revision is invalid.');
  }
  const base = {
    commandId: input.commandId,
    generation: input.generation,
    documentRevision: input.documentRevision,
  };
  switch (input.type) {
    case 'ready':
    case 'history-undo':
    case 'history-redo':
    case 'clear-simulation': {
      const unknown = firstUnknownField(input, COMMON_FIELDS);
      return unknown === undefined
        ? success({ ...base, type: input.type })
        : failure([unknown], 'Unknown Blueprint canvas command field.');
    }
    case 'select':
    case 'delete-selection': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'selection']));
      if (unknown !== undefined) return failure([unknown], 'Unknown selection command field.');
      const selection = parseSelection(input.selection);
      if (!selection.ok) return selection;
      if (
        input.type === 'delete-selection' &&
        selection.value.nodes.length === 0 &&
        selection.value.edges.length === 0
      ) {
        return failure(['selection'], 'Selection is required.');
      }
      return success({ ...base, type: input.type, selection: selection.value });
    }
    case 'connect': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'from', 'to']));
      if (unknown !== undefined) return failure([unknown], 'Unknown connection command field.');
      const from = parsePortRef(input.from);
      const to = parsePortRef(input.to);
      if (from === undefined || to === undefined) {
        return failure([], 'Blueprint connection command is invalid.');
      }
      return success({ ...base, type: input.type, from, to });
    }
    case 'insert-node': {
      const fields: Record<string, readonly string[]> = {
        component: ['componentId'],
        variable: ['variableId'],
        'sub-canvas': ['canvasId'],
        'main-canvas': [],
        host: [],
        lifecycle: [],
        timer: ['intervalSeconds'],
        condition: [],
      };
      const kind = typeof input.kind === 'string' ? input.kind : '';
      const extra = fields[kind];
      if (extra === undefined) return failure(['kind'], 'Blueprint insert command is invalid.');
      const unknown = firstUnknownField(
        input,
        new Set([...COMMON_FIELDS, 'kind', 'position', ...extra]),
      );
      if (unknown !== undefined) return failure([unknown], 'Unknown insert command field.');
      const position = parseOptionalPosition(input.position);
      if (!position.ok) return position;
      const at = position.value === undefined ? {} : { position: position.value };
      if (kind === 'component') {
        if (!isIdentifier(input.componentId))
          return failure([], 'Blueprint insert command is invalid.');
        return success({
          ...base,
          type: 'insert-node',
          kind,
          componentId: input.componentId,
          ...at,
        });
      }
      if (kind === 'variable') {
        if (!isIdentifier(input.variableId))
          return failure([], 'Blueprint insert command is invalid.');
        return success({ ...base, type: 'insert-node', kind, variableId: input.variableId, ...at });
      }
      if (kind === 'sub-canvas') {
        if (!isIdentifier(input.canvasId))
          return failure([], 'Blueprint insert command is invalid.');
        return success({ ...base, type: 'insert-node', kind, canvasId: input.canvasId, ...at });
      }
      if (kind === 'timer') {
        const interval = input.intervalSeconds;
        if (interval !== undefined && !isInterval(interval)) {
          return failure(['intervalSeconds'], 'Blueprint insert command is invalid.');
        }
        return success({
          ...base,
          type: 'insert-node',
          kind,
          ...(interval === undefined ? {} : { intervalSeconds: interval as number }),
          ...at,
        });
      }
      return success({
        ...base,
        type: 'insert-node',
        kind: kind as 'host' | 'lifecycle' | 'condition' | 'main-canvas',
        ...at,
      });
    }
    case 'update-node': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'nodeIds', 'update']));
      if (unknown !== undefined) return failure([unknown], 'Unknown node update field.');
      const nodeIds = parseIdList(input.nodeIds);
      const update = parseNodeUpdate(input.update);
      if (nodeIds === undefined || nodeIds.length === 0 || update === undefined) {
        return failure([], 'Blueprint node update is invalid.');
      }
      return success({ ...base, type: input.type, nodeIds, update });
    }
    case 'reorder-edge': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'edgeId', 'direction']));
      if (unknown !== undefined) return failure([unknown], 'Unknown reorder field.');
      if (
        !isIdentifier(input.edgeId) ||
        (input.direction !== 'earlier' && input.direction !== 'later')
      ) {
        return failure([], 'Blueprint edge reorder is invalid.');
      }
      return success({
        ...base,
        type: input.type,
        edgeId: input.edgeId,
        direction: input.direction,
      });
    }
    case 'duplicate-nodes': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'nodeIds']));
      if (unknown !== undefined) return failure([unknown], 'Unknown duplicate field.');
      const nodeIds = parseIdList(input.nodeIds);
      if (nodeIds === undefined || nodeIds.length === 0) {
        return failure(['nodeIds'], 'Blueprint duplicate command is invalid.');
      }
      return success({ ...base, type: input.type, nodeIds });
    }
    case 'commit-layout': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'nodes', 'viewport']));
      if (unknown !== undefined) return failure([unknown], 'Unknown layout command field.');
      const nodes = parseLayoutNodes(input.nodes);
      if (!nodes.ok) return nodes;
      const viewport =
        input.viewport === undefined
          ? success<ScreenBlueprintLayoutViewport | undefined>(undefined)
          : parseViewport(input.viewport);
      if (!viewport.ok) return viewport;
      return success({
        ...base,
        type: input.type,
        nodes: nodes.value,
        ...(viewport.value === undefined ? {} : { viewport: viewport.value }),
      });
    }
    case 'commit-viewport': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'viewport']));
      if (unknown !== undefined) return failure([unknown], 'Unknown viewport command field.');
      const viewport = parseViewport(input.viewport);
      return viewport.ok
        ? success({ ...base, type: input.type, viewport: viewport.value })
        : viewport;
    }
    case 'run-simulation': {
      const unknown = firstUnknownField(
        input,
        new Set([...COMMON_FIELDS, 'nodeId', 'port', 'payload']),
      );
      if (unknown !== undefined) return failure([unknown], 'Unknown simulation command field.');
      if (!isIdentifier(input.nodeId) || !isPort(input.port)) {
        return failure([], 'Simulation trigger is invalid.');
      }
      const payload = parseScreenJsonValue(input.payload, {
        maxBytes: MAX_SIMULATION_PAYLOAD_BYTES,
      });
      if (!payload.ok) return failure(['payload'], 'Simulation payload is invalid.', true);
      return success({
        ...base,
        type: input.type,
        nodeId: input.nodeId,
        port: input.port,
        payload: payload.value,
      });
    }
    default:
      return failure(['type'], 'Blueprint canvas command type is unsupported.');
  }
}

const PORT_PATTERN = new RegExp(SCREEN_BLUEPRINT_PORT_PATTERN);
const MAX_SELECTION_IDS = 4096;

function isPort(value: unknown): value is string {
  return typeof value === 'string' && PORT_PATTERN.test(value);
}

function isInterval(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 86_400;
}

function parsePortRef(
  input: unknown,
): { readonly node: string; readonly port: string } | undefined {
  if (!isRecord(input) || firstUnknownField(input, new Set(['node', 'port'])) !== undefined) {
    return undefined;
  }
  return isIdentifier(input.node) && isPort(input.port)
    ? { node: input.node, port: input.port }
    : undefined;
}

function parseIdList(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > MAX_SELECTION_IDS) return undefined;
  const ids: string[] = [];
  for (const item of input) {
    if (!isIdentifier(item)) return undefined;
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}

function parseNodeUpdate(input: unknown): BaseScreenBlueprintCanvasNodeUpdate | undefined {
  if (!isRecord(input)) return undefined;
  if (input.type === 'name') {
    if (firstUnknownField(input, new Set(['type', 'name'])) !== undefined) return undefined;
    if (input.name === null) return { type: 'name', name: null };
    return isBoundedString(input.name, MAX_NODE_NAME_LENGTH)
      ? { type: 'name', name: input.name }
      : undefined;
  }
  if (input.type === 'interval') {
    if (firstUnknownField(input, new Set(['type', 'intervalSeconds'])) !== undefined) {
      return undefined;
    }
    return isInterval(input.intervalSeconds)
      ? { type: 'interval', intervalSeconds: input.intervalSeconds as number }
      : undefined;
  }
  if (input.type === 'enabled') {
    if (firstUnknownField(input, new Set(['type', 'enabled'])) !== undefined) return undefined;
    return typeof input.enabled === 'boolean'
      ? { type: 'enabled', enabled: input.enabled }
      : undefined;
  }
  return undefined;
}

function parseSelection(input: unknown): ScreenParseResult<BaseScreenBlueprintCanvasSelection> {
  if (!isRecord(input) || firstUnknownField(input, new Set(['nodes', 'edges'])) !== undefined) {
    return failure(['selection'], 'Blueprint selection is invalid.');
  }
  const nodes = parseIdList(input.nodes);
  const edges = parseIdList(input.edges);
  if (nodes === undefined || edges === undefined) {
    return failure(['selection'], 'Blueprint selection is invalid.');
  }
  return success({ nodes, edges });
}

function parseLayoutNodes(input: unknown): ScreenParseResult<readonly ScreenBlueprintLayoutNode[]> {
  if (!Array.isArray(input) || input.length > MAX_LAYOUT_NODES) {
    return failure(['nodes'], 'Blueprint layout nodes exceed their limit.', true);
  }
  const seen = new Set<string>();
  const nodes: ScreenBlueprintLayoutNode[] = [];
  for (let index = 0; index < input.length; index++) {
    const node = input[index];
    if (!isRecord(node)) return failure(['nodes', index], 'Blueprint layout node is invalid.');
    const unknown = firstUnknownField(node, new Set(['id', 'x', 'y', 'collapsed']));
    if (
      unknown !== undefined ||
      !isIdentifier(node.id) ||
      seen.has(node.id) ||
      !isCoordinate(node.x) ||
      !isCoordinate(node.y) ||
      (node.collapsed !== undefined && typeof node.collapsed !== 'boolean')
    ) {
      return failure(['nodes', index], 'Blueprint layout node is invalid.');
    }
    seen.add(node.id);
    nodes.push({
      id: node.id,
      x: round(node.x),
      y: round(node.y),
      ...(node.collapsed === true ? { collapsed: true } : {}),
    });
  }
  return success(nodes);
}

function parseViewport(input: unknown): ScreenParseResult<ScreenBlueprintLayoutViewport> {
  if (!isRecord(input)) return failure(['viewport'], 'Blueprint viewport is invalid.');
  const unknown = firstUnknownField(input, new Set(['x', 'y', 'zoom']));
  if (
    unknown !== undefined ||
    !isCoordinate(input.x) ||
    !isCoordinate(input.y) ||
    typeof input.zoom !== 'number' ||
    !Number.isFinite(input.zoom) ||
    input.zoom < 0.1 ||
    input.zoom > 8
  ) {
    return failure(['viewport'], 'Blueprint viewport is invalid.');
  }
  return success({ x: round(input.x), y: round(input.y), zoom: round(input.zoom) });
}

function parseOptionalPosition(
  input: unknown,
): ScreenParseResult<BaseScreenBlueprintCanvasNodePosition | undefined> {
  if (input === undefined) return success(undefined);
  if (!isRecord(input)) return failure(['position'], 'Blueprint node position is invalid.');
  const unknown = firstUnknownField(input, new Set(['x', 'y']));
  if (unknown !== undefined || !isCoordinate(input.x) || !isCoordinate(input.y)) {
    return failure(['position'], 'Blueprint node position is invalid.');
  }
  return success({ x: round(input.x), y: round(input.y) });
}

import {
  parseScreenJsonValue,
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
  BaseScreenBlueprintCanvasSelection,
} from './designer-blueprint-protocol-types.js';

export * from './designer-blueprint-protocol-types.js';

const MAX_COMMAND_ID_LENGTH = 128;
const MAX_LAYOUT_NODES = 4096;
const MAX_SIMULATION_PAYLOAD_BYTES = 256 * 1024;
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
    case 'history-redo': {
      const unknown = firstUnknownField(input, COMMON_FIELDS);
      return unknown === undefined
        ? success({ ...base, type: input.type })
        : failure([unknown], 'Unknown Blueprint canvas command field.');
    }
    case 'select': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'selection']));
      if (unknown !== undefined) return failure([unknown], 'Unknown selection command field.');
      const selection = parseSelection(input.selection, true);
      return selection.ok
        ? success({ ...base, type: input.type, selection: selection.value })
        : selection;
    }
    case 'connect': {
      const unknown = firstUnknownField(
        input,
        new Set([...COMMON_FIELDS, 'sourceNodeId', 'sourceHandle', 'targetNodeId', 'targetHandle']),
      );
      if (unknown !== undefined) return failure([unknown], 'Unknown connection command field.');
      if (
        !isIdentifier(input.sourceNodeId) ||
        !isIdentifier(input.sourceHandle) ||
        !isIdentifier(input.targetNodeId) ||
        !isIdentifier(input.targetHandle)
      ) {
        return failure([], 'Blueprint connection command is invalid.');
      }
      return success({
        ...base,
        type: input.type,
        sourceNodeId: input.sourceNodeId,
        sourceHandle: input.sourceHandle,
        targetNodeId: input.targetNodeId,
        targetHandle: input.targetHandle,
      });
    }
    case 'delete-selection': {
      const unknown = firstUnknownField(input, new Set([...COMMON_FIELDS, 'selection']));
      if (unknown !== undefined) return failure([unknown], 'Unknown delete command field.');
      const selection = parseSelection(input.selection, false);
      if (!selection.ok || selection.value === null)
        return failure(['selection'], 'Selection is required.');
      return success({ ...base, type: input.type, selection: selection.value });
    }
    case 'insert-node': {
      if (input.kind === 'component') {
        const unknown = firstUnknownField(
          input,
          new Set([...COMMON_FIELDS, 'kind', 'componentId', 'position']),
        );
        if (unknown !== undefined) return failure([unknown], 'Unknown insert command field.');
        const position = parseOptionalPosition(input.position);
        if (!isIdentifier(input.componentId) || !position.ok) {
          return failure([], 'Blueprint insert command is invalid.');
        }
        return success({
          ...base,
          type: input.type,
          kind: input.kind,
          componentId: input.componentId,
          ...(position.value === undefined ? {} : { position: position.value }),
        });
      }
      if (input.kind === 'variable') {
        const unknown = firstUnknownField(
          input,
          new Set([...COMMON_FIELDS, 'kind', 'variableId', 'position']),
        );
        const position = parseOptionalPosition(input.position);
        if (unknown !== undefined || !isIdentifier(input.variableId) || !position.ok) {
          return failure([], 'Blueprint insert command is invalid.');
        }
        return success({
          ...base,
          type: input.type,
          kind: input.kind,
          variableId: input.variableId,
          ...(position.value === undefined ? {} : { position: position.value }),
        });
      }
      if (
        input.kind !== 'condition' &&
        input.kind !== 'set-variable' &&
        input.kind !== 'emit-host-event'
      ) {
        return failure([], 'Blueprint insert command is invalid.');
      }
      const allowed = new Set([
        ...COMMON_FIELDS,
        'kind',
        'position',
        ...(input.kind === 'set-variable' ? ['variableId'] : []),
      ]);
      const unknown = firstUnknownField(input, allowed);
      if (unknown !== undefined) return failure([unknown], 'Unknown insert command field.');
      const position = parseOptionalPosition(input.position);
      if (!position.ok || (input.variableId !== undefined && !isIdentifier(input.variableId))) {
        return failure([], 'Blueprint insert command is invalid.');
      }
      return success({
        ...base,
        type: input.type,
        kind: input.kind,
        ...(input.variableId === undefined ? {} : { variableId: input.variableId }),
        ...(position.value === undefined ? {} : { position: position.value }),
      });
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
        new Set([...COMMON_FIELDS, 'componentId', 'eventName', 'payload']),
      );
      if (unknown !== undefined) return failure([unknown], 'Unknown simulation command field.');
      if (!isIdentifier(input.componentId) || !isIdentifier(input.eventName)) {
        return failure([], 'Simulation trigger is invalid.');
      }
      const payload = parseScreenJsonValue(input.payload, {
        maxBytes: MAX_SIMULATION_PAYLOAD_BYTES,
      });
      if (!payload.ok) return failure(['payload'], 'Simulation payload is invalid.', true);
      return success({
        ...base,
        type: input.type,
        componentId: input.componentId,
        eventName: input.eventName,
        payload: payload.value,
      });
    }
    default:
      return failure(['type'], 'Blueprint canvas command type is unsupported.');
  }
}

function parseSelection(
  input: unknown,
  nullable: boolean,
): ScreenParseResult<BaseScreenBlueprintCanvasSelection> {
  if (input === null && nullable) return success(null);
  if (!isRecord(input)) return failure(['selection'], 'Blueprint selection is invalid.');
  const unknown = firstUnknownField(input, new Set(['kind', 'id']));
  if (
    unknown !== undefined ||
    (input.kind !== 'node' && input.kind !== 'edge') ||
    !isIdentifier(input.id)
  ) {
    return failure(['selection'], 'Blueprint selection is invalid.');
  }
  return success({ kind: input.kind, id: input.id });
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

import { MAX_CANONICAL_DOCUMENT_BYTES, MAX_COMPONENTS } from '../document/limits.js';
import { parseScreenDocument } from '../document/parse.js';
import { parseScreenJsonValue } from '../json/parse.js';
import type { ScreenDiagnosticPath, ScreenParseResult } from './diagnostics.js';
import type { ScreenDocument } from './document.js';
import type { ScreenJsonObject } from './json.js';

export const MAX_BLUEPRINT_AUTHORING_CONTEXT_BYTES = MAX_CANONICAL_DOCUMENT_BYTES + 2 * 1024 * 1024;
export const MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES = MAX_CANONICAL_DOCUMENT_BYTES;
export const MAX_BLUEPRINT_AUTHORING_EVENTS_PER_MATERIAL = 64;
export const MAX_BLUEPRINT_AUTHORING_CAPABILITIES = 256;
export const MAX_BLUEPRINT_AUTHORING_PAYLOAD_SCHEMA_BYTES = 256 * 1024;

export interface ScreenBlueprintAuthoringEvent {
  readonly name: string;
  readonly label?: string;
  readonly hint?: string;
  readonly payloadSchema?: ScreenJsonObject;
  readonly maxPayloadBytes?: number;
  readonly requiredCapability?: string;
  readonly available: boolean;
}

export interface ScreenBlueprintAuthoringMaterialEvents {
  readonly materialType: string;
  readonly events: readonly ScreenBlueprintAuthoringEvent[];
}

export interface ScreenBlueprintAuthoringLimits {
  readonly maxDocumentBytes: number;
  readonly maxCandidateBytes: number;
  readonly maxJsonDepth: number;
}

export interface ScreenBlueprintAuthoringContext {
  readonly document: ScreenDocument;
  readonly initialComponentId: string | null;
  readonly materialEvents: readonly ScreenBlueprintAuthoringMaterialEvents[];
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly limits: ScreenBlueprintAuthoringLimits;
}

export interface ScreenBlueprintEditOptions {
  readonly initialComponentId?: string | null;
}

const CONTEXT_FIELDS = new Set([
  'document',
  'initialComponentId',
  'materialEvents',
  'capabilities',
  'limits',
]);
const MATERIAL_EVENTS_FIELDS = new Set(['materialType', 'events']);
const EVENT_FIELDS = new Set([
  'name',
  'label',
  'hint',
  'payloadSchema',
  'maxPayloadBytes',
  'requiredCapability',
  'available',
]);
const LIMIT_FIELDS = new Set(['maxDocumentBytes', 'maxCandidateBytes', 'maxJsonDepth']);

export function parseScreenBlueprintAuthoringContext(
  input: unknown,
): ScreenParseResult<ScreenBlueprintAuthoringContext> {
  if (!isRecord(input)) return failure([], 'Blueprint authoring context must be an object.');
  const serialized = safeStringify(input);
  if (serialized === undefined)
    return failure([], 'Blueprint authoring context must be JSON-safe.');
  if (byteLength(serialized) > MAX_BLUEPRINT_AUTHORING_CONTEXT_BYTES) {
    return failure([], 'Blueprint authoring context exceeds its byte limit.', true);
  }
  const unknownField = firstUnknownField(input, CONTEXT_FIELDS);
  if (unknownField !== undefined) return failure([unknownField], 'Unknown context field.');

  const document = parseScreenDocument(input.document);
  if (!document.ok) {
    return {
      ok: false,
      diagnostics: document.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: ['document', ...diagnostic.path],
      })),
    };
  }
  const initialComponentId = input.initialComponentId;
  if (initialComponentId !== null && !isBoundedString(initialComponentId, 256)) {
    return failure(['initialComponentId'], 'Initial component id must be a string or null.');
  }
  if (
    typeof initialComponentId === 'string' &&
    !document.value.components.some((component) => component.id === initialComponentId)
  ) {
    return failure(['initialComponentId'], 'Initial component does not exist in the document.');
  }

  const materialEvents = parseMaterialEvents(input.materialEvents, document.value);
  if (!materialEvents.ok) return materialEvents;
  const capabilities = parseCapabilities(input.capabilities);
  if (!capabilities.ok) return capabilities;
  for (let materialIndex = 0; materialIndex < materialEvents.value.length; materialIndex++) {
    const material = materialEvents.value[materialIndex]!;
    for (let eventIndex = 0; eventIndex < material.events.length; eventIndex++) {
      const event = material.events[eventIndex]!;
      if (
        event.requiredCapability !== undefined &&
        capabilities.value[event.requiredCapability] === undefined
      ) {
        return failure(
          ['materialEvents', materialIndex, 'events', eventIndex, 'requiredCapability'],
          'Required capability is missing from the capability projection.',
        );
      }
      if (
        event.available &&
        event.requiredCapability !== undefined &&
        capabilities.value[event.requiredCapability] !== true
      ) {
        return failure(
          ['materialEvents', materialIndex, 'events', eventIndex, 'available'],
          'An event cannot be available when its required capability is unavailable.',
        );
      }
    }
  }
  const limits = parseLimits(input.limits);
  if (!limits.ok) return limits;

  return {
    ok: true,
    value: {
      document: document.value,
      initialComponentId,
      materialEvents: materialEvents.value,
      capabilities: capabilities.value,
      limits: limits.value,
    },
    diagnostics: [],
  };
}

function parseMaterialEvents(
  input: unknown,
  document: ScreenDocument,
): ScreenParseResult<readonly ScreenBlueprintAuthoringMaterialEvents[]> {
  const usedTypes = new Set(document.components.map((component) => component.type));
  if (!Array.isArray(input) || input.length > MAX_COMPONENTS || input.length !== usedTypes.size) {
    return failure(
      ['materialEvents'],
      'Material event projection must cover every material type used by the document exactly once.',
    );
  }
  const seenTypes = new Set<string>();
  const result: ScreenBlueprintAuthoringMaterialEvents[] = [];
  for (let index = 0; index < input.length; index++) {
    const item = input[index];
    const path = ['materialEvents', index] as const;
    if (!isRecord(item)) return failure(path, 'Material event entry must be an object.');
    const unknownField = firstUnknownField(item, MATERIAL_EVENTS_FIELDS);
    if (unknownField !== undefined) {
      return failure([...path, unknownField], 'Unknown material event field.');
    }
    if (
      !isBoundedString(item.materialType, 256) ||
      !usedTypes.has(item.materialType) ||
      seenTypes.has(item.materialType)
    ) {
      return failure([...path, 'materialType'], 'Material type is invalid or duplicated.');
    }
    seenTypes.add(item.materialType);
    const events = parseEvents(item.events, [...path, 'events']);
    if (!events.ok) return events;
    result.push({ materialType: item.materialType, events: events.value });
  }
  return { ok: true, value: result, diagnostics: [] };
}

function parseEvents(
  input: unknown,
  path: ScreenDiagnosticPath,
): ScreenParseResult<readonly ScreenBlueprintAuthoringEvent[]> {
  if (!Array.isArray(input) || input.length > MAX_BLUEPRINT_AUTHORING_EVENTS_PER_MATERIAL) {
    return failure(path, 'Authoring events are invalid or exceed their limit.');
  }
  const names = new Set<string>();
  const result: ScreenBlueprintAuthoringEvent[] = [];
  for (let index = 0; index < input.length; index++) {
    const event = input[index];
    const eventPath = [...path, index] as const;
    if (!isRecord(event)) return failure(eventPath, 'Authoring event must be an object.');
    const unknownField = firstUnknownField(event, EVENT_FIELDS);
    if (unknownField !== undefined) {
      return failure([...eventPath, unknownField], 'Unknown authoring event field.');
    }
    if (!isBoundedString(event.name, 128) || names.has(event.name)) {
      return failure([...eventPath, 'name'], 'Authoring event name is invalid or duplicated.');
    }
    names.add(event.name);
    if (event.label !== undefined && !isBoundedString(event.label, 256)) {
      return failure([...eventPath, 'label'], 'Authoring event label is invalid.');
    }
    if (event.hint !== undefined && !isBoundedString(event.hint, 1024)) {
      return failure([...eventPath, 'hint'], 'Authoring event hint is invalid.');
    }
    if (event.requiredCapability !== undefined && !isBoundedString(event.requiredCapability, 256)) {
      return failure([...eventPath, 'requiredCapability'], 'Required capability is invalid.');
    }
    const maxPayloadBytes = event.maxPayloadBytes;
    if (
      maxPayloadBytes !== undefined &&
      (typeof maxPayloadBytes !== 'number' ||
        !Number.isInteger(maxPayloadBytes) ||
        maxPayloadBytes < 1024 ||
        maxPayloadBytes > 1024 * 1024)
    ) {
      return failure([...eventPath, 'maxPayloadBytes'], 'Payload byte limit is invalid.');
    }
    if (typeof event.available !== 'boolean') {
      return failure([...eventPath, 'available'], 'Authoring event availability is invalid.');
    }
    let payloadSchema: ScreenJsonObject | undefined;
    if (event.payloadSchema !== undefined) {
      const parsed = parseScreenJsonValue(event.payloadSchema, {
        maxBytes: MAX_BLUEPRINT_AUTHORING_PAYLOAD_SCHEMA_BYTES,
      });
      if (!parsed.ok || !isRecord(parsed.value)) {
        return failure([...eventPath, 'payloadSchema'], 'Payload schema is invalid.');
      }
      payloadSchema = parsed.value;
    }
    result.push({
      name: event.name,
      ...(event.label === undefined ? {} : { label: event.label }),
      ...(event.hint === undefined ? {} : { hint: event.hint }),
      ...(payloadSchema === undefined ? {} : { payloadSchema }),
      ...(maxPayloadBytes === undefined ? {} : { maxPayloadBytes }),
      ...(event.requiredCapability === undefined
        ? {}
        : { requiredCapability: event.requiredCapability }),
      available: event.available,
    });
  }
  return { ok: true, value: result, diagnostics: [] };
}

function parseCapabilities(input: unknown): ScreenParseResult<Readonly<Record<string, boolean>>> {
  if (!isRecord(input))
    return failure(['capabilities'], 'Capability projection must be an object.');
  const entries = Object.entries(input);
  if (entries.length > MAX_BLUEPRINT_AUTHORING_CAPABILITIES) {
    return failure(['capabilities'], 'Capability projection exceeds its limit.', true);
  }
  const result: Record<string, boolean> = {};
  for (const [capability, available] of entries) {
    if (!isBoundedString(capability, 256) || typeof available !== 'boolean') {
      return failure(['capabilities', capability], 'Capability projection entry is invalid.');
    }
    result[capability] = available;
  }
  return { ok: true, value: result, diagnostics: [] };
}

function parseLimits(input: unknown): ScreenParseResult<ScreenBlueprintAuthoringLimits> {
  if (!isRecord(input)) return failure(['limits'], 'Authoring limits must be an object.');
  const unknownField = firstUnknownField(input, LIMIT_FIELDS);
  if (unknownField !== undefined) return failure(['limits', unknownField], 'Unknown limits field.');
  if (
    !isPositiveInteger(input.maxDocumentBytes, MAX_CANONICAL_DOCUMENT_BYTES) ||
    !isPositiveInteger(input.maxCandidateBytes, 1024 * 1024) ||
    !isPositiveInteger(input.maxJsonDepth, 128)
  ) {
    return failure(['limits'], 'Authoring limits are invalid.');
  }
  return {
    ok: true,
    value: {
      maxDocumentBytes: input.maxDocumentBytes,
      maxCandidateBytes: input.maxCandidateBytes,
      maxJsonDepth: input.maxJsonDepth,
    },
    diagnostics: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isPositiveInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

function firstUnknownField(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).find((key) => !allowed.has(key));
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function byteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function failure<T>(
  path: ScreenDiagnosticPath,
  message: string,
  limit = false,
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: limit ? 'AUTHORING_LIMIT_EXCEEDED' : 'AUTHORING_REQUEST_INVALID',
        path,
        message,
      },
    ],
  };
}

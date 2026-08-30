import type { ScreenParseResult } from './diagnostics.js';
import type { ScreenJsonObject, ScreenJsonValue } from './json.js';

export const SCREEN_AUTHORING_REQUEST_EVENT = 'base-screen-authoring-request' as const;

export const MAX_AUTHORING_REQUEST_ID_LENGTH = 128;
export const MAX_AUTHORING_SOURCE_BYTES = 256 * 1024;
export const MAX_AUTHORING_JSON_DEPTH = 32;
export const MAX_AUTHORING_CANDIDATE_BYTES = 256 * 1024;
export const MAX_AUTHORING_COMPONENT_SNAPSHOT_BYTES = 1024 * 1024;

export type ScreenComponentTextTarget = 'props' | 'style' | 'data';

export interface ScreenAuthoringRequest {
  readonly kind: 'component-text';
  readonly requestId: string;
  readonly componentId: string;
  readonly documentRevision: string | null;
  readonly target: ScreenComponentTextTarget;
  readonly source: string;
  readonly format: 'json' | 'expression';
  readonly maxBytes: number;
}

export interface ScreenAuthoringEditorLimits {
  readonly maxSourceBytes: number;
  readonly maxJsonDepth: number;
  readonly maxCandidateBytes: number;
}

export interface ScreenAuthoringEditorContext {
  readonly instanceId: string;
  readonly requestId: string;
  readonly componentId: string | null;
  readonly documentRevision: string | null;
  readonly componentSnapshot: ScreenJsonObject | null;
  readonly manifest: ScreenJsonObject | null;
  readonly blueprint: ScreenJsonObject | null;
  readonly limits: ScreenAuthoringEditorLimits;
}

export interface ScreenAuthoringRequestEventDetail {
  readonly request: ScreenAuthoringRequest;
}

export interface ScreenComponentTextCommitRequest {
  readonly requestId: string;
  readonly expectedRevision: string | null;
  readonly componentId: string;
  readonly target: ScreenComponentTextTarget;
  readonly source: string;
}

const REQUEST_FIELDS_COMMON = new Set(['kind', 'requestId', 'documentRevision']);

export function parseScreenAuthoringRequest(
  input: unknown,
): ScreenParseResult<ScreenAuthoringRequest> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return authoringFailure(
      'AUTHORING_REQUEST_INVALID',
      [],
      'Authoring request must be an object.',
    );
  }
  const record = input as Record<string, unknown>;
  const kind = record.kind;
  if (kind === 'component-text') {
    for (const key of Object.keys(record)) {
      if (
        !REQUEST_FIELDS_COMMON.has(key) &&
        key !== 'componentId' &&
        key !== 'maxBytes' &&
        key !== 'target' &&
        key !== 'source' &&
        key !== 'format'
      ) {
        return authoringFailure('AUTHORING_REQUEST_INVALID', [key], 'Unknown request field.');
      }
    }
    if (!isRequestId(record.requestId)) {
      return authoringFailure('AUTHORING_REQUEST_INVALID', ['requestId'], 'Request id is invalid.');
    }
    if (typeof record.componentId !== 'string' || record.componentId.length === 0) {
      return authoringFailure(
        'AUTHORING_REQUEST_INVALID',
        ['componentId'],
        'Component id is invalid.',
      );
    }
    if (record.documentRevision !== null && typeof record.documentRevision !== 'string') {
      return authoringFailure(
        'AUTHORING_REQUEST_INVALID',
        ['documentRevision'],
        'Document revision must be a string or null.',
      );
    }
    if (record.target !== 'props' && record.target !== 'style' && record.target !== 'data') {
      return authoringFailure('AUTHORING_REQUEST_INVALID', ['target'], 'Target is unsupported.');
    }
    if (typeof record.source !== 'string') {
      return authoringFailure('AUTHORING_REQUEST_INVALID', ['source'], 'Source must be a string.');
    }
    if (byteLength(record.source) > MAX_AUTHORING_SOURCE_BYTES) {
      return authoringFailure(
        'AUTHORING_LIMIT_EXCEEDED',
        ['source'],
        'Source exceeds the authoring byte limit.',
      );
    }
    if (record.format !== 'json' && record.format !== 'expression') {
      return authoringFailure('AUTHORING_REQUEST_INVALID', ['format'], 'Format is unsupported.');
    }
    if (!isByteBudget(record.maxBytes)) {
      return authoringFailure('AUTHORING_REQUEST_INVALID', ['maxBytes'], 'Byte budget is invalid.');
    }
    return {
      ok: true,
      value: {
        kind: 'component-text',
        requestId: record.requestId as string,
        componentId: record.componentId,
        documentRevision: record.documentRevision as string | null,
        target: record.target,
        source: record.source,
        format: record.format,
        maxBytes: record.maxBytes,
      },
      diagnostics: [],
    };
  }
  return authoringFailure('AUTHORING_REQUEST_INVALID', ['kind'], 'Request kind is unsupported.');
}

export function parseScreenAuthoringEditorContext(
  input: unknown,
): ScreenParseResult<ScreenAuthoringEditorContext> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return contextFailure('AUTHORING_REQUEST_INVALID', [], 'Editor context must be an object.');
  }
  const record = input as Record<string, unknown>;
  if (typeof record.instanceId !== 'string' || record.instanceId.length === 0) {
    return contextFailure('AUTHORING_REQUEST_INVALID', ['instanceId'], 'Instance id is invalid.');
  }
  if (!isRequestId(record.requestId)) {
    return contextFailure('AUTHORING_REQUEST_INVALID', ['requestId'], 'Request id is invalid.');
  }
  if (record.componentId !== null && typeof record.componentId !== 'string') {
    return contextFailure(
      'AUTHORING_REQUEST_INVALID',
      ['componentId'],
      'Component id must be a string or null.',
    );
  }
  if (record.documentRevision !== null && typeof record.documentRevision !== 'string') {
    return contextFailure(
      'AUTHORING_REQUEST_INVALID',
      ['documentRevision'],
      'Document revision must be a string or null.',
    );
  }
  for (const field of ['componentSnapshot', 'manifest', 'blueprint'] as const) {
    if (
      record[field] !== null &&
      (record[field] === undefined || record[field] === null || typeof record[field] !== 'object')
    ) {
      return contextFailure('AUTHORING_REQUEST_INVALID', [field], 'Detached snapshot is invalid.');
    }
  }
  const limits = record.limits as Record<string, unknown> | null | undefined;
  if (
    limits === null ||
    typeof limits !== 'object' ||
    !isByteBudget(limits.maxSourceBytes) ||
    !isByteBudget(limits.maxCandidateBytes) ||
    typeof limits.maxJsonDepth !== 'number' ||
    !Number.isInteger(limits.maxJsonDepth) ||
    limits.maxJsonDepth < 1 ||
    limits.maxJsonDepth > 128
  ) {
    return contextFailure('AUTHORING_REQUEST_INVALID', ['limits'], 'Editor limits are invalid.');
  }
  return {
    ok: true,
    value: record as unknown as ScreenAuthoringEditorContext,
    diagnostics: [],
  };
}

export function isScreenAuthoringRequest(value: unknown): value is ScreenAuthoringRequest {
  return parseScreenAuthoringRequest(value).ok;
}

function isRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= MAX_AUTHORING_REQUEST_ID_LENGTH
  );
}

function isByteBudget(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1024 &&
    value <= MAX_AUTHORING_CANDIDATE_BYTES
  );
}

function byteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code >= 0xd800 && code <= 0xdfff ? 4 : 3;
  }
  return bytes;
}

function authoringFailure(
  code: 'AUTHORING_REQUEST_INVALID' | 'AUTHORING_LIMIT_EXCEEDED',
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<ScreenAuthoringRequest> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

function contextFailure(
  code: 'AUTHORING_REQUEST_INVALID',
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<ScreenAuthoringEditorContext> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

export function jsonDepth(value: ScreenJsonValue | undefined): number {
  if (Array.isArray(value)) {
    let depth = 0;
    for (const item of value) depth = Math.max(depth, jsonDepth(item));
    return depth + 1;
  }
  if (value !== null && typeof value === 'object') {
    let depth = 0;
    const record = value as Readonly<Record<string, ScreenJsonValue>>;
    for (const key of Object.keys(record)) depth = Math.max(depth, jsonDepth(record[key]));
    return depth + 1;
  }
  return 0;
}

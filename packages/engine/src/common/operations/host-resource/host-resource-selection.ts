import {
  isBoundedScreenImageUrl,
  MAX_AUTHORING_REQUEST_ID_LENGTH,
  parseScreenJsonValue,
  readScreenComponentValueRef,
  readScreenDocumentDataSources,
  type ScreenCanvasBackgroundImageFit,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourceParameter,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { containsForbiddenHostResourceTransportData } from './host-resource-authoring.js';

export const BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT =
  'base-screen-host-resource-selection-request';

export type BaseScreenHostResourceSelectionTarget =
  | {
      readonly kind: 'canvas-background';
      readonly backgroundImageFit: ScreenCanvasBackgroundImageFit | null;
    }
  | {
      readonly kind: 'component';
      readonly componentId: string;
      readonly materialType: string;
    };

export type BaseScreenHostResourceSelectionCurrent =
  | { readonly kind: 'none' }
  | { readonly kind: 'url'; readonly url: string }
  | {
      readonly kind: 'host-resource';
      readonly resourceType: string;
      readonly resourceId: string;
    }
  | { readonly kind: 'other' };

export interface BaseScreenHostResourceSelectionRequest {
  readonly requestId: string;
  readonly instanceId: string;
  readonly documentRevision: string | null;
  readonly target: BaseScreenHostResourceSelectionTarget;
  readonly current: BaseScreenHostResourceSelectionCurrent;
}

export type BaseScreenHostResourceSelection =
  | { readonly kind: 'url'; readonly url: string }
  | {
      readonly kind: 'host-resource';
      readonly resourceType: string;
      readonly resourceId: string;
      readonly params?: Readonly<Record<string, ScreenHostResourceParameter>>;
    };

export interface BaseScreenHostResourceSelectionCommit {
  readonly requestId: string;
  readonly selection: BaseScreenHostResourceSelection;
  /** 仅 canvas-background 目标允许。 */
  readonly backgroundImageFit?: ScreenCanvasBackgroundImageFit;
}

export interface BaseScreenHostResourceSelectionRequestEventDetail {
  readonly request: BaseScreenHostResourceSelectionRequest;
}

const COMMIT_FIELDS = new Set(['requestId', 'selection', 'backgroundImageFit']);
const MAX_SELECTION_BYTES = 8 * 1024;

export function buildHostResourceSelectionRequest(input: {
  readonly target: BaseScreenHostResourceSelectionTarget;
  readonly current: BaseScreenHostResourceSelectionCurrent;
  readonly instanceId: string;
  readonly requestId: string;
  readonly documentRevision: string | null;
}): BaseScreenHostResourceSelectionRequest {
  return {
    requestId: input.requestId,
    instanceId: input.instanceId,
    documentRevision: input.documentRevision,
    target: input.target,
    current: input.current,
  };
}

/** 提交守卫：pending 会话存在且实例代际未过期。 */
export function validateHostResourceSelectionCommitGuards(input: {
  readonly pendingKind: string | undefined;
  readonly disposed: boolean;
}): ScreenParseResult<null> {
  if (input.disposed) {
    return failure(
      'AUTHORING_EXPIRED',
      ['requestId'],
      'Designer is unloaded or disposed; the host resource selection session has expired.',
    );
  }
  if (input.pendingKind !== 'host-resource-selection') {
    return failure(
      'AUTHORING_REQUEST_INVALID',
      ['requestId'],
      'Host resource selection session is missing or no longer current.',
    );
  }
  return { ok: true, value: null, diagnostics: [] };
}

export function parseHostResourceSelectionCommit(
  input: unknown,
): ScreenParseResult<BaseScreenHostResourceSelectionCommit> {
  const normalized = normalizeCommit(input);
  if (!normalized.ok) return normalized;
  const value = normalized.value;
  if (!isRecord(value) || !Object.keys(value).every((key) => COMMIT_FIELDS.has(key))) {
    return invalidPayload('Host resource selection commit must be a strict object.');
  }
  const requestId = value.requestId;
  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    requestId.length > MAX_AUTHORING_REQUEST_ID_LENGTH
  ) {
    return invalidPayload('Host resource selection requestId is invalid.', ['requestId']);
  }
  const selection = parseSelection(value.selection);
  if (!selection.ok) return selection;
  let backgroundImageFit: ScreenCanvasBackgroundImageFit | undefined;
  if (value.backgroundImageFit !== undefined) {
    if (value.backgroundImageFit !== 'cover' && value.backgroundImageFit !== 'contain') {
      return invalidPayload('Host resource selection backgroundImageFit is invalid.', [
        'backgroundImageFit',
      ]);
    }
    backgroundImageFit = value.backgroundImageFit;
  }
  return {
    ok: true,
    value: {
      requestId,
      selection: selection.value,
      ...(backgroundImageFit === undefined ? {} : { backgroundImageFit }),
    },
    diagnostics: [],
  };
}

export function readHostResourceSelectionCurrent(
  document: ScreenDocument,
  target: BaseScreenHostResourceSelectionTarget,
): BaseScreenHostResourceSelectionCurrent {
  if (target.kind === 'canvas-background') {
    const url = document.canvas.backgroundImage;
    return typeof url === 'string' && url.length > 0 ? { kind: 'url', url } : { kind: 'none' };
  }
  const component = document.components.find((item) => item.id === target.componentId);
  if (component === undefined) return { kind: 'none' };
  const ref = readScreenComponentValueRef(component);
  if (ref === null) return { kind: 'none' };
  if (ref.kind === 'inline') {
    if (typeof ref.value !== 'string' || ref.value.length === 0) return { kind: 'none' };
    return isBoundedScreenImageUrl(ref.value) ? { kind: 'url', url: ref.value } : { kind: 'other' };
  }
  if (ref.kind === 'variable') return { kind: 'other' };
  const source = readScreenDocumentDataSources(document).find(
    (item) => item.id === ref.dataSourceId,
  )?.source;
  return source?.kind === 'host-resource'
    ? {
        kind: 'host-resource',
        resourceType: source.resourceType,
        resourceId: source.resourceId,
      }
    : { kind: 'other' };
}

function parseSelection(input: unknown): ScreenParseResult<BaseScreenHostResourceSelection> {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    return invalidPayload('Host resource selection is invalid.', ['selection']);
  }
  if (input.kind === 'url') {
    if (!hasExactKeys(input, ['kind', 'url']) || typeof input.url !== 'string') {
      return invalidPayload('Host resource URL selection is invalid.', ['selection']);
    }
    if (!isBoundedScreenImageUrl(input.url)) {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        ['selection', 'url'],
        'Host resource selection URL is invalid.',
      );
    }
    return { ok: true, value: { kind: 'url', url: input.url }, diagnostics: [] };
  }
  if (input.kind !== 'host-resource') {
    return invalidPayload('Host resource selection kind is invalid.', ['selection', 'kind']);
  }
  if (
    !Object.keys(input).every((key) =>
      ['kind', 'resourceType', 'resourceId', 'params'].includes(key),
    ) ||
    typeof input.resourceType !== 'string' ||
    input.resourceType.length === 0 ||
    typeof input.resourceId !== 'string' ||
    input.resourceId.length === 0
  ) {
    return invalidPayload('Host resource identity selection is invalid.', ['selection']);
  }
  if (input.params !== undefined && (!isRecord(input.params) || Array.isArray(input.params))) {
    return invalidPayload('Host resource selection params must be an object.', [
      'selection',
      'params',
    ]);
  }
  if (containsForbiddenHostResourceTransportData(input)) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      ['selection'],
      'Host resource selection must not contain URLs, tokens, or headers.',
    );
  }
  return {
    ok: true,
    value: {
      kind: 'host-resource',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ...(input.params === undefined
        ? {}
        : { params: input.params as Readonly<Record<string, ScreenHostResourceParameter>> }),
    },
    diagnostics: [],
  };
}

function normalizeCommit(input: unknown): ScreenParseResult<ScreenJsonValue> {
  try {
    const parsed = parseScreenJsonValue(input, {
      maxBytes: MAX_SELECTION_BYTES,
      maxStringBytes: MAX_SELECTION_BYTES,
    });
    if (parsed.ok) return parsed;
    return parsed.diagnostics.some((diagnostic) => diagnostic.code === 'JSON_LIMIT_EXCEEDED')
      ? failure(
          'AUTHORING_LIMIT_EXCEEDED',
          [],
          'Host resource selection commit exceeds its JSON limits.',
        )
      : invalidPayload('Host resource selection commit is not JSON-safe.');
  } catch {
    return invalidPayload('Host resource selection commit is not JSON-safe.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function invalidPayload<T>(
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return failure('AUTHORING_PAYLOAD_INVALID', path, message);
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  path: ScreenDiagnostic['path'],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

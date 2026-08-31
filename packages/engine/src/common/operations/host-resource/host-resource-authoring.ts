import {
  isScreenMaterialType,
  parseScreenDocument,
  parseScreenJsonValue,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenHostResourceDataSource,
  type ScreenJsonValue,
  type ScreenParseResult,
  type ScreenPosition,
} from '@base-screen/contracts';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { roundScreenGeometry } from '../element/designer-geometry.js';

export const BASE_SCREEN_HOST_RESOURCE_DRAG_MIME =
  'application/x-base-screen-host-resource' as const;

export const BASE_SCREEN_HOST_RESOURCE_DRAG_MAX_BYTES = 8 * 1024;

const HOST_RESOURCE_INTENT_FIELDS = new Set(['materialType', 'dataSource', 'name']);
const MAX_HOST_RESOURCE_NAME_CODE_POINTS = 256;
const FORBIDDEN_TRANSPORT_FIELD = /(url|token|headers?)/i;
const FORBIDDEN_TRANSPORT_VALUE =
  /^\s*(?:[a-z][a-z\d+.-]*:\/\/|https?:|data:|blob:|file:|javascript:|\.{0,2}\/)/i;

export interface BaseScreenHostResourceAuthoringIntent {
  readonly materialType: string;
  readonly dataSource: ScreenHostResourceDataSource;
  readonly name?: string;
}

export interface BaseScreenHostResourceDragDataTransfer {
  effectAllowed?: string;
  setData(format: string, data: string): void;
}

export function parseBaseScreenHostResourceAuthoringIntent(
  input: unknown,
): ScreenParseResult<BaseScreenHostResourceAuthoringIntent> {
  const normalized = normalizeIntent(input);
  if (!normalized.ok) return normalized;
  input = normalized.value;
  if (!isRecord(input) || !hasExactKeys(input, HOST_RESOURCE_INTENT_FIELDS)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Host resource authoring intent must be a strict object.',
    );
  }
  if (!isScreenMaterialType(input.materialType)) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource materialType must be a canonical material type.',
      ['materialType'],
    );
  }
  if (input.name !== undefined && !isBoundedName(input.name)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      `Host resource name must contain 1 to ${MAX_HOST_RESOURCE_NAME_CODE_POINTS} code points without control characters.`,
      ['name'],
    );
  }
  if (containsForbiddenTransportData(input)) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource intent must not contain URLs, tokens, or headers.',
    );
  }
  const parsed = parseScreenDocument(intentValidationDocument(input));
  if (!parsed.ok) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Host resource dataSource does not match the canonical document contract.',
      ['dataSource'],
    );
  }
  const component = parsed.value.components[0];
  if (component?.dataSource?.type !== 'host-resource') {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Host resource dataSource must use type "host-resource".',
      ['dataSource', 'type'],
    );
  }
  return {
    ok: true,
    value: {
      materialType: component.type,
      dataSource: component.dataSource,
      ...(input.name === undefined ? {} : { name: component.name }),
    },
    diagnostics: [],
  };
}

export function parseBaseScreenHostResourceDragData(
  payload: string,
): ScreenParseResult<BaseScreenHostResourceAuthoringIntent> {
  if (typeof payload !== 'string' || payload.length === 0) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Host resource drag payload must be nonempty JSON.',
    );
  }
  if (utf8ByteLength(payload) > BASE_SCREEN_HOST_RESOURCE_DRAG_MAX_BYTES) {
    return failure(
      'AUTHORING_LIMIT_EXCEEDED',
      'Host resource drag payload exceeds its byte limit.',
    );
  }
  try {
    return parseBaseScreenHostResourceAuthoringIntent(JSON.parse(payload));
  } catch {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Host resource drag payload is not valid JSON.');
  }
}

export function writeBaseScreenHostResourceDragData(
  dataTransfer: BaseScreenHostResourceDragDataTransfer,
  intent: BaseScreenHostResourceAuthoringIntent,
): ScreenParseResult<null> {
  const parsed = parseBaseScreenHostResourceAuthoringIntent(intent);
  if (!parsed.ok) return parsed;
  const payload = JSON.stringify(parsed.value);
  if (utf8ByteLength(payload) > BASE_SCREEN_HOST_RESOURCE_DRAG_MAX_BYTES) {
    return failure('AUTHORING_LIMIT_EXCEEDED', 'Host resource drag payload exceeds 8 KiB.');
  }
  try {
    dataTransfer.setData(BASE_SCREEN_HOST_RESOURCE_DRAG_MIME, payload);
    dataTransfer.effectAllowed = 'copy';
    return { ok: true, value: null, diagnostics: [] };
  } catch {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Host resource drag payload could not be written.');
  }
}

export function validateHostResourceMaterial(
  manifest: BaseScreenMaterialManifest | undefined,
  intent: BaseScreenHostResourceAuthoringIntent,
): ScreenParseResult<BaseScreenMaterialManifest> {
  if (
    manifest === undefined ||
    manifest.type !== intent.materialType ||
    manifest.libraryVisible === false
  ) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource material is not available in the configured catalog.',
      ['materialType'],
    );
  }
  if (!manifest.dataCapabilities.includes('host-resource')) {
    return failure(
      'AUTHORING_SOURCE_INVALID',
      'Host resource material does not declare the host-resource capability.',
      ['materialType'],
    );
  }
  return { ok: true, value: manifest, diagnostics: [] };
}

export function createHostResourceComponent(
  document: ScreenDocument,
  manifest: BaseScreenMaterialManifest,
  intent: BaseScreenHostResourceAuthoringIntent,
  position: ScreenPosition,
): ScreenComponentNode {
  return {
    id: nextComponentId(document, manifest.type),
    type: manifest.type,
    name: intent.name ?? manifest.name,
    parentId: null,
    position: clampPositionToCanvas(document, manifest, position),
    size: manifest.defaultSize,
    rotation: 0,
    zIndex:
      document.components.reduce((maximum, component) => Math.max(maximum, component.zIndex), -1) +
      1,
    status: { locked: false, hidden: false },
    props: manifest.defaultProps,
    style: manifest.defaultStyle,
    dataSource: intent.dataSource,
  };
}

export function centeredHostResourcePosition(
  document: ScreenDocument,
  manifest: BaseScreenMaterialManifest,
  center: ScreenPosition,
): ScreenPosition {
  return clampPositionToCanvas(document, manifest, {
    x: center.x - manifest.defaultSize.width / 2,
    y: center.y - manifest.defaultSize.height / 2,
  });
}

function clampPositionToCanvas(
  document: ScreenDocument,
  manifest: BaseScreenMaterialManifest,
  position: ScreenPosition,
): ScreenPosition {
  return {
    x: roundScreenGeometry(
      Math.max(
        0,
        Math.min(position.x, Math.max(0, document.canvas.width - manifest.defaultSize.width)),
      ),
    ),
    y: roundScreenGeometry(
      Math.max(
        0,
        Math.min(position.y, Math.max(0, document.canvas.height - manifest.defaultSize.height)),
      ),
    ),
  };
}

function nextComponentId(document: ScreenDocument, type: string): string {
  const base = type.replace(/[^A-Za-z0-9]+/g, '-');
  let index = document.components.length + 1;
  const ids = new Set(document.components.map((component) => component.id));
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function intentValidationDocument(input: Record<string, unknown>): unknown {
  return {
    canvas: { width: 1, height: 1, backgroundColor: '#000000' },
    components: [
      {
        id: 'host-resource-intent',
        type: input.materialType,
        name: input.name ?? 'Host resource',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: input.dataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

function containsForbiddenTransportData(value: unknown): boolean {
  if (typeof value === 'string') return FORBIDDEN_TRANSPORT_VALUE.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenTransportData);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_TRANSPORT_FIELD.test(key) || containsForbiddenTransportData(child),
  );
}

function isBoundedName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /\S/.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    [...value].length <= MAX_HOST_RESOURCE_NAME_CODE_POINTS
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function normalizeIntent(input: unknown): ScreenParseResult<ScreenJsonValue> {
  try {
    const parsed = parseScreenJsonValue(input, {
      maxBytes: BASE_SCREEN_HOST_RESOURCE_DRAG_MAX_BYTES,
      maxStringBytes: BASE_SCREEN_HOST_RESOURCE_DRAG_MAX_BYTES,
    });
    if (parsed.ok) return parsed;
    return parsed.diagnostics.some((diagnostic) => diagnostic.code === 'JSON_LIMIT_EXCEEDED')
      ? failure(
          'AUTHORING_LIMIT_EXCEEDED',
          'Host resource authoring intent exceeds its JSON limits.',
        )
      : failure('AUTHORING_PAYLOAD_INVALID', 'Host resource authoring intent is not JSON-safe.');
  } catch {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Host resource authoring intent is not JSON-safe.');
  }
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

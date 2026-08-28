import {
  jsonDepth,
  MAX_AUTHORING_CANDIDATE_BYTES,
  MAX_AUTHORING_COMPONENT_SNAPSHOT_BYTES,
  MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES,
  MAX_AUTHORING_JSON_DEPTH,
  MAX_AUTHORING_SOURCE_BYTES,
  parseScreenJsonValue,
  type ScreenAuthoringEditorContext,
  type ScreenBlueprintAuthoringContext,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialEventDescriptor,
  BaseScreenMaterialManifest,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';

export const DESIGNER_BLUEPRINT_CAPABILITIES = {
  materialEvent: 'blueprint.trigger.material-event',
  eventPayload: 'blueprint.value.event-payload',
  variable: 'blueprint.value.variable',
  condition: 'blueprint.condition.compare',
  setVariable: 'blueprint.action.set-variable',
  emitHostEvent: 'blueprint.action.emit-host-event',
  componentVisibility: 'blueprint.action.component-visibility',
} as const;

export interface ScreenAuthoringGuardInput {
  readonly requestId: string | undefined;
  readonly expectedRevision: string | null | undefined;
  readonly currentRevision: string | null | undefined;
  readonly componentId: string | undefined;
  readonly componentExists: boolean;
  readonly disposed: boolean;
}

export interface ScreenAuthoringContextInput {
  readonly instanceId: string;
  readonly requestId: string | undefined;
  readonly document: ScreenDocument | undefined;
  readonly documentRevision: string | undefined;
  readonly focusedComponentId: string | null;
  readonly manifest: BaseScreenMaterialManifest | undefined;
}

export interface ScreenBlueprintAuthoringContextInput {
  readonly document: ScreenDocument;
  readonly initialComponentId: string | null;
  readonly catalog: BaseScreenMaterialCatalog | undefined;
  readonly runtimeContributions: BaseScreenRuntimeContributionIndex | undefined;
}

export interface ScreenBlueprintAuthoringGuardInput {
  readonly requestId: string | undefined;
  readonly expectedRevision: string | null | undefined;
  readonly openedRevision: string | null | undefined;
  readonly currentRevision: string | null | undefined;
  readonly openedDocumentGeneration: number;
  readonly currentDocumentGeneration: number;
  readonly disposed: boolean;
}

export function createScreenAuthoringRequestId(): string {
  return `authoring-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createScreenAuthoringInstanceId(): string {
  return `designer-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function validateScreenAuthoringCommitGuards(
  input: ScreenAuthoringGuardInput,
): ScreenParseResult<null> {
  if (input.requestId === undefined || input.requestId.length === 0) {
    return authoringFailure('AUTHORING_REQUEST_INVALID', ['requestId'], 'Request id is missing.');
  }
  if (input.disposed) {
    return authoringFailure(
      'AUTHORING_EXPIRED',
      ['requestId'],
      'Designer is unloaded or disposed; the authoring session has expired.',
    );
  }
  if (input.expectedRevision !== input.currentRevision) {
    return authoringFailure(
      'AUTHORING_STALE_REVISION',
      ['documentRevision'],
      'Document revision is stale; the authoring session is no longer current.',
    );
  }
  if (input.componentId === undefined || !input.componentExists) {
    return authoringFailure(
      'AUTHORING_COMPONENT_MISSING',
      ['componentId'],
      'Component no longer exists in the document.',
    );
  }
  return { ok: true, value: null, diagnostics: [] };
}

export function validateScreenBlueprintAuthoringCommitGuards(
  input: ScreenBlueprintAuthoringGuardInput,
): ScreenParseResult<null> {
  if (input.requestId === undefined || input.requestId.length === 0) {
    return authoringFailure('AUTHORING_REQUEST_INVALID', ['requestId'], 'Request id is missing.');
  }
  if (input.disposed) {
    return authoringFailure(
      'AUTHORING_EXPIRED',
      ['requestId'],
      'Designer is unloaded or disposed; the authoring session has expired.',
    );
  }
  if (
    input.expectedRevision !== input.openedRevision ||
    input.openedRevision !== input.currentRevision
  ) {
    return authoringFailure(
      'AUTHORING_STALE_REVISION',
      ['documentRevision'],
      'Document revision changed after the Blueprint authoring session was opened.',
    );
  }
  if (input.openedDocumentGeneration !== input.currentDocumentGeneration) {
    return authoringFailure(
      'AUTHORING_STALE_REVISION',
      ['document'],
      'Document changed after the Blueprint authoring session was opened.',
    );
  }
  return { ok: true, value: null, diagnostics: [] };
}

export function buildScreenBlueprintAuthoringContext(
  input: ScreenBlueprintAuthoringContextInput,
): ScreenBlueprintAuthoringContext {
  const initialComponentId = input.document.components.some(
    (component) => component.id === input.initialComponentId,
  )
    ? input.initialComponentId
    : null;
  const materialTypes = [...new Set(input.document.components.map((component) => component.type))];
  const manifests = new Map<string, BaseScreenMaterialManifest | undefined>();
  const descriptors = new Map<string, readonly BaseScreenMaterialEventDescriptor[]>();
  const capabilityIds = new Set<string>(Object.values(DESIGNER_BLUEPRINT_CAPABILITIES));
  for (const rule of input.document.blueprint.rules) {
    for (const capability of rule.requiredCapabilities ?? []) capabilityIds.add(capability);
  }
  for (const materialType of materialTypes) {
    const manifest = input.catalog?.get(materialType)?.manifest;
    const events = manifest?.editorDescriptor?.events ?? [];
    manifests.set(materialType, manifest);
    descriptors.set(materialType, events);
    for (const event of events) {
      if (event.requiredCapability !== undefined) capabilityIds.add(event.requiredCapability);
    }
  }
  const capabilities: Record<string, boolean> = {};
  for (const capability of capabilityIds) {
    capabilities[capability] = hasBlueprintCapability(input.runtimeContributions, capability);
  }
  const materialEvents = materialTypes.map((materialType) => {
    const manifest = manifests.get(materialType);
    const byName = new Map(
      (descriptors.get(materialType) ?? []).map((descriptor) => [descriptor.name, descriptor]),
    );
    return {
      materialType,
      events: (manifest?.events ?? []).map((name) => {
        const descriptor = byName.get(name);
        const requiredCapability = descriptor?.requiredCapability;
        const blueprintAllowed =
          descriptor?.triggerContexts === undefined ||
          descriptor.triggerContexts.includes('blueprint');
        return {
          name,
          ...(descriptor?.label === undefined ? {} : { label: descriptor.label }),
          ...(descriptor?.hint === undefined ? {} : { hint: descriptor.hint }),
          ...(descriptor?.payloadSchema === undefined
            ? {}
            : { payloadSchema: descriptor.payloadSchema as unknown as ScreenJsonObject }),
          ...(descriptor?.maxPayloadBytes === undefined
            ? {}
            : { maxPayloadBytes: descriptor.maxPayloadBytes }),
          ...(requiredCapability === undefined ? {} : { requiredCapability }),
          available:
            blueprintAllowed &&
            capabilities[DESIGNER_BLUEPRINT_CAPABILITIES.materialEvent] === true &&
            (requiredCapability === undefined || capabilities[requiredCapability] === true),
        };
      }),
    };
  });
  return detachJson({
    document: input.document,
    initialComponentId,
    materialEvents,
    capabilities,
    limits: {
      maxDocumentBytes: MAX_AUTHORING_DOCUMENT_SNAPSHOT_BYTES,
      maxCandidateBytes: MAX_AUTHORING_CANDIDATE_BYTES,
      maxJsonDepth: MAX_AUTHORING_JSON_DEPTH,
    },
  });
}

export function buildScreenAuthoringEditorContext(
  input: ScreenAuthoringContextInput,
): ScreenAuthoringEditorContext {
  const component = input.document?.components.find((item) => item.id === input.focusedComponentId);
  const blueprint = input.document?.blueprint;
  return {
    instanceId: input.instanceId,
    requestId: input.requestId ?? '',
    componentId: component?.id ?? null,
    documentRevision: input.documentRevision ?? null,
    componentSnapshot: component === undefined ? null : (component as unknown as ScreenJsonObject),
    manifest: input.manifest === undefined ? null : (input.manifest as unknown as ScreenJsonObject),
    blueprint: blueprint === undefined ? null : (blueprint as unknown as ScreenJsonObject),
    limits: {
      maxSourceBytes: MAX_AUTHORING_SOURCE_BYTES,
      maxJsonDepth: MAX_AUTHORING_JSON_DEPTH,
      maxCandidateBytes: MAX_AUTHORING_COMPONENT_SNAPSHOT_BYTES,
    },
  };
}

export function parseScreenComponentTextSource(
  source: string,
  maxBytes: number,
): ScreenParseResult<ScreenJsonValue> {
  if (typeof source !== 'string') {
    return authoringFailure('AUTHORING_SOURCE_INVALID', ['source'], 'Source must be a string.');
  }
  if (byteLength(source) > maxBytes) {
    return authoringFailure(
      'AUTHORING_LIMIT_EXCEEDED',
      ['source'],
      'Source exceeds the authoring byte limit.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return authoringFailure(
      'AUTHORING_SOURCE_INVALID',
      ['source'],
      'Source is not valid JSON text.',
    );
  }
  const value = parseScreenJsonValue(parsed, { maxBytes: MAX_AUTHORING_COMPONENT_SNAPSHOT_BYTES });
  if (!value.ok) {
    return authoringFailure('AUTHORING_SOURCE_INVALID', ['source'], 'Source is not valid JSON.');
  }
  if (jsonDepth(value.value) > MAX_AUTHORING_JSON_DEPTH) {
    return authoringFailure(
      'AUTHORING_LIMIT_EXCEEDED',
      ['source'],
      'Source exceeds the JSON depth limit.',
    );
  }
  return { ok: true, value: value.value, diagnostics: [] };
}

export function parseScreenAuthoringBlueprintCandidate(
  blueprint: unknown,
  maxBytes: number,
): ScreenParseResult<ScreenJsonValue> {
  const value = parseScreenJsonValue(blueprint, { maxBytes });
  if (!value.ok) {
    return authoringFailure(
      'AUTHORING_PAYLOAD_INVALID',
      ['blueprint'],
      'Blueprint candidate is not valid JSON.',
    );
  }
  if (jsonDepth(value.value) > MAX_AUTHORING_JSON_DEPTH) {
    return authoringFailure(
      'AUTHORING_LIMIT_EXCEEDED',
      ['blueprint'],
      'Blueprint candidate exceeds the JSON depth limit.',
    );
  }
  return { ok: true, value: value.value, diagnostics: [] };
}

export function authoringDiagnostic(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenDiagnostic {
  return { severity: 'error', code, path, message };
}

function authoringFailure<T>(
  code: ScreenDiagnostic['code'],
  path: readonly (string | number)[],
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [authoringDiagnostic(code, path, message)] };
}

function byteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code >= 0xd800 && code <= 0xdfff ? 4 : 3;
  }
  return bytes;
}

function hasBlueprintCapability(
  runtimeContributions: BaseScreenRuntimeContributionIndex | undefined,
  capability: string,
): boolean {
  try {
    return runtimeContributions?.hasBlueprintCapability(capability) === true;
  } catch {
    return false;
  }
}

function detachJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

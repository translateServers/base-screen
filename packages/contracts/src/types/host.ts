import type { ScreenParseResult } from './diagnostics.js';
import type { ScreenDocument, ScreenHostResourceDataSource } from './document.js';
import type { ScreenProjectEnvelope } from './envelope.js';
import type { ScreenJsonValue } from './json.js';

export interface ScreenProjectLoadRequest {
  readonly projectId: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectSaveRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectPublishRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectAdapter {
  readonly capabilities: { readonly publish: boolean };
  load(request: ScreenProjectLoadRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  save(request: ScreenProjectSaveRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  publish?(request: ScreenProjectPublishRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
}

export interface ScreenDesignerHostCapabilities {
  readonly projectCatalog: boolean;
  readonly projectPreview: boolean;
  readonly projectSnapshots: boolean;
  readonly assets: boolean;
  readonly resources: boolean;
  readonly variables: boolean;
  readonly actions: boolean;
}

export interface ScreenDesignerHostAdapter {
  readonly capabilities: ScreenDesignerHostCapabilities;
  readonly projectCatalog?: ScreenProjectCatalogPort;
  readonly projectPreview?: ScreenProjectPreviewPort;
  readonly projectSnapshots?: ScreenProjectSnapshotPort;
  readonly assets?: ScreenAssetCatalogPort;
  readonly resources?: ScreenHostResourcePort;
  readonly variables?: ScreenHostVariablePort;
  readonly actions?: ScreenBlueprintHostActionPort;
}

export interface ScreenProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly description: string | null;
  readonly revision: string;
  readonly published: boolean;
}

export interface ScreenProjectCatalogRequest {
  readonly query: string;
  readonly published: boolean | undefined;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCreateRequest {
  readonly name: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCloneRequest {
  readonly projectId: string;
  readonly name: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectDeleteRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectImportRequest {
  readonly name: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectExportRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectCatalogPort {
  list(
    request: ScreenProjectCatalogRequest,
  ): Promise<ScreenParseResult<readonly ScreenProjectSummary[]>>;
  create(request: ScreenProjectCreateRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  clone(request: ScreenProjectCloneRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  delete(request: ScreenProjectDeleteRequest): Promise<ScreenParseResult<void>>;
  import(request: ScreenProjectImportRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  export(request: ScreenProjectExportRequest): Promise<ScreenParseResult<ScreenDocument>>;
}

export interface ScreenProjectPreviewRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly published: boolean;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectPreview {
  readonly label: string;
  readonly document: ScreenDocument;
}

export interface ScreenProjectPreviewPort {
  load(request: ScreenProjectPreviewRequest): Promise<ScreenParseResult<ScreenProjectPreview>>;
}

export interface ScreenProjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface ScreenProjectSnapshotCreateRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenProjectSnapshotPort {
  list(
    projectId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<readonly ScreenProjectSnapshot[]>>;
  create(
    request: ScreenProjectSnapshotCreateRequest,
  ): Promise<ScreenParseResult<ScreenProjectSnapshot>>;
  restore(
    projectId: string,
    snapshotId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  delete(
    projectId: string,
    snapshotId: string,
    signal: ScreenAbortSignal,
  ): Promise<ScreenParseResult<void>>;
}

export interface ScreenAssetSummary {
  readonly assetId: string;
  readonly name: string;
  readonly mediaType: string;
}

export interface ScreenAssetCatalogRequest {
  readonly query: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenAssetCatalogPort {
  list(
    request: ScreenAssetCatalogRequest,
  ): Promise<ScreenParseResult<readonly ScreenAssetSummary[]>>;
  canDelete(assetId: string, signal: ScreenAbortSignal): Promise<ScreenParseResult<boolean>>;
}

export interface ScreenHostResourceRequest {
  readonly componentId: string;
  readonly source: ScreenHostResourceDataSource;
}

export interface ScreenAbortSignal {
  readonly aborted: boolean;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
}

export interface ScreenHostResourceResolveOptions {
  readonly signal: ScreenAbortSignal;
}

export interface ScreenHostResourcePort {
  resolve(
    request: ScreenHostResourceRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>>;
}

export interface ScreenHostVariableRequest {
  readonly variableId: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenHostVariablePort {
  resolve(request: ScreenHostVariableRequest): Promise<ScreenParseResult<ScreenJsonValue>>;
}

export interface ScreenBlueprintHostEvent {
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintRuntimePort {
  emit(event: ScreenBlueprintHostEvent): void | Promise<void>;
}

export interface ScreenBlueprintHostActionPort {
  execute(action: ScreenBlueprintHostEvent): void | Promise<void>;
}

export function validateScreenDesignerHostAdapter(
  input: unknown,
): ScreenParseResult<ScreenDesignerHostAdapter> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalidDesignerHostAdapter('Designer host adapter must be an object.');
  }
  const adapter = input as Record<string, unknown>;
  const capabilities = adapter.capabilities;
  if (capabilities === null || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    return invalidDesignerHostAdapter('Designer host capabilities must be an object.');
  }
  const capabilityRecord = capabilities as Record<string, unknown>;
  const checks = [
    ['projectCatalog', 'projectCatalog', ['list', 'create', 'clone', 'delete', 'import', 'export']],
    ['projectPreview', 'projectPreview', ['load']],
    ['projectSnapshots', 'projectSnapshots', ['list', 'create', 'restore', 'delete']],
    ['assets', 'assets', ['list', 'canDelete']],
    ['resources', 'resources', ['resolve']],
    ['variables', 'variables', ['resolve']],
    ['actions', 'actions', ['execute']],
  ] as const;
  for (const [capability, port, methods] of checks) {
    if (typeof capabilityRecord[capability] !== 'boolean') {
      return invalidDesignerHostAdapter(
        `Designer host capability "${capability}" must be boolean.`,
      );
    }
    const portValue = adapter[port];
    const hasValidPort =
      portValue !== null &&
      typeof portValue === 'object' &&
      methods.every(
        (method) => typeof (portValue as Record<string, unknown>)[method] === 'function',
      );
    if (
      (capabilityRecord[capability] === true && !hasValidPort) ||
      (capabilityRecord[capability] === false && portValue !== undefined)
    ) {
      return invalidDesignerHostAdapter(
        `Designer host capability "${capability}" does not match its port.`,
      );
    }
  }
  return { ok: true, value: adapter as unknown as ScreenDesignerHostAdapter, diagnostics: [] };
}

function invalidDesignerHostAdapter(message: string): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [{ severity: 'error', code: 'PROJECT_ADAPTER_INVALID', path: [], message }],
  };
}

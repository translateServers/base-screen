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

export interface ScreenBlueprintHostEvent {
  readonly name: string;
  readonly payload: ScreenJsonValue;
}

export interface ScreenBlueprintRuntimePort {
  emit(event: ScreenBlueprintHostEvent): void | Promise<void>;
}

import type {
  ScreenDatasetField,
  ScreenDatasetValueType,
  ScreenTabularDataset,
} from './dataset.js';
import type { ScreenParseResult } from './diagnostics.js';
import type { ScreenAbortSignal, ScreenHostResourceResolveOptions } from './host.js';
import type { ScreenJsonObject } from './json.js';

export interface ScreenDatasetGroup {
  readonly id: string;
  readonly name: string;
}

export interface ScreenDatasetEntry {
  readonly datasetId: string;
  readonly name: string;
  readonly description: string | null;
  readonly groupId?: string;
}

export interface ScreenDatasetEntries {
  readonly items: readonly ScreenDatasetEntry[];
  readonly nextCursor?: string;
}

export type ScreenDatasetParameterValue = string | number | boolean;

/** Parameters belong to a concrete immutable dataset definition. */
export interface ScreenDatasetParameterDefinition {
  readonly name: string;
  readonly label: string;
  readonly valueType: ScreenDatasetValueType;
  readonly required: boolean;
  readonly defaultValue?: ScreenDatasetParameterValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly allowedValues?: readonly ScreenDatasetParameterValue[];
}

export interface ScreenDatasetDefinition extends ScreenDatasetEntry {
  readonly fields: readonly ScreenDatasetField[];
  readonly parameters: readonly ScreenDatasetParameterDefinition[];
}

export interface ScreenDatasetListRequest {
  readonly query: string;
  readonly groupId?: string;
  readonly cursor?: string;
  readonly limit: number;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenDatasetDescribeRequest {
  readonly datasetId: string;
  readonly signal: ScreenAbortSignal;
}

export interface ScreenDatasetQueryRequest {
  readonly datasetId: string;
  readonly componentId: string;
  readonly params: ScreenJsonObject;
}

/** Dataset access is distinct from arbitrary host resources. */
export interface ScreenHostDatasetPort {
  /** Explicit opt-in to identical in-flight queries sharing within one instance. */
  readonly queryScope?: 'dataset';
  groups?(request: {
    readonly signal: ScreenAbortSignal;
  }): Promise<ScreenParseResult<readonly ScreenDatasetGroup[]>>;
  list(request: ScreenDatasetListRequest): Promise<ScreenParseResult<ScreenDatasetEntries>>;
  describe(
    request: ScreenDatasetDescribeRequest,
  ): Promise<ScreenParseResult<ScreenDatasetDefinition>>;
  query(
    request: ScreenDatasetQueryRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenTabularDataset>>;
}

export function isScreenHostDatasetPort(input: unknown): input is ScreenHostDatasetPort {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return (
    ['list', 'describe', 'query'].every((name) => typeof value[name] === 'function') &&
    (value.groups === undefined || typeof value.groups === 'function') &&
    (value.queryScope === undefined || value.queryScope === 'dataset')
  );
}

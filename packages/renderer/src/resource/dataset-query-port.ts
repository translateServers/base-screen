import {
  evaluateScreenDatasetParameters,
  parseScreenDatasetDefinition,
  parseScreenTabularDataset,
  type ScreenDatasetDefinition,
  type ScreenHostDatasetPort,
  type ScreenHostResourcePort,
  type ScreenHostResourceRequest,
  type ScreenHostResourceResolveOptions,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { canonicalJsonString } from '../canonical-json.js';

// Invalid as a public host-resource type; only dataset candidates may produce it.
export const DATASET_QUERY_KIND = '#dataset';

/** Reuse the instance coordinator for metadata + query under one deadline. */
export class DatasetQueryPort implements ScreenHostResourcePort {
  #definitions = new Map<string, ScreenDatasetDefinition>();
  #generation = 0;

  constructor(
    private readonly resources: ScreenHostResourcePort | undefined,
    private readonly datasets: ScreenHostDatasetPort | undefined,
  ) {}

  clear(): void {
    this.#generation++;
    this.#definitions.clear();
  }

  resolve(
    request: ScreenHostResourceRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    if (request.resourceType !== DATASET_QUERY_KIND) {
      return this.resources?.resolve(request, options) ?? Promise.resolve(unavailable());
    }
    return this.resolveDataset(request, options);
  }

  private async resolveDataset(
    request: ScreenHostResourceRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    if (this.datasets === undefined) return unavailable();
    const generation = this.#generation;
    const active = () => !options.signal.aborted && generation === this.#generation;
    if (!active()) return cancelled();
    let definition = this.#definitions.get(request.resourceId);
    if (definition === undefined) {
      const response = await this.datasets.describe({
        datasetId: request.resourceId,
        signal: options.signal,
      });
      if (!active()) return cancelled();
      if (!response.ok) return response;
      const parsed = parseScreenDatasetDefinition(response.value);
      if (!parsed.ok) return parsed;
      if (parsed.value.datasetId !== request.resourceId) return invalid();
      definition = parsed.value;
      if (this.#definitions.size >= 32)
        this.#definitions.delete(this.#definitions.keys().next().value!);
      this.#definitions.set(request.resourceId, definition);
    }
    const params = evaluateScreenDatasetParameters(definition.parameters, request.params);
    if (!params.ok) return params;
    if (!active()) return cancelled();
    const response = await this.datasets.query(
      { datasetId: request.resourceId, dataSourceId: request.dataSourceId, params: params.value },
      options,
    );
    if (!active()) return cancelled();
    if (!response.ok) return response;
    const result = parseScreenTabularDataset(response.value);
    if (!result.ok) return result;
    if (
      canonicalJsonString(result.value.fields as unknown as ScreenJsonValue) !==
      canonicalJsonString(definition.fields as unknown as ScreenJsonValue)
    )
      return invalid();
    return { ok: true, value: result.value as unknown as ScreenJsonValue, diagnostics: [] };
  }
}

function unavailable(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_RESOURCE_UNAVAILABLE',
        path: [],
        message: 'Dataset port is unavailable.',
      },
    ],
  };
}

function invalid(): ScreenParseResult<never> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'HOST_DATASET_INVALID',
        path: [],
        message: 'Dataset definition does not match its result.',
      },
    ],
  };
}

function cancelled(): ScreenParseResult<never> {
  return { ok: false, diagnostics: [] };
}

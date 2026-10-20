import {
  evaluateScreenDatasetParameters,
  parseScreenDatasetDefinition,
  parseScreenTabularDataset,
  type ScreenDataSourceSource,
  type ScreenDatasetDefinition,
  type ScreenHostCatalogPort,
  type ScreenHostDatasetPort,
  type ScreenHostResourcePort,
  type ScreenHostResourceResolveOptions,
  type ScreenJsonObject,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { canonicalJsonString } from '../canonical-json.js';

/**
 * 数据源请求在协调器侧的共享范围标记（都不是合法的宿主资源类型）。
 *
 * 共享范围由来源决定：数据集端口声明 `queryScope:'dataset'` 才共享；宿主资源按贡献
 * 声明的 `queryScope:'resource'`；目录类来源恒不共享。
 */
export const SOURCE_SHARE_DATASET = '#source-dataset';
export const SOURCE_SHARE_RESOURCE = '#source-resource';
/** 目录类来源（`host-catalog` / `url-query`）与未声明共享的请求。 */
export const SOURCE_QUERY_KIND = '#source';

export function shareScopeOf(source: ScreenDataSourceSource): string {
  if (source.kind === 'dataset') return SOURCE_SHARE_DATASET;
  if (source.kind === 'host-resource') return SOURCE_SHARE_RESOURCE;
  return SOURCE_QUERY_KIND;
}

/**
 * 一次按实例的取数请求。
 *
 * 请求身份是数据源实例（`dataSourceId`），不是组件；`source` 让端口按来源分派，不用把
 * 来源枚举塞进宿主契约（D1）。
 */
export interface SourceQueryRequest {
  readonly dataSourceId: string;
  readonly source: ScreenDataSourceSource;
  readonly params: ScreenJsonObject;
}

/**
 * 三种来源 ↔ 三个端口的唯一分派点。
 *
 * 数据集走「describe → 参数求值 → query → 校验字段」，其余两种直接交给宿主：
 * `host-resource` 用资源端口，`host-catalog`/`url-query` 用来源目录端口（§1.1）。
 */
export class SourceQueryPort {
  #definitions = new Map<string, ScreenDatasetDefinition>();
  #generation = 0;

  constructor(
    private readonly resources: ScreenHostResourcePort | undefined,
    private readonly datasets: ScreenHostDatasetPort | undefined,
    private readonly hostCatalog: ScreenHostCatalogPort | undefined,
  ) {}

  clear(): void {
    this.#generation++;
    this.#definitions.clear();
  }

  /** 该来源当前是否有端口可用（缺端口时实例直接进 unavailable 状态）。 */
  accepts(source: ScreenDataSourceSource): boolean {
    switch (source.kind) {
      case 'dataset':
        return this.datasets !== undefined;
      case 'host-resource':
        return this.resources !== undefined;
      default:
        return this.hostCatalog !== undefined;
    }
  }

  query(
    request: SourceQueryRequest,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    switch (request.source.kind) {
      case 'dataset':
        return this.queryDataset(request, request.source.datasetId, options);
      case 'host-resource':
        return (
          this.resources?.resolve(
            {
              dataSourceId: request.dataSourceId,
              resourceType: request.source.resourceType,
              resourceId: request.source.resourceId,
              params: request.params,
            },
            options,
          ) ?? Promise.resolve(unavailable())
        );
      default:
        return (
          this.hostCatalog?.resolve({
            sourceId: request.source.sourceId,
            params: request.params,
            purpose: 'runtime',
            signal: options.signal,
          }) ?? Promise.resolve(unavailable())
        );
    }
  }

  private async queryDataset(
    request: SourceQueryRequest,
    datasetId: string,
    options: ScreenHostResourceResolveOptions,
  ): Promise<ScreenParseResult<ScreenJsonValue>> {
    if (this.datasets === undefined) return unavailable();
    const generation = this.#generation;
    const active = () => !options.signal.aborted && generation === this.#generation;
    if (!active()) return cancelled();
    let definition = this.#definitions.get(datasetId);
    if (definition === undefined) {
      const response = await this.datasets.describe({ datasetId, signal: options.signal });
      if (!active()) return cancelled();
      if (!response.ok) return response;
      const parsed = parseScreenDatasetDefinition(response.value);
      if (!parsed.ok) return parsed;
      if (parsed.value.datasetId !== datasetId) return invalid();
      definition = parsed.value;
      if (this.#definitions.size >= 32) {
        this.#definitions.delete(this.#definitions.keys().next().value!);
      }
      this.#definitions.set(datasetId, definition);
    }
    const params = evaluateScreenDatasetParameters(definition.parameters, request.params);
    if (!params.ok) return params;
    if (!active()) return cancelled();
    const response = await this.datasets.query(
      { datasetId, dataSourceId: request.dataSourceId, params: params.value },
      options,
    );
    if (!active()) return cancelled();
    if (!response.ok) return response;
    const result = parseScreenTabularDataset(response.value);
    if (!result.ok) return result;
    if (
      canonicalJsonString(result.value.fields as unknown as ScreenJsonValue) !==
      canonicalJsonString(definition.fields as unknown as ScreenJsonValue)
    ) {
      return invalid();
    }
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
        message: 'Host resource port is unavailable.',
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

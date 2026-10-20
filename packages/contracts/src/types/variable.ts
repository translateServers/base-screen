import type { ScreenDatasetParameterDefinition } from './dataset-port.js';

/**
 * 来源目录项：宿主命名空间内的一个可取值的来源（host-catalog / url-query 共用）。
 */
export interface ScreenHostCatalogSummary {
  readonly sourceId: string;
  readonly name: string;
  readonly description: string | null;
}

/**
 * 来源目录项的详情。参数形状与数据集参数一致（复用 `ScreenDatasetParameterDefinition`），
 * 因此「目录项」与「数据集」在文档级实例上完全同构。
 */
export interface ScreenHostCatalogDescriptor extends ScreenHostCatalogSummary {
  /** 该目录项可接受的参数；无参来源为空数组。 */
  readonly parameters: readonly ScreenDatasetParameterDefinition[];
  /** 宿主声明该来源只读（D5 的第二个只读来源）。 */
  readonly readOnly?: boolean;
  readonly previewable: boolean;
}

export interface ScreenHostCatalogPage {
  readonly items: readonly ScreenHostCatalogSummary[];
  readonly nextCursor?: string;
}

export interface ScreenVariableRefreshOptions {
  /** Omission refreshes every dynamic variable in the current document. */
  readonly variableIds?: readonly string[];
  readonly traceId?: string;
}

export interface ScreenVariableHandle {
  readonly id: string;
  readonly value: import('./json.js').ScreenJsonValue;
  set(
    value: import('./json.js').ScreenJsonValue,
  ): import('./diagnostics.js').ScreenParseResult<null>;
  onChange(listener: (value: import('./json.js').ScreenJsonValue) => void): () => void;
}

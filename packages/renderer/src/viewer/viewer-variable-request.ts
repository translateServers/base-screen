import {
  readScreenDocumentDataSources,
  readScreenVariableRecord,
  type ScreenDataSource,
  type ScreenDataSourceSource,
  type ScreenDocument,
  type ScreenHostCatalogResolveRequest,
  type ScreenVariableEntry,
} from '@base-screen/contracts';

/**
 * 变量条目的宿主解析入参。
 *
 * 文档 `variables` 是过渡容器（旧三形态 + 单形态记录），条目本身只声明「值取自哪个数据源
 * 实例的输出」；发给宿主的 `sourceId` 由「条目 → 取值引用 → 文档级实例」读出。本模块只做
 * 读，不改写文档，也不缓存派生结果。
 *
 * 本轮（T02a）参数位仍为空：实例参数求值属 T02c 的 `DataSourceRuntime`。
 */

/** 变量条目的值是否取自某个数据源实例的输出（= 需要向来源目录解析）。 */
export function isHostResolvedVariable(entry: ScreenVariableEntry): boolean {
  return readScreenVariableRecord(entry).value.kind === 'data-source-field';
}

/** 读文档里所有需要向来源目录解析的变量条目。 */
export function hostResolvedVariables(document: ScreenDocument): readonly ScreenVariableEntry[] {
  return document.variables.filter((entry) => isHostResolvedVariable(entry));
}

/** 构造来源目录解析请求；条目的值不是数据源输出时返回 `undefined`。 */
export function readHostCatalogResolveRequest(
  document: ScreenDocument,
  entry: ScreenVariableEntry,
  purpose: ScreenHostCatalogResolveRequest['purpose'],
  signal: ScreenHostCatalogResolveRequest['signal'],
): ScreenHostCatalogResolveRequest | undefined {
  const ref = readScreenVariableRecord(entry).value;
  if (ref.kind !== 'data-source-field') return undefined;
  const instance = readDataSourceInstance(document, ref.dataSourceId);
  if (instance === undefined) return undefined;
  return {
    sourceId: readSourceIdentifier(instance.source),
    params: {},
    purpose,
    signal,
  };
}

function readDataSourceInstance(
  document: ScreenDocument,
  dataSourceId: string,
): ScreenDataSource | undefined {
  return readScreenDocumentDataSources(document).find((instance) => instance.id === dataSourceId);
}

function readSourceIdentifier(source: ScreenDataSourceSource): string {
  switch (source.kind) {
    case 'dataset':
      return source.datasetId;
    case 'host-resource':
      return source.resourceId;
    default:
      return source.sourceId;
  }
}

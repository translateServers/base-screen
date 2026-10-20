import {
  readScreenDocumentDataSources,
  readScreenVariableRecord,
  type ScreenDataSource,
  type ScreenDataSourceSource,
  type ScreenDocument,
  type ScreenHostVariableRequest,
  type ScreenVariableEntry,
} from '@base-screen/contracts';

/**
 * 变量条目的宿主解析入参（旧变量端口的形状）。
 *
 * 文档 `variables` 现在是过渡容器（旧三形态 + 单形态记录），条目本身不再携带
 * `sourceId`/`controlled` 之外的来源信息；运行时所需的来源标识由「条目 → 取值引用 →
 * 文档级数据源实例」读出。本模块只做读，不改写文档，也不缓存派生结果。
 */

/** 变量条目的值是否取自某个数据源实例的输出（= 需要向宿主解析）。 */
export function isHostResolvedVariable(entry: ScreenVariableEntry): boolean {
  return readScreenVariableRecord(entry).value.kind === 'data-source-field';
}

/** 读文档里所有需要向宿主解析的变量条目。 */
export function hostResolvedVariables(document: ScreenDocument): readonly ScreenVariableEntry[] {
  return document.variables.filter((entry) => isHostResolvedVariable(entry));
}

/**
 * 构造旧变量端口的解析请求；条目的值不是数据源输出时返回 `undefined`。
 */
export function readHostVariableRequest(
  document: ScreenDocument,
  entry: ScreenVariableEntry,
  purpose: ScreenHostVariableRequest['purpose'],
  signal: ScreenHostVariableRequest['signal'],
): ScreenHostVariableRequest | undefined {
  const record = readScreenVariableRecord(entry);
  const ref = record.value;
  if (ref.kind !== 'data-source-field') return undefined;
  const instance = readDataSourceInstance(document, ref.dataSourceId);
  const source = instance?.source;
  if (source === undefined) return undefined;
  const autoUpdate = readAutoUpdate(instance);
  return {
    variableId: record.id,
    sourceId: readSourceIdentifier(source),
    sourceType: source.kind === 'url-query' ? 'url-query' : 'data-source',
    initialValue: record.initialValue,
    controlled: record.controlled,
    ...(instance?.processorId === undefined ? {} : { processorId: instance.processorId }),
    ...(autoUpdate === undefined ? {} : { autoUpdate }),
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

function readAutoUpdate(
  instance: ScreenDataSource | undefined,
): { readonly intervalSeconds: number } | undefined {
  const policy = instance?.updatePolicy;
  if (policy?.mode !== 'auto') return undefined;
  const intervalSeconds = policy.intervalSeconds;
  return intervalSeconds === undefined ? undefined : { intervalSeconds };
}

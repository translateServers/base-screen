import {
  readScreenDocumentDataSources,
  type ScreenDocument,
  type ScreenValueRef,
} from '@base-screen/contracts';
import type { DesignerDataSourceInstanceView } from '../../dom/dataset/designer-dataset-types.js';

/**
 * 组件引用实例的只读视图 —— 实例级字段只读的**唯一**判据来源。
 *
 * 三态（R-4）：`document`（文档里真有）/ `pending`（草稿实例，等应用）/ `missing`（悬空）。
 * `pending` 与 `missing` 必须分开：草稿实例的 id 与将要落库的 id **相同**，`data-instance-id`
 * 等值校验会通过，但那个 id 在文档里还不存在——**等值只证明"我要用它"，不证明"它已存在"**。
 *
 * 存在性只读文档（同步）：`readScreenDocumentDataSources()` 会把旧形态组件合成派生实例，
 * 所以旧文档的引用同样命中。**禁止**用 `describe()` 判存在性（异步；宿主没接端口时永远无解）。
 */
export function readDesignerDataSourceInstanceView(
  document: ScreenDocument | undefined,
  dataValue: ScreenValueRef | null,
): DesignerDataSourceInstanceView | undefined {
  if (dataValue === null || dataValue.kind !== 'data-source-field') return undefined;
  const id = dataValue.dataSourceId;
  const instance = readScreenDocumentDataSources(document ?? emptyDocument()).find(
    (candidate) => candidate.id === id,
  );
  if (instance === undefined) {
    return {
      id,
      name: id,
      sourceKind: undefined,
      updatePolicy: undefined,
      processorId: undefined,
      status: 'missing',
    };
  }
  return {
    id: instance.id,
    name: instance.name,
    sourceKind: instance.source.kind,
    updatePolicy: instance.updatePolicy,
    processorId: instance.processorId,
    status: 'document',
  };
}

/** 同数据集的文档级实例（共享实例选择器的唯一数据源；不把派生实例当成可复用对象）。 */
export function readDesignerDatasetInstances(
  document: ScreenDocument | undefined,
  datasetId: string,
): readonly DesignerDataSourceInstanceView[] {
  return (document?.dataSources ?? [])
    .filter(
      (instance) => instance.source.kind === 'dataset' && instance.source.datasetId === datasetId,
    )
    .map((instance) => ({
      id: instance.id,
      name: instance.name,
      sourceKind: instance.source.kind,
      updatePolicy: instance.updatePolicy,
      processorId: instance.processorId,
      status: 'document' as const,
    }));
}

/** 文档缺失时的空壳：只为让 `find` 走同一条路径，不制造第二种分支。 */
function emptyDocument(): ScreenDocument {
  return {
    canvas: { width: 0, height: 0, backgroundColor: 'transparent' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

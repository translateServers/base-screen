import {
  readScreenDocumentDataSources,
  readScreenVariableRecord,
  type ScreenDataSource,
  type ScreenDataSourceSource,
  type ScreenDocument,
  type ScreenJsonValue,
  type ScreenUpdatePolicy,
  type ScreenValueRef,
  type ScreenVariable,
  type ScreenVariableEntry,
} from '@base-screen/contracts';

/**
 * 变量面板的只读视图。
 *
 * 变量面板今天按「静态值 / 数据源请求 / URL 查询条件」三桶分组并逐行展示，桶与行字段都
 * 来自旧三形态；变量的单形态记录（`ScreenVariableRecord`）没有 `type` / `sourceId`，
 * 因此面板先经本模块把任意条目读成一份与旧三形态同形的视图：
 * - 值固定（`value.kind === 'inline'`）→ 归入静态值桶；
 * - 值取自某个数据源实例的输出 → 按该实例的来源归入数据源 / URL 查询条件桶。
 *
 * 本模块只做读：不构造可写文档，`sourceId` 由 `readScreenDocumentDataSources` 读出的
 * 实例派生。视图里的 `type` 只是面板分桶用的既有词法，不是新的领域概念。
 */
export interface DesignerVariableView {
  readonly id: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly initialValue: ScreenJsonValue;
  /** 面板分桶词法：静态值 / 数据源请求 / URL 查询条件。 */
  readonly type: ScreenVariable['type'];
  /** 取值引用的 kind；`undefined` = 条目仍是旧三形态（面板沿用三桶文案）。 */
  readonly valueRefKind: ScreenValueRef['kind'] | undefined;
  /** 来源标识（数据集 id、资源 id、目录项 id）；静态值桶为空串。 */
  readonly sourceId: string;
  readonly processorId: string | undefined;
  readonly controlled: boolean;
  readonly autoUpdate: { readonly intervalSeconds: number } | undefined;
}

/** 读单个变量条目在面板中的视图。 */
export function readDesignerVariableView(
  document: ScreenDocument | undefined,
  entry: ScreenVariableEntry,
): DesignerVariableView {
  return viewOf(entry, instanceIndexOf(document));
}

/** 读整份文档的变量视图，顺序与文档 `variables` 一致。 */
export function readDesignerVariableViews(
  document: ScreenDocument | undefined,
): readonly DesignerVariableView[] {
  const entries = document?.variables ?? [];
  if (entries.length === 0) return [];
  const instances = instanceIndexOf(document);
  return entries.map((entry) => viewOf(entry, instances));
}

function viewOf(
  entry: ScreenVariableEntry,
  instances: ReadonlyMap<string, ScreenDataSource>,
): DesignerVariableView {
  if ('type' in entry) {
    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      initialValue: entry.initialValue,
      type: entry.type,
      valueRefKind: undefined,
      sourceId: entry.type === 'static' ? '' : entry.sourceId,
      processorId: entry.type === 'static' ? undefined : entry.processorId,
      controlled: entry.type === 'static' ? false : entry.controlled,
      autoUpdate: entry.type === 'data-source' ? entry.autoUpdate : undefined,
    };
  }
  const record = readScreenVariableRecord(entry);
  const ref = record.value;
  if (ref.kind !== 'data-source-field') {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      initialValue: record.initialValue,
      type: 'static',
      valueRefKind: ref.kind,
      sourceId: '',
      processorId: undefined,
      controlled: record.controlled,
      autoUpdate: undefined,
    };
  }
  const instance = instances.get(ref.dataSourceId);
  const source = instance?.source;
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    initialValue: record.initialValue,
    type: source?.kind === 'url-query' ? 'url-query' : 'data-source',
    valueRefKind: ref.kind,
    sourceId: source === undefined ? '' : readSourceIdentifier(source),
    processorId: instance?.processorId,
    controlled: record.controlled,
    autoUpdate: readAutoUpdate(instance?.updatePolicy),
  };
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
  policy: ScreenUpdatePolicy | undefined,
): { readonly intervalSeconds: number } | undefined {
  if (policy?.mode !== 'auto') return undefined;
  const intervalSeconds = policy.intervalSeconds;
  return intervalSeconds === undefined ? undefined : { intervalSeconds };
}

/** 文档级实例索引：让每个变量条目只做一次「引用 → 实例」查找。 */
function instanceIndexOf(
  document: ScreenDocument | undefined,
): ReadonlyMap<string, ScreenDataSource> {
  const index = new Map<string, ScreenDataSource>();
  if (document === undefined) return index;
  for (const instance of readScreenDocumentDataSources(document)) {
    index.set(instance.id, instance);
  }
  return index;
}

import type {
  ScreenComponentDataSource,
  ScreenComponentNode,
  ScreenDataBinding,
  ScreenDataSource,
  ScreenDocument,
  ScreenHostResourceParameter,
  ScreenValueRef,
  ScreenVariableEntry,
  ScreenVariableRecord,
} from '../types/document.js';

/**
 * 读取适配窗口：全仓唯一知道「组件旧 `dataSource` 四形态」与「变量旧三形态」的地方。
 *
 * 规则（过渡期硬约束）：
 * - 只做读：不接受、不返回、不生成可写文档；旧的→新的唯一转换路径是 `migrateScreenDocument`。
 * - 新字段优先：`dataValue` / `dataBinding` / 变量单形态记录存在时原样返回。
 * - 旧形态就地推导只读视图：组件旧数据源推导出等价的 `ScreenValueRef`，并合成一个
 *   只存在于本次调用结果里的实例视图（id 由所在组件/变量 id 派生，确定性、不含随机数）。
 *   合成视图的 id 与迁移器分配的可读 id 不同：视图只服务于「当前文档怎么读」，不改变文档。
 */

const DERIVED_ID_PREFIX = 'data-source-';
const MAX_COMPONENT_ID_LENGTH = 128;

/** 派生实例 id：`data-source-<ownerId>`，超长时截断到组件 id 词法上限。 */
function derivedDataSourceId(ownerId: string): string {
  const candidate = `${DERIVED_ID_PREFIX}${ownerId}`;
  return candidate.length <= MAX_COMPONENT_ID_LENGTH
    ? candidate
    : candidate.slice(0, MAX_COMPONENT_ID_LENGTH);
}

/**
 * 读一个组件实际使用的取值引用：新字段优先，缺失时从旧 `dataSource` 推导等价引用。
 *
 * @param component 文档中的组件节点（可能来自旧形态文档）。
 * @returns 等价取值引用；`null` 表示该组件不取值。
 */
export function readScreenComponentValueRef(component: ScreenComponentNode): ScreenValueRef | null {
  if (component.dataValue !== undefined) return component.dataValue;
  return deriveValueRefOfComponentSource(component);
}

/**
 * 读一个组件实际使用的字段映射：`dataBinding` 优先，缺失时回落到旧 `dataSource.binding`。
 *
 * @param component 文档中的组件节点（可能来自旧形态文档）。
 * @returns 字段映射；`null` 表示未做字段映射。
 */
export function readScreenComponentDataBinding(
  component: ScreenComponentNode,
): ScreenDataBinding | null {
  if (component.dataBinding !== undefined) return component.dataBinding;
  const source = component.dataSource;
  if (source === null) return null;
  return source.binding ?? null;
}

function deriveValueRefOfComponentSource(component: ScreenComponentNode): ScreenValueRef | null {
  const source: ScreenComponentDataSource | null = component.dataSource;
  if (source === null) return null;
  switch (source.type) {
    case 'static':
      return { kind: 'inline', value: source.value };
    case 'variable':
      return { kind: 'variable', variableId: source.variableId };
    default:
      return {
        kind: 'data-source-field',
        dataSourceId: derivedDataSourceId(component.id),
        path: [],
      };
  }
}

/**
 * 读一份文档实际生效的数据源实例集合：已声明的 `dataSources` 在前，旧形态（组件
 * `dataset`/`host-resource`、变量 `data-source`/`url-query`）合成的只读实例视图在后。
 *
 * 合成视图只为「当前文档已声明但还没有文档级实例」的旧写法补位：调用方无需再区分
 * 旧形态，也无需自己拼实例。同一 owner 只会合成一次，顺序确定。
 */
export function readScreenDocumentDataSources(
  document: ScreenDocument,
): readonly ScreenDataSource[] {
  const declared = document.dataSources ?? [];
  const known = new Set(declared.map((instance) => instance.id));
  const derived: ScreenDataSource[] = [];
  for (const component of document.components) {
    if (component.dataValue !== undefined) continue;
    const source = component.dataSource;
    if (source === null) continue;
    if (source.type !== 'dataset' && source.type !== 'host-resource') continue;
    const id = derivedDataSourceId(component.id);
    if (known.has(id)) continue;
    known.add(id);
    derived.push(
      source.type === 'dataset'
        ? {
            id,
            name: source.datasetId,
            source: { kind: 'dataset', datasetId: source.datasetId },
            params: readSourceParams(source.params),
          }
        : {
            id,
            name: source.resourceId,
            source: {
              kind: 'host-resource',
              resourceType: source.resourceType,
              resourceId: source.resourceId,
            },
            params: readSourceParams(source.params),
          },
    );
  }
  for (const entry of document.variables) {
    if (!('type' in entry)) continue;
    if (entry.type !== 'data-source' && entry.type !== 'url-query') continue;
    const id = derivedDataSourceId(entry.id);
    if (known.has(id)) continue;
    known.add(id);
    const base = {
      id,
      name: entry.name,
      source:
        entry.type === 'url-query'
          ? { kind: 'url-query' as const, sourceId: entry.sourceId }
          : { kind: 'host-catalog' as const, sourceId: entry.sourceId },
      params: {},
      updatePolicy:
        entry.type === 'data-source' && entry.autoUpdate !== undefined
          ? { mode: 'auto' as const, intervalSeconds: entry.autoUpdate.intervalSeconds }
          : { mode: 'manual' as const },
    };
    derived.push(
      entry.processorId === undefined ? base : { ...base, processorId: entry.processorId },
    );
  }
  return derived.length === 0 ? declared : [...declared, ...derived];
}

function readSourceParams(
  params: Readonly<Record<string, ScreenHostResourceParameter>>,
): Readonly<Record<string, ScreenValueRef>> {
  const read: Record<string, ScreenValueRef> = {};
  for (const [name, parameter] of Object.entries(params)) {
    read[name] =
      parameter.kind === 'literal'
        ? { kind: 'inline', value: parameter.value }
        : { kind: 'variable', variableId: parameter.variableId };
  }
  return read;
}

/**
 * 读一个变量条目的单形态视图：单形态记录原样返回，旧三形态推导出等价记录。
 *
 * 旧 `static` 变量等价于「值固定、不接受外部写入」；旧 `data-source`/`url-query` 变量
 * 等价于「值取自一个数据源实例」，实例 id 与 `readScreenDocumentDataSources` 合成的
 * 视图 id 一致，因此两处读出的结果自洽。
 */
export function readScreenVariableRecord(entry: ScreenVariableEntry): ScreenVariableRecord {
  if (!('type' in entry)) return entry;
  const withDescription = entry.description === undefined ? {} : { description: entry.description };
  switch (entry.type) {
    case 'static':
      return {
        id: entry.id,
        name: entry.name,
        ...withDescription,
        initialValue: entry.initialValue,
        value: { kind: 'inline', value: entry.initialValue },
        controlled: false,
      };
    default:
      return {
        id: entry.id,
        name: entry.name,
        ...withDescription,
        initialValue: entry.initialValue,
        value: {
          kind: 'data-source-field',
          dataSourceId: derivedDataSourceId(entry.id),
          path: [],
        },
        controlled: entry.controlled,
      };
  }
}

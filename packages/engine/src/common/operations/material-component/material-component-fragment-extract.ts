import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenValueRef,
} from '@base-screen/contracts';
import { getScreenSelectionBounds } from '@base-screen/core';
import {
  type BaseScreenFragmentBody,
  type BaseScreenFragmentDataSource,
  type BaseScreenFragmentNode,
  type BaseScreenMaterialCatalog,
  parseBaseScreenComponentFragmentInsertionIntent,
} from '@base-screen/plugin-core';
import { extractDesignerBlueprintFragment } from '../blueprint/designer-blueprint-graph.js';

/** 「存为组合」请求事件：Engine 只产出分片组合，命名、归类与存储归宿主。 */
export const BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT = 'base-screen-fragment-save-request' as const;

export interface BaseScreenFragmentSaveRequestEventDetail {
  /** 与插入意图同构的组合部分；宿主补上 id / name / category / keywords 即成分片定义。 */
  readonly fragment: BaseScreenFragmentBody;
  /** 提取时的选区（已去掉不存在的 id）。 */
  readonly componentIds: readonly string[];
  /** 建议名称：外壳或首个节点的组件名。 */
  readonly suggestedName: string;
  /** 被舍弃内容的 warning 诊断（条件样式、锁定 / 隐藏、跨出选区的关系）。 */
  readonly diagnostics: readonly ScreenDiagnostic[];
}

/**
 * 「将选区存为分片」的提取（ADR-0100 第二阶段）：把选中的组件（连同后代）还原成分片的组合部分。
 *
 * 只读：不改文档。产出与插入走同一个解析器回读一遍，因此「存出来的分片」一定能被
 * `insertComponentFragment` 接受；存储、命名与归类归宿主（与 ADR-0089 同构）。
 *
 * 还原规则：
 * - 单个选中根且它接受子节点（容器 / 编组）且有后代 → 它成为外壳；否则所有组件都是节点；
 * - 几何以整片包围盒左上角为原点，props/style 原样带走（与 manifest 默认值浅合并后仍等于自身）；
 * - 读共享数据源的节点连同它引用的文档级数据源（含参数的传递依赖）一起带走；
 * - 端点全在选区内的蓝图节点与连线一起带走，跨出选区的连线属于文档，不带走；
 * - 分片不携带变量：任何变量引用都使提取失败关闭；
 * - 条件样式规则、锁定 / 隐藏状态不属于分片契约，以 warning 诊断告知被舍弃。
 */
export function extractBaseScreenComponentFragment(input: {
  readonly document: ScreenDocument;
  readonly componentIds: readonly string[];
  readonly catalog: BaseScreenMaterialCatalog | undefined;
}): ScreenParseResult<BaseScreenFragmentBody> {
  const { document, componentIds, catalog } = input;
  const byId = new Map(document.components.map((component) => [component.id, component]));
  const selected = componentIds.filter((id) => byId.has(id));
  if (selected.length === 0) {
    return failure('AUTHORING_SOURCE_INVALID', 'Select at least one component to save.');
  }
  const selectedSet = new Set(selected);
  const isCovered = (component: ScreenComponentNode): boolean => {
    for (let parent = component.parentId; parent !== null; ) {
      if (selectedSet.has(parent)) return true;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return false;
  };
  // 按 zIndex 稳定排序：插入时按声明顺序分配 zIndex，先序 + 同级按层级才能还原原有叠放。
  const byLayer = [...document.components].sort((left, right) => left.zIndex - right.zIndex);
  const roots = byLayer.filter(
    (component) => selectedSet.has(component.id) && !isCovered(component),
  );
  const childrenOf = new Map<string, ScreenComponentNode[]>();
  for (const component of byLayer) {
    if (component.parentId === null) continue;
    const bucket = childrenOf.get(component.parentId) ?? [];
    bucket.push(component);
    childrenOf.set(component.parentId, bucket);
  }
  // 先序：父级总在子级之前，满足「父级必须先于子节点声明」。
  const ordered: ScreenComponentNode[] = [];
  const visit = (component: ScreenComponentNode): void => {
    ordered.push(component);
    for (const child of childrenOf.get(component.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);

  const shellComponent =
    roots.length === 1 &&
    ordered.length > 1 &&
    catalog?.get(roots[0]!.type)?.manifest.designCapabilities.children === true
      ? roots[0]
      : undefined;

  const warnings: ScreenDiagnostic[] = [];
  const keyById = new Map<string, string>();
  const takenKeys = new Set<string>();
  for (const component of ordered) {
    const key = uniqueKey(component.id, takenKeys);
    takenKeys.add(key);
    keyById.set(component.id, key);
  }

  const bounds = getScreenSelectionBounds(ordered);
  const left = bounds?.left ?? 0;
  const top = bounds?.top ?? 0;
  const dataSourceKeys = new Map<string, string>();
  const dataSources: BaseScreenFragmentDataSource[] = [];
  const collected = collectDataSources(document, ordered, dataSourceKeys, dataSources);
  if (!collected.ok) return collected;

  const entryOf = (component: ScreenComponentNode): ScreenParseResult<BaseScreenFragmentNode> => {
    if ((component.styleRules?.length ?? 0) > 0) {
      warnings.push(warning(component.id, 'Conditional style rules are not saved in fragments.'));
    }
    if (component.status.locked || component.status.hidden) {
      warnings.push(warning(component.id, 'Locked and hidden states are not saved in fragments.'));
    }
    const data = nodeData(component, dataSourceKeys);
    if (!data.ok) return data;
    const parentKey =
      component.parentId === null ||
      component.parentId === shellComponent?.id ||
      !keyById.has(component.parentId)
        ? undefined
        : keyById.get(component.parentId);
    return {
      ok: true,
      value: {
        key: keyById.get(component.id)!,
        materialType: component.type,
        name: component.name,
        offset: { x: component.position.x - left, y: component.position.y - top },
        size: component.size,
        ...(component.rotation === 0 ? {} : { rotation: component.rotation }),
        props: component.props,
        style: component.style,
        ...(parentKey === undefined ? {} : { parent: parentKey }),
        ...data.value,
      },
      diagnostics: [],
    };
  };

  let shell: BaseScreenFragmentNode | undefined;
  const nodes: BaseScreenFragmentNode[] = [];
  for (const component of ordered) {
    const entry = entryOf(component);
    if (!entry.ok) return entry;
    if (component === shellComponent) {
      // 外壳只承担外观与父级，不接受 dataSource / parent（分片契约）。
      const {
        dataSource: _dataSource,
        dataValue: _value,
        dataBinding: _binding,
        ...rest
      } = entry.value;
      shell = rest;
    } else {
      nodes.push(entry.value);
    }
  }

  const fragmentKeys = new Map(
    ordered.flatMap((item) => {
      const key = keyById.get(item.id);
      return key === undefined ? [] : [[item.id, key] as const];
    }),
  );
  const graph = extractDesignerBlueprintFragment(document.blueprint, fragmentKeys);
  if (graph.dropped > 0) {
    warnings.push({
      severity: 'warning',
      code: 'AUTHORING_SOURCE_INVALID',
      path: ['blueprint'],
      message: `${graph.dropped} blueprint edge(s) reach outside the selection and are not saved.`,
    });
  }

  const parsed = parseBaseScreenComponentFragmentInsertionIntent({
    ...(shell === undefined ? {} : { shell }),
    nodes,
    ...(dataSources.length === 0 ? {} : { dataSources }),
    ...(graph.edges.length === 0 && graph.nodes.length === 0
      ? {}
      : { blueprint: { nodes: graph.nodes, edges: graph.edges } }),
  });
  if (!parsed.ok) return parsed;
  const { anchor: _anchor, ...body } = parsed.value;
  return { ok: true, value: body, diagnostics: warnings };
}

type NodeData = Pick<BaseScreenFragmentNode, 'dataSource' | 'dataValue' | 'dataBinding'>;

function nodeData(
  component: ScreenComponentNode,
  dataSourceKeys: ReadonlyMap<string, string>,
): ScreenParseResult<NodeData> {
  if (component.dataValue !== undefined) {
    if (component.dataValue !== null && component.dataValue.kind === 'variable') {
      return variableFailure(component.id);
    }
    return {
      ok: true,
      value: {
        dataValue:
          component.dataValue === null ? null : remapRef(component.dataValue, dataSourceKeys),
        ...(component.dataBinding === undefined ? {} : { dataBinding: component.dataBinding }),
      },
      diagnostics: [],
    };
  }
  const source = component.dataSource;
  if (source?.type === 'variable') return variableFailure(component.id);
  if (
    (source?.type === 'dataset' || source?.type === 'host-resource') &&
    Object.values(source.params).some((param) => param.kind === 'variable')
  ) {
    return variableFailure(component.id);
  }
  return { ok: true, value: { dataSource: source }, diagnostics: [] };
}

/** 选区读取的文档级数据源，按依赖先序（被引用者在前），参数里的引用一并改写为分片 key。 */
function collectDataSources(
  document: ScreenDocument,
  components: readonly ScreenComponentNode[],
  keys: Map<string, string>,
  output: BaseScreenFragmentDataSource[],
): ScreenParseResult<null> {
  const byId = new Map((document.dataSources ?? []).map((source) => [source.id, source]));
  const taken = new Set<string>();
  const visiting = new Set<string>();
  const include = (id: string): ScreenParseResult<null> => {
    if (keys.has(id) || visiting.has(id)) return success();
    const source = byId.get(id);
    if (source === undefined) {
      return failure('AUTHORING_SOURCE_INVALID', `Data source "${id}" is not in the document.`);
    }
    visiting.add(id);
    for (const ref of Object.values(source.params)) {
      if (ref.kind === 'variable') return variableFailure(id);
      if (ref.kind === 'data-source-field') {
        const nested = include(ref.dataSourceId);
        if (!nested.ok) return nested;
      }
    }
    const key = uniqueKey(id, taken);
    taken.add(key);
    keys.set(id, key);
    output.push(toFragmentDataSource(source, key, keys));
    return success();
  };
  for (const component of components) {
    const ref = component.dataValue;
    if (ref === undefined || ref === null || ref.kind !== 'data-source-field') continue;
    const included = include(ref.dataSourceId);
    if (!included.ok) return included;
  }
  return success();
}

function toFragmentDataSource(
  source: ScreenDataSource,
  key: string,
  keys: ReadonlyMap<string, string>,
): BaseScreenFragmentDataSource {
  const { id: _id, readOnly: _readOnly, ...rest } = source;
  return {
    key,
    ...rest,
    params: Object.fromEntries(
      Object.entries(source.params).map(([name, ref]) => [name, remapRef(ref, keys)]),
    ),
  };
}

function remapRef(ref: ScreenValueRef, keys: ReadonlyMap<string, string>): ScreenValueRef {
  if (ref.kind !== 'data-source-field') return ref;
  return { ...ref, dataSourceId: keys.get(ref.dataSourceId) ?? ref.dataSourceId };
}

/** 分片 key 词法：`^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$`。文档 id 同字符集、更长，截断后去重。 */
function uniqueKey(source: string, taken: ReadonlySet<string>): string {
  const base = source.slice(0, 64);
  if (!taken.has(base)) return base;
  const stem = source.slice(0, 58);
  for (let suffix = 2; ; suffix++) {
    const candidate = `${stem}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function warning(componentId: string, message: string): ScreenDiagnostic {
  return {
    severity: 'warning',
    code: 'AUTHORING_SOURCE_INVALID',
    path: ['components', componentId],
    message,
  };
}

function variableFailure<T>(id: string): ScreenParseResult<T> {
  return failure(
    'AUTHORING_SOURCE_INVALID',
    `"${id}" reads a variable; fragments do not carry variables.`,
    [id],
  );
}

function success(): ScreenParseResult<null> {
  return { ok: true, value: null, diagnostics: [] };
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

import {
  isBoundedScreenImageUrl,
  isScreenMaterialType,
  parseScreenBlueprintGraph,
  parseScreenDataBinding,
  parseScreenDataSource,
  parseScreenDataSourceInstance,
  parseScreenValueRef,
  type ScreenBlueprintEdge,
  type ScreenBlueprintNode,
  type ScreenBlueprintValueExpression,
  type ScreenComponentDataSource,
  type ScreenDataBinding,
  type ScreenDataSource,
  type ScreenDiagnostic,
  type ScreenJsonObject,
  type ScreenParseResult,
  type ScreenPosition,
  type ScreenSize,
  type ScreenValueRef,
} from '@base-screen/contracts';
import { isDisplayString, isFiniteNumber } from '../material/material-validation-utils.js';

/**
 * 组合分片（component fragment）的唯一解析器（ADR-0087 / ADR-0100）。
 *
 * 分片是作者期构造：插入即展开为普通组件，文档中不记录来源。这里只负责**形状**的失败关闭解析——
 * 未知键一律拒绝，不剥离、不补默认、不转换类型；`props`/`style` 的取值是否合法取决于 catalog 里的
 * manifest schema，由 Engine 在展开事务时校验。
 *
 * 三个消费方共用同一份规则：Engine 的 `insertComponentFragment` 插入意图、插件清单的 `fragment`
 * 贡献、宿主物料库条目（ADR-0100 第一阶段）。分片用**相对 anchor 的偏移**而不是绝对坐标：
 * 文档坐标是画布绝对、父子关系不引入局部坐标系，所以只有把组合的包围盒对齐到落点，
 * 同一份分片才能跨画布尺寸复用。
 */

type DiagnosticPath = ScreenDiagnostic['path'];

const BODY_FIELDS = ['shell', 'nodes', 'dataSources', 'blueprint'] as const;
const INTENT_FIELDS = new Set(['anchor', ...BODY_FIELDS]);
const DEFINITION_FIELDS = new Set(['id', 'name', 'category', 'keywords', 'cover', ...BODY_FIELDS]);
const SHELL_FIELDS = new Set([
  'key',
  'materialType',
  'name',
  'offset',
  'size',
  'rotation',
  'props',
  'style',
]);
const NODE_FIELDS = new Set([...SHELL_FIELDS, 'parent', 'dataSource', 'dataValue', 'dataBinding']);
const DATA_SOURCE_FIELDS = new Set([
  'key',
  'name',
  'source',
  'params',
  'updatePolicy',
  'processorId',
]);
/** 分片自带的文档级数据源与蓝图节点 / 连线上限：分片是一张卡片级的组合，不是页面模板（F6）。 */
const MAX_FRAGMENT_DATA_SOURCES = 16;
const MAX_FRAGMENT_BLUEPRINT_NODES = 32;
const MAX_FRAGMENT_BLUEPRINT_EDGES = 32;
const FRAGMENT_BLUEPRINT_FIELDS = new Set(['nodes', 'edges']);
const POSITION_FIELDS = new Set(['x', 'y']);
const SIZE_FIELDS = new Set(['width', 'height']);
const FRAGMENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
/** 与物料库条目 id 同一词法：分片在物料库里以 id 区分收藏、最近使用与拖放。 */
const FRAGMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_FRAGMENT_NODES = 64;
const MAX_FRAGMENT_JSON_CHARS = 64 * 1024;
const MAX_FRAGMENT_NAME_CODE_POINTS = 256;
/** 元数据上限与物料 manifest 一致（name/category 256、keywords 64 × 64、cover 2048）。 */
const MAX_FRAGMENT_DISPLAY_CODE_POINTS = 256;
const MAX_FRAGMENT_KEYWORDS = 64;
const MAX_FRAGMENT_KEYWORD_CODE_POINTS = 64;
const MAX_FRAGMENT_COVER_LENGTH = 2048;

export interface BaseScreenComponentFragmentInsertionIntent {
  /** 组合包围盒左上角的落点；省略时由调用方决定（公开 API 取当前可见画布中心）。 */
  readonly anchor?: ScreenPosition;
  /** 组合外壳：其余节点默认的父级。只按 `designCapabilities.children` 校验，不要求物料库可见。 */
  readonly shell?: BaseScreenFragmentShell;
  /** 1 至 64 个节点；被引用为父级的节点必须先于子节点声明。 */
  readonly nodes: readonly BaseScreenFragmentNode[];
  readonly dataSources?: readonly BaseScreenFragmentDataSource[];
  readonly blueprint?: BaseScreenFragmentBlueprint;
}

/** 分片条目共有的键、物料与几何/外观覆盖。 */
export interface BaseScreenFragmentEntry {
  readonly key: string;
  readonly materialType: string;
  readonly name?: string;
  readonly offset?: ScreenPosition;
  readonly size?: ScreenSize;
  /** 与 manifest `defaultProps` 顶层浅合并后按 `propsSchema` 校验。 */
  readonly props?: ScreenJsonObject;
  /** 与 manifest `defaultStyle` 顶层浅合并后按 `styleSchema` 校验。 */
  readonly style?: ScreenJsonObject;
  /** 旋转角度（度），取值同文档组件：[-180, 180)。省略为 0。 */
  readonly rotation?: number;
}

/**
 * 组合外壳。不接受 `dataSource` 与 `parent`：外壳是装饰性容器，它自己就是其余节点的父级。
 */
export type BaseScreenFragmentShell = BaseScreenFragmentEntry;

export interface BaseScreenFragmentNode extends BaseScreenFragmentEntry {
  /** 省略时挂到 shell；无 shell 时为文档根。只接受 shell 或更早声明的节点键。 */
  readonly parent?: string;
  /** 给出即整体替换 manifest 推导的初始数据源；显式 `null` 表示无数据源。与 `dataValue` 互斥。 */
  readonly dataSource?: ScreenComponentDataSource | null;
  /**
   * 取值引用（ADR-0100 F4）。`data-source-field` 的 `dataSourceId` 写分片内数据源的 `key`，插入时与组件 id
   * 一样重映射；分片不携带变量，因此不接受 `variable`。给出即该节点不再带 legacy `dataSource`。
   */
  readonly dataValue?: ScreenValueRef | null;
  /** 字段映射；仅当 `dataValue` 是 `data-source-field` 时可用。 */
  readonly dataBinding?: ScreenDataBinding | null;
}

/**
 * 分片自带的文档级数据源（ADR-0100 F4）：插入时生成实例，`key` 重映射为文档内唯一 id。
 * 参数里的 `data-source-field` 只能引用**更早声明**的分片数据源 key——声明顺序即求值顺序，天然无环。
 */
export interface BaseScreenFragmentDataSource extends Omit<ScreenDataSource, 'id' | 'readOnly'> {
  readonly key: string;
}

/**
 * 分片内蓝图节点图（ADR-0100 F5、ADR-0107）：形状即文档 `blueprint` 的 `nodes` / `edges`，
 * 节点与连线 id 是分片内 key，组件节点的 `componentId` 写外壳 / 节点的 `key`；插入时一并重映射，
 * 宿主与实例就绪节点并入文档已有的单例。分片不携带变量：不得有变量节点，表达式不得引用变量。
 */
export interface BaseScreenFragmentBlueprint {
  readonly nodes: readonly ScreenBlueprintNode[];
  readonly edges: readonly ScreenBlueprintEdge[];
}

/**
 * 可复用的分片定义：物料库条目的展示信息 + 与插入意图同构的组合（不含落点）。
 *
 * `id` 跨构建稳定、不带版本字段（ADR-0100 F7）；`cover` 与物料 manifest 的封面同语义，
 * 省略时由 Engine 按节点几何绘制示意线框。
 */
export interface BaseScreenFragmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly cover?: string;
  readonly shell?: BaseScreenFragmentShell;
  readonly nodes: readonly BaseScreenFragmentNode[];
  readonly dataSources?: readonly BaseScreenFragmentDataSource[];
  readonly blueprint?: BaseScreenFragmentBlueprint;
}

/** 分片的组合部分：插入意图与分片定义共用，「将选区存为分片」产出的也是它。 */
export interface BaseScreenFragmentBody {
  readonly shell?: BaseScreenFragmentShell;
  readonly nodes: readonly BaseScreenFragmentNode[];
  readonly dataSources?: readonly BaseScreenFragmentDataSource[];
  readonly blueprint?: BaseScreenFragmentBlueprint;
}

/**
 * 「受长度约束的名称」的唯一校验规则：至少一个非空白字符、不含 C0/C1 控制字符、码点数不超过上限。
 *
 * 组件名、宿主资源名与分片条目名共用这一条；Engine 经公共导出消费，不另写一份。
 */
export function isBaseScreenBoundedName(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    /\S/.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    [...value].length <= limit
  );
}

/** 插入意图：分片组合 + 可选落点。诊断码沿用作者面（`AUTHORING_*`）。 */
export function parseBaseScreenComponentFragmentInsertionIntent(
  input: unknown,
): ScreenParseResult<BaseScreenComponentFragmentInsertionIntent> {
  if (!isRecord(input) || !hasExactKeys(input, INTENT_FIELDS)) {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment intent must be a strict object.');
  }
  if (!withinJsonBudget(input)) {
    return failure(
      'AUTHORING_LIMIT_EXCEEDED',
      `Fragment must be JSON-safe and fit within ${MAX_FRAGMENT_JSON_CHARS} characters.`,
    );
  }
  const anchor = parsePosition(input.anchor, ['anchor']);
  if (!anchor.ok) return anchor;
  const body = parseFragmentBody(input);
  if (!body.ok) return body;
  return {
    ok: true,
    value: {
      ...(anchor.value === undefined ? {} : { anchor: anchor.value }),
      ...body.value,
    },
    diagnostics: [],
  };
}

/**
 * 分片定义：插件 `fragment` 贡献与宿主物料库条目共用。它属于清单类契约，
 * 诊断码统一为 `PLUGIN_CORE_*`（组合部分的作者面诊断按同一路径重新归类）。
 */
export function parseBaseScreenFragmentDefinition(
  input: unknown,
): ScreenParseResult<BaseScreenFragmentDefinition> {
  if (!isRecord(input) || !hasExactKeys(input, DEFINITION_FIELDS)) {
    return failure(
      'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
      'Fragment definition must be a strict object.',
    );
  }
  if (!withinJsonBudget(input)) {
    return failure(
      'PLUGIN_CORE_LIMIT_EXCEEDED',
      `Fragment must be JSON-safe and fit within ${MAX_FRAGMENT_JSON_CHARS} characters.`,
    );
  }
  const diagnostics: ScreenDiagnostic[] = [];
  const field = (path: string, message: string) =>
    diagnostics.push(fieldDiagnostic(message, [path]));
  if (typeof input.id !== 'string' || !FRAGMENT_ID_PATTERN.test(input.id)) {
    field('id', 'Fragment id must match ^[A-Za-z][A-Za-z0-9._:-]{0,127}$.');
  }
  for (const key of ['name', 'category'] as const) {
    if (!isDisplayString(input[key], MAX_FRAGMENT_DISPLAY_CODE_POINTS)) {
      field(key, `Fragment ${key} must be a display string.`);
    }
  }
  diagnostics.push(...validateKeywords(input.keywords));
  if (
    input.cover !== undefined &&
    !isBoundedScreenImageUrl(input.cover, MAX_FRAGMENT_COVER_LENGTH)
  ) {
    field('cover', 'Fragment cover must be a bounded HTTP(S) or relative URL string.');
  }
  const body = parseFragmentBody(input);
  if (!body.ok) diagnostics.push(...body.diagnostics.map(asManifestDiagnostic));
  if (diagnostics.length > 0 || !body.ok) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      id: input.id as string,
      name: input.name as string,
      category: input.category as string,
      keywords: [...(input.keywords as readonly string[])],
      ...(input.cover === undefined ? {} : { cover: input.cover as string }),
      ...body.value,
    },
    diagnostics: [],
  };
}

function parseFragmentBody(
  input: Record<string, unknown>,
): ScreenParseResult<BaseScreenFragmentBody> {
  if (!Array.isArray(input.nodes)) {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment nodes must be an array.', ['nodes']);
  }
  if (input.nodes.length === 0 || input.nodes.length > MAX_FRAGMENT_NODES) {
    return failure(
      'AUTHORING_LIMIT_EXCEEDED',
      `Fragment must declare between 1 and ${MAX_FRAGMENT_NODES} nodes.`,
      ['nodes'],
    );
  }

  const diagnostics: ScreenDiagnostic[] = [];
  // 数据源先解析：节点的 dataValue 只能引用已声明的分片数据源 key。
  const dataSources = parseFragmentDataSources(input.dataSources, diagnostics);
  const dataSourceKeys = new Set((dataSources ?? []).map((source) => source.key));
  const keys = new Set<string>();
  let shell: BaseScreenFragmentShell | undefined;
  if (input.shell !== undefined) {
    if (!isRecord(input.shell)) {
      diagnostics.push(...payloadFailure('Fragment shell must be an object.', ['shell']));
    } else {
      const parsed = parseFragmentEntry(input.shell, SHELL_FIELDS, keys, ['shell']);
      if (!parsed.ok) {
        diagnostics.push(...parsed.diagnostics);
      } else {
        shell = parsed.value;
      }
    }
  }

  const nodes: BaseScreenFragmentNode[] = [];
  for (const [index, candidate] of input.nodes.entries()) {
    const path: DiagnosticPath = ['nodes', index];
    if (!isRecord(candidate)) {
      diagnostics.push(...payloadFailure('Fragment node must be an object.', path));
      continue;
    }
    const parsed = parseFragmentEntry(candidate, NODE_FIELDS, keys, path);
    if (!parsed.ok) {
      diagnostics.push(...parsed.diagnostics);
      continue;
    }
    const data = parseFragmentNodeData(candidate, dataSourceKeys, path);
    if (!data.ok) {
      diagnostics.push(...data.diagnostics);
      continue;
    }
    nodes.push({ ...parsed.value, ...data.value });
  }
  const blueprint = parseFragmentBlueprint(input.blueprint, keys, diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      ...(shell === undefined ? {} : { shell }),
      nodes,
      ...(dataSources === undefined ? {} : { dataSources }),
      ...(blueprint === undefined ? {} : { blueprint }),
    },
    diagnostics: [],
  };
}

type FragmentNodeData = Pick<BaseScreenFragmentNode, 'dataSource' | 'dataValue' | 'dataBinding'>;

/** 节点的数据写入口：legacy `dataSource` 与 `dataValue` 二选一（沿用文档契约的互斥规则）。 */
function parseFragmentNodeData(
  candidate: Record<string, unknown>,
  dataSourceKeys: ReadonlySet<string>,
  path: DiagnosticPath,
): ScreenParseResult<FragmentNodeData> {
  if (candidate.dataSource !== undefined && candidate.dataValue !== undefined) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment node must not declare dataSource together with dataValue.',
      [...path, 'dataValue'],
    );
  }
  if (candidate.dataSource !== undefined) {
    const source = parseScreenDataSource(candidate.dataSource);
    if (!source.ok) {
      return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment node dataSource is not canonical.', [
        ...path,
        'dataSource',
      ]);
    }
    if (candidate.dataBinding !== undefined) {
      return failure(
        'AUTHORING_PAYLOAD_INVALID',
        'Fragment node dataBinding requires a data-source-field dataValue.',
        [...path, 'dataBinding'],
      );
    }
    return { ok: true, value: { dataSource: source.value }, diagnostics: [] };
  }
  let dataValue: ScreenValueRef | null | undefined;
  if (candidate.dataValue === null) {
    dataValue = null;
  } else if (candidate.dataValue !== undefined) {
    const parsed = parseScreenValueRef(candidate.dataValue);
    if (!parsed.ok) return repathFailure(parsed.diagnostics, [...path, 'dataValue']);
    const reference = checkValueRef(parsed.value, dataSourceKeys, [...path, 'dataValue']);
    if (reference !== undefined) return { ok: false, diagnostics: [reference] };
    dataValue = parsed.value;
  }
  let dataBinding: ScreenDataBinding | null | undefined;
  if (candidate.dataBinding === null) {
    dataBinding = null;
  } else if (candidate.dataBinding !== undefined) {
    if (dataValue?.kind !== 'data-source-field') {
      return failure(
        'AUTHORING_PAYLOAD_INVALID',
        'Fragment node dataBinding requires a data-source-field dataValue.',
        [...path, 'dataBinding'],
      );
    }
    const parsed = parseScreenDataBinding(candidate.dataBinding);
    if (!parsed.ok) return repathFailure(parsed.diagnostics, [...path, 'dataBinding']);
    dataBinding = parsed.value;
  }
  return {
    ok: true,
    value: {
      ...(dataValue === undefined ? {} : { dataValue }),
      ...(dataBinding === undefined ? {} : { dataBinding }),
    },
    diagnostics: [],
  };
}

function parseFragmentDataSources(
  input: unknown,
  diagnostics: ScreenDiagnostic[],
): readonly BaseScreenFragmentDataSource[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    diagnostics.push(...payloadFailure('Fragment dataSources must be an array.', ['dataSources']));
    return undefined;
  }
  if (input.length > MAX_FRAGMENT_DATA_SOURCES) {
    diagnostics.push(
      ...failure<never>(
        'AUTHORING_LIMIT_EXCEEDED',
        `Fragment must declare at most ${MAX_FRAGMENT_DATA_SOURCES} data sources.`,
        ['dataSources'],
      ).diagnostics,
    );
    return undefined;
  }
  const declared = new Set<string>();
  const sources: BaseScreenFragmentDataSource[] = [];
  for (const [index, candidate] of input.entries()) {
    const path: DiagnosticPath = ['dataSources', index];
    if (!isRecord(candidate) || !hasExactKeys(candidate, DATA_SOURCE_FIELDS)) {
      diagnostics.push(...payloadFailure('Fragment data source must be a strict object.', path));
      continue;
    }
    const key = candidate.key;
    if (typeof key !== 'string' || !FRAGMENT_KEY_PATTERN.test(key) || declared.has(key)) {
      diagnostics.push(
        ...payloadFailure('Fragment data source key must be a unique fragment key.', [
          ...path,
          'key',
        ]),
      );
      continue;
    }
    const { key: _key, ...rest } = candidate;
    const parsed = parseScreenDataSourceInstance({ ...rest, id: key });
    if (!parsed.ok) {
      diagnostics.push(
        ...parsed.diagnostics.map((item) => ({
          ...item,
          code: 'AUTHORING_PAYLOAD_INVALID' as const,
          path: [...path, ...(item.path[0] === 'id' ? ['key', ...item.path.slice(1)] : item.path)],
        })),
      );
      continue;
    }
    // 参数只能引用更早声明的分片数据源：声明顺序即求值顺序，不需要再做环判定。
    let clean = true;
    for (const [name, ref] of Object.entries(parsed.value.params)) {
      const problem = checkValueRef(ref, declared, [...path, 'params', name]);
      if (problem !== undefined) {
        diagnostics.push(problem);
        clean = false;
      }
    }
    declared.add(key);
    if (!clean) continue;
    const { id: _id, readOnly: _readOnly, ...source } = parsed.value;
    sources.push({ key, ...source });
  }
  return sources;
}

function parseFragmentBlueprint(
  input: unknown,
  entryKeys: ReadonlySet<string>,
  diagnostics: ScreenDiagnostic[],
): BaseScreenFragmentBlueprint | undefined {
  if (input === undefined) return undefined;
  if (!isRecord(input)) {
    diagnostics.push(...payloadFailure('Fragment blueprint must be an object.', ['blueprint']));
    return undefined;
  }
  for (const key of Object.keys(input)) {
    if (!FRAGMENT_BLUEPRINT_FIELDS.has(key)) {
      diagnostics.push(
        ...payloadFailure(`Unknown fragment blueprint field "${key}".`, ['blueprint', key]),
      );
      return undefined;
    }
  }
  const nodeCount = Array.isArray(input.nodes) ? input.nodes.length : 0;
  const edgeCount = Array.isArray(input.edges) ? input.edges.length : 0;
  if (nodeCount > MAX_FRAGMENT_BLUEPRINT_NODES || edgeCount > MAX_FRAGMENT_BLUEPRINT_EDGES) {
    diagnostics.push(
      ...failure<never>(
        'AUTHORING_LIMIT_EXCEEDED',
        `Fragment blueprint must declare at most ${MAX_FRAGMENT_BLUEPRINT_NODES} nodes and ${MAX_FRAGMENT_BLUEPRINT_EDGES} edges.`,
        ['blueprint'],
      ).diagnostics,
    );
    return undefined;
  }
  const parsed = parseScreenBlueprintGraph(input);
  if (!parsed.ok) {
    diagnostics.push(...repathFailure<never>(parsed.diagnostics, ['blueprint']).diagnostics);
    return undefined;
  }
  const graph = parsed.value;
  let clean = true;
  graph.nodes.forEach((node, index) => {
    const path: DiagnosticPath = ['blueprint', 'nodes', index];
    if (node.kind === 'variable') {
      diagnostics.push(
        ...payloadFailure('Fragment blueprint must not contain variable nodes.', [...path, 'kind']),
      );
      clean = false;
    } else if (node.kind === 'component' && !entryKeys.has(node.componentId)) {
      diagnostics.push(
        ...payloadFailure('Fragment blueprint node must reference a fragment entry key.', [
          ...path,
          'componentId',
        ]),
      );
      clean = false;
    } else if (
      node.kind === 'condition' &&
      (referencesVariable(node.condition.left) ||
        (node.condition.right !== undefined && referencesVariable(node.condition.right)))
    ) {
      diagnostics.push(
        ...payloadFailure('Fragment blueprint must not reference variables.', [
          ...path,
          'condition',
        ]),
      );
      clean = false;
    }
  });
  graph.edges.forEach((edge, index) => {
    if (edge.kind !== 'flow') return;
    for (const field of ['value', 'payload'] as const) {
      const expression = edge[field];
      if (expression !== undefined && referencesVariable(expression)) {
        diagnostics.push(
          ...payloadFailure('Fragment blueprint must not reference variables.', [
            'blueprint',
            'edges',
            index,
            field,
          ]),
        );
        clean = false;
      }
    }
  });
  return clean ? { nodes: graph.nodes, edges: graph.edges } : undefined;
}

function referencesVariable(expression: ScreenBlueprintValueExpression): boolean {
  if (expression.kind === 'variable') return true;
  if (expression.kind === 'array') return expression.items.some(referencesVariable);
  if (expression.kind === 'object') {
    return Object.values(expression.properties).some(referencesVariable);
  }
  return false;
}

/** 分片里的取值引用：不得引用变量；数据源字段只能指向已声明的分片数据源 key。 */
function checkValueRef(
  ref: ScreenValueRef,
  dataSourceKeys: ReadonlySet<string>,
  path: DiagnosticPath,
): ScreenDiagnostic | undefined {
  if (ref.kind === 'variable') {
    return payloadFailure('Fragment value references must not reference variables.', path)[0];
  }
  if (ref.kind === 'data-source-field' && !dataSourceKeys.has(ref.dataSourceId)) {
    return payloadFailure(
      'Fragment value reference must point to an earlier declared fragment data source key.',
      [...path, 'dataSourceId'],
    )[0];
  }
  return undefined;
}

function repathFailure<T>(
  diagnostics: readonly ScreenDiagnostic[],
  prefix: DiagnosticPath,
): ScreenParseResult<T> {
  return {
    ok: false,
    diagnostics: diagnostics.map((item) => ({
      ...item,
      code:
        item.code === 'DOCUMENT_LIMIT_EXCEEDED'
          ? 'AUTHORING_LIMIT_EXCEEDED'
          : 'AUTHORING_PAYLOAD_INVALID',
      path: [...prefix, ...item.path],
    })),
  };
}

function parseFragmentEntry(
  candidate: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  keys: Set<string>,
  path: DiagnosticPath,
): ScreenParseResult<BaseScreenFragmentNode> {
  if (!hasExactKeys(candidate, allowed)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment entry declares an unsupported field.',
      path,
    );
  }
  if (typeof candidate.key !== 'string' || !FRAGMENT_KEY_PATTERN.test(candidate.key)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment entry key must match ^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$.',
      [...path, 'key'],
    );
  }
  if (keys.has(candidate.key)) {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment entry key must be unique.', [
      ...path,
      'key',
    ]);
  }
  if (!isScreenMaterialType(candidate.materialType)) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment entry materialType must be a canonical material type.',
      [...path, 'materialType'],
    );
  }
  if (
    candidate.name !== undefined &&
    !isBaseScreenBoundedName(candidate.name, MAX_FRAGMENT_NAME_CODE_POINTS)
  ) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      `Fragment entry name must contain 1 to ${MAX_FRAGMENT_NAME_CODE_POINTS} code points without control characters.`,
      [...path, 'name'],
    );
  }
  if ('parent' in candidate && typeof candidate.parent !== 'string') {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment node parent must be a string.', [
      ...path,
      'parent',
    ]);
  }
  for (const field of ['props', 'style'] as const) {
    if (candidate[field] !== undefined && !isRecord(candidate[field])) {
      return failure('AUTHORING_PAYLOAD_INVALID', `Fragment entry ${field} must be an object.`, [
        ...path,
        field,
      ]);
    }
  }
  if (
    candidate.rotation !== undefined &&
    (!isFiniteNumber(candidate.rotation) || candidate.rotation < -180 || candidate.rotation >= 180)
  ) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment entry rotation must be a finite angle in [-180, 180).',
      [...path, 'rotation'],
    );
  }
  const offset = parsePosition(candidate.offset, [...path, 'offset']);
  if (!offset.ok) return offset;
  const size = parseSize(candidate.size, [...path, 'size']);
  if (!size.ok) return size;

  keys.add(candidate.key);
  return {
    ok: true,
    value: {
      key: candidate.key,
      materialType: candidate.materialType,
      ...(candidate.name === undefined ? {} : { name: candidate.name }),
      ...(offset.value === undefined ? {} : { offset: offset.value }),
      ...(size.value === undefined ? {} : { size: size.value }),
      ...(candidate.props === undefined ? {} : { props: candidate.props as ScreenJsonObject }),
      ...(candidate.style === undefined ? {} : { style: candidate.style as ScreenJsonObject }),
      ...(candidate.rotation === undefined ? {} : { rotation: candidate.rotation as number }),
      ...(typeof candidate.parent === 'string' ? { parent: candidate.parent } : {}),
    },
    diagnostics: [],
  };
}

function parsePosition(
  value: unknown,
  path: DiagnosticPath,
): ScreenParseResult<ScreenPosition | undefined> {
  if (value === undefined) return { ok: true, value: undefined, diagnostics: [] };
  if (
    !isRecord(value) ||
    !hasExactKeys(value, POSITION_FIELDS) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y)
  ) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment position must be finite coordinates.',
      path,
    );
  }
  return { ok: true, value: { x: value.x, y: value.y }, diagnostics: [] };
}

function parseSize(
  value: unknown,
  path: DiagnosticPath,
): ScreenParseResult<ScreenSize | undefined> {
  if (value === undefined) return { ok: true, value: undefined, diagnostics: [] };
  if (
    !isRecord(value) ||
    !hasExactKeys(value, SIZE_FIELDS) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return failure(
      'AUTHORING_PAYLOAD_INVALID',
      'Fragment size must be positive finite width and height.',
      path,
    );
  }
  return { ok: true, value: { width: value.width, height: value.height }, diagnostics: [] };
}

/** 整个分片的 JSON 体积守卫；循环引用在此失败而不是在序列化时抛出。 */
function withinJsonBudget(input: unknown): boolean {
  try {
    return JSON.stringify(input)!.length <= MAX_FRAGMENT_JSON_CHARS;
  } catch {
    return false;
  }
}

function payloadFailure(message: string, path: DiagnosticPath): readonly ScreenDiagnostic[] {
  return failure<never>('AUTHORING_PAYLOAD_INVALID', message, path).diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: DiagnosticPath = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

function validateKeywords(value: unknown): readonly ScreenDiagnostic[] {
  if (!Array.isArray(value)) {
    return [fieldDiagnostic('Fragment keywords must be an array of strings.', ['keywords'])];
  }
  if (value.length > MAX_FRAGMENT_KEYWORDS) {
    return [
      {
        ...fieldDiagnostic('Fragment keywords exceed their maximum item count.', ['keywords']),
        code: 'PLUGIN_CORE_LIMIT_EXCEEDED',
      },
    ];
  }
  const diagnostics: ScreenDiagnostic[] = [];
  const seen = new Set<string>();
  for (const [index, keyword] of value.entries()) {
    if (!isDisplayString(keyword, MAX_FRAGMENT_KEYWORD_CODE_POINTS)) {
      diagnostics.push(fieldDiagnostic('Fragment keyword is invalid.', ['keywords', index]));
    } else if (seen.has(keyword)) {
      diagnostics.push({
        ...fieldDiagnostic('Fragment keyword is duplicated.', ['keywords', index]),
        code: 'PLUGIN_CORE_CONTRIBUTION_DUPLICATE',
      });
    } else {
      seen.add(keyword);
    }
  }
  return diagnostics;
}

/** 作者面诊断归入清单类：超限仍是超限，其余一律字段无效；路径与文案不变。 */
function asManifestDiagnostic(diagnostic: ScreenDiagnostic): ScreenDiagnostic {
  return {
    ...diagnostic,
    code:
      diagnostic.code === 'AUTHORING_LIMIT_EXCEEDED'
        ? 'PLUGIN_CORE_LIMIT_EXCEEDED'
        : 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
  };
}

function fieldDiagnostic(message: string, path: DiagnosticPath): ScreenDiagnostic {
  return { severity: 'error', code: 'PLUGIN_CORE_MANIFEST_FIELD_INVALID', path, message };
}

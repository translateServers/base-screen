import {
  isScreenMaterialType,
  parseScreenDataSource,
  type ScreenComponentDataSource,
  type ScreenComponentNode,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenJsonObject,
  type ScreenParseResult,
  type ScreenPosition,
  type ScreenSize,
} from '@base-screen/contracts';
import { getScreenSelectionBounds, type ScreenDocumentTransaction } from '@base-screen/core';
import {
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { roundScreenGeometry } from '../element/designer-geometry.js';
import {
  createMaterialComponent,
  nextMaterialComponentId,
  nextMaterialComponentZIndex,
  validateInsertableMaterial,
} from './material-component.js';

/**
 * 组合分片（component fragment）的失败关闭解析与事务构建。
 *
 * `insertComponent` 一次只能按 manifest 默认值建一个节点，因此「底座 + 标题 + 读数 + 分隔线
 * 组合成的一张卡片」没有合规入口：宿主要么自己把每个物料的全部默认值重新展开一遍再发
 * `add-component`，要么依赖私有拖放 MIME。这里补的是那半条路——基座只做一次展开，预设 JSON 的
 * 存储与检索仍归宿主（ADR-0087）。
 *
 * 分片用**相对 anchor 的偏移**而不是绝对坐标：文档坐标是画布绝对、父子关系不引入局部坐标系，
 * 所以只有把组合的包围盒对齐到 anchor，同一份预设才能跨画布尺寸复用。
 */

type DiagnosticPath = ScreenDiagnostic['path'];

const INTENT_FIELDS = new Set(['anchor', 'shell', 'nodes']);
const SHELL_FIELDS = new Set(['key', 'materialType', 'name', 'offset', 'size', 'props', 'style']);
const NODE_FIELDS = new Set([...SHELL_FIELDS, 'parent', 'dataSource']);
const POSITION_FIELDS = new Set(['x', 'y']);
const SIZE_FIELDS = new Set(['width', 'height']);
const FRAGMENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MAX_FRAGMENT_NODES = 64;
const MAX_FRAGMENT_JSON_CHARS = 64 * 1024;
const MAX_FRAGMENT_NAME_CODE_POINTS = 256;

export interface BaseScreenComponentFragmentInsertionIntent {
  /** 组合包围盒左上角的落点；省略时由调用方决定（公开 API 取当前可见画布中心）。 */
  readonly anchor?: ScreenPosition;
  /** 组合外壳：其余节点默认的父级。只按 `designCapabilities.children` 校验，不要求物料库可见。 */
  readonly shell?: BaseScreenFragmentShell;
  /** 1 至 64 个节点；被引用为父级的节点必须先于子节点声明。 */
  readonly nodes: readonly BaseScreenFragmentNode[];
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
}

/**
 * 组合外壳。不接受 `dataSource` 与 `parent`：外壳是装饰性容器，它自己就是其余节点的父级。
 */
export type BaseScreenFragmentShell = BaseScreenFragmentEntry;

export interface BaseScreenFragmentNode extends BaseScreenFragmentEntry {
  /** 省略时挂到 shell；无 shell 时为文档根。只接受 shell 或更早声明的节点键。 */
  readonly parent?: string;
  /** 给出即整体替换 manifest 推导的初始数据源；显式 `null` 表示无数据源。 */
  readonly dataSource?: ScreenComponentDataSource | null;
}

export interface BaseScreenComponentFragmentInsertion {
  readonly transaction: ScreenDocumentTransaction;
  /** 本次创建的全部组件 id，按声明顺序（shell 在最前）。 */
  readonly componentIds: readonly string[];
  /** shell 优先，否则第一个根节点：与成组命令的选中语义一致。 */
  readonly focusedComponentId: string;
}

/**
 * 失败关闭解析：未知键一律拒绝，不剥离、不补默认、不转换类型。
 *
 * `props`/`style` 的取值校验留到事务构建期，因为是否合法取决于 catalog 里的 manifest schema；
 * 这里只保证形状与边界（键集合、数量、JSON 体积、有限数、键唯一）。
 */
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
    const node: BaseScreenFragmentNode = parsed.value;
    if (candidate.dataSource === undefined) {
      nodes.push(node);
      continue;
    }
    const source = parseScreenDataSource(candidate.dataSource);
    if (!source.ok) {
      diagnostics.push(
        ...payloadFailure('Fragment node dataSource is not canonical.', [...path, 'dataSource']),
      );
      continue;
    }
    nodes.push({ ...node, dataSource: source.value });
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    value: {
      ...(anchor.value === undefined ? {} : { anchor: anchor.value }),
      ...(shell === undefined ? {} : { shell }),
      nodes,
    },
    diagnostics: [],
  };
}

/**
 * 把已解析的分片展开成一个可撤销事务：逐节点按 catalog manifest 默认值建节点，id 与 zIndex
 * 在分片内本地去重，整片只平移不变形。
 *
 * 先按偏移建出临时节点并对包围盒求并集，再把并集左上角对齐到 anchor 后贴进画布。**不**逐节点
 * 裁剪——那会把组合拉开。分片比画布大时失败关闭而不是缩放。
 */
export function createBaseScreenComponentFragmentTransaction(input: {
  readonly document: ScreenDocument;
  readonly catalog: BaseScreenMaterialCatalog;
  readonly intent: BaseScreenComponentFragmentInsertionIntent;
  readonly anchor: ScreenPosition;
}): ScreenParseResult<BaseScreenComponentFragmentInsertion> {
  const { document, catalog, intent, anchor } = input;
  const diagnostics: ScreenDiagnostic[] = [];
  const created: ScreenComponentNode[] = [];
  const idsByFragmentKey = new Map<string, string>();
  const reservedIds = new Set<string>();
  let shellId: string | undefined;

  let nextZIndex = nextMaterialComponentZIndex(document);
  if (intent.shell !== undefined) {
    const manifest = catalog.get(intent.shell.materialType)?.manifest;
    if (
      manifest === undefined ||
      manifest.type !== intent.shell.materialType ||
      manifest.designCapabilities.children !== true
    ) {
      return failure(
        'AUTHORING_SOURCE_INVALID',
        'Fragment shell must be a catalogued material that accepts children.',
        ['shell', 'materialType'],
      );
    }
    const built = buildFragmentComponent({
      document,
      manifest,
      entry: intent.shell,
      parentId: null,
      reservedIds,
      zIndex: nextZIndex,
      path: ['shell'],
    });
    if (!built.ok) return built;
    nextZIndex++;
    shellId = built.value.id;
    reservedIds.add(built.value.id);
    idsByFragmentKey.set(intent.shell.key, built.value.id);
    created.push(built.value);
  }

  for (const [index, node] of intent.nodes.entries()) {
    const path: DiagnosticPath = ['nodes', index];
    const manifest = catalog.get(node.materialType)?.manifest;
    const validated = validateInsertableMaterial(manifest, { materialType: node.materialType });
    if (!validated.ok) {
      diagnostics.push(...repath(validated.diagnostics, [...path, 'materialType']));
      continue;
    }
    const parentId = resolveFragmentParent(node, shellId, idsByFragmentKey, path);
    if ('diagnostics' in parentId) {
      diagnostics.push(...parentId.diagnostics);
      continue;
    }
    const built = buildFragmentComponent({
      document,
      manifest: validated.value,
      entry: node,
      parentId: parentId.value,
      reservedIds,
      zIndex: nextZIndex,
      path,
    });
    if (!built.ok) {
      diagnostics.push(...built.diagnostics);
      continue;
    }
    nextZIndex++;
    reservedIds.add(built.value.id);
    idsByFragmentKey.set(node.key, built.value.id);
    created.push(built.value);
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };

  const bounds = getScreenSelectionBounds(created);
  if (bounds === null) {
    return failure('AUTHORING_PAYLOAD_INVALID', 'Fragment produced no components.', ['nodes']);
  }
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width > document.canvas.width || height > document.canvas.height) {
    return failure('AUTHORING_LIMIT_EXCEEDED', 'Fragment bounding box is larger than the canvas.', [
      'nodes',
    ]);
  }
  const left = clamp(anchor.x, 0, Math.max(0, document.canvas.width - width)) - bounds.left;
  const top = clamp(anchor.y, 0, Math.max(0, document.canvas.height - height)) - bounds.top;
  const components = created.map((component) => ({
    ...component,
    position: {
      x: roundScreenGeometry(component.position.x + left),
      y: roundScreenGeometry(component.position.y + top),
    },
  }));

  return {
    ok: true,
    value: {
      transaction: {
        commands: components.map((component) => ({ type: 'add-component', component })),
      },
      componentIds: components.map((component) => component.id),
      focusedComponentId: components[0]!.id,
    },
    diagnostics: [],
  };
}

function buildFragmentComponent(input: {
  readonly document: ScreenDocument;
  readonly manifest: BaseScreenMaterialManifest;
  readonly entry: BaseScreenFragmentNode;
  readonly parentId: string | null;
  readonly reservedIds: Set<string>;
  readonly zIndex: number;
  readonly path: DiagnosticPath;
}): ScreenParseResult<ScreenComponentNode> {
  const { document, manifest, entry, parentId, reservedIds, zIndex, path } = input;
  const projected = projectFragmentManifest(manifest, entry, path);
  if (!projected.ok) return projected;
  const offset = entry.offset ?? { x: 0, y: 0 };
  return {
    ok: true,
    value: createMaterialComponent(document, projected.value, {
      position: { x: offset.x, y: offset.y },
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(entry.dataSource === undefined ? {} : { dataSource: entry.dataSource }),
      id: nextMaterialComponentId(document, projected.value.type, reservedIds),
      parentId,
      zIndex,
    }),
    diagnostics: [],
  };
}

/**
 * 与 manifest 默认值顶层浅合并，合并结果仍按 schema 失败关闭校验。
 *
 * 这条合并正是单节点 `insertComponent` 拒绝承担的部分：宿主改 `props` 时必须自己把必填字段
 * 全部重新展开一遍，漏一个就在提交时被 `propsSchema` 拒绝。
 */
function projectFragmentManifest(
  manifest: BaseScreenMaterialManifest,
  entry: BaseScreenFragmentNode,
  path: DiagnosticPath,
): ScreenParseResult<BaseScreenMaterialManifest> {
  const { props, style, size } = entry;
  if (props === undefined && style === undefined && size === undefined) {
    return { ok: true, value: manifest, diagnostics: [] };
  }
  let defaultProps = manifest.defaultProps;
  let defaultStyle = manifest.defaultStyle;
  if (props !== undefined) {
    const validated = validateBaseScreenMaterialProps(
      { ...manifest.defaultProps, ...props },
      manifest.propsSchema,
    );
    if (!validated.ok) {
      return { ok: false, diagnostics: repath(validated.diagnostics, [...path, 'props']) };
    }
    defaultProps = validated.value;
  }
  if (style !== undefined) {
    const validated = validateBaseScreenMaterialStyle(
      { ...manifest.defaultStyle, ...style },
      manifest.styleSchema,
    );
    if (!validated.ok) {
      return { ok: false, diagnostics: repath(validated.diagnostics, [...path, 'style']) };
    }
    defaultStyle = validated.value;
  }
  return {
    ok: true,
    value: {
      ...manifest,
      defaultProps,
      defaultStyle,
      ...(size === undefined ? {} : { defaultSize: size }),
    },
    diagnostics: [],
  };
}

function resolveFragmentParent(
  node: BaseScreenFragmentNode,
  shellId: string | undefined,
  idsByFragmentKey: ReadonlyMap<string, string>,
  path: DiagnosticPath,
): { readonly value: string | null } | { readonly diagnostics: readonly ScreenDiagnostic[] } {
  if (node.parent === undefined) return { value: shellId ?? null };
  const resolved = idsByFragmentKey.get(node.parent);
  if (resolved === undefined) {
    return {
      diagnostics: payloadFailure(
        'Fragment node parent must reference the shell key or an earlier declared node key.',
        [...path, 'parent'],
      ),
    };
  }
  return { value: resolved };
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
  if (candidate.name !== undefined && !isBoundedName(candidate.name)) {
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
  const offset = parsePosition(candidate.offset, [...path, 'offset']);
  if (!offset.ok) return offset;
  const size = parseSize(candidate.size);
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

function parseSize(value: unknown): ScreenParseResult<ScreenSize | undefined> {
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
      ['size'],
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

function repath(
  diagnostics: readonly ScreenDiagnostic[],
  path: DiagnosticPath,
): ScreenDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, path }));
}

function payloadFailure(message: string, path: DiagnosticPath): readonly ScreenDiagnostic[] {
  return failure<never>('AUTHORING_PAYLOAD_INVALID', message, path).diagnostics;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoundedName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /\S/.test(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    [...value].length <= MAX_FRAGMENT_NAME_CODE_POINTS
  );
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

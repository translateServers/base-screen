import type {
  ScreenComponentNode,
  ScreenDataSource,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
  ScreenPosition,
  ScreenValueRef,
} from '@base-screen/contracts';
import {
  getScreenSelectionBounds,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import {
  type BaseScreenComponentFragmentInsertionIntent,
  type BaseScreenFragmentDataSource,
  type BaseScreenFragmentNode,
  type BaseScreenMaterialCatalog,
  type BaseScreenMaterialManifest,
  resolveBaseScreenMaterialDefaultStyle,
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '@base-screen/plugin-core';
import { mergeDesignerBlueprintFragment } from '../blueprint/designer-blueprint-graph.js';
import { roundScreenGeometry } from '../element/designer-geometry.js';
import {
  createMaterialComponent,
  nextMaterialComponentId,
  nextMaterialComponentZIndex,
  validateInsertableMaterial,
} from './material-component.js';

/**
 * 组合分片（component fragment）的事务构建。
 *
 * 分片的形状解析只有一份，在 `@base-screen/plugin-core`（ADR-0100）：插入意图与分片定义共用。
 * 这里负责把已解析的分片按 catalog 展开成一个可撤销事务。
 *
 * `insertComponent` 一次只能按 manifest 默认值建一个节点，因此「底座 + 标题 + 读数 + 分隔线
 * 组合成的一张卡片」没有合规入口：宿主要么自己把每个物料的全部默认值重新展开一遍再发
 * `add-component`，要么依赖私有拖放 MIME。这里补的是那半条路——基座只做一次展开，分片的
 * 存储与检索仍归宿主或插件（ADR-0087 / ADR-0100）。
 */

type DiagnosticPath = ScreenDiagnostic['path'];

export interface BaseScreenComponentFragmentInsertion {
  readonly transaction: ScreenDocumentTransaction;
  /** 本次创建的全部组件 id，按声明顺序（shell 在最前）。 */
  readonly componentIds: readonly string[];
  /**
   * 插入后应选中的组件：只取分片内的根节点（有 shell 时就是 shell 一个）。
   *
   * 不能把子节点一并选中：画布拖动要求选区同属一个父级，「外壳 + 外壳的子节点」混选时拖不动，
   * 必须重新点选才能移动；成组命令的选中语义也是只选组本身。
   */
  readonly selectionIds: readonly string[];
  /** shell 优先，否则第一个根节点：与成组命令的选中语义一致。 */
  readonly focusedComponentId: string;
  /** 本次生成的文档级数据源 id（分片 key 重映射后），按声明顺序。 */
  readonly dataSourceIds: readonly string[];
  /** 本次追加的蓝图连线 id（分片 key 重映射后），按声明顺序。 */
  readonly edgeIds: readonly string[];
}

/** 分片落点策略，见 `createBaseScreenComponentFragmentTransaction`。 */
export type BaseScreenComponentFragmentPlacement = 'fit-canvas' | 'at-anchor';

/**
 * 把已解析的分片展开成一个可撤销事务：逐节点按 catalog manifest 默认值建节点，id 与 zIndex
 * 在分片内本地去重，整片只平移不变形。
 *
 * 先按偏移建出临时节点并对包围盒求并集，再把并集左上角对齐到 anchor。**不**逐节点裁剪——那会
 * 把组合拉开。
 *
 * `placement`：
 * - `'fit-canvas'`（默认，公开 `insertComponentFragment` 的语义）：整片贴进画布，比画布大时失败
 *   关闭而不是缩放；
 * - `'at-anchor'`（物料库拖放）：落点即包围盒左上角，与单个物料拖放一致——允许越出画布，由检查器
 *   的「部分内容超出画布」提示兜底。否则与画布同量级的组合几乎没有可移动余量，拖到哪都落回原处。
 */
export function createBaseScreenComponentFragmentTransaction(input: {
  readonly document: ScreenDocument;
  readonly catalog: BaseScreenMaterialCatalog;
  readonly intent: BaseScreenComponentFragmentInsertionIntent;
  readonly anchor: ScreenPosition;
  readonly placement?: BaseScreenComponentFragmentPlacement;
}): ScreenParseResult<BaseScreenComponentFragmentInsertion> {
  const { document, catalog, intent, anchor } = input;
  const placement = input.placement ?? 'fit-canvas';
  const diagnostics: ScreenDiagnostic[] = [];
  const created: ScreenComponentNode[] = [];
  const idsByFragmentKey = new Map<string, string>();
  const reservedIds = new Set<string>();
  let shellId: string | undefined;
  // 数据源先重映射：节点的 dataValue 要用到文档内的新 id。
  const dataSourceIdsByKey = new Map<string, string>();
  const dataSources = remapDataSources(document, intent.dataSources ?? [], dataSourceIdsByKey);

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
      dataSourceIdsByKey,
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
  if (
    placement === 'fit-canvas' &&
    (width > document.canvas.width || height > document.canvas.height)
  ) {
    return failure('AUTHORING_LIMIT_EXCEEDED', 'Fragment bounding box is larger than the canvas.', [
      'nodes',
    ]);
  }
  const origin =
    placement === 'fit-canvas'
      ? {
          x: clamp(anchor.x, 0, Math.max(0, document.canvas.width - width)),
          y: clamp(anchor.y, 0, Math.max(0, document.canvas.height - height)),
        }
      : anchor;
  const left = origin.x - bounds.left;
  const top = origin.y - bounds.top;
  const components = created.map((component) => ({
    ...component,
    position: {
      x: roundScreenGeometry(component.position.x + left),
      y: roundScreenGeometry(component.position.y + top),
    },
  }));
  const merged =
    intent.blueprint === undefined
      ? undefined
      : mergeDesignerBlueprintFragment(document.blueprint, intent.blueprint, idsByFragmentKey);

  // 顺序即依赖：数据源先于读取它的组件，蓝图最后（组件节点引用的组件必须已存在）。整片仍是一个事务。
  const commands: ScreenDocumentCommand[] = [];
  if (dataSources.length > 0) {
    commands.push({
      type: 'replace-data-sources',
      dataSources: [...(document.dataSources ?? []), ...dataSources],
    });
  }
  for (const component of components) commands.push({ type: 'add-component', component });
  if (merged !== undefined && merged.blueprint !== document.blueprint) {
    commands.push({ type: 'replace-blueprint', blueprint: merged.blueprint });
  }
  const createdIds = new Set(components.map((component) => component.id));
  const selectionIds = components
    .filter((component) => component.parentId === null || !createdIds.has(component.parentId))
    .map((component) => component.id);
  return {
    ok: true,
    value: {
      transaction: { commands },
      componentIds: components.map((component) => component.id),
      selectionIds,
      focusedComponentId: selectionIds[0] ?? components[0]!.id,
      dataSourceIds: dataSources.map((source) => source.id),
      edgeIds: merged?.edgeIds ?? [],
    },
    diagnostics: [],
  };
}

/** 分片 key → 文档内唯一 id：优先沿用 key，冲突时加数字后缀；参数里的数据源引用一并重映射。 */
function remapDataSources(
  document: ScreenDocument,
  sources: readonly BaseScreenFragmentDataSource[],
  idsByKey: Map<string, string>,
): ScreenDataSource[] {
  const taken = new Set((document.dataSources ?? []).map((source) => source.id));
  return sources.map(({ key, ...source }) => {
    const id = uniqueIdentifier(key, taken);
    taken.add(id);
    idsByKey.set(key, id);
    return {
      ...source,
      id,
      params: Object.fromEntries(
        Object.entries(source.params).map(([name, ref]) => [name, remapValueRef(ref, idsByKey)]),
      ),
    };
  });
}

function remapValueRef(ref: ScreenValueRef, idsByKey: ReadonlyMap<string, string>): ScreenValueRef {
  if (ref.kind !== 'data-source-field') return ref;
  return { ...ref, dataSourceId: idsByKey.get(ref.dataSourceId) ?? ref.dataSourceId };
}

/** 与组件 id 同一词法（≤128）：分片 key ≤64，加 `-N` 后缀不会越界。 */
function uniqueIdentifier(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function buildFragmentComponent(input: {
  readonly document: ScreenDocument;
  readonly manifest: BaseScreenMaterialManifest;
  readonly entry: BaseScreenFragmentNode;
  readonly parentId: string | null;
  readonly reservedIds: Set<string>;
  readonly zIndex: number;
  readonly path: DiagnosticPath;
  readonly dataSourceIdsByKey?: ReadonlyMap<string, string>;
}): ScreenParseResult<ScreenComponentNode> {
  const { document, manifest, entry, parentId, reservedIds, zIndex, path } = input;
  const projected = projectFragmentManifest(document, manifest, entry, path);
  if (!projected.ok) return projected;
  const offset = entry.offset ?? { x: 0, y: 0 };
  const node = entry;
  // 读共享数据源的节点不再带 legacy dataSource（文档契约：两者互斥）。
  const readsValue = node.dataValue !== undefined;
  const component = createMaterialComponent(document, projected.value, {
    position: { x: offset.x, y: offset.y },
    ...(entry.name === undefined ? {} : { name: entry.name }),
    ...(readsValue ? { dataSource: null } : {}),
    ...(node.dataSource === undefined ? {} : { dataSource: node.dataSource }),
    id: nextMaterialComponentId(document, projected.value.type, reservedIds),
    parentId,
    zIndex,
  });
  return {
    ok: true,
    value: {
      ...component,
      ...(entry.rotation === undefined ? {} : { rotation: entry.rotation }),
      ...(node.dataValue === undefined
        ? {}
        : {
            dataValue:
              node.dataValue === null
                ? null
                : remapValueRef(node.dataValue, input.dataSourceIdsByKey ?? new Map()),
          }),
      ...(node.dataBinding === undefined ? {} : { dataBinding: node.dataBinding }),
    },
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
  document: ScreenDocument,
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
  // 显式样式分支已经按主题解析过默认值；投影结果去掉 `themeStyle`，否则建节点时会再解析一次，
  // 把分片显式写的同名键覆盖掉。
  let themed: BaseScreenMaterialManifest = manifest;
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
    // 先按主题取默认值，再叠分片显式写的样式：分片写了的键以分片为准，
    // 没写的键跟随主题（ADR-0101）。
    const validated = validateBaseScreenMaterialStyle(
      { ...resolveBaseScreenMaterialDefaultStyle(manifest, document.theme), ...style },
      manifest.styleSchema,
    );
    if (!validated.ok) {
      return { ok: false, diagnostics: repath(validated.diagnostics, [...path, 'style']) };
    }
    defaultStyle = validated.value;
    const { themeStyle: _themeStyle, ...unthemed } = manifest;
    themed = unthemed;
  }
  return {
    ok: true,
    value: {
      ...themed,
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

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: DiagnosticPath = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

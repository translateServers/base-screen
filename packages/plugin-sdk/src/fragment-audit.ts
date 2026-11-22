import { type ScreenJsonValue, screenJsonEquals } from '@base-screen/contracts';
import {
  type BaseScreenFragmentDefinition,
  type BaseScreenFragmentEntry,
  type BaseScreenMaterialCatalog,
  parseBaseScreenFragmentDefinition,
} from '@base-screen/plugin-core';
import {
  type BaseScreenAuthoringFinding,
  sortBaseScreenAuthoringFindings,
} from './authoring-finding.js';

/** ADR-0100 F6：建议规模。超出不阻断，但它更像一张页面模板。 */
const SUGGESTED_NODES = 8;
const SUGGESTED_DEPTH = 2;
/** F2：一个节点盖住其余节点包围盒的这个比例以上，视为「底板」。 */
const BACKDROP_COVERAGE = 0.9;
const BACKDROP_MATERIALS: ReadonlySet<string> = new Set(['base.rectangle', 'base.container']);

/**
 * 组合组件体检（base-screen-docs ADR-0105 §2.6）：ADR-0100 的 F 规则在作者保存组合时的运行时口径。
 *
 * - `SPEC`：分片形状错误（`parseBaseScreenFragmentDefinition`）；
 * - `F8`：引用的物料不在 catalog（错误）或已下架（警告）；外壳不接受子节点（错误）；
 * - `F2`：没有外壳却用一块矩形 / 容器垫在其余节点下面 → 建议把底板换成容器外壳；
 * - `F4`：多个节点各自带着同一个数据源 → 建议共享文档级数据源（一次查询、多处读取）；
 * - `F6`：节点超过 8 个或嵌套超过 2 层（警告）；
 * - `F9`：节点未命名（警告）：插入后图层面板只显示物料名，作者分不清哪个是标题、哪个是读数。
 */
export function auditBaseScreenFragment(
  input: unknown,
  catalog?: BaseScreenMaterialCatalog,
): readonly BaseScreenAuthoringFinding[] {
  const parsed = parseBaseScreenFragmentDefinition(input);
  if (!parsed.ok) {
    return parsed.diagnostics.map((item) => ({
      rule: 'SPEC',
      severity: 'error',
      message: item.message,
      path: item.path,
    }));
  }
  const fragment = parsed.value;
  const findings: BaseScreenAuthoringFinding[] = [];
  if (catalog !== undefined) auditMaterials(fragment, catalog, findings);
  auditBackdrop(fragment, findings);
  auditSharedData(fragment, findings);
  auditScale(fragment, findings);
  fragment.nodes.forEach((node, index) => {
    if (node.name === undefined || node.name.trim() === '') {
      findings.push({
        rule: 'F9',
        severity: 'warning',
        message: `节点 ${node.key} 没有名称：插入后图层里只显示物料名。`,
        path: ['nodes', index, 'name'],
      });
    }
  });
  return sortBaseScreenAuthoringFindings(findings);
}

function auditMaterials(
  fragment: BaseScreenFragmentDefinition,
  catalog: BaseScreenMaterialCatalog,
  findings: BaseScreenAuthoringFinding[],
): void {
  const entries: readonly (readonly [BaseScreenFragmentEntry, readonly (string | number)[]])[] = [
    ...(fragment.shell === undefined ? [] : [[fragment.shell, ['shell']] as const]),
    ...fragment.nodes.map((node, index) => [node, ['nodes', index]] as const),
  ];
  for (const [entry, path] of entries) {
    const manifest = catalog.get(entry.materialType)?.manifest;
    if (manifest === undefined) {
      findings.push({
        rule: 'F8',
        severity: 'error',
        message: `引用的物料 ${entry.materialType} 不在物料目录里。`,
        path: [...path, 'materialType'],
      });
      continue;
    }
    if (manifest.libraryVisible === false) {
      findings.push({
        rule: 'F8',
        severity: 'warning',
        message: `「${manifest.name}」已下架：已有组合仍可插入，但新作者在物料库里找不到它。`,
        path: [...path, 'materialType'],
      });
    }
    if (entry === fragment.shell && manifest.designCapabilities.children !== true) {
      findings.push({
        rule: 'F8',
        severity: 'error',
        message: `外壳「${manifest.name}」不接受子节点，改用容器。`,
        path: [...path, 'materialType'],
      });
    }
  }
}

function auditBackdrop(
  fragment: BaseScreenFragmentDefinition,
  findings: BaseScreenAuthoringFinding[],
): void {
  if (fragment.shell !== undefined || fragment.nodes.length < 2) return;
  const [first, ...rest] = fragment.nodes;
  if (first === undefined || !BACKDROP_MATERIALS.has(first.materialType)) return;
  const backdrop = rect(first);
  const others = rest.map(rect).filter((item) => item !== undefined);
  if (backdrop === undefined || others.length === 0) return;
  const covered = others.filter((item) => overlapRatio(item, backdrop) >= BACKDROP_COVERAGE);
  if (covered.length === others.length) {
    findings.push({
      rule: 'F2',
      severity: 'warning',
      message:
        '底板由外壳承担：把这块矩形换成容器，其余节点放进容器后整体存为组合，卡片才能整体移动、缩放。',
      path: ['nodes', 0],
    });
  }
}

function auditSharedData(
  fragment: BaseScreenFragmentDefinition,
  findings: BaseScreenAuthoringFinding[],
): void {
  const sources = fragment.nodes.flatMap((node) =>
    node.dataSource === undefined || node.dataSource === null ? [] : [node.dataSource],
  );
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    if (source.type !== 'dataset' && source.type !== 'host-resource') continue;
    // 比较对象取全集类型：static 等其他来源因 type 不同直接判否。
    const sameSource = (other: (typeof sources)[number]): boolean =>
      other.type === source.type &&
      screenJsonEquals(withoutBinding(other), withoutBinding(source));
    if (sources.slice(0, index).some(sameSource)) continue;
    if (sources.slice(index + 1).some(sameSource)) {
      findings.push({
        rule: 'F4',
        severity: 'warning',
        message: '多个节点各自查询同一个数据源：改为共享文档级数据源，一次查询、多处读取。',
        path: ['nodes'],
      });
      return;
    }
  }
}

function auditScale(
  fragment: BaseScreenFragmentDefinition,
  findings: BaseScreenAuthoringFinding[],
): void {
  if (fragment.nodes.length > SUGGESTED_NODES) {
    findings.push({
      rule: 'F6',
      severity: 'warning',
      message: `组合有 ${fragment.nodes.length} 个节点（建议不超过 ${SUGGESTED_NODES} 个）：更像页面模板，考虑拆成几个组合。`,
      path: ['nodes'],
    });
  }
  const parents = new Map(fragment.nodes.map((node) => [node.key, node.parent]));
  const depth = (key: string | undefined, seen = 0): number => {
    if (key === undefined || seen > 64) return seen;
    return depth(parents.get(key), seen + 1);
  };
  const deepest = Math.max(0, ...fragment.nodes.map((node) => depth(node.key)));
  if (deepest > SUGGESTED_DEPTH) {
    findings.push({
      rule: 'F6',
      severity: 'warning',
      message: `组合嵌套 ${deepest} 层（建议不超过 ${SUGGESTED_DEPTH} 层）。`,
      path: ['nodes'],
    });
  }
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function rect(entry: BaseScreenFragmentEntry): Box | undefined {
  if (entry.size === undefined) return undefined;
  return {
    x: entry.offset?.x ?? 0,
    y: entry.offset?.y ?? 0,
    width: entry.size.width,
    height: entry.size.height,
  };
}

/** `inner` 落在 `outer` 里的面积比例。 */
function overlapRatio(inner: Box, outer: Box): number {
  const width = Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x);
  const height =
    Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y);
  const area = inner.width * inner.height;
  return width <= 0 || height <= 0 || area <= 0 ? 0 : (width * height) / area;
}

function withoutBinding(source: object): ScreenJsonValue {
  const { binding: _binding, ...rest } = source as { readonly binding?: unknown };
  return rest as ScreenJsonValue;
}

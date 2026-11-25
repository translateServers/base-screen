import {
  readScreenBlueprintEventPort,
  type ScreenDiagnostic,
  type ScreenDocument,
} from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogDiff,
} from '@base-screen/plugin-core';
import type { BaseScreenMaterialLibraryGrouping } from '../material-library/material-library-grouping.js';

/** `refreshCatalog` 的公共结果：只报告 type，不携带 Manifest 或 constructor。 */
export interface BaseScreenMaterialCatalogRefreshResult {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

/**
 * `refreshCatalog` 的可选项（base-screen-docs ADR-0105 §4 范式改进 P2）。
 *
 * 宿主配置了物料库分组时，分组必须覆盖每个可见物料、且不能引用不存在或已下架的类型——
 * 新增 / 下架在线物料时，旧分组对新 catalog 必然不成立，而先改分组又会对旧 catalog 不成立。
 * 因此分组随 catalog 一起交换：`materialLibraryGrouping` 按**新** catalog 校验，与 catalog
 * 同一次全有或全无；省略时沿用当前分组（仍须对新 catalog 成立）。
 */
export interface BaseScreenMaterialCatalogRefreshOptions {
  readonly materialLibraryGrouping?: BaseScreenMaterialLibraryGrouping;
}

/**
 * 纯文档兼容性检查：子级能力收回与 Blueprint 物料事件引用。
 *
 * props/style/data 的 schema 校验由 Renderer 的 `validateCatalog` 负责；这里只补
 * `prepareCandidates` 不覆盖的结构性约束。无诊断表示可以交换 catalog。
 */
export function collectCatalogCompatibilityDiagnostics(
  document: ScreenDocument,
  catalog: BaseScreenMaterialCatalog,
  diff: BaseScreenMaterialCatalogDiff,
): readonly ScreenDiagnostic[] {
  const diagnostics: ScreenDiagnostic[] = [];
  const changedTypes = new Set(diff.changed);
  if (changedTypes.size === 0) return diagnostics;

  for (let index = 0; index < document.components.length; index++) {
    const component = document.components[index]!;
    if (!changedTypes.has(component.type)) continue;
    const entry = catalog.get(component.type);
    if (entry === undefined || entry.manifest.designCapabilities.children === true) continue;
    if (!document.components.some((child) => child.parentId === component.id)) continue;
    diagnostics.push({
      severity: 'error',
      code: 'PLUGIN_CORE_CAPABILITY_INCOMPATIBLE',
      path: ['components', index, 'type'],
      message: 'Material no longer supports children.',
    });
  }

  const componentsById = new Map(document.components.map((component) => [component.id, component]));
  const nodes = new Map(document.blueprint.nodes.map((node) => [node.id, node]));
  const edges = document.blueprint.edges;
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex]!;
    if (edge.kind !== 'flow') continue;
    const source = nodes.get(edge.from.node);
    if (source?.kind !== 'component') continue;
    const component = componentsById.get(source.componentId);
    if (component === undefined || !changedTypes.has(component.type)) continue;
    const entry = catalog.get(component.type);
    const eventName = readScreenBlueprintEventPort(edge.from.port);
    if (
      entry === undefined ||
      eventName === undefined ||
      entry.manifest.events.includes(eventName)
    ) {
      continue;
    }
    diagnostics.push({
      severity: 'error',
      code: 'PLUGIN_CORE_EVENT_PAYLOAD_INVALID',
      path: ['blueprint', 'edges', edgeIndex, 'from', 'port'],
      message: 'Blueprint references an event that is no longer declared by the material.',
    });
  }

  return diagnostics;
}

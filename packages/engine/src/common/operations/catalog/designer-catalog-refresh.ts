import type { ScreenDiagnostic, ScreenDocument } from '@base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogDiff,
} from '@base-screen/plugin-core';

/** `refreshCatalog` 的公共结果：只报告 type，不携带 Manifest 或 constructor。 */
export interface BaseScreenMaterialCatalogRefreshResult {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
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
  const relations = document.blueprint.relations;
  for (let relationIndex = 0; relationIndex < relations.length; relationIndex++) {
    const relation = relations[relationIndex]!;
    if (relation.type !== 'behavior' || relation.source.kind !== 'component') continue;
    const source = relation.source;
    const component = componentsById.get(source.componentId);
    if (component === undefined || !changedTypes.has(component.type)) continue;
    const entry = catalog.get(component.type);
    if (entry === undefined || entry.manifest.events.includes(source.event.eventName)) continue;
    diagnostics.push({
      severity: 'error',
      code: 'PLUGIN_CORE_EVENT_PAYLOAD_INVALID',
      path: ['blueprint', 'relations', relationIndex, 'source', 'event', 'eventName'],
      message: 'Blueprint references an event that is no longer declared by the material.',
    });
  }

  return diagnostics;
}

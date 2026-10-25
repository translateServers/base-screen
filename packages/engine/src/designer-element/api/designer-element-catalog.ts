import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { diffBaseScreenMaterialCatalogs } from '@base-screen/plugin-core';
import type { BaseScreenMaterialCatalogRefreshResult } from '../../common/operations/catalog/designer-catalog-refresh.js';
import { collectCatalogCompatibilityDiagnostics } from '../../common/operations/catalog/designer-catalog-refresh.js';
import { validateBaseScreenMaterialLibraryGroupingForCatalog } from '../../common/operations/material-library/material-library-grouping.js';
import { resolveBaseScreenMaterialLibraryItems } from '../../common/operations/material-library/material-library-items.js';
import { isBaseScreenMaterialCatalog } from '../runtime/designer-element-guards.js';
import type { DesignerElementHost } from '../runtime/designer-element-host.js';
import {
  type DesignerElementState,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

/**
 * 初始化后更新物料目录的唯一入口（ADR-0090）。
 *
 * 全有或全无：先校验 catalog、物料库分组/条目、当前文档与 Blueprint，再交换目录并重渲染；
 * 任一步失败保持 catalog、文档、DOM、历史与数据源状态不变。
 */
export function refreshCatalog(
  element: DesignerElementHost,
  catalog: BaseScreenMaterialCatalog,
): ScreenParseResult<BaseScreenMaterialCatalogRefreshResult> {
  const state = getDesignerElementState(element);
  if (state.catalog === undefined) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Designer must be configured before refreshing its catalog.',
    );
  }
  if (!isBaseScreenMaterialCatalog(catalog)) {
    return failure('PLUGIN_CORE_IDENTITY_INVALID', 'Material catalog is invalid.');
  }

  const diff = diffBaseScreenMaterialCatalogs(state.catalog, catalog);
  if (state.materialLibraryGrouping !== undefined) {
    const grouping = validateBaseScreenMaterialLibraryGroupingForCatalog(
      state.materialLibraryGrouping,
      catalog,
    );
    if (!grouping.ok) return { ok: false, diagnostics: grouping.diagnostics };
  }
  const resolvedItems = resolveBaseScreenMaterialLibraryItems(catalog, state.materialLibraryItems);
  if (!resolvedItems.ok) return { ok: false, diagnostics: resolvedItems.diagnostics };

  const document = state.session.document;
  const renderer = state.renderer;
  if (document !== undefined && renderer === undefined) {
    return failure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Catalog refresh requires an initialized renderer while a document is loaded.',
    );
  }
  if (document !== undefined && renderer !== undefined) {
    const validated = renderer.validateCatalog(document, catalog);
    if (!validated.ok) return { ok: false, diagnostics: validated.diagnostics };
    const compatibility = collectCatalogCompatibilityDiagnostics(document, catalog, diff);
    if (compatibility.length > 0) return { ok: false, diagnostics: compatibility };
  }

  const previousCatalog = state.catalog;
  const previousResolvedItems = state.resolvedMaterialLibraryItems;
  state.catalog = catalog;
  state.resolvedMaterialLibraryItems = resolvedItems.value;

  if (document === undefined || renderer === undefined) {
    state.runtime.renderMaterialLibraryItems(element);
    return success(diff);
  }

  const catalogResult = renderer.setCatalog(catalog);
  if (!catalogResult.ok) {
    restoreCatalog(state, element, previousCatalog, previousResolvedItems, document);
    return { ok: false, diagnostics: catalogResult.diagnostics };
  }
  const rendered = state.canvasRuntimeController.render(document);
  if (!rendered.ok) {
    restoreCatalog(state, element, previousCatalog, previousResolvedItems, document);
    return { ok: false, diagnostics: rendered.diagnostics };
  }
  state.runtime.renderMaterialLibraryItems(element);
  state.runtime.renderInteraction(element);
  return success(diff);
}

function restoreCatalog(
  state: DesignerElementState,
  element: DesignerElementHost,
  previousCatalog: BaseScreenMaterialCatalog,
  previousResolvedItems: DesignerElementState['resolvedMaterialLibraryItems'],
  document: ScreenDocument,
): void {
  state.catalog = previousCatalog;
  state.resolvedMaterialLibraryItems = previousResolvedItems;
  state.renderer?.setCatalog(previousCatalog);
  state.canvasRuntimeController.render(document);
  state.runtime.renderMaterialLibraryItems(element);
  state.runtime.renderInteraction(element);
}

function success(
  diff: ReturnType<typeof diffBaseScreenMaterialCatalogs>,
): ScreenParseResult<BaseScreenMaterialCatalogRefreshResult> {
  return {
    ok: true,
    value: { added: diff.added, changed: diff.changed, removed: diff.removed },
    diagnostics: [],
  };
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}

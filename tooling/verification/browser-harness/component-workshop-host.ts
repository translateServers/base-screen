import {
  createComponentWorkshop,
  createLocalWorkshopFragmentStore,
  createLocalWorkshopMaterialStore,
  loadSpecMaterialEntry,
  type WorkshopMaterialRuntime,
  withWorkshopLibraryGroup,
} from '../../../examples/vanilla-host/src/screen/component-workshop.ts';
import type { ScreenParseResult } from '../../../packages/contracts/src/index.ts';
import {
  BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
  type BaseScreenDesignerElement,
} from '../../../packages/engine/src/index.ts';
import {
  type BaseScreenMaterialCatalogEntry,
  createBaseScreenMaterialCatalog,
} from '../../../packages/plugin-core/src/index.ts';

/**
 * browser-harness 的组件工坊宿主（`?designer&workshop`）：与三端示例同一份工坊实现，
 * 存储换成 localStorage（harness 没有后端），catalog 由这里重建后 `refreshCatalog`（ADR-0090）。
 *
 * 只在带 `workshop` 参数时挂载：工坊按钮是固定定位的页面元素，常驻会干扰其他断言的命中测试。
 */
const MATERIAL_STORAGE_KEY = 'base-screen-harness:workshop-materials';
const FRAGMENT_STORAGE_KEY = 'base-screen-harness:workshop-fragments';

export async function mountHarnessComponentWorkshop(
  designer: BaseScreenDesignerElement,
): Promise<{ readonly dispose: () => void }> {
  const online = new Map<string, BaseScreenMaterialCatalogEntry>();
  const commit = (
    next: ReadonlyMap<string, BaseScreenMaterialCatalogEntry>,
  ): ScreenParseResult<unknown> => {
    // 基础目录取当前 catalog 去掉在线类型：其他用例换过 catalog 时也以设计器为准。
    const base = (designer.catalog?.list() ?? []).filter(
      (entry) => !online.has(entry.manifest.type) && !next.has(entry.manifest.type),
    );
    // harness 配置了物料库分组：在线组件随 catalog 一起进「在线组件」分组（ADR-0105 P2）。
    const grouping = designer.materialLibraryGrouping;
    const onlineTypes = new Set([...online.keys(), ...next.keys()]);
    const visibleTypes = [...next.values()]
      .filter((entry) => entry.manifest.libraryVisible !== false)
      .map((entry) => entry.manifest.type);
    const refreshed = designer.refreshCatalog(
      createBaseScreenMaterialCatalog([...base, ...next.values()]),
      grouping === undefined
        ? {}
        : {
            materialLibraryGrouping: withWorkshopLibraryGroup(grouping, onlineTypes, visibleTypes),
          },
    );
    if (refreshed.ok) {
      online.clear();
      for (const [type, entry] of next) online.set(type, entry);
    }
    return refreshed;
  };
  const runtime: WorkshopMaterialRuntime = {
    async apply(pkg) {
      const loaded = await loadSpecMaterialEntry(pkg.code, pkg.manifest);
      if (!loaded.ok) return loaded;
      const next = new Map(online);
      next.set(pkg.type, loaded.value);
      return commit(next);
    },
    async remove(type) {
      if (!online.has(type)) return { ok: true, value: null, diagnostics: [] };
      const next = new Map(online);
      next.delete(type);
      return commit(next);
    },
  };
  const materials = createLocalWorkshopMaterialStore(MATERIAL_STORAGE_KEY);
  // 刷新页面后把已发布的在线组件装回来（示例宿主由 host-runtime 在启动时做同一件事）。
  const stored = await materials.list();
  if (stored.ok) {
    for (const pkg of stored.value) {
      const applied = await runtime.apply(pkg);
      if (!applied.ok) console.warn('[workshop] 在线组件装载失败', pkg.name, applied.diagnostics);
    }
  }
  const workshop = createComponentWorkshop({
    designer,
    materials,
    runtime,
    fragments: createLocalWorkshopFragmentStore(FRAGMENT_STORAGE_KEY),
    fragmentSaveRequestEvent: BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
    fragmentIdPrefix: 'harness.fragment',
  });
  workshop.element.style.cssText = 'position:fixed;right:24px;bottom:48px;z-index:30;';
  document.body.append(workshop.element);
  Object.assign(window, { baseScreenWorkshop: workshop });
  return { dispose: () => workshop.dispose() };
}

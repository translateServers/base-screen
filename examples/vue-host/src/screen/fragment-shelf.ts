import type { BaseScreenDesignerElement } from 'base-screen';
import { BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT } from 'base-screen/designer';
import { api } from '../lib/api';
import type { OnlineMaterialPackageShape } from '../types';
import {
  createComponentWorkshop,
  createLocalWorkshopFragmentStore,
  type WorkshopMaterialPackage,
  type WorkshopMaterialStore,
  type WorkshopResult,
} from './component-workshop';
import { loadHostRuntime } from './host-runtime';
import { METRIC_CARD_FRAGMENT } from './metric-value';

/**
 * 宿主的组件工坊接线（ADR-0105，三端逐字共享）：原子组件存到后端 `MaterialPackage`（ADR-0090），
 * 组合组件存到 localStorage（示例级；真实宿主应落自己的后端），预置「指标卡」只读。
 *
 * 设计器的「存为组合」只派发保存请求，命名、归类、体检与保存都在工坊里完成（ADR-0100 第二阶段）。
 * 在线组件的加载与热刷新沿用 `host-runtime`：启动时装载全部包，发布后 `applyOnlineMaterialPackage`。
 */
const FRAGMENT_STORAGE_KEY = 'base-screen-example:workshop-fragments';

export function attachHostComponentWorkshop(
  designer: BaseScreenDesignerElement,
  onDispose: (cleanup: () => void) => void,
): void {
  const materials: WorkshopMaterialStore = {
    async list() {
      const result = await api.listMaterialPackages();
      return result.ok
        ? { ok: true, value: result.data.packages }
        : { ok: false, message: result.error.message };
    },
    async save(input) {
      const body = { type: input.type, name: input.name, manifest: { ...input.manifest }, code: input.code };
      const result =
        input.id === undefined
          ? await api.createMaterialPackage(body)
          : await api.updateMaterialPackage(input.id, { ...body, revision: input.revision ?? 0 });
      return packageResult(result);
    },
    async setVisibility(id, visible) {
      return packageResult(await api.setMaterialPackageVisibility(id, visible));
    },
    async remove(id) {
      const result = await api.deleteMaterialPackage(id);
      return result.ok ? { ok: true, value: null } : { ok: false, message: result.error.message };
    },
  };
  const workshop = createComponentWorkshop({
    designer,
    materials,
    runtime: {
      async apply(pkg) {
        const runtime = await loadHostRuntime();
        return runtime.applyOnlineMaterialPackage(toPackageShape(pkg), 'code');
      },
      async remove(type) {
        const runtime = await loadHostRuntime();
        return runtime.removeOnlineMaterialPackage(type);
      },
    },
    fragments: createLocalWorkshopFragmentStore(FRAGMENT_STORAGE_KEY),
    presetFragments: [METRIC_CARD_FRAGMENT],
    fragmentSaveRequestEvent: BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT,
  });
  workshop.element.style.cssText = 'position:fixed;right:16px;bottom:40px;z-index:30;';
  document.body.append(workshop.element);
  onDispose(() => workshop.dispose());
}

function packageResult(
  result:
    | { readonly ok: true; readonly data: { readonly package: OnlineMaterialPackageShape } }
    | { readonly ok: false; readonly error: { readonly message: string } },
): WorkshopResult<WorkshopMaterialPackage> {
  return result.ok
    ? { ok: true, value: result.data.package }
    : { ok: false, message: result.error.message };
}

/** 工坊只关心包的身份与内容；运行时接口要完整的后端形状，时间戳不参与装载。 */
function toPackageShape(pkg: WorkshopMaterialPackage): OnlineMaterialPackageShape {
  const full = pkg as Partial<OnlineMaterialPackageShape>;
  return {
    id: pkg.id,
    type: pkg.type,
    name: pkg.name,
    code: pkg.code,
    manifest: { ...pkg.manifest },
    revision: pkg.revision,
    createdAt: full.createdAt ?? '',
    updatedAt: full.updatedAt ?? '',
  };
}

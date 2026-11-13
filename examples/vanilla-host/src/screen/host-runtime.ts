import {
  createPluginMaterialsRuntime,
  PLUGIN_MATERIALS_ID,
  PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
  PLUGIN_PIPELINE_ACTION_CAPABILITY,
  registerPluginMaterials,
} from '@base-screen/plugin-materials';
import { type BaseScreenRuntime, createBaseScreenRuntime } from 'base-screen';
import { SCREEN_BLUEPRINT_CAPABILITY_IDS, type ScreenParseResult } from 'base-screen/contracts';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialCatalogEntry,
} from 'base-screen/plugin-core';
import {
  createBaseScreenMaterialCatalog,
  parseBaseScreenMaterialManifest,
} from 'base-screen/plugin-core';
import { api } from '../lib/api';
import type { OnlineMaterialPackageShape } from '../types';
import { createHostResourceRuntime } from './host-resource-plugin';
import {
  loadOnlineMaterialEntry,
  type OnlineMaterialApplyResult,
  type OnlineMaterialRuntime,
} from './online-materials';
import { registerHostMaterials } from './register';

const INSTANCE_ID = 'vanilla-host';

export interface HostRuntime extends BaseScreenRuntime, OnlineMaterialRuntime {}

let runtimePromise: Promise<HostRuntime> | undefined;

/** 应用共享一个标准 runtime；初始化失败清掉 Promise，允许下次进入时重试。 */
export function loadHostRuntime(): Promise<HostRuntime> {
  runtimePromise ??= createHostRuntime().catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

async function createHostRuntime(): Promise<HostRuntime> {
  // 物料插件只提供 runtime 与幂等注册入口，元素由插件自身定义。
  registerPluginMaterials();
  const created = await createBaseScreenRuntime({
    instanceId: INSTANCE_ID,
    materials: registerHostMaterials(),
    plugins: [createPluginMaterialsRuntime(), createHostResourceRuntime()],
    grantedCapabilities: {
      // 统一物料插件同时承载物料、资源类型、处理器与蓝图动作，四项能力都要显式批准。
      [PLUGIN_MATERIALS_ID]: [
        'command.execute',
        'design.read',
        PLUGIN_METRICS_BLUEPRINT_CAPABILITY,
        PLUGIN_PIPELINE_ACTION_CAPABILITY,
      ],
    },
    blueprintCapabilities: SCREEN_BLUEPRINT_CAPABILITY_IDS,
  });
  if (!created.ok) {
    throw new Error(`HOST_RUNTIME_ACTIVATION_FAILED:${created.diagnostics[0]?.code}`);
  }
  const base = created.value;
  try {
    return await extendHostRuntime(base);
  } catch (error) {
    await base.dispose();
    throw error;
  }
}

async function extendHostRuntime(base: BaseScreenRuntime): Promise<HostRuntime> {
  const baseCatalogEntries = base.catalog.list();
  const baseTypes = new Set(baseCatalogEntries.map((entry) => entry.manifest.type));
  const onlineEntries = new Map<string, BaseScreenMaterialCatalogEntry>();
  const onlineMaterialErrors: string[] = [];
  const packages = await api.listMaterialPackages();
  if (packages.ok) {
    for (const pkg of packages.data.packages) {
      if (baseTypes.has(pkg.type) || pkg.manifest.type !== pkg.type) {
        onlineMaterialErrors.push(`${pkg.name}: 物料类型与内置物料冲突或包身份不一致`);
        continue;
      }
      const loaded = await loadOnlineMaterialEntry(pkg);
      if (!loaded.ok) {
        onlineMaterialErrors.push(`${pkg.name}: ${loaded.diagnostics[0]?.message ?? '加载失败'}`);
        continue;
      }
      if (loaded.value.manifest.type !== pkg.type || baseTypes.has(loaded.value.manifest.type)) {
        onlineMaterialErrors.push(`${pkg.name}: 物料类型与内置物料冲突或包身份不一致`);
        continue;
      }
      onlineEntries.set(pkg.type, loaded.value);
    }
  } else {
    onlineMaterialErrors.push(`在线物料读取失败：${packages.error.message}`);
  }

  const buildCatalog = (
    entries: ReadonlyMap<string, BaseScreenMaterialCatalogEntry>,
  ): BaseScreenMaterialCatalog =>
    createBaseScreenMaterialCatalog([...baseCatalogEntries, ...entries.values()]);
  const commitOnlineEntries = (
    next: ReadonlyMap<string, BaseScreenMaterialCatalogEntry>,
  ): ScreenParseResult<null> => {
    const committed = base.setCatalog(buildCatalog(next));
    if (!committed.ok) return committed;
    onlineEntries.clear();
    for (const [type, entry] of next) onlineEntries.set(type, entry);
    return committed;
  };
  const initialized = base.setCatalog(buildCatalog(onlineEntries));
  if (!initialized.ok) {
    throw new Error(`HOST_ONLINE_CATALOG_FAILED:${initialized.diagnostics[0]?.code}`);
  }

  return {
    ...base,
    get catalog(): BaseScreenMaterialCatalog {
      return base.catalog;
    },
    get disposed(): boolean {
      return base.disposed;
    },
    onlineMaterialErrors,
    async applyOnlineMaterialPackage(
      pkg: OnlineMaterialPackageShape,
      mode: 'code' | 'manifest',
    ): Promise<ScreenParseResult<OnlineMaterialApplyResult | null>> {
      if (base.disposed) {
        return runtimeFailure('PLUGIN_CORE_LIFECYCLE_INVALID', '宿主运行时已释放。');
      }
      const manifest = parseBaseScreenMaterialManifest(pkg.manifest);
      if (!manifest.ok) return manifest;
      if (manifest.value.type !== pkg.type || baseTypes.has(manifest.value.type)) {
        return runtimeFailure(
          'PLUGIN_CORE_IDENTITY_CONFLICT',
          `物料类型 ${manifest.value.type} 与内置物料冲突或包身份不一致。`,
        );
      }
      let entry: BaseScreenMaterialCatalogEntry;
      let previousManifest: PropertyDescriptor | undefined;
      if (mode === 'manifest') {
        const existing = onlineEntries.get(pkg.type);
        if (existing === undefined) {
          return runtimeFailure(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            '在线物料尚未加载，请先发布代码。',
          );
        }
        if (manifest.value.tagName !== existing.manifest.tagName) {
          return runtimeFailure('PLUGIN_CORE_IDENTITY_CONFLICT', '仅更新清单不能改变物料标签。');
        }
        previousManifest = Object.getOwnPropertyDescriptor(existing.constructor, 'manifest');
        try {
          Object.defineProperty(existing.constructor, 'manifest', {
            value: manifest.value,
            configurable: true,
          });
        } catch {
          return runtimeFailure(
            'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
            '无法把 Manifest 挂到在线物料构造器。',
          );
        }
        entry = { ...existing, manifest: manifest.value };
      } else {
        const loaded = await loadOnlineMaterialEntry(pkg);
        if (!loaded.ok) return loaded;
        entry = loaded.value;
      }
      const next = new Map(onlineEntries);
      next.set(pkg.type, entry);
      const committed = commitOnlineEntries(next);
      if (!committed.ok && previousManifest !== undefined) {
        Object.defineProperty(entry.constructor, 'manifest', previousManifest);
      }
      return committed;
    },
    async removeOnlineMaterialPackage(
      type: string,
    ): Promise<ScreenParseResult<OnlineMaterialApplyResult | null>> {
      if (base.disposed) {
        return runtimeFailure('PLUGIN_CORE_LIFECYCLE_INVALID', '宿主运行时已释放。');
      }
      if (!onlineEntries.has(type)) return { ok: true, value: null, diagnostics: [] };
      const next = new Map(onlineEntries);
      next.delete(type);
      return commitOnlineEntries(next);
    },
  };
}

function runtimeFailure<T>(
  code:
    | 'PLUGIN_CORE_LIFECYCLE_INVALID'
    | 'PLUGIN_CORE_IDENTITY_CONFLICT'
    | 'PLUGIN_CORE_MANIFEST_FIELD_INVALID',
  message: string,
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path: [], message }] };
}

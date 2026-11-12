import type {
  ScreenBlueprintCapabilityId,
  ScreenDiagnostic,
  ScreenDocument,
  ScreenParseResult,
} from '@base-screen/contracts';
import {
  type BaseScreenDesignerConfiguration,
  BaseScreenDesignerElement,
  type CreateBaseScreenCorePluginDesignReadPortOptions,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
} from '@base-screen/engine';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenRuleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
} from '@base-screen/material';
import {
  type BaseScreenPluginManager,
  type BaseScreenPluginManagerOptions,
  type BaseScreenPluginManagerSnapshot,
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '@base-screen/plugin-manager';
import {
  type CreatePluginRegistrationOptions,
  createMaterialDefinition,
  createPluginRegistration,
} from '@base-screen/plugin-sdk';
import { type BaseScreenViewerConfiguration, BaseScreenViewerElement } from '@base-screen/renderer';
import { BASE_SCREEN_DESIGNER_TAG_NAME } from './designer.js';
import { type BaseScreenMountHandle } from './mount-handle.js';
import { createBaseScreenBlueprintCapabilityPlugin } from './plugins.js';
import {
  collectDiagnostics,
  collectFailureDiagnostics,
  nullResult,
  runtimeDiagnostic,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';
import { createBaseScreenRuntimeMounts } from './runtime-mounts.js';
import { BASE_SCREEN_VIEWER_TAG_NAME } from './viewer.js';

export {
  BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
  BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
} from './material.js';

export interface BaseScreenSetCatalogOptions {
  /** 默认同步使用运行时目录的挂载；future-mounts 只替换后续挂载的默认值。 */
  readonly target?: 'mounted-and-future' | 'future-mounts';
}

export type BaseScreenRuntimeCatalog = BaseScreenPluginManagerSnapshot['materials'];
export type BaseScreenRuntimePluginCommandPort = ReturnType<
  typeof createBaseScreenPluginContributionCommandPort
>;

type RuntimeMaterial = NonNullable<CreatePluginRegistrationOptions['materials']>[number];
type RuntimePlugin = NonNullable<CreatePluginRegistrationOptions['plugins']>[number];
type RuntimeRegistry = NonNullable<CreatePluginRegistrationOptions['registry']>;
type ManagerMaterialConstructor = ReturnType<BaseScreenPluginManagerOptions['registry']['get']>;
type DesignSelection = ReturnType<CreateBaseScreenCorePluginDesignReadPortOptions['getSelection']>;

const EMPTY_SELECTION: DesignSelection = Object.freeze({
  selectedComponentIds: Object.freeze([]),
  focusedComponentId: null,
});

export interface CreateBaseScreenRuntimeOptions {
  readonly instanceId?: string;
  /** 默认注册全部官方物料；关闭后只使用 `materials` 与插件贡献的物料。 */
  readonly officialMaterials?: boolean;
  /** 宿主自有物料包或物料定义，与官方物料一并进入同一份注册与授权计划。 */
  readonly materials?: CreatePluginRegistrationOptions['materials'];
  readonly plugins?: CreatePluginRegistrationOptions['plugins'];
  readonly grantedCapabilities?: BaseScreenPluginManagerOptions['grantedCapabilities'];
  /** 显式授权这些内建蓝图能力；省略时不声明也不授权任何蓝图能力。 */
  readonly blueprintCapabilities?: readonly ScreenBlueprintCapabilityId[];
  readonly activation?: BaseScreenPluginManagerOptions['activation'];
  /** 高级逃逸口：覆盖默认的 Designer 命令端口工厂。 */
  readonly createCommandPort?: BaseScreenPluginManagerOptions['createCommandPort'];
  /** 高级逃逸口：覆盖默认的 Designer 只读端口工厂。 */
  readonly createDesignReadPort?: BaseScreenPluginManagerOptions['createDesignReadPort'];
}

export type BaseScreenDesignerMountOptions = Omit<BaseScreenDesignerConfiguration, 'catalog'> & {
  readonly catalog?: BaseScreenRuntimeCatalog;
  /** 项目会话模式：经已配置的 `projectAdapter` 调用 `load(projectId)`。 */
  readonly projectId?: string;
  /** 直接文档模式：configure 后赋给 `document`，不得与项目会话模式混用。 */
  readonly document?: ScreenDocument;
  /** 宿主 light DOM（如 Blueprint 画布或左侧分组），在挂载前追加到元素。 */
  readonly children?: readonly Node[];
  /** 高级逃逸口：使用跨 realm 或测试环境预先创建的元素。 */
  readonly element?: BaseScreenDesignerElement;
};

export type BaseScreenViewerMountOptions = Omit<BaseScreenViewerConfiguration, 'catalog'> & {
  readonly catalog?: BaseScreenRuntimeCatalog;
  readonly document?: ScreenDocument;
  readonly children?: readonly Node[];
  readonly element?: BaseScreenViewerElement;
};

export interface BaseScreenRuntime {
  readonly instanceId: string;
  /** 完整插件管理器 API；组合层不收敛高级控制入口。 */
  readonly manager: BaseScreenPluginManager;
  readonly catalog: BaseScreenRuntimeCatalog;
  readonly pluginCatalog: BaseScreenPluginManagerSnapshot['plugins'];
  readonly pluginPanels: BaseScreenPluginManagerSnapshot['panels'];
  readonly inspectorControls: BaseScreenPluginManagerSnapshot['inspectorControls'];
  readonly runtimeContributions: BaseScreenPluginManagerSnapshot['contributions'];
  readonly pluginCommandPort: BaseScreenRuntimePluginCommandPort;
  readonly disposed: boolean;
  /** 一个 runtime 对应一个 Designer 会话；绑定不同实例前必须释放当前实例。 */
  bindDesigner(element: BaseScreenDesignerElement | null): ScreenParseResult<null>;
  /** 热刷新使用运行时默认目录的挂载；失败保留默认值并回滚已刷新的实例。 */
  setCatalog(
    catalog: BaseScreenRuntimeCatalog,
    options?: BaseScreenSetCatalogOptions,
  ): ScreenParseResult<null>;
  mountDesigner(
    container: Element,
    options: BaseScreenDesignerMountOptions,
  ): Promise<ScreenParseResult<BaseScreenMountHandle<BaseScreenDesignerElement>>>;
  mountViewer(
    container: Element,
    options: BaseScreenViewerMountOptions,
  ): Promise<ScreenParseResult<BaseScreenMountHandle<BaseScreenViewerElement>>>;
  /** 卸载全部挂载句柄、清理端口绑定并释放插件管理器；可重复调用。 */
  dispose(): Promise<ScreenParseResult<null>>;
}

function readHostRegistry(): ScreenParseResult<RuntimeRegistry> {
  const candidate = (globalThis as { readonly customElements?: unknown }).customElements;
  if (candidate === undefined || candidate === null || typeof candidate !== 'object') {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Custom Elements are unavailable in this runtime.',
      ['customElements'],
    );
  }
  const record = candidate as Record<string, unknown>;
  if (typeof record.get !== 'function' || typeof record.define !== 'function') {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Custom Elements registry must provide get and define.',
      ['customElements'],
    );
  }
  const get = record.get as (
    this: unknown,
    tagName: string,
  ) => CustomElementConstructor | undefined;
  const define = record.define as (
    this: unknown,
    tagName: string,
    element: CustomElementConstructor,
  ) => unknown;
  return runtimeSuccess({
    get: (tagName) => get.call(candidate, tagName),
    define: (tagName, element) => define.call(candidate, tagName, element),
  });
}

function createOfficialMaterialDefinitions(): ScreenParseResult<readonly RuntimeMaterial[]> {
  const sources = [
    {
      manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
      element: BaseScreenTextMaterialElement,
    },
    {
      manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
      element: BaseScreenRectangleMaterialElement,
    },
    {
      manifest: BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
      element: BaseScreenEllipseMaterialElement,
    },
    {
      manifest: BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
      element: BaseScreenImageMaterialElement,
    },
    {
      manifest: BASE_SCREEN_RULE_MATERIAL_MANIFEST,
      element: BaseScreenRuleMaterialElement,
    },
    {
      manifest: BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
      element: BaseScreenContainerMaterialElement,
    },
    {
      manifest: BASE_SCREEN_CHART_MATERIAL_MANIFEST,
      element: BaseScreenChartMaterialElement,
    },
    {
      manifest: BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
      element: BaseScreenTableMaterialElement,
    },
  ] as const;
  const definitions: RuntimeMaterial[] = [];
  for (const source of sources) {
    const definition = createMaterialDefinition(source);
    if (!definition.ok) return definition;
    definitions.push(definition.value);
  }
  return runtimeSuccess(Object.freeze(definitions));
}

function designerUnavailable(): ScreenParseResult<ScreenDocument> {
  return runtimeFailure('PLUGIN_CORE_SESSION_INVALID', 'Designer is not mounted yet.', [
    'designer',
  ]);
}

export async function createBaseScreenRuntime(
  options: CreateBaseScreenRuntimeOptions = {},
): Promise<ScreenParseResult<BaseScreenRuntime>> {
  const registryResult = readHostRegistry();
  if (!registryResult.ok) return registryResult;
  const registry = registryResult.value;

  let officialMaterials: readonly RuntimeMaterial[] = [];
  if (options.officialMaterials !== false) {
    const created = createOfficialMaterialDefinitions();
    if (!created.ok) return created;
    officialMaterials = created.value;
  }
  const materials: RuntimeMaterial[] = [...officialMaterials, ...(options.materials ?? [])];
  const instanceId = options.instanceId ?? 'base-screen';
  const plugins: RuntimePlugin[] = [...(options.plugins ?? [])];
  let grantedCapabilities = options.grantedCapabilities ?? {};
  if (options.blueprintCapabilities !== undefined) {
    const blueprint = createBaseScreenBlueprintCapabilityPlugin({
      id: `${instanceId}-blueprint`,
      capabilities: options.blueprintCapabilities,
    });
    if (!blueprint.ok) return blueprint;
    plugins.push(blueprint.value.plugin);
    grantedCapabilities = { ...grantedCapabilities, ...blueprint.value.grantedCapabilities };
  }
  const registration = createPluginRegistration({
    registry,
    materials,
    plugins,
    elements: [
      { tagName: BASE_SCREEN_DESIGNER_TAG_NAME, element: BaseScreenDesignerElement },
      { tagName: BASE_SCREEN_VIEWER_TAG_NAME, element: BaseScreenViewerElement },
    ],
  });
  if (!registration.ok) return registration;
  const registered = registration.value.define();
  if (!registered.ok) return registered;

  let disposed = false;
  let designer: BaseScreenDesignerElement | undefined;
  const readDesigner = (): BaseScreenDesignerElement | undefined => designer;
  const unbindDesigner = (element: BaseScreenDesignerElement): void => {
    if (designer === element) designer = undefined;
  };
  const clearDesigners = (): void => {
    designer = undefined;
  };
  const bindDesigner = (element: BaseScreenDesignerElement | null): ScreenParseResult<null> => {
    if (disposed) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime is already disposed.',
        ['runtime'],
      );
    }
    if (mounts.designer !== undefined && mounts.designer !== element) {
      return runtimeFailure(
        'PLUGIN_CORE_SESSION_INVALID',
        'Dispose the mounted Designer handle before changing its binding.',
        ['designer'],
      );
    }
    if (element !== null && designer !== undefined && designer !== element) {
      return runtimeFailure(
        'PLUGIN_CORE_SESSION_INVALID',
        'A runtime supports one Designer session. Release the current Designer or create a separate runtime.',
        ['designer'],
      );
    }
    designer = element ?? undefined;
    return runtimeSuccess(null);
  };

  const manager = createBaseScreenPluginManager({
    instanceId,
    standaloneMaterialTagNames: registered.value.standaloneMaterialTagNames,
    plugins: registered.value.plugins,
    grantedCapabilities,
    registry: {
      get: (tagName) => registry.get(tagName) as ManagerMaterialConstructor,
    },
    createCommandPort:
      options.createCommandPort ??
      (() =>
        createBaseScreenCorePluginCommandPort({
          executeCommand: (command) => {
            const designer = readDesigner();
            return designer === undefined
              ? designerUnavailable()
              : designer.executeCommand(command);
          },
        })),
    createDesignReadPort:
      options.createDesignReadPort ??
      (() =>
        createBaseScreenCorePluginDesignReadPort({
          getDocument: () => readDesigner()?.document,
          getSelection: () => readDesigner()?.selection ?? EMPTY_SELECTION,
        })),
    activation: options.activation ?? 'eager',
  });

  const activated = await manager.activate();
  if (!activated.ok) {
    const disposal = await manager.dispose();
    return { ok: false, diagnostics: collectDiagnostics([activated, disposal]) };
  }
  const snapshot = activated.value;
  const failureDiagnostics: ScreenDiagnostic[] = snapshot.failures.flatMap((failure) => [
    ...failure.diagnostics,
  ]);
  if (snapshot.failures.length > 0) {
    if (failureDiagnostics.length === 0) {
      failureDiagnostics.push(
        runtimeDiagnostic(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Plugin activation failed without diagnostics.',
          ['plugins'],
        ),
      );
    }
    const disposal = await manager.dispose();
    return {
      ok: false,
      diagnostics: [...failureDiagnostics, ...collectFailureDiagnostics([disposal])],
    };
  }

  const pluginCommandPort = createBaseScreenPluginContributionCommandPort(manager);
  let currentCatalog = snapshot.materials;
  let disposePromise: Promise<ScreenParseResult<null>> | undefined;

  const setCatalog = (
    catalog: BaseScreenRuntimeCatalog,
    updateOptions: BaseScreenSetCatalogOptions = {},
  ): ScreenParseResult<null> => {
    if (disposed) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime is already disposed.',
        ['runtime'],
      );
    }
    if (updateOptions.target !== 'future-mounts') {
      const refreshed = mounts.refreshCatalog(currentCatalog, catalog);
      if (!refreshed.ok) return refreshed;
    }
    currentCatalog = catalog;
    return runtimeSuccess(null);
  };
  const isDisposed = (): boolean => disposed;

  const mounts = createBaseScreenRuntimeMounts({
    instanceId,
    readCatalog: () => currentCatalog,
    pluginCatalog: snapshot.plugins,
    pluginPanels: snapshot.panels,
    inspectorControls: snapshot.inspectorControls,
    runtimeContributions: snapshot.contributions,
    pluginCommandPort,
    bindDesigner,
    releaseDesigner: unbindDesigner,
    isDisposed,
  });

  const dispose = (): Promise<ScreenParseResult<null>> => {
    disposed = true;
    disposePromise ??= Promise.resolve().then(async (): Promise<ScreenParseResult<null>> => {
      const results: ScreenParseResult<unknown>[] = [await mounts.disposeAll()];
      clearDesigners();
      results.push(await manager.dispose());
      return nullResult(collectFailureDiagnostics(results));
    });
    return disposePromise;
  };

  return runtimeSuccess(
    Object.freeze({
      instanceId,
      manager,
      get catalog(): BaseScreenRuntimeCatalog {
        return currentCatalog;
      },
      pluginCatalog: snapshot.plugins,
      pluginPanels: snapshot.panels,
      inspectorControls: snapshot.inspectorControls,
      runtimeContributions: snapshot.contributions,
      pluginCommandPort,
      get disposed(): boolean {
        return disposed;
      },
      bindDesigner,
      setCatalog,
      mountDesigner: mounts.mountDesigner,
      mountViewer: mounts.mountViewer,
      dispose,
    }) satisfies BaseScreenRuntime,
  );
}

import type {
  ScreenBlueprintCapabilityId,
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
import type {
  BaseScreenPluginManager,
  BaseScreenPluginManagerSnapshot,
  createBaseScreenPluginContributionCommandPort,
} from '@base-screen/plugin-manager';
import {
  type CreatePluginRegistrationOptions,
  createMaterialDefinition,
} from '@base-screen/plugin-sdk';
import { type BaseScreenViewerConfiguration, BaseScreenViewerElement } from '@base-screen/renderer';
import { BASE_SCREEN_DESIGNER_TAG_NAME } from './designer.js';
import {
  BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
  BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
} from './material.js';
import type { BaseScreenMountHandle } from './mount-handle.js';
import { createBaseScreenBlueprintCapabilityPlugin } from './plugins.js';
import {
  type BaseScreenMountResult,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';
import { createBaseScreenRuntimeLifecycle } from './runtime-lifecycle.js';
import {
  type BaseScreenRuntimeRegistrationOptions,
  createBaseScreenRuntimeRegistration,
} from './runtime-registration.js';
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
type DesignSelection = ReturnType<CreateBaseScreenCorePluginDesignReadPortOptions['getSelection']>;

const EMPTY_SELECTION: DesignSelection = Object.freeze({
  selectedComponentIds: Object.freeze([]),
  focusedComponentId: null,
});

export interface CreateBaseScreenRuntimeOptions extends BaseScreenRuntimeRegistrationOptions {
  /** 默认注册全部官方物料；关闭后只使用 `materials` 与插件贡献的物料。 */
  readonly officialMaterials?: boolean;
  /** 显式授权这些内建蓝图能力；省略时不声明也不授权任何蓝图能力。 */
  readonly blueprintCapabilities?: readonly ScreenBlueprintCapabilityId[];
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

/** 只读组合面；完整运行时同样满足此接口，可用于命令式和框架 Viewer。 */
export interface BaseScreenViewerRuntime {
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
  /** 热刷新使用运行时默认目录的挂载；失败保留默认值并回滚已刷新的实例。 */
  setCatalog(
    catalog: BaseScreenRuntimeCatalog,
    options?: BaseScreenSetCatalogOptions,
  ): ScreenParseResult<null>;
  mountViewer(
    container: Element,
    options: BaseScreenViewerMountOptions,
  ): Promise<BaseScreenMountResult<BaseScreenMountHandle<BaseScreenViewerElement>>>;
  /** 卸载全部挂载句柄、清理端口绑定并释放插件管理器；可重复调用。 */
  dispose(): Promise<ScreenParseResult<null>>;
}

export interface BaseScreenRuntime extends BaseScreenViewerRuntime {
  /** 一个 runtime 对应一个 Designer 会话；绑定不同实例前必须释放当前实例。 */
  bindDesigner(element: BaseScreenDesignerElement | null): ScreenParseResult<null>;
  mountDesigner(
    container: Element,
    options: BaseScreenDesignerMountOptions,
  ): Promise<BaseScreenMountResult<BaseScreenMountHandle<BaseScreenDesignerElement>>>;
}

function createOfficialMaterialDefinitions(): ScreenParseResult<readonly RuntimeMaterial[]> {
  const sources = [
    { manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST, element: BaseScreenTextMaterialElement },
    {
      manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
      element: BaseScreenRectangleMaterialElement,
    },
    { manifest: BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST, element: BaseScreenEllipseMaterialElement },
    { manifest: BASE_SCREEN_IMAGE_MATERIAL_MANIFEST, element: BaseScreenImageMaterialElement },
    { manifest: BASE_SCREEN_RULE_MATERIAL_MANIFEST, element: BaseScreenRuleMaterialElement },
    {
      manifest: BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
      element: BaseScreenContainerMaterialElement,
    },
    { manifest: BASE_SCREEN_CHART_MATERIAL_MANIFEST, element: BaseScreenChartMaterialElement },
    { manifest: BASE_SCREEN_TABLE_MATERIAL_MANIFEST, element: BaseScreenTableMaterialElement },
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
  let officialMaterials: readonly RuntimeMaterial[] = [];
  if (options.officialMaterials !== false) {
    const created = createOfficialMaterialDefinitions();
    if (!created.ok) return created;
    officialMaterials = created.value;
  }
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
  let designer: BaseScreenDesignerElement | undefined;
  const registered = await createBaseScreenRuntimeRegistration(
    {
      ...options,
      materials: [...officialMaterials, ...(options.materials ?? [])],
      plugins,
      grantedCapabilities,
      createCommandPort:
        options.createCommandPort ??
        (() =>
          createBaseScreenCorePluginCommandPort({
            executeCommand: (command) =>
              designer === undefined ? designerUnavailable() : designer.executeCommand(command),
          })),
      createDesignReadPort:
        options.createDesignReadPort ??
        (() =>
          createBaseScreenCorePluginDesignReadPort({
            getDocument: () => designer?.document,
            getSelection: () => designer?.selection ?? EMPTY_SELECTION,
          })),
    },
    [
      { tagName: BASE_SCREEN_DESIGNER_TAG_NAME, element: BaseScreenDesignerElement },
      { tagName: BASE_SCREEN_VIEWER_TAG_NAME, element: BaseScreenViewerElement },
    ],
  );
  if (!registered.ok) return registered;
  const bindDesigner = (element: BaseScreenDesignerElement | null): ScreenParseResult<null> => {
    if (lifecycle.runtime.disposed) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime is already disposed.',
        ['runtime'],
      );
    }
    if (lifecycle.mounts.designer !== undefined && lifecycle.mounts.designer !== element) {
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
  const lifecycle = createBaseScreenRuntimeLifecycle(registered.value, {
    createDesignerElement: () => new BaseScreenDesignerElement(),
    toolMaterialTypes: BASE_SCREEN_OFFICIAL_TOOL_MATERIAL_TYPES,
    groupMaterialType: BASE_SCREEN_OFFICIAL_GROUP_MATERIAL_TYPE,
    bindDesigner,
    releaseDesigner: (element) => {
      if (designer === element) designer = undefined;
    },
    onDispose: () => {
      designer = undefined;
    },
  });
  const runtime = lifecycle.runtime;
  return runtimeSuccess(
    Object.freeze({
      instanceId: runtime.instanceId,
      manager: runtime.manager,
      get catalog() {
        return runtime.catalog;
      },
      pluginCatalog: runtime.pluginCatalog,
      pluginPanels: runtime.pluginPanels,
      inspectorControls: runtime.inspectorControls,
      runtimeContributions: runtime.runtimeContributions,
      pluginCommandPort: runtime.pluginCommandPort,
      get disposed() {
        return runtime.disposed;
      },
      setCatalog: runtime.setCatalog,
      mountViewer: runtime.mountViewer,
      dispose: runtime.dispose,
      bindDesigner,
      mountDesigner: lifecycle.mounts.mountDesigner,
    }) satisfies BaseScreenRuntime,
  );
}

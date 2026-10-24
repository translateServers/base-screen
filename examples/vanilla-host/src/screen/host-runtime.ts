import type { ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '@base-screen/contracts';
import { createPluginBoardRuntime, PLUGIN_BOARD_ID } from '@base-screen/plugin-board-materials';
import type {
  BaseScreenMaterialCatalog,
  BaseScreenMaterialConstructor,
  BaseScreenPluginCatalog,
  BaseScreenPluginInspectorControlCatalog,
  BaseScreenPluginPanelCatalog,
  BaseScreenPluginRuntime,
  BaseScreenRuntimeContributionIndex,
  PluginCommandPort,
} from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createPluginEchartsRuntime, PLUGIN_ECHARTS_ID } from '@base-screen/plugin-echarts';
import {
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '@base-screen/plugin-manager';
import {
  type BaseScreenDesignerElement,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
} from '@base-screen/sdk/designer';
import { createHostResourceRuntime } from './host-resource-plugin';
import { registerHostMaterials } from './register';

const INSTANCE_ID = 'vanilla-host';

/**
 * 蓝图能力由插件贡献进入 `runtimeContributions`：没有这份授权，设计器会把物料事件
 * 标成不可用、编译也会按能力缺失失败关闭。能力词汇只从 contracts 取，宿主不另抄一份。
 */
const HOST_AUTHORING_PLUGIN_ID = `${INSTANCE_ID}-authoring`;
const HOST_AUTHORING_CAPABILITIES = [...SCREEN_BLUEPRINT_CAPABILITY_IDS];

function createHostAuthoringRuntime(): BaseScreenPluginRuntime {
  return {
    manifest: {
      id: HOST_AUTHORING_PLUGIN_ID,
      dependencies: [],
      capabilities: HOST_AUTHORING_CAPABILITIES,
      contributions: HOST_AUTHORING_CAPABILITIES.map((id) => ({
        kind: 'blueprintCapability' as const,
        id,
        name: id,
      })),
    },
    activate() {},
    deactivate() {},
    dispose() {},
  };
}

export interface HostRuntime {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly pluginCatalog: BaseScreenPluginCatalog;
  readonly pluginPanels: BaseScreenPluginPanelCatalog;
  readonly inspectorControls: BaseScreenPluginInspectorControlCatalog;
  readonly runtimeContributions: BaseScreenRuntimeContributionIndex;
  readonly pluginCommandPort: PluginCommandPort;
  /** 设计器创建后绑定；命令端口与只读端口都通过它惰性取当前实例。 */
  bindDesigner(element: BaseScreenDesignerElement | null): void;
  dispose(): Promise<void>;
}

let runtimePromise: Promise<HostRuntime> | undefined;

/**
 * 加载宿主运行时（单例、Promise 记忆化）：
 * 注册元素 → 建 manager → 激活插件 → 合并 catalog。
 *
 * 失败时清掉缓存，让下一次进入编辑/查看页可以重试；成功后整个应用共享同一份
 * manager 与 catalog（插件命令端口是有状态的，不能每次 configure 都新建）。
 */
export function loadHostRuntime(): Promise<HostRuntime> {
  runtimePromise ??= createHostRuntime().catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

async function createHostRuntime(): Promise<HostRuntime> {
  const baseEntries = registerHostMaterials();
  let designer: BaseScreenDesignerElement | undefined;

  const manager = createBaseScreenPluginManager({
    instanceId: INSTANCE_ID,
    // 官方物料由宿主自己的 catalog 承载；manager 只负责插件贡献的物料。
    standaloneMaterialTagNames: [],
    plugins: [
      createHostAuthoringRuntime(),
      createPluginBoardRuntime(),
      createPluginEchartsRuntime(),
      createHostResourceRuntime(),
    ],
    grantedCapabilities: {
      [HOST_AUTHORING_PLUGIN_ID]: HOST_AUTHORING_CAPABILITIES,
      [PLUGIN_BOARD_ID]: ['command.execute', 'design.read'],
      [PLUGIN_ECHARTS_ID]: ['command.execute', 'design.read'],
    },
    registry: {
      get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
    },
    // 端口工厂在 activate 时就会被调用，因此不能捕获具体元素；闭包读模块级变量。
    createCommandPort: () =>
      createBaseScreenCorePluginCommandPort({
        executeCommand: (command) => {
          if (designer === undefined) return Promise.resolve(designerUnavailable());
          return Promise.resolve(designer.executeCommand(command));
        },
      }),
    createDesignReadPort: () =>
      createBaseScreenCorePluginDesignReadPort({
        getDocument: () => designer?.document,
        getSelection: () =>
          designer?.selection ?? { selectedComponentIds: [], focusedComponentId: null },
      }),
  });

  const activated = await manager.activate();
  const snapshot = manager.snapshot;
  if (!activated.ok || snapshot === undefined) {
    throw new Error(
      `HOST_PLUGIN_ACTIVATION_FAILED:${activated.ok ? 'SNAPSHOT_MISSING' : activated.diagnostics[0]?.code}`,
    );
  }
  if (snapshot.failures.length > 0) {
    // 插件级失败不会让 activate 整体失败；不显式抛错就会表现为"物料少了几件但页面正常"。
    throw new Error(
      `HOST_PLUGIN_PREFLIGHT_FAILED:${snapshot.failures
        .map((failure) => failure.pluginId || `index-${failure.index}`)
        .join(',')}`,
    );
  }

  const byType = new Map(baseEntries.map((entry) => [entry.manifest.type, entry]));
  for (const entry of snapshot.materials.list()) {
    // catalog 对重复 type 直接抛 RangeError；基础条目优先，保留宿主自己的 adapter。
    if (!byType.has(entry.manifest.type)) byType.set(entry.manifest.type, entry);
  }

  return {
    catalog: createBaseScreenMaterialCatalog([...byType.values()]),
    pluginCatalog: snapshot.plugins,
    pluginPanels: snapshot.panels,
    inspectorControls: snapshot.inspectorControls,
    runtimeContributions: snapshot.contributions,
    pluginCommandPort: createBaseScreenPluginContributionCommandPort(manager),
    bindDesigner(element) {
      designer = element ?? undefined;
    },
    dispose: async () => {
      designer = undefined;
      await manager.dispose();
    },
  };
}

function designerUnavailable(): ScreenParseResult<ScreenDocument> {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'PLUGIN_CORE_SESSION_INVALID',
        path: ['designer'],
        message: 'Designer is not mounted yet.',
      },
    ],
  };
}

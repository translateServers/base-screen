import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '@base-screen/contracts';
import {
  type BaseScreenDesignerElement,
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
} from '@base-screen/engine';
import {
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenTextMaterialElement,
} from '@base-screen/material';
import type { BaseScreenMaterialConstructor } from '@base-screen/plugin-core';
import {
  createBaseScreenPluginContributionCommandPort,
  createBaseScreenPluginManager,
} from '@base-screen/plugin-manager';
import { createMaterialDefinition, createPluginRegistration } from '@base-screen/plugin-sdk';
import { defineBaseScreenDesigner } from '@base-screen/sdk/designer';
import { createApp, nextTick } from 'vue';
import App from './App.vue';
import { createHostPlugin, HOST_PLUGIN_ID } from './screen/host-plugin';
import { createHostProductCardElement } from './screen/product-card';
import { createHostProjectAdapter, HOST_PROJECT_ID } from './screen/project-adapter';
import './style.css';

export interface VueHostDebugState {
  readonly pluginIds: readonly string[];
  readonly materialTypes: readonly string[];
  readonly grantedBlueprintCapabilities: number;
  readonly failures: readonly string[];
  readonly designer: BaseScreenDesignerElement;
  readonly manager: ReturnType<typeof createBaseScreenPluginManager>;
}

declare global {
  interface Window {
    __vueHost?: VueHostDebugState;
  }
}

// 返回 `never` 才能让调用方在 `if (!result.ok) fail(...)` 之后安全收窄到 ok 分支；
// 只返回 void 的话 TS 不会认为控制流已终止，`result.value` 会一直报"可能不存在"。
function fail(
  code: string,
  diagnostics: readonly { code: string; path: readonly unknown[] }[],
): never {
  throw new Error(
    `${code}:${diagnostics.map((item) => `${item.code}@${item.path.join('.')}`).join(',')}`,
  );
}

// 1) 注册设计器自定义元素。宿主显式调用，不依赖导入副作用。
const designerDefinition = defineBaseScreenDesigner();
if (!designerDefinition.ok) {
  fail('VUE_HOST_DESIGNER_DEFINITION_FAILED', designerDefinition.diagnostics);
}

// 2) 宿主自有的 Vue 物料：桥接产出 catalog entry，元素注册交给下面的注册编排。
const productCard = createHostProductCardElement();
if (!productCard.ok) fail('VUE_HOST_PRODUCT_CARD_FAILED', productCard.diagnostics);
const productCardEntry = productCard.value;

// 3) 宿主放进设计器但不属于任何插件的独立物料；它产生 standaloneMaterialTagNames。
const textMaterial = createMaterialDefinition({
  manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  element: BaseScreenTextMaterialElement as BaseScreenMaterialConstructor,
});
if (!textMaterial.ok) fail('VUE_HOST_TEXT_MATERIAL_FAILED', textMaterial.diagnostics);
const textMaterialEntry = textMaterial.value;

// 4) 一次调用收敛注册与插件输入：createPluginRegistration 先对全部待注册 tag 做整体
//    冲突预检（冲突发生在任何 define 之前），再统一注册，返回值直接喂给 manager。
const registration = createPluginRegistration({
  plugins: [createHostPlugin()],
  materials: [textMaterialEntry],
  elements: [{ tagName: productCardEntry.manifest.tagName, element: productCardEntry.constructor }],
  registry: customElements,
});
if (!registration.ok) fail('VUE_HOST_REGISTRATION_INVALID', registration.diagnostics);
const registered = registration.value.define();
if (!registered.ok) fail('VUE_HOST_REGISTRATION_FAILED', registered.diagnostics);
const registrationInput = registered.value;

const designer = document.createElement('base-screen-designer') as BaseScreenDesignerElement;

// 5) 宿主授权能力：声明在插件清单、批准在宿主。这里显式写出宿主愿意批准的能力集合。
const manager = createBaseScreenPluginManager({
  instanceId: HOST_PROJECT_ID,
  standaloneMaterialTagNames: registrationInput.standaloneMaterialTagNames,
  plugins: registrationInput.plugins,
  grantedCapabilities: {
    [HOST_PLUGIN_ID]: ['command.execute', 'design.read'],
  },
  registry: {
    get: (tagName) => customElements.get(tagName) as BaseScreenMaterialConstructor | undefined,
  },
  // 入站端口把插件命令接进设计器的文档事务，因此插件改动可撤销。
  createCommandPort: () =>
    createBaseScreenCorePluginCommandPort({
      executeCommand: (command) => designer.executeCommand(command),
    }),
  createDesignReadPort: () =>
    createBaseScreenCorePluginDesignReadPort({
      getDocument: () => designer.document,
      getSelection: () => designer.selection,
    }),
});

const activated = await manager.activate();
if (!activated.ok) fail('VUE_HOST_ACTIVATION_FAILED', activated.diagnostics);
const snapshot = manager.snapshot;
if (snapshot === undefined) throw new Error('VUE_HOST_SNAPSHOT_MISSING');
if (snapshot.failures.length > 0) {
  throw new Error(`VUE_HOST_PLUGIN_ACTIVATION_FAILED:${JSON.stringify(snapshot.failures)}`);
}

// 6) 先挂载 Vue 应用，把设计器接进 DOM。
//    顺序很重要：画布与渲染器在元素 connected 时才建立，因此必须"先挂载、再 configure/load"。
//    对一个尚未连接的设计器调用 configure/load 不会报错，但画布内容会一直是空的。
const mountTarget = document.querySelector<HTMLElement>('#host-app');
if (mountTarget === null) throw new Error('VUE_HOST_MOUNT_TARGET_MISSING');
createApp(App, { designer, manager }).mount(mountTarget);
await nextTick();
if (!designer.isConnected) throw new Error('VUE_HOST_DESIGNER_NOT_MOUNTED');

// 7) 把 manager 快照交回设计器。物料目录、贡献索引、面板与控件目录都来自 snapshot，
//    宿主不自己重建一份——否则插件通道没有被真正使用。
const configured = designer.configure({
  catalog: snapshot.materials,
  runtimeContributions: snapshot.contributions,
  pluginCatalog: snapshot.plugins,
  pluginPanels: snapshot.panels,
  inspectorControls: snapshot.inspectorControls,
  pluginCommandPort: createBaseScreenPluginContributionCommandPort(manager),
  projectAdapter: createHostProjectAdapter(),
  toolMaterialTypes: { text: BASE_SCREEN_TEXT_MATERIAL_MANIFEST.type },
});
if (!configured.ok) fail('VUE_HOST_CONFIGURATION_FAILED', configured.diagnostics);

// 8) 载入宿主项目。真正的存取归宿主，这里读的是宿主自己的 projectAdapter。
const loaded = await designer.load(HOST_PROJECT_ID);
if (!loaded.ok) fail('VUE_HOST_LOAD_FAILED', loaded.diagnostics);

// 宿主侧自检证据与句柄：供外部消费者的验证脚本读取，避免只断言 DOM 而漏掉插件通道。
// 暴露 designer/manager 与仓库内浏览器验证脚本的用法一致——它们是宿主已持有的公共入口。
window.__vueHost = {
  pluginIds: snapshot.plugins.list().map((plugin) => plugin.manifest.id),
  materialTypes: snapshot.materials.list().map((entry) => entry.manifest.type),
  grantedBlueprintCapabilities: SCREEN_BLUEPRINT_CAPABILITY_IDS.filter((capability) =>
    snapshot.contributions.hasBlueprintCapability(capability),
  ).length,
  failures: snapshot.failures.map((failure) => failure.pluginId),
  designer,
  manager,
};

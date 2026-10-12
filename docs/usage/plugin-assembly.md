# 插件装配与贡献命令

> 返回[宿主使用指南](../usage.md)。


插件必须由宿主显式导入、审核并交给 Plugin Manager。首期信任模型是同 realm 受信代码：
capability 限制的是 Base Screen 集成点，不是 JavaScript 环境权限。远程发现、dynamic import
和不可信执行仍归宿主，不进入 Base Screen。

激活失败的影响范围按插件收敛：清单解析、能力授权、registry 解析失败或 `activate()` 抛错的插件
被单独排除并级联其声明依赖方，其余插件的贡献照常发布；失败明细在 `snapshot.failures`
（`{ index, pluginId, diagnostics }`）中逐插件可观察。只有输入快照非法或宿主自营物料
（`standaloneMaterialTagNames`）解析失败这类无法归属到单个插件的全局门失败，才会让整个
`activate()` 返回失败。跨插件贡献冲突按稳定顺序 first-wins：先声明方保留，后声明方失败。

启动期不想运行全部插件钩子时，给 `createBaseScreenPluginManager` 传 `activation: 'lazy'`：
预检与目录发布照常一次完成（命令面板、面板、目录都可见），插件 `activate(context)` 推迟到其
贡献命令或面板动作首次经 manager 使用时按依赖拓扑序运行，也可用 `manager.ensureActive(pluginId)`
显式触发。懒激活失败的插件记入 `snapshot.failures` 并失败关闭、拒绝重试；eager（缺省）行为不变。

作者用 `@base-screen/plugin-sdk` 声明插件；宿主激活后把 snapshot 交给 Viewer/Designer：

custom element 注册与插件输入的组装可以用 `createPluginRegistration` 收敛为一次调用：它先对
全部待注册 tag（插件包物料、宿主物料、面板/控件元素）做整体冲突预检——任何冲突都发生在第一个
`define()` 之前，已注册为同一构造函数视为幂等重放——然后统一注册，返回值直接展开为
`createBaseScreenPluginManager` 的 `plugins` 与 `standaloneMaterialTagNames`：

```ts
import { createPluginRegistration } from '@base-screen/plugin-sdk';

const registration = createPluginRegistration({
  plugins: [defined.value],
  materials: [hostOwnedMaterialPackage],
  elements: [
    { tagName: 'acme-monitor-panel', element: AcmeMonitorPanelElement },
  ],
});
const registered = registration.define();
if (!registered.ok) throw new Error('Plugin registration failed');

const manager = createBaseScreenPluginManager({
  instanceId: 'screen-a',
  standaloneMaterialTagNames: registered.value.standaloneMaterialTagNames,
  plugins: registered.value.plugins,
  // ...
});
```

## 插件面板元素的生命周期

面板元素（`kind: 'panel'` 贡献的 tagName）与自定义检查器控件不同：**`model` 在首次写入前是
`undefined`**。Engine 先挂载元素（触发 `connectedCallback`），再按文档代际/选区变化写入快照；
文档尚未就绪时可能整轮都不写。因此面板元素必须：

- 在 `model` 为 `undefined` 时也能安全渲染（例如显示"未选中"降级态）；
- **不要**在 `connectedCallback` 里假设 `model` 已存在，也不要把 getter 实现成
  `model` 未赋值就 throw——那会让面板一挂载就崩。

`BaseScreenPluginPanelElement['model']` 的类型已声明为
`BaseScreenPluginDesignSnapshot | undefined`，如实反映这一时序：

```ts
class AcmeMonitorPanelElement extends HTMLElement implements BaseScreenPluginPanelElement {
  #model: BaseScreenPluginDesignSnapshot | undefined;

  get model(): BaseScreenPluginDesignSnapshot | undefined {
    return this.#model;
  }
  set model(value: BaseScreenPluginDesignSnapshot | undefined) {
    this.#model = value;
    this.render();
  }
  connectedCallback(): void {
    this.render(); // model 可能仍是 undefined，render 必须容忍。
  }
}
```

自定义检查器控件（`kind: 'inspectorControl'`）没有这个问题：Engine 在把它挂进面板**之前**
就写好了 `model` 与初值。

不使用编排辅助时，按下一例手工装配；`createCommandPort` 只在授予 `command.execute` 时需要，
未授予可直接省略：

```ts
import { definePlugin, createPluginPackage } from '@base-screen/plugin-sdk';
import type { PluginCommandPort, PluginDesignReadPort } from '@base-screen/plugin-core';
import {
  createBaseScreenPluginManager,
  createBaseScreenPluginContributionCommandPort,
} from '@base-screen/plugin-manager';
import {
  createBaseScreenCorePluginCommandPort,
  createBaseScreenCorePluginDesignReadPort,
} from '@base-screen/engine';

let commandPort: PluginCommandPort | undefined;
let designReadPort: PluginDesignReadPort | undefined;

const defined = definePlugin({
  manifest: {
    id: 'acme.tools',
    dependencies: [],
    capabilities: ['command.execute', 'design.read'],
    contributions: [
      {
        kind: 'command',
        id: 'acme.refresh',
        name: 'Refresh metrics',
        requiredCapability: 'command.execute',
        menus: ['commandPalette', 'menu.tools', 'context.canvas'],
        shortcut: 'Ctrl+Shift+P',
      },
    ],
  },
  commands: {
    // 先读快照、再决定写什么：位移量来自组件现状，而不是插件自带的常量。
    'acme.refresh': async () => {
      if (commandPort === undefined || designReadPort === undefined) {
        return { ok: false, diagnostics: [] };
      }
      const snapshot = await designReadPort.read();
      if (!snapshot.ok) return snapshot;
      const target = snapshot.value.document.components.find(
        (component) => component.id === snapshot.value.focusedComponentId,
      );
      if (target === undefined) return { ok: false, diagnostics: [] };
      return commandPort.execute({
        commandId: 'update-components',
        args: {
          componentIds: [target.id],
          patch: { position: { x: target.position.x + 40, y: target.position.y } },
        },
      });
    },
  },
  activate(context) {
    commandPort = context.commandPort;
    designReadPort = context.designReadPort;
  },
  deactivate() {
    commandPort = undefined;
    designReadPort = undefined;
  },
  dispose() {
    commandPort = undefined;
    designReadPort = undefined;
  },
});
if (!defined.ok) throw new Error('Plugin is invalid');

let designer: BaseScreenDesignerElement;
const manager = createBaseScreenPluginManager({
  instanceId: 'screen-a',
  standaloneMaterialTagNames,
  plugins: [defined.value],
  grantedCapabilities: { 'acme.tools': ['command.execute', 'design.read'] },
  registry: { get: (tagName) => customElements.get(tagName) },
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
if (!activated.ok) throw new Error('Plugin activation failed');

designer = document.querySelector('base-screen-designer')!;
designer.configure({
  catalog: activated.value.materials,
  runtimeContributions: activated.value.contributions,
  pluginCatalog: activated.value.plugins,
  pluginPanels: activated.value.panels,
  pluginCommandPort: createBaseScreenPluginContributionCommandPort(manager),
});
```

两条命令方向不要混用：

- **贡献命令**：Manifest 声明 `kind: 'command'`，handler 在 runtime `commands` 上。可选
  `menus` 把命令投影到命令面板、工具菜单、画布/组件/多选右键；省略 `menus` 时只出现在命令
  面板。可选 `shortcut` 不得覆盖内建操作或工具 chord，冲突时忽略快捷键、命令仍可从菜单调用。
  点击走 `pluginCommandPort`，由 Manager 分发到对应 handler。
- **Core 命令端口**：仅当授予 `command.execute` 时，插件 `activate(context)` 才能拿到
  `context.commandPort`。该端口只接受已有 `ScreenDocumentCommand` JSON（`commandId` 等于
  命令 `type`），不能定义新的文档 mutation。
- **Core 只读端口**：仅当授予 `design.read` 时才能拿到 `context.designReadPort`。`read()`
  返回一次调用内取到的原子快照 `{ document, selectedComponentIds, focusedComponentId }`，是
  JSON 往返后的深冻结私有副本：写入不触及 canonical 文档，严格模式下改写会抛 `TypeError`。
  只提供按需读取，没有变更通知；要"按现状行动"就在 handler 里先 `read()` 再 `execute()`。

三者可以组合：chrome 触发贡献命令，handler 用只读端口取现状，再用 Core 命令端口写回事务（可
撤销）。`design.read` 被授予但宿主未提供 `createDesignReadPort` 时激活失败关闭。

插件还可以贡献一个面板，这是目前唯一被授权的插件 UI 面（[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：

```ts
// manifest.contributions 内
{ kind: 'panel', id: 'acme.monitor', name: '监控台', tagName: 'acme-monitor' }
```

- `tagName` 由宿主 `registry` 端口解析，与物料同一信任模型（宿主负责加载与审核来源）；解析不到
  时激活失败关闭。
- Designer 把面板挂在左栏（宿主分组之后，并保持容器末尾以免改变 rail 键盘导航顺序），写入与
  `designReadPort` 同形的快照作为 `model`。宿主只在文档代际或选区真的变化时重新赋值，面板不要
  依赖自己被反复重建。
- 面板回传意图派发 `base-screen-plugin-panel-action`，detail 为 `{ panelId, commandId, args }`。
  Engine 校验 `panelId` 归属后派发到该插件自己的贡献命令，`args` 原样送到 handler 的第二参数。

不引入 `when` 条件语言、工具栏、任意 DOM 注入或具名槽位协议；自定义视图容器仍另立 ADR。

属性面板里的表单控件也可以由插件贡献，授权方式与面板相同但更严格：

```ts
// 插件 manifest.contributions：声明并授权这个控件标签
{ kind: 'inspectorControl', id: 'acme.tone', name: '语气控件', tagName: 'acme-tone' }
```

```ts
// 物料 editorDescriptor 的 appearance 字段：绑定到 props 路径
{ id: 'tone', target: 'props', path: ['tone'], label: '语气', control: 'custom', tagName: 'acme-tone' }
```

- **注册不等于授权**：Engine 只实例化 `pluginManager.snapshot.inspectorControls` 里的构造函数，绝不
  `createElement(tagName)`。宿主注册过该标签但没有插件贡献它，该字段渲染为"控件未由宿主注册"提示，
  且不进入写回路径。
- 控件契约与内建控件同形：宿主写 `element.model`（`{ value, componentId, componentType, target, path }`），
  用户改值后控件派发 `change`，宿主读 `element.value` 并走既有 `update-components` props/style 事务，
  因此撤销、dirty 与校验语义自动继承。读回的值必须 JSON-safe，否则视为未编辑。
- 只允许 `target: 'props' | 'style'`；`data` 绑定字段仍只能 `field-selector`，`interaction` 不放开。
- 无变更订阅：控件要反映外部编辑，只能依赖宿主在重绘时重新赋 `model`。

依据见 [ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)。

`pluginCatalog` / `pluginPanels` / `inspectorControls` / `pluginCommandPort` 与
`runtimeContributions` 一样，初始化后变更必须先 `unload()`。Viewer 不提供命令面板与插件面板。
`createPluginPackage({ id, plugin, materials? })` 可把插件与可选物料包组合；package `id` 只用于
宿主诊断，不进入 Screen Document。

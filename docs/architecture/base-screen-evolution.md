# Base Screen 长期演进总纲

> 状态：设计中
> 最近更新：2026-08-03
> 定位：定义 Base Screen 的长期产品边界、目标架构、公共契约、包职责、演进路线和质量基线

## 0. 文档职责

本文是 Base Screen 在早期阶段的总纲型活文档，同时服务产品判断、架构设计和阶段规划。它回答以下问题：

- Base Screen 要解决什么问题，不解决什么问题。
- 哪些边界需要长期稳定，哪些实现允许替换。
- Web Component、SDK、物料和插件如何协作。
- 各 workspace 包分别拥有什么，不应该拥有什么。
- 项目从空仓库演进为可发布底座时应经过哪些阶段和质量门。

当前仓库除 MIT `LICENSE` 外尚无实现。因此本文描述的是目标状态，不代表能力已经完成。

### 0.1 结论级别

本文使用以下标记区分结论成熟度：

| 标记 | 含义 |
| --- | --- |
| 已确认 | 已经明确，后续实现不得自行偏离；改变时需要 ADR |
| 待 ADR | 方向基本明确，但实现方案仍需独立决策 |
| 远期 | 保留演进空间，不进入近期公共契约 |

未显式标记的架构规则按“已确认”处理。代码实现若与本文冲突，应先修正文档或补充 ADR，不能让实现静默成为新标准。

### 0.2 维护规则

- 实质性修改必须更新“最近更新”和文末变更记录。
- 公共契约、依赖方向、安全边界和兼容策略发生变化时必须新增 ADR。
- 功能进入实施前，应从本文拆出可验收的 Spec；本文保留最终结论，不承载逐项任务进度。
- 阶段完成后只更新事实状态，不删除历史决策背景。
- 示例 API 用于约束语义，不等同于已冻结的 TypeScript 声明；正式声明以对应 Spec 和发布包为准。

## 1. 项目定位

### 1.1 产品定义

Base Screen 是一个独立、可嵌入、跨框架的大屏设计器底座。它提供：

- 可视化设计引擎。
- 独立运行时渲染器。
- 基于 Web Component 的物料协议。
- 框架无关的设计器和查看器 SDK。
- 受控、可验证的插件体系。
- 面向 Vanilla、React 和 Vue 物料作者的开发桥接。
- 可版本化、可迁移的项目文档契约。

Base Screen 不绑定具体后台、账号系统、数据平台或业务领域。宿主应用决定项目存储、认证、数据资源、发布流程和权限模型。

### 1.2 与 Nebula 的关系

Base Screen 是从 Nebula 大屏能力中提炼出的独立开源底座，不是 Nebula 子模块或运行时依赖。

- Nebula 是架构经验来源、真实业务宿主和未来集成目标之一。
- Base Screen 不依赖 Nebula Router、Store、后端 DTO、认证、数据集或 UI 组件。
- Base Screen 定义新的 canonical document，不直接沿用 Nebula 建设期的文档分支。
- Nebula 项目通过显式导入器或宿主适配层进入 Base Screen，不把兼容字段带入核心契约。
- 从 Nebula 迁移具体源码前，必须形成文件级来源记录、版权所有者授权和必要的 attribution 决策；未通过来源审查的代码不能进入 MIT 发布产物。架构思想可以作为设计输入。

### 1.3 目标用户

| 用户 | 主要诉求 |
| --- | --- |
| 平台开发者 | 将设计器和查看器嵌入已有 Vanilla、React、Vue 或其他 Web 应用 |
| 物料作者 | 用标准 Web Component、React 或 Vue 开发可配置的大屏组件 |
| 插件作者 | 扩展工具、命令、数据能力、DSL 节点或导出能力 |
| 业务宿主 | 接管项目存储、资源执行、鉴权、发布和审计 |
| Base Screen 维护者 | 在不破坏公共契约的前提下持续替换内部实现 |

### 1.4 近期非目标

以下内容不进入首个稳定版本：

- 从项目文档、URL 或远程市场动态加载可执行代码。
- 不受信任插件的 iframe、Worker 或独立 realm 沙箱。
- 多人实时协作和 CRDT。
- 移动端完整设计能力。
- 服务端渲染设计器。
- 任意脚本、`eval`、SQL 或通用 HTTP 请求描述进入项目文档。
- 为所有前端框架维护重型设计器包装组件。
- 兼容旧浏览器的 Custom Element polyfill。

## 2. 长期架构原则

### 2.1 Web Component 是稳定 ABI

Web Component 是 Base Screen 的宿主集成 ABI，也是物料渲染和注册 ABI。

- 设计器和查看器通过 Custom Element 暴露。
- 所有可渲染物料最终必须注册为 Custom Element。
- React、Vue 等框架只能作为物料内部实现，不能成为 renderer 公共协议。
- renderer 不接收 `ReactNode`、Vue `Component`、render function 或宿主框架 Context。
- 内部 UI 可以在阶段性实现中使用框架，但框架类型、peer dependency 和私有状态不得泄漏到公共 API。

### 2.2 契约优先

- `contracts` 是 wire schema、公共数据类型、版本和迁移的唯一来源。
- 其他包可以追加语义校验，但不得复制一套同名持久化 Schema。
- 文档、Element Model、事件 payload 和 Adapter 结果都必须跨越明确的 JSON 边界。
- 公共行为先由契约测试描述，再由实现包消费。

### 2.3 宿主拥有副作用

- 项目加载、保存、发布、资源执行和权限校验由宿主 Adapter 实现。
- Base Screen 不读取宿主 Token、Cookie、Router、Query Client 或业务 Store。
- 项目文档只保存业务意图和稳定资源标识，不保存 URL、Header、Token、SQL 或连接信息。
- Core 和 DSL 编译器保持纯粹；副作用通过端口注入。

### 2.4 显式注册与实例隔离

- 组件代码通过标准 `customElements.define()` 注册到浏览器全局 `CustomElementRegistry`。
- 宿主显式选择每个设计器或查看器实例可以使用的物料和插件。
- 全局代码定义与实例级可用目录是两个不同层次。
- 项目文档不能决定加载哪些代码。
- 未注册、未启用或能力不匹配时必须 fail closed。

### 2.5 确定性与可迁移

- 相同文档、物料目录和运行时输入必须产生可重复结果。
- 编辑写入统一经过命令边界，支持诊断、历史和测试。
- 文档升级使用显式迁移链，不依赖启发式字段猜测。
- npm 包版本、文档 Schema 版本、组件协议版本和物料实现版本彼此独立。

### 2.6 最小公共面

- 先开放稳定、可验证的扩展点，再开放任意自定义 UI。
- 公共 API 不暴露内部 Store、DOM 结构、CSS 类名或实现框架。
- SDK 是统一门面，不重复实现下层能力。
- 每个包必须有明确所有权和单向依赖，禁止通过 barrel export 隐藏循环依赖。

## 3. 系统上下文

```text
Vanilla / React / Vue / 其他 Web 宿主
                  │
                  │ properties / methods / CustomEvent
                  ▼
        <base-screen-designer>
        <base-screen-viewer>
                  │
          ┌───────┴────────┐
          ▼                ▼
   Designer Engine    Runtime Renderer
          │                │
          └───────┬────────┘
                  ▼
          Core + Contracts
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
Plugin Manager         Host Adapter
       │                     │
       ▼                     ▼
Custom Elements       Storage / Data / Publish
```

系统存在四条彼此独立的边界：

1. 宿主边界：Custom Element API 与 Host Adapter。
2. 持久化边界：`ScreenDocument` 与 `ScreenProjectEnvelope`。
3. 物料边界：Manifest、Custom Element constructor、Element Model 和标准事件。
4. 插件边界：Plugin Manifest、贡献点、能力和生命周期。

## 4. Monorepo 与包职责

### 4.1 目标目录

```text
packages/
├── contracts/        # 持久化契约、公共类型、版本、迁移、诊断
├── core/             # 画布领域、状态、命令、DSL、事件
├── renderer/         # 运行时渲染与 viewer
├── engine/           # 设计器引擎
├── material/         # 官方 Web Component 物料
├── plugin-core/      # 插件与物料扩展协议
├── plugin-manager/   # 插件解析、注册、启停和实例目录
├── plugin-sdk/       # 插件与原生物料开发 SDK
├── react/            # React 物料桥接
├── vue/              # Vue 物料桥接
├── sdk/              # 对外统一入口，按需导出
└── testing/          # 契约夹具、Fake Adapter 和一致性测试工具
```

M0 内部逻辑包名统一使用 `@base-screen/*`，十二包保持 private。公开 npm scope 不在 M0 范围内；工具链和私有阶段规则由已接受的 [ADR-0001](../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md) 冻结。

### 4.2 `@base-screen/contracts`

拥有：

- `ScreenDocument` 及其 runtime schema、JSON Schema 和 TypeScript 类型。
- `ScreenProjectEnvelope`、opaque revision 和项目操作输入输出。
- Host Adapter、Host Resource 和快照等公共端口。
- 基础 JSON value、错误、诊断、能力和事件数据结构。
- Schema 版本常量、迁移接口、迁移结果和兼容性诊断。
- 公共 fixture 的类型，不包含具体测试数据。

不拥有：

- 编辑器 Store、历史栈或 DOM。
- 插件激活逻辑。
- React、Vue 或具体 UI 类型。
- 宿主后端 DTO 和认证模型。

### 4.3 `@base-screen/core`

拥有：

- 画布、组件树、分组、层级和几何领域模型。
- 文档状态、视口状态和交互状态的类型、不可变 reducer 与纯状态转换规则，不持有运行中的 Store 实例。
- 命令、事务、历史、undo/redo 和批量更新的协议与纯算法。
- 选择、对齐、吸附、缩放、坐标变换等纯逻辑。
- DSL/蓝图编译器、事件匹配和无副作用执行计划。
- 基于 `contracts` 的语义校验与诊断。

这里的“画布”指领域和计算能力，不负责把画布渲染为 DOM。Core 不依赖 plugin、renderer、engine 或 sdk。

### 4.4 `@base-screen/renderer`

拥有：

- `ScreenDocument` 到运行时 DOM 的渲染协调。
- `design`、`preview`、`viewer` 三种明确模式。
- 根据实例物料目录创建和复用 Custom Element。
- Element Model 的原子更新、事件接收和运行时交互闸门。
- static 与 host-resource 数据状态协调。
- DSL 执行器及注入式运行时端口。
- 未注册的 Viewer Element 实现类和 `<base-screen-viewer>` 的底层能力；稳定 tagName 只由 sdk 注册。

不拥有编辑选择框、拖拽控制器、属性面板和历史栈。Renderer 只依赖 `contracts`、`core` 和 `plugin-core` 的接口，不依赖具体 `plugin-manager` 实现。

### 4.5 `@base-screen/engine`

拥有：

- 运行中的设计会话和 Store 实例，并基于 Core 的纯转换规则实例化工具状态机与交互状态机。
- DOM 事件到选择、框选、拖拽、缩放、旋转、分组和图层命令的协调。
- 命令调度、历史实例、剪贴板、快捷键和脏状态。
- 运行中的画布视口、标尺、网格、吸附线和设计态辅助层。
- 属性编辑、组件库、图层树和 DSL 编辑入口的协调端口。
- 未注册的 Designer Element 实现类和 `<base-screen-designer>` 的底层能力；稳定 tagName 只由 sdk 注册。

Engine 通过 renderer 展示真实物料，通过 plugin-manager 获取当前实例能力，不直接识别 React/Vue 组件。

### 4.6 `@base-screen/material`

拥有官方基础物料，例如文本、图片、基础图形和首批图表。所有官方物料必须遵循与第三方物料相同的公开协议，不得使用 renderer 私有逃生路径。

官方物料用于证明协议完备性，不应成为 core 的隐式依赖。宿主可以选择空官方物料集或只启用其中一部分。

### 4.7 `@base-screen/plugin-core`

拥有：

- Material Manifest、Element Model 和 Custom Element constructor 契约。
- Plugin Manifest、依赖、能力、贡献点和生命周期协议。
- 实例级只读物料目录与插件目录接口。
- 插件冲突、缺失依赖和能力不匹配诊断。
- 物料 type 到 tagName 的稳定映射规则。

该包定义协议，不执行插件、不注册 DOM、不依赖 engine 或 renderer。

### 4.8 `@base-screen/plugin-manager`

拥有：

- 插件预检、依赖图、版本约束和启用顺序。
- 插件 activate/deactivate/dispose 生命周期。
- Custom Element 已定义状态、constructor 身份和 Manifest 校验。
- 设计器实例级不可变物料目录和贡献点快照。
- 重复 type、tagName、命令、工具和 DSL 节点冲突诊断。
- 插件能力授权和宿主白名单。

Plugin Manager 不从文档或网络加载代码。它只管理宿主已经显式导入的受信任模块。

### 4.9 `@base-screen/plugin-sdk`

拥有插件和原生 Web Component 物料作者需要的便捷 API：

- `createMaterialDefinition()`、`definePlugin()` 等声明辅助函数；Material Definition 对外提供稳定 `define()`。
- Manifest 构建、schema 校验和事件辅助函数。
- Element Model 基类或可选 mixin，但不强制继承。
- 属性字段、工具和 DSL 贡献的类型安全 builder。
- 基于 `plugin-core` 限权 Command Port 的插件命令 builder，不导入或复制 Core 命令实现。
- 开发期诊断和最小调试辅助。

测试夹具和浏览器 harness 统一放在 `@base-screen/testing`，避免 plugin-sdk 承担测试包职责。

### 4.10 `@base-screen/react`

将普通 React 组件转换为符合 Base Screen 物料协议的 Custom Element constructor，并提供显式注册辅助。

- React 和 React DOM 是 peer dependencies，发布产物不得打入第二份 React runtime。
- 默认把 `model.props` 映射为 React props。
- 可通过 `mapModel()` 映射尺寸、模式和数据状态。
- React callback props 映射为标准 DOM 事件。
- 每个元素维护独立 root；model 更新不重建 root。
- 断连清理遵循 8.4 的可观测生命周期协议，不假设 Custom Element 能直接判断“永久断开”。
- 不注入宿主 Router、Context、Query Client、Store 或主题 Provider。

该包只服务物料作者，不提供重型 `<BaseScreenDesigner />` 宿主包装器。

### 4.11 `@base-screen/vue`

将普通 Vue 3 Component/SFC 转换为符合协议的 Custom Element constructor，并提供显式注册辅助。

- Vue 是 peer dependency。
- 优先复用 Vue 官方 Custom Element 能力。
- 默认把 `model.props` 映射为 Vue props。
- Vue emits 映射为标准 DOM 事件。
- model 更新保持同一 Vue 实例。
- 断连清理遵循 8.4 的可观测生命周期协议。
- 不注入宿主 Pinia、Router、i18n 或其他应用 Context。

该包只服务物料作者。Vue 宿主直接使用标准 `<base-screen-designer>` 和 `<base-screen-viewer>`。

### 4.12 `@base-screen/sdk`

SDK 是对外统一入口和产品级装配层：

- 导出 `<base-screen-designer>` 与 `<base-screen-viewer>`。
- 提供显式 `defineBaseScreenViewer()`、`defineBaseScreenDesigner()` 和聚合 `defineBaseScreenElements()`。
- 提供 viewer/designer 按需注册入口和可选 `/auto-register` 聚合副作用入口。
- 从 renderer/engine 装配未注册的 Viewer/Designer Element 实现类，并独占两个稳定产品 tagName 的注册责任。
- 按子路径重导出稳定的 contracts、engine、renderer、plugin 和 material API。
- 保证根入口不自动加载官方物料、React、Vue 或插件代码。
- 不复制下层 Store、Schema、注册表或渲染实现。

`@base-screen/testing` 保持独立，不通过 SDK `/testing` 子路径间接分发。

### 4.13 `@base-screen/testing`

拥有：

- canonical document fixtures 和 schema migration fixtures。
- Fake Host Adapter、Fake Host Resource 和可控时钟。
- 物料协议一致性套件。
- 插件生命周期与冲突测试工具。
- Custom Element 唯一 tagName 生成器。
- renderer、engine、双实例和卸载清理 harness。
- SDK tarball consumer 与浏览器测试辅助。

Testing 可以依赖需要验证的公共包，但任何生产包不得依赖 testing。

## 5. 依赖方向

### 5.1 目标依赖图

```text
contracts
├── core
├── plugin-core
│   ├── plugin-manager
│   └── plugin-sdk
│       ├── material
│       ├── react   (+ React peer)
│       └── vue     (+ Vue peer)
│
├── renderer  (+ core + plugin-core)
└── engine    (+ core + renderer + plugin-core + plugin-manager)

sdk           (+ contracts + core + renderer + engine
               + plugin-manager + plugin-sdk + material)

testing       (+ public packages under test; production packages never point back)
```

### 5.2 强制规则

- `contracts` 不依赖 workspace 内其他包。
- `core` 不依赖 plugin、renderer、engine、material、framework bridge 或 sdk。
- `plugin-core` 不依赖 plugin-manager 或 plugin-sdk。
- `plugin-sdk` 不依赖 core、renderer、engine 或 sdk；插件命令只能通过 `plugin-core` 定义的限权端口进入 Engine。
- `renderer` 不依赖 plugin-manager 的具体实现，只消费只读目录协议。
- `material`、`react`、`vue` 不依赖 engine、renderer 或 sdk。
- workspace 内部包不得通过 `sdk` 反向获取底层类型。
- `sdk` 是依赖图顶层之一，不作为内部共享包。
- `testing` 只允许被 examples、外部 consumer 和独立测试工程依赖；十二个正式生产包的任何 dependency 类型都不得指向 testing。
- 所有包禁止 import 应用目录或 Nebula 源码。

这些规则必须由依赖图检查、声明文件检查和发布 tarball 验证共同守护。

## 6. Canonical Document

### 6.1 文档与项目分离

`ScreenDocument` 只描述可移植的大屏内容，不包含数据库主键、租户、用户、权限、发布状态或后端 revision。

概念结构如下：

```ts
interface ScreenDocument {
  readonly schemaVersion: number;
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenVariable[];
  readonly blueprint?: ScreenBlueprint;
}

interface ScreenProjectEnvelope {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly description?: string;
  readonly document: ScreenDocument;
  readonly metadata?: Readonly<Record<string, ScreenJsonValue>>;
}
```

具体字段在 contracts Spec 中冻结。长期不变量如下：

- `revision` 对 SDK 不透明，用于宿主并发控制。
- 保存以完整 canonical document 原子替换为基线，不允许多个隐式字段写路径互相覆盖。
- 文档对象使用 strict schema；未知字段不得被静默 strip。
- 文档中的所有可变值必须是有限、无循环、无危险原型键的 JSON value。
- Parser 必须拒绝未知和未来 `schemaVersion`，不能尝试按当前版本读取。
- component id 必须唯一，parent、DSL 和其他跨节点引用必须存在且满足类型约束。
- Contracts Spec 必须冻结文档深度、组件数量、字符串长度和单字段 payload 等资源上限。

### 6.2 物料身份

文档保存稳定的物料 `type`，例如 `acme.kpi-card/v1`，不直接保存 JavaScript 模块地址或 constructor。

Manifest 保存对应的 Custom Element `tagName`，例如 `acme-kpi-card-v1`。实例物料目录负责：

```text
document type
     │
     ▼
Material Manifest
     │
     ▼
versioned tagName
     │
     ▼
customElements.get(tagName)
```

将持久化 type 与 DOM tagName 分开，可以在保持文档身份稳定的同时校验实现版本和浏览器全局注册冲突。

### 6.3 版本与迁移

- 首个正式契约使用明确的 `schemaVersion`。
- Parser 只输出当前 canonical shape。
- 旧版本输入先经过 `vN -> vN+1` 的显式纯函数迁移链，再进入当前 parser。
- 每条迁移必须有输入 fixture、输出 fixture、幂等或单向性说明及失败诊断。
- 相同输入和迁移版本必须产生字节可稳定规范化或语义完全相同的输出，迁移不得读取时间、随机数、网络或宿主状态。
- 导入 Nebula 等外部格式属于 importer，不占用 Base Screen schemaVersion。
- 发布稳定版后不得通过“重置数据”逃避已承诺的文档兼容。

## 7. Web Component 物料协议

### 7.1 唯一渲染 ABI

所有官方和第三方物料最终满足以下结构性协议：

```ts
interface BaseScreenMaterialElement extends HTMLElement {
  model: Readonly<BaseScreenMaterialModel>;
}

interface BaseScreenMaterialConstructor extends CustomElementConstructor {
  readonly manifest: BaseScreenMaterialManifest;
}
```

具体实现不强制继承 Base Screen 基类。Vanilla、Lit、Stencil、React bridge、Vue bridge 或其他工具只要最终产生符合协议的 Custom Element constructor 即可。

### 7.2 Element Model

Renderer 通过 JavaScript property 原子写入 detached model，不把复杂对象序列化为 HTML attribute。

```ts
interface BaseScreenMaterialModel {
  readonly apiVersion: number;
  readonly componentId: string;
  readonly mode: 'design' | 'preview' | 'viewer';
  readonly interactive: boolean;
  readonly props: Readonly<Record<string, ScreenJsonValue>>;
  readonly style: Readonly<Record<string, ScreenJsonValue>>;
  readonly size: { readonly width: number; readonly height: number };
  readonly dataState: ScreenMaterialDataState;
}
```

不变量：

- 首个合法 model 到达前，物料可以保持空壳，但不得读取未初始化业务状态。
- model 更新复用同一个 Custom Element 实例。
- 物料不得反向修改 model 或直接写入编辑器 Store。
- Renderer 对 model 做 JSON 边界、尺寸和能力校验。
- `interactive=false` 时，即使物料派发事件，renderer 也必须阻止其进入 DSL runtime。

### 7.3 Manifest

Manifest 至少描述：

- 协议版本、稳定 type、实现版本和 versioned tagName。
- 名称、分类、关键词、默认尺寸、默认 props 和默认 style。
- props schema 和声明式属性面板字段。
- 标准事件和可接受的数据能力。
- 可选设计态能力，例如是否允许缩放、旋转或容器子节点。

Manifest 必须是可序列化、可校验的数据，不能包含 React/Vue renderer、任意属性面板函数或宿主服务实例。

### 7.4 标准事件

物料通过一个稳定、可冒泡、可穿透 Shadow DOM 的 `CustomEvent` 上报交互。事件 detail 只携带 Manifest 已声明的事件名和可选 JSON payload。

```ts
element.dispatchEvent(
  new CustomEvent('base-screen-material-event', {
    bubbles: true,
    composed: true,
    detail: { name: 'valueClick', payload: { value: 42 } },
  }),
);
```

Renderer 使用自身上下文中的可信 componentId，不信任事件 detail 提供组件身份。事件 payload 需要通过 JSON 校验、大小限制和 detached clone。

### 7.5 注册流程

代码级注册使用标准 Custom Element API：

```ts
customElements.define(manifest.tagName, MaterialElement);
```

为保证校验和易用性，所有可发布物料包必须导出：

```text
@acme/kpi-card                 manifest + constructor + define()
@acme/kpi-card/auto-register   导入即调用 define()
```

默认入口必须无副作用；`/auto-register` 是面向简单宿主的显式副作用入口，并且只能定义该入口文档中声明的物料集合。

`define()` 必须：

- 在调用 `customElements.define()` 前校验 Manifest 和 constructor。
- tagName 必须是合法、全小写、带连字符且不属于平台保留名的 autonomous custom element name。
- 同一 tagName 已绑定同一 constructor 时幂等返回。
- 同一 tagName 已绑定不同 constructor 时 fail closed。
- 同一 constructor 已注册到其他 tagName 时拒绝注册，并把浏览器 `NotSupportedError` 归一化为稳定诊断。
- 不覆盖已有定义，不吞掉冲突。
- 返回稳定 definition 信息，便于宿主构造实例物料目录。

浏览器不支持撤销 Custom Element 定义，也没有可靠的全量枚举协议。因此 Base Screen 不尝试把全局 registry 伪装成实例 registry，也不承诺多个 tagName 的全局定义可以事务回滚。原子性由“单物料注册前完整校验”和“实例目录一次性构建”保证。

### 7.6 实例级启用

宿主在首次 load 前显式配置当前 designer/viewer 可使用的物料：

```ts
defineKpiCard();

const designer = document.querySelector('base-screen-designer');
designer.materials = ['acme-kpi-card-v1'];
await designer.load({ projectId: 'screen-1' });
```

Plugin Manager 根据 tagName 获取 constructor、读取 Manifest、验证 type 冲突，并一次性生成不可变实例目录。文档引用未启用物料时拒绝加载，不使用占位 renderer 静默替代。

## 8. 框架易用性

### 8.1 原生与 Lit

原生物料可以直接实现 `HTMLElement`，也可以使用 Lit 等 Web Component 库。`plugin-sdk` 提供可选 helper，但不要求继承专有基类。

```ts
const definition = createMaterialDefinition({
  manifest,
  element: KpiCardElement,
});

export const define = () => definition.define();
```

### 8.2 React 物料桥接

```tsx
const definition = createReactMaterialDefinition({
  manifest,
  component: KpiCard,
  mapModel,
  events,
});

export const define = () => definition.define();
```

桥接层负责：

- 生成稳定 Custom Element constructor。
- 管理每个元素自己的 React root。
- 把 model 映射为普通 props。
- 将声明的 callback prop 转换为标准 DOM 事件。
- 保持 root 和 hook state 跨 model 更新稳定。
- 按 8.4 的断连协议清理 root 和 effect。

### 8.3 Vue 物料桥接

```ts
const definition = createVueMaterialDefinition({
  manifest,
  component: KpiCard,
  mapModel,
  events,
});

export const define = () => definition.define();
```

桥接层负责：

- 使用 Vue Custom Element 能力生成稳定 constructor。
- 把 model 映射为普通 Vue props。
- 将声明的 emits 转换为标准 DOM 事件。
- 保持组件实例跨 model 更新稳定。
- 按 8.4 的断连协议清理 effect 和 listener。

### 8.4 Bridge 断连协议

Custom Element 只能观察 `disconnectedCallback()`，无法知道一次移除是否永久。React/Vue bridge 必须使用以下确定性协议：

1. `disconnectedCallback()` 只调度一次 microtask 清理检查。
2. microtask 执行时若元素已经重新连接，则保留 framework root、组件实例和本地状态。
3. microtask 执行时若元素仍未连接，则卸载 framework root 并释放 effect、listener 和 bridge 持有的异步任务。
4. 已清理元素后续重新连接时，使用最后一份合法 detached model 创建新 root；不承诺保留清理前的框架本地状态。
5. Renderer 在主动删除组件前先取消自身的数据请求和事件订阅，再移除 DOM；它不依赖 bridge 推断“永久断开”。

同步 DOM move 必须保留实例；跨 microtask 的延迟重连允许重建实例。测试需要分别覆盖这两种语义。

### 8.5 宿主框架接入

React 19、Vue 3 和其他现代框架直接消费标准 `<base-screen-designer>` 与 `<base-screen-viewer>`。SDK 保持框架无关，并提供：

- 完整 Custom Element TypeScript 类型。
- property 设置、事件订阅和生命周期示例。
- 对框架更新时序的适配说明。

SDK 不发布引用 React/Vue module 的声明。React JSX 和 Vue template/GlobalComponents 的增强以 consumer-local module augmentation 配方和可编译示例提供，由宿主项目显式采用；框架 bridge 仍只服务物料作者。

首期不维护重型宿主包装组件。若标准 Custom Element 在某框架中存在无法通过薄 helper 解决的高频问题，再通过独立 ADR 评估 host bridge。

## 9. 插件体系

### 9.1 物料与插件分离

物料是可渲染 Custom Element；插件是向 Base Screen 实例贡献能力的受信代码单元。

- 单个物料可以只执行 Custom Element 注册，不必包装为插件。
- 一个插件可以贡献多个已定义物料 tagName。
- 插件可以贡献非物料能力，但不能绕过 renderer 注入框架 renderer。
- 项目文档只引用能力标识，不保存插件模块位置。

### 9.2 初始贡献点

首个可用版本只开放必要贡献点：

- `materials`：已定义的 Custom Element tagName。
- `commands`：声明式命令元数据和通过限权 Command Port 执行的 handler，不直接暴露 Core Command Bus。
- `dataResourceTypes`：宿主资源类型声明，不包含真实执行凭证。
- `blueprintCapabilities`：经过白名单的触发器和动作能力。

工具、面板、自定义属性控件、导入导出器和主题属于后续贡献点。任意 UI render function 不作为首期扩展面。

插件命令的合法调用路径固定为：

```text
Plugin Command Handler
          │
          ▼
PluginCommandPort       由 plugin-core 定义，只接受白名单 command id + JSON args
          │
          ▼
Engine Adapter          执行实例权限、参数和会话检查
          │
          ▼
Core Command Dispatcher 统一事务、诊断和历史
```

Engine 实现 `PluginCommandPort` Adapter，因此可以同时依赖 plugin-core 与 core；plugin-core/plugin-sdk 不需要依赖 core。首期插件只能编排已注册 Core 命令。允许插件定义新的文档 mutation 之前，必须另立 ADR 说明 schema、历史和迁移语义。

### 9.3 生命周期

候选生命周期如下，正式签名由 Plugin Spec 冻结：

```text
discover -> validate -> resolve dependencies -> activate
                                      │
                                      ├── deactivate
                                      └── dispose
```

要求：

- 插件依赖图必须可诊断，并拒绝环和不兼容版本。
- activate 失败不能返回半成品实例目录。
- dispose 后取消监听器、定时器、请求和外部资源。
- 同页不同实例可以启用不同插件集合。
- 插件不能修改另一个实例的目录或状态。

### 9.4 信任边界

首期插件与宿主运行在同一 JavaScript realm，属于宿主显式导入的受信代码。Shadow DOM 只提供样式隔离，不是安全沙箱。

不受信任市场插件需要独立解决代码签名、权限、隔离、通信、资源配额和升级回滚，必须另立 ADR，不能复用“受信插件”名义直接开放远程代码。

## 10. Core、Renderer 与 Engine 协作

### 10.1 状态分层

```text
Document State     可持久化，进入历史和保存
Viewport State     缩放、偏移、辅助线等本地视图状态
Interaction State  选择、拖拽、框选、编辑会话等瞬时状态
Runtime Overrides  数据结果、可见性覆盖、加载状态等非持久化状态
```

四类状态不得混入同一个可序列化项目对象。保存只读取 Document State。

状态定义与运行实例的所有权如下：

| 状态 | 类型、纯算法所有者 | 运行实例所有者 |
| --- | --- | --- |
| Document State | Core | Engine 设计会话；Viewer 只读会话 |
| Viewport State | Core 的几何与 reducer | Engine |
| Interaction State | Core 的状态类型与转换表 | Engine |
| Runtime Overrides | Contracts 的数据结构 | Renderer |

Core 不创建全局或实例 Store。Engine 改变 Document、Viewport 和 Interaction State 时必须使用 Core 公开的 reducer、command 和 pure utility。Renderer 使用自身的纯状态转换管理 Runtime Overrides，数据结构受 contracts 约束，且不得借运行态路径写回 Document State。

### 10.2 命令与历史

- 所有文档写入通过命令或事务进入 Core。
- 命令返回变更结果和诊断，不直接操作 DOM。
- Engine 持有 Command Dispatcher 和 History 实例；Core 提供命令应用与历史算法，避免两套 Store 或 undo 语义。
- 连续拖拽、缩放等高频手势在开始时记录 baseline，在结束时合并为一个历史项。
- undo/redo 恢复文档，不恢复网络请求或临时运行态覆盖。
- 插件命令必须声明可撤销语义；不可撤销副作用不能伪装为文档命令。

### 10.3 设计态交互

Engine 维护正交的工具状态机和交互状态机。Renderer 始终展示真实物料，设计辅助层位于物料 DOM 之外，避免要求物料理解选择框、拖拽或缩放协议。

性能基线：

- 手势期间优先更新 transient transform，结束时提交文档。
- 高频计算使用 `requestAnimationFrame` 合并。
- 组件按稳定 id diff，普通 model 更新不重建元素。
- 大量组件场景需要空间索引、可见区域裁剪和按需属性面板计算。

### 10.4 DSL 运行时

Core 负责纯函数编译：

```text
ScreenBlueprint + Capabilities
             │
             ▼
Compiled Plan + Diagnostics
```

Renderer 负责用注入依赖执行计划。编译器不访问 DOM、网络或宿主 Store。执行器必须支持取消、深度限制、环诊断、超时和卸载保护。

## 11. 数据与宿主边界

### 11.1 数据源模型

首期只接受：

- `static`：文档内的 JSON 数据。
- `host-resource`：宿主资源意图。

候选 host-resource 结构：

```ts
interface ScreenHostResourceIntent {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly params?: Readonly<Record<string, ScreenJsonValue>>;
  readonly binding?: Readonly<Record<string, ScreenJsonValue>>;
}
```

文档不得出现真实 URL、Header、Token、Cookie、SQL、脚本或数据库连接配置。参数名称需要 forbidden-key 检查，但最终安全责任仍由宿主 resolver 的 allowlist、权限和审计承担。

### 11.2 Host Adapter

Adapter 能力按端口组合，不要求所有宿主实现全部能力：

- 项目：load、save、publish。
- 交换：import、export。
- 快照：create、list、restore。
- 数据：listResources、openContext、execute、closeContext。

关键行为：

- 所有异步操作支持 `AbortSignal`。
- save 携带 opaque revision，并返回新的 envelope。
- late result 不能覆盖更新后的项目或已卸载实例。
- 文档需要 host-resource 而 Adapter 未提供 data capability 时，加载必须 fail closed。
- Adapter 结果在进入物料 model 前经过 JSON 和响应大小限制。

### 11.3 数据协调器

Renderer 内的数据协调器负责请求去重、取消、超时、刷新、迟到结果保护和 context 生命周期；宿主负责真实执行、认证、权限、缓存策略和服务端审计。

## 12. SDK 公共形态

### 12.1 Custom Elements

首个正式 SDK 只提供两个产品级元素：

- `<base-screen-designer>`：设计、保存、预览和发布入口。
- `<base-screen-viewer>`：预览、发布态和只读查看入口。

Renderer 拥有未注册的 Viewer Element 实现类，Engine 拥有未注册的 Designer Element 实现类；SDK 负责装配、公开类型和注册稳定 tagName。下层包不得自行定义这两个产品 tagName。

复杂配置使用 JavaScript property，不把 Adapter、插件目录或文档塞入 attribute。attribute 只用于稳定的字符串、布尔值和可反射展示配置。

### 12.2 初始化顺序

以下能力必须在首次 load 前设置：

- Host Adapter。
- 启用的物料或实例物料目录。
- 插件集合与能力白名单。
- 初始 projectId 或 document。
- 需要锁定的语言、主题和编辑端口。

首次 load 后替换影响契约的配置应 fail closed，或要求显式 unload/reload，不能在运行中留下混合目录。

### 12.3 候选方法与事件

方法候选：

- `load()`、`unload()`。
- `getDocument()`、`replaceDocument()`。
- `executeCommand()`。
- `undo()`、`redo()`。
- `save()`、`publish()`。
- `validate()`、`focusComponent()`。

事件候选：

- `base-screen-ready`。
- `base-screen-change`。
- `base-screen-dirty-change`。
- `base-screen-selection-change`。
- `base-screen-diagnostic`。
- `base-screen-error`。

事件名、detail 和错误码必须在 SDK Spec 中冻结后才能视为公共 API。

### 12.4 包入口

候选入口：

```text
@base-screen/sdk
@base-screen/sdk/auto-register
@base-screen/sdk/viewer
@base-screen/sdk/viewer/auto-register
@base-screen/sdk/designer
@base-screen/sdk/designer/auto-register
@base-screen/sdk/contracts
@base-screen/sdk/core
@base-screen/sdk/renderer
@base-screen/sdk/engine
@base-screen/sdk/plugins
@base-screen/sdk/material
```

原则：

- 根入口提供高层元素、配置类型和常用方法。
- 子路径只重导出正式公共 API，不暴露源码目录。
- SDK 的 `auto-register` 只聚合注册 Designer 与 Viewer；viewer/designer 的按需 `auto-register` 只注册各自元素。
- 上一条只约束 `@base-screen/sdk` 自身；独立物料包仍可提供各自明确的 `/auto-register` 入口。
- 三个显式 define 函数重复调用在 constructor 相同时幂等，tagName 冲突时 fail closed；`defineBaseScreenElements()` 只组合另外两个函数，SDK 默认入口不得注册任何元素。
- React、Vue 和 testing 保持独立安装，不进入默认依赖图。
- 所有入口都需要 tarball consumer 验证 exports、types 和 tree-shaking。

## 13. Nebula 能力取舍

### 13.1 继承

- 实例级不可变注册表和 fail-closed 语义。
- Manifest + Custom Element + detached model 的组件边界。
- 文档状态、视口状态、交互状态和运行态覆盖分离。
- 手势期间 transient DOM 更新、结束时单次历史提交。
- 纯 DSL 编译器、诊断和注入式执行器。
- Host Adapter 的 revision、AbortSignal、操作串行化和迟到结果保护。

### 13.2 改造

- 从 React renderer 注册转为 Custom Element 唯一渲染 ABI。
- 从多份文档 parser 收敛为独立 contracts 包的 canonical schema。
- 从 Nebula 专属 API/dataset 字段转为宿主无关 host-resource。
- 从应用内 Store 和 UI 组合转为 core、renderer、engine 的清晰依赖方向。
- React/Vue 从公共依赖转为可选物料桥接。

### 13.3 不继承

- 应用 Router、Query、认证、通知、Monaco、数据集 DTO 和后端模型。
- 模块级可变组件注册表。
- document 驱动的代码加载和任意 fetch callback。
- V1/V2/V3 长期并存的文档和 runtime 分支。
- ReactNode 属性面板和任意 renderer escape hatch。

### 13.4 延后

- 不受信任插件市场。
- SQL、脚本和通用 API 编排。
- 多人协作。
- 移动端完整编辑。
- 服务端渲染和离屏导出集群。

## 14. 安全基线

- 项目文档不能加载或指定代码模块。
- 插件和物料只能由宿主显式导入。
- Custom Element、Shadow DOM 和框架 bridge 均不是安全沙箱。
- 所有跨边界对象拒绝 function、DOM Node、Promise、class instance、循环引用、危险原型键和非有限数值。
- props、数据响应和事件 payload 设置独立大小上限。
- 事件名必须在 Manifest allowlist 中。
- Renderer 不信任物料上报的 componentId、type 或 interactive 状态。
- Host Resource resolver 必须服务端重验项目、资源、租户和发布权限。
- 错误与日志不得记录 Token、Header、完整数据响应或用户敏感 props。
- iframe/Worker 沙箱能力在威胁模型完成前不得进入插件 API。

## 15. 兼容与发布策略

### 15.1 四类版本

| 版本 | 用途 |
| --- | --- |
| Package SemVer | npm 包 API 和行为兼容 |
| Document schemaVersion | 持久化文档形状与迁移 |
| Material API Version | Manifest、Element Model 和标准事件协议 |
| Material implementationVersion | 某个物料包自身实现版本 |

四者不得共用一个版本判断或通过包版本猜测文档形状。

### 15.2 发布阶段

- `alpha`：允许快速收敛，但每次破坏性变化需要变更记录。
- `beta`：公共 API 候选冻结，必须提供迁移说明和 consumer 验证。
- `stable`：遵循 SemVer、弃用周期和文档迁移承诺。

稳定版删除公共 API 前至少经过一个有文档记录的弃用周期。安全问题例外，但需要补充公告和替代方案。

### 15.3 Nebula 导入

Nebula importer 是外部格式转换工具，不属于 canonical parser。近期可以放在独立集成目录或宿主仓库；是否发布 `@base-screen/adapter-nebula` 需要单独 ADR，不预先增加第十三个核心包。

导入是单向的 `external input -> canonical document + diagnostics`。除非另立导出 Spec，不承诺 canonical document 可以还原为 Nebula 格式。

导入验收至少覆盖：

- 输入格式识别和明确错误。
- 物料 type 映射报告。
- 不支持数据源和 DSL 节点诊断。
- 导入结果经过 `parse -> serialize -> parse` 后语义相同。
- 无法无损映射的字段产生结构化 diagnostics；错误级损失必须阻止自动提交，允许的降级必须由调用方显式确认。
- 原始输入不被覆盖。

## 16. 质量基线

### 16.1 测试层次

| 层次 | 重点 |
| --- | --- |
| Contract | Schema、迁移、JSON 边界、错误码和序列化 |
| Unit | 命令、几何、DSL 编译、依赖图和数据协调器 |
| Conformance | 原生、React、Vue 物料的 model、事件和生命周期 |
| Integration | Engine、Renderer、Plugin Manager 和 Adapter 协作 |
| Tarball Consumer | Vanilla、React、Vue 空白项目安装、类型检查和构建 |
| Browser E2E | 真实 designer/viewer、拖拽、保存、数据、事件和卸载 |

### 16.2 必测场景

- 同一页面两个 designer 使用不同物料和插件集合。
- 同 tagName 同 constructor 重复注册幂等。
- 同 tagName 不同 constructor 稳定拒绝。
- 非法 tagName、同 constructor 复用到其他 tagName 和浏览器原生注册异常被归一化诊断。
- 默认物料/SDK 入口无注册副作用，`/auto-register` 只定义文档声明的精确元素集合。
- `defineBaseScreenViewer()`、`defineBaseScreenDesigner()`、聚合函数和原生、React、Vue definition 的重复调用保持幂等。
- 缺少物料、插件或 Host Adapter capability 时不覆盖当前项目。
- 原生、React、Vue 物料在 model 更新时保持实例。
- 同步 DOM move 在 microtask 检查前重连时保持 framework root 和本地状态。
- 跨 microtask 重连时旧 root 已释放，并从最后合法 model 创建新实例。
- 清理检查后没有继续运行的 effect、事件或请求。
- save 的旧 revision 冲突不会静默覆盖。
- schema migration 和 Nebula importer 不修改原始输入。
- 未知/未来 schemaVersion、重复 component id、悬空引用和超出资源上限的文档稳定拒绝。
- 相同 migration 输入产生确定性输出；导入发生有损映射时必须返回结构化 diagnostics。
- Viewer 与 Designer 对同一文档产生一致的物料 model。
- `interactive=false` 时物料事件不进入 DSL runtime。
- 生产依赖图不包含 testing，Vanilla consumer 不被迫安装 React 或 Vue。

### 16.3 工程质量门

首轮工具链 ADR 需要为以下能力选择具体工具：

- 格式化、lint、typecheck、unit test 和 build。
- workspace 依赖方向检查。
- package exports、声明文件和 tarball 验证。
- bundle size 与重复 framework runtime 检查。
- Chromium E2E；稳定版前扩展 Firefox 和 WebKit 验证。
- API 报告和破坏性变更检测。
- 文档链接与代码示例检查。
- 源码 provenance、第三方依赖许可证和发布 attribution 检查。

## 17. 演进路线

路线按能力依赖和退出标准推进，不在总纲中绑定未经评估的日期。

### M0：架构与工程基线

目标：让仓库具备可以安全开始实现的边界。

实施依据：[M0 工程基线 Spec](../specs/m0-engineering-baseline/spec.md)

实施状态（2026-08-03）：本地 Node 22 已完成十二包工程初始化并通过 `pnpm verify:m0`；Node 24 由 CI matrix 验证。

交付：

- 本总纲评审通过。
- Monorepo、包名、Node/package manager、构建和发布 ADR。
- 十二个包的 package skeleton 和依赖图门禁。
- 文档、ADR、Spec 和变更记录约定。
- 源码 provenance、第三方许可证与 attribution 策略。

退出标准：

- 空包可以独立 build、typecheck 和 pack。
- 依赖方向违规会在 CI 中失败。
- testing 不进入生产依赖图。
- 未记录来源或许可证不兼容的代码不能进入发布产物。

### M1：Contracts 与物料纵向切片

目标：先证明协议，不先建设完整设计器。

交付：

- canonical document 最小 Schema。
- Material Manifest、Element Model 和标准事件。
- `createMaterialDefinition()`、显式 `define()` 和 `/auto-register` 模式。
- 最小 plugin-manager 实例物料目录。
- 一个官方原生 Web Component 物料。
- React/Vue bridge 的最小内部 spike 各一个，用于在 ABI 冻结前验证 model、事件、样式和断连语义；此阶段不承诺发布稳定 bridge API。
- `@base-screen/testing` 协议一致性 harness。

退出标准：

- 原生物料能通过 `customElements.define()` 注册。
- 同一物料可以被一个实例启用、被另一个实例排除。
- 原生、React spike、Vue spike 的 model、事件、冲突和断连测试通过。

### M2：Renderer 与 Viewer

目标：建立不依赖设计器的稳定运行时。

交付：

- 文档解析和实例物料目录语义校验。
- 基于稳定 componentId 的 Custom Element diff。
- static data、模式和 interactive gate。
- `<base-screen-viewer>`。
- SDK 的最小 root、`defineBaseScreenViewer()` 与 viewer 按需 `/auto-register` 契约；不提前注册尚未实现的 Designer。
- Vanilla SDK consumer。

退出标准：

- Viewer 可加载、替换、卸载最小文档。
- 多实例和缺失物料 fail-closed 测试通过。
- 普通 model 更新不重建 Custom Element。

### M3：Designer Engine MVP

目标：完成可用的基础设计闭环。

交付：

- 画布视口、选择、拖拽、缩放、旋转和框选。
- 组件库、图层、基础属性面板和命令历史。
- Host Adapter load/save 与 revision 冲突处理。
- `<base-screen-designer>`。
- `defineBaseScreenDesigner()`、聚合 `defineBaseScreenElements()` 与 SDK 聚合 `/auto-register`。
- Designer 到 Viewer 的文档闭环。

退出标准：

- 用户可以添加官方物料、编辑、撤销、保存并在 Viewer 打开。
- 手势历史合并、脏状态和多实例隔离通过 E2E。

### M4：跨框架物料与 SDK 稳定化

目标：证明跨框架不是类型层承诺，而是真实运行能力。

交付：

- `@base-screen/react` 与真实 React 物料。
- `@base-screen/vue` 与真实 Vue SFC 物料。
- SDK 正式子路径、框架无关 DOM 类型和注册契约稳定化。
- React/Vue consumer-local 类型增强示例和类型检查 fixture。
- Vanilla、React、Vue tarball consumers。
- 框架物料作者指南。

退出标准：

- React/Vue 物料无需作者手写 Custom Element 生命周期。
- 两种物料都可完成注册、拖入、编辑、保存和 Viewer 渲染。
- Vanilla consumer 不安装 React/Vue；bridge 不打包重复 framework runtime。

### M5：Host Resource 与 DSL Runtime

目标：在不泄漏宿主安全边界的前提下支持动态业务能力。

交付：

- host-resource intent 和 Adapter data capability。
- 数据协调器、取消、超时和迟到结果保护。
- DSL 编译器、诊断、受限触发器和动作。
- design/preview/viewer 的运行时差异。

退出标准：

- 文档中不存在请求凭证和传输配置。
- 资源数据状态可正确进入原生、React、Vue 物料。
- 卸载和 context 关闭后无请求或事件继续执行。

### M6：插件生态

目标：从物料扩展演进到受控的平台扩展。

交付：

- 稳定 Plugin Manifest、依赖图和生命周期。
- 命令、工具、数据类型和 DSL 能力贡献点。
- 插件开发模板、诊断工具和 conformance suite。
- 插件包版本、兼容矩阵和发布指南。

退出标准：

- 插件失败不污染实例目录。
- 多实例插件组合和 dispose 行为可自动验证。
- 公共贡献点没有框架 renderer 或任意脚本逃生舱。

### M7：Nebula 集成与稳定化

目标：用真实宿主验证独立底座的完整边界。

交付：

- Nebula importer 或宿主侧转换层。
- Nebula Host Adapter。
- 真实项目兼容报告和性能基线。
- beta 到 stable 的 API、Schema 和迁移审核。

退出标准：

- 代表性 Nebula 项目可以生成 canonical document，且导入结果通过 canonical `parse -> serialize -> parse` 语义等价验证。
- 所有有损映射都有结构化报告并经过显式确认；本阶段不隐含承诺反向导出 Nebula 格式。
- Base Screen 不反向依赖 Nebula 包或应用源码。
- 所有进入 MIT 发布物的 Nebula 衍生源码都有来源、授权和 attribution 记录。
- 公共 API、文档、tarball 和浏览器质量门全部通过。

### M8：远期能力

以下能力只有在独立 ADR、威胁模型和资源预算完成后进入路线：

- 不受信任插件沙箱和市场。
- 多人协作和冲突解决。
- 大规模场景虚拟化、Worker/offscreen 能力。
- 服务端截图、视频导出和批量渲染。
- Angular、Svelte 等专用物料 authoring bridge。
- 移动端轻编辑。

## 18. 初始 ADR 清单

| ADR | 主题 | 状态 | 优先级 |
| --- | --- | --- | --- |
| [ADR-0001](../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md) | Monorepo、工具链、私有阶段版本与依赖方向 | 已接受 | M0 |
| ADR-0002 | Canonical Screen Document 与迁移策略 | 待起草 | M1 |
| ADR-0003 | Web Component 物料 ABI 与注册规则 | 待起草 | M1 |
| ADR-0004 | 插件生命周期、贡献点和信任边界 | 待起草 | M1/M6 |
| ADR-0005 | Renderer DOM、样式和 Shadow DOM 策略 | 待起草 | M2 |
| ADR-0006 | Designer Engine 内部 UI 与交互技术选型 | 待起草 | M3 |
| ADR-0007 | Host Resource 安全与执行模型 | 待起草 | M5 |
| ADR-0008 | Nebula importer 与集成边界 | 待起草 | M7 |

## 19. 已确认决策

| 决策项 | 结论 |
| --- | --- |
| 项目关系 | Base Screen 是独立 MIT 开源底座，Nebula 是宿主和参考来源 |
| 文档策略 | 先维护一份总纲型活文档，再按实施拆分 ADR 与 Spec |
| 文档兼容 | 定义新的 canonical schema，Nebula 通过 importer 接入 |
| 首期框架 | Vanilla、React 19、Vue 3 |
| 宿主 ABI | `<base-screen-designer>` 与 `<base-screen-viewer>` Custom Elements |
| 物料 ABI | 所有物料最终是标准 Custom Element |
| 注册方式 | 标准 `customElements.define()`，默认显式 define，提供 `/auto-register` |
| 实例隔离 | 全局 Custom Element 定义 + 实例级不可变物料目录 |
| 框架桥接 | React/Vue 包只桥接物料组件，不提供重型宿主包装器 |
| 插件边界 | 物料与插件分离；插件可以贡献已定义物料和受控能力 |
| 包结构 | contracts、core、renderer、engine、material、plugin-core、plugin-manager、plugin-sdk、react、vue、sdk、testing |
| Testing | 独立发布包，生产包不得依赖 |
| M0 发布边界 | 十二包使用 `@base-screen/*` 内部逻辑名并保持 private；公开 npm scope 延后决策 |
| 数据边界 | static + host-resource；宿主执行副作用 |
| 安全模型 | 首期只支持宿主显式导入的受信代码 |

## 20. 风险与开放问题

### 20.1 已知风险

| 风险 | 当前控制方式 |
| --- | --- |
| Custom Element 全局不可撤销 | versioned tagName、同 constructor 幂等、不同 constructor 拒绝 |
| 全局定义破坏实例隔离 | 单独维护实例物料目录，文档只能使用启用项 |
| 插件 API 过早膨胀 | 首期只开放必要声明式贡献点，任意 UI renderer 延后 |
| 内部框架泄漏 | 声明检查、tarball consumer、依赖图门禁 |
| 文档版本再次分裂 | contracts 单一来源、显式迁移、禁止重复 parser |
| 动态数据泄漏凭证 | host-resource intent、Host Adapter、服务端 allowlist |
| React/Vue 生命周期差异 | bridge conformance suite 和真实浏览器卸载测试 |
| Custom Element 无法判断永久断开 | microtask 检查、同步 move 保持、延迟重连重建的确定性协议 |
| 大画布性能退化 | transient transform、rAF、稳定 diff、性能基线和后续虚拟化 |
| Nebula 兼容污染核心 | importer 与 canonical parser 分离 |
| Nebula 源码进入 MIT 仓库的来源风险 | M0 provenance 策略、文件级记录、依赖许可证与 attribution 门禁 |

### 20.2 待 ADR 问题

- 选择 pnpm、构建器、测试框架和发布工具的具体版本。
- `contracts` runtime schema 的实现库及 JSON Schema 生成方式。
- Engine 内部 UI 是否使用现有 React 实现过渡，或直接采用其他方案。
- Shadow DOM 默认策略、主题 token 和字体注入协议。
- 属性面板首期支持的声明式控件集合。
- Component container、嵌套布局和响应式约束的文档模型。
- DSL 首期触发器、动作和变量表达式范围。
- package scope 和首个稳定浏览器支持矩阵。

## 21. 参考基线

本文的初始设计参考了 Nebula 中已经验证或正在收敛的以下方向：

- `ADR-0001-screen-sdk-static-runtime-boundary.md`：应用与 SDK runtime 边界。
- `ADR-0002-screen-component-extension-protocol.md`：Manifest、Web Component 和实例注册表。
- `ADR-0003-screen-unified-contract-framework-bridges.md`：唯一契约、Host Resource 与 React/Vue bridge。
- `screen-editor-architecture.md`：画布、状态、命令、属性面板和性能经验。
- `blueprint-runtime-architecture.md`：纯编译器、诊断与注入式执行器。

这些文档是输入证据，不是 Base Screen 的依赖或兼容承诺。Base Screen 的正式依据始终是本仓库内已生效的 contracts、ADR、Spec 和发布包。

## 22. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-08-03 | 创建长期演进总纲，冻结独立开源定位、十二包结构、Web Component 物料注册、框架桥接、插件边界和阶段路线 |
| 2026-08-03 | 架构复核：明确 Core/Engine 状态所有权、插件命令端口、产品元素归属、bridge 断连协议、注册边界、来源审查和 importer 语义 |
| 2026-08-03 | 新增 ADR-0001 回链，开始评审 Monorepo、工具链、发布和依赖门禁提案 |
| 2026-08-03 | 按评审收紧 testing 依赖语义，并将 ADR-0001 Node 基线调整为 Node.js 22+ |
| 2026-08-03 | 将 React JSX 与 Vue template 类型增强调整为 consumer-local 配方，保持 SDK 和 bridge 依赖方向不变 |
| 2026-08-03 | 接受 ADR-0001；M0 十二包保持 private，公开 npm scope 延后到首次公开发布前决策 |
| 2026-08-03 | 新增生效中的 M0 工程基线 Spec，冻结工具链、十二包骨架、边界门禁和私有 tarball 验收 |

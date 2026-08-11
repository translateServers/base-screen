# Base Screen 包开发与文档优先级

> 状态：生效中
> 最近更新：2026-08-10
> 定位：定义十二个 package 的实现顺序、并行波次、文档前置和阶段退出条件

## 1. 排序原则

包优先级由依赖方向和纵向验证价值决定，不按目录顺序推进。

- 先冻结跨边界数据，再实现状态和插件协议。
- 每一波先完成 ADR/Spec，再进入代码。
- 优先形成最小纵向闭环，不追求先把某个底层包全部写完。
- 只建设可移植作者/渲染内核和必要宿主端口；重型处理与完整业务工作流由宿主承担。
- `testing` 与所有波次同步演进，不作为收尾包。
- `sdk` 只在下层能力成立后装配，不提前制造空 facade。
- React/Vue bridge 先以 spike 验证 ABI，稳定 API 晚于原生 Web Component 纵向切片。

## 2. 依赖图

```text
contracts
├── core
├── plugin-core
│   ├── plugin-manager
│   └── plugin-sdk
│       ├── material
│       ├── react
│       └── vue
│
├── renderer  (+ core + plugin-core)
└── engine    (+ core + renderer + plugin-core + plugin-manager)

sdk           (+ contracts + core + renderer + engine
               + plugin-manager + plugin-sdk + material)

testing       -> 只从外部消费公共包，横向覆盖每个波次
```

## 3. 优先级波次

### P0：Contracts

包：`@base-screen/contracts`

目标：冻结所有后续包共同消费的 JSON、Document 和诊断边界。

文档前置：

- ADR-0002：Canonical Screen Document 契约。
- Contracts Foundation Spec。

退出条件：

- 当前 Schema、parser、canonical serializer 和 JSON Schema 契约可独立实现。
- 未知字段、危险 JSON 和资源上限都有稳定诊断。
- 不依赖 DOM、插件、Core、Renderer 或 SDK。

### P1：Core 与 Plugin Core

包：`@base-screen/core`、`@base-screen/plugin-core`

两包在 contracts 稳定后并行。

`core` 目标：

- 纯文档状态、命令、事务、历史和几何算法。
- 文档语义校验、组件树引用与状态转换。
- 不创建 Store 实例，不访问 DOM。

`plugin-core` 目标：

- Material Manifest、Element Model、标准事件和插件协议。
- type 到 tagName 的映射与只读目录接口。
- 不注册 Custom Element，不执行插件。

文档前置：

- Core Domain Spec。
- ADR-0003：Web Component 物料 ABI 与注册规则。
- Material/Plugin Contract Spec。

退出条件：

- Core 可在 Node 环境测试。
- Plugin Core 不包含 React/Vue 类型。
- 两包不互相依赖。

### P2：Plugin Manager 与 Plugin SDK

包：`@base-screen/plugin-manager`、`@base-screen/plugin-sdk`

两包依赖 plugin-core，可并行实现。

`plugin-manager` 目标：

- 预检 Custom Element constructor 与 Manifest。
- 构造不可变实例物料目录。
- 检测 type/tagName/贡献点冲突和依赖环。

`plugin-sdk` 目标：

- 提供 `createMaterialDefinition()` 和 `definePlugin()`。
- 默认入口无副作用，显式 `define()` 完成标准 Custom Element 注册。
- 提供作者友好的类型与稳定诊断，不依赖 Manager、Renderer 或 Engine。

退出条件：

- 全局 Custom Element 定义与实例启用被明确分离。
- 同 tagName/同 constructor 幂等，不同 constructor fail closed。
- Manager 失败不返回部分实例目录。

### P3：原生 Material 与框架 Spike

包：`@base-screen/material`、`@base-screen/react`、`@base-screen/vue`

顺序：先一个原生官方物料，再做 React/Vue 最小 spike。

目标：

- 原生物料证明 Manifest、model、标准事件和 define 流程。
- React/Vue spike 证明普通组件可以转为稳定 Custom Element constructor。
- 验证 model 更新、事件映射、Light/Shadow DOM 和 microtask disconnect 语义。

退出条件：

- 三种实现通过同一 conformance suite。
- Vanilla consumer 不安装 React/Vue。
- spike 不提前冻结完整 bridge 公共 API。

### P4：Renderer 与 Viewer

包：`@base-screen/renderer`，同时开始 `@base-screen/sdk` 的 Viewer-only 装配。

目标：

- 将 canonical document 与实例物料目录渲染为稳定 Custom Elements。
- 以 componentId diff，普通 model 更新不重建元素。
- 完成 `<base-screen-viewer>`、`defineBaseScreenViewer()` 和按需 auto-register。

文档前置：

- ADR-0005：Renderer DOM、样式和 Shadow DOM 策略。
- Renderer/Viewer Spec。

退出条件：

- Viewer 可 load/replace/unload 最小文档。
- 缺失物料和能力不匹配 fail closed。
- 双实例使用不同目录且互不污染。

### P5：Engine 与 Designer

包：`@base-screen/engine`

目标：

- 实例化 Core 状态、命令和历史算法。
- 完成视口、选择、拖拽、缩放、旋转和设计辅助层。
- 完成 `<base-screen-designer>` 底层实现。

文档前置：

- ADR-0006：Designer Engine 内部 UI 与交互技术选型。
- Designer Engine MVP Spec。

退出条件：

- 添加、编辑、撤销、保存、Viewer 打开形成闭环。
- 手势只产生一个历史项。
- Document、Viewport、Interaction 和 Runtime Overrides 保持分层。

### P6：SDK 与 Framework Bridge 稳定化

包：`@base-screen/sdk`、`@base-screen/react`、`@base-screen/vue`

目标：

- SDK 聚合 Designer/Viewer 和稳定子路径。
- 冻结 React/Vue 物料桥接公共 API。
- 提供 Vanilla、React、Vue tarball consumers 和 consumer-local 类型增强示例。

退出条件：

- SDK 不复制下层 Schema、Store 或 registry。
- 默认入口无注册副作用。
- 所有公开入口通过 API report、publint、ATTW 和浏览器 E2E。

### P7：动态数据与 DSL Runtime

包：`contracts`、`core`、`renderer`、`engine`、`plugin-core` 的受控增量。

目标：

- host-resource intent 与 Host Adapter data capability。
- 数据协调器、取消、超时和迟到结果保护。
- DSL 编译、诊断和受限运行时。

文档前置：

- ADR-0007：Host Resource 安全与执行模型。
- Host Resource 与 DSL Runtime Spec。

该阶段不新增绕过十二包边界的“动态 SDK”平行实现。

## 4. Testing 横向轨道

`@base-screen/testing` 不排在 P6/P7 后，而是随每一波增加公开 harness：

| 波次 | Testing 交付 |
| --- | --- |
| P0 | Document fixtures、parser conformance |
| P1 | Core command/history fixtures、Material contract fixtures |
| P2 | Registry/Plugin lifecycle conformance |
| P3 | Native/React/Vue material conformance |
| P4 | Renderer、Viewer、双实例 harness |
| P5 | Designer command、gesture、save/load harness |
| P6 | Tarball consumer 与 framework examples |
| P7 | Fake Host Adapter、资源取消和 DSL runtime harness |

生产包不得反向依赖 testing。共享测试逻辑通过 testing 消费生产包的公共 API，而不是生产包 import testing。

## 5. 当前状态

当前推进方针：以轻量、可嵌入的大屏设计器基座为主线。`@base-screen/engine` 聚焦当前文档内的画布、编辑和反馈，
其他包只在直接支撑可移植作者/渲染内核、必要宿主端口或守护既有公共契约时继续扩展。项目、数据、资产、发布和
长任务的真实处理及完整业务工作流由宿主承担；该优先级不放宽既有依赖边界和质量门。

| 波次 | 状态 |
| --- | --- |
| M0 工程基线 | 已完成，本地 Node 22 通过 `pnpm verify:m0` |
| P0 Contracts 文档 | 已完成：ADR-0002 已接受，Contracts Foundation Spec 生效中 |
| P0 Contracts 实现 | 已完成：schema、parser、serializer、diagnostics、JSON Schema artifact 与测试；`pnpm verify:m0` 通过 |
| P1 Core 与 Plugin Core | 已完成：命令、history、层级/几何纯查询、Material/Plugin contract、catalog 与 parser 通过包内测试 |
| P2 Plugin Manager 与 Authoring SDK | 已完成：候选预检、依赖拓扑、授权、生命周期回滚、会话端口和显式物料/插件定义 |
| P3 Native/React/Vue Material | 已完成：官方文本物料、Custom Element registration、React/Vue bridge 与 Node 无副作用测试 |
| P4 Renderer/Viewer | 已完成：catalog DOM diff、Shadow DOM Viewer、标准事件、资源 generation guard 与浏览器 harness |
| P5 Designer Engine | 已完成：Core command/history、拖拽单次提交、属性编辑、项目 load/save revision Adapter 与浏览器 harness |
| P6 SDK 与 Framework Bridge | 已完成：SDK 稳定子路径、React/Vue 物料桥接公共 API、consumer-local 类型增强（React `JSX.IntrinsicElements` / Vue `GlobalComponents`）与 Vanilla/React/Vue tarball consumers 均已由 `pnpm verify:tarball` 与 `pnpm verify:m0` 验证 |
| P7 动态数据与 DSL | 已完成：当前 Document、Host Resource port、Blueprint compile/dispatch、Nebula importer 与超时/取消/conformance harness 均已由 `pnpm verify:runtime`、`pnpm verify:nebula-import` 和 `pnpm verify:m0` 验证 |
| M8 不可信插件/远程模块 | 已完成第一阶段：ADR-0008、sandbox iframe、bounded ready/event protocol、超时和处置边界；远程物料 ABI 仍明确不在该协议内 |
| M9 宿主托管物料包 | 已完成：ADR-0029 与 Host Material Package Spec 生效，plugin-sdk `createMaterialPackage` 注册辅助与 browser-harness 闭环验证；Base Screen 不加载远程代码，宿主交付可信模块 |

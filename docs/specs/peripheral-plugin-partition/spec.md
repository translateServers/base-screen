# Peripheral Plugin Partition Spec

> 状态：生效中
> 最近更新：2026-09-12
> 定位：把「能力由插件承载」落到可执行的分区与承载面上——核心库保持零第三方依赖，第三方依赖只以逐插件显式申报的方式存在于外围插件区
> 依据：[ADR-0074](../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)（已接受）、[ADR-0019](../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)（已接受）、[ADR-0073](../../decisions/ADR-0073-inspector-custom-form-controls.md)（已接受）

## 1. 生效条件

- ADR-0074 已接受，且其「实施前仍需生效中的 Spec」条件由本 Spec 满足。
- `@base-screen/plugin-core`、`@base-screen/plugin-manager`、`@base-screen/plugin-sdk` 三包已交付；Plugin Core Contract Spec 与 Plugin Manager Runtime Spec 已完成并归档，本 Spec 不重新授权其范围。
- 核心库 12 个包维持零第三方依赖（唯一例外是 `contracts` 使用 `zod`），该约束由 `scripts/check-boundaries.mjs` 强制。
- 本 Spec 每项 Requirement 均可映射到自动化测试或静态门禁。

## 2. 范围与阶段边界

本 Spec 分阶段交付，阶段之间可独立验收：

- **P0 承载骨架**（已完成）：工作区分区、边界检查分区、首个带第三方依赖的外围插件、核心库手绘图表移出。
- **后续阶段**（未完成，见 `tasks.md`）：声明与接线收敛、失败爆炸半径与懒激活、UI/命令承载面采纳、条件内核表驱动、兼容性。

阶段边界原则：**本 Spec 只解决依赖分区与承载面，不解决执行隔离。** 依赖隔离（构建/打包期挡住第三方依赖）与执行隔离（运行期防恶意代码）是两件事，后者归宿主。

## 3. 目标

- 第三方依赖只能出现在 `plugins/` 区，且必须逐插件显式申报，不接受通配与继承。
- 依赖方向单向：`plugins` 可用 `packages`，`packages` 绝不可用 `plugins`。
- 外围插件不获得任何运行期特权：无沙箱豁免、无全局注册权、无跨插件相对引用。
- 插件不只是物料的交付通道，同样承载命令、面板、检查器控件、数据资源类型与蓝图能力。
- 核心库不再发布任何自称 ECharts 的物料；真实图表能力由外围插件承载。

## 4. 非目标

- 执行隔离、沙箱、恶意插件防护、代码签名与升级回滚（宿主职责，见 ADR-0074）。
- 从 URL、npm 名称、市场、网络或文件系统发现、下载或动态导入代码。
- 第三方不可信插件的信任模型（不在本阶段范围内）。
- 为核心库引入任何第三方依赖，或放宽 `ALLOWED_EXTERNAL_DEPENDENCIES` 白名单。
- 完整 ECharts option 编辑器与领域配置编辑器（宿主职责）。
- 在 Engine 内补建后端、通用网络客户端、任务队列或业务降级实现。

## 5. Requirements

### R1 工作区分区

`pnpm-workspace.yaml` 并列 `packages/*`、`plugins/*`、`examples/*`。`plugins/` 不进入 `check-packages.mjs` 固定的 12 包清单，也不进入 `check:api`、`verify:tarball` 等以 `packages/` 为域的门禁。

### R2 依赖方向单向

任何 `packages/` 包声明对 `plugins/` 包的依赖即 `PLUGIN_DEPENDENCY_FORBIDDEN` 失败关闭。

### R3 外围插件的工作区依赖收敛

`plugins/` 只能依赖稳定契约面：`contracts`、`plugin-core`、`plugin-sdk`。依赖其他 `packages/` 包即 `FORBIDDEN_PLUGIN_WORKSPACE_DEPENDENCY` 失败关闭。

### R4 外部依赖逐插件显式申报

`plugins/` 的外部依赖按插件目录名显式登记（当前 `plugin-echarts` 允许 `echarts`）。未登记的外部依赖或框架根包即 `FORBIDDEN_PLUGIN_EXTERNAL_DEPENDENCY` 失败关闭。

### R5 插件之间不得相对引用

插件只能经各自声明的工作区依赖协作；相对路径逃出本插件目录即 `PLUGIN_RELATIVE_IMPORT_ESCAPE` 失败关闭。

### R6 私有 adapter 收口第三方类型

第三方依赖必须置于私有 adapter 之后（ADR-0019）。第三方类型、状态与 document shape 不得出现在插件的公共导出面；对外只暴露 JSON-safe 载荷与 handle 接口。

### R7 清单声明与元素注册分离

插件的 runtime 入口必须 DOM-free，以便在 node 环境构造与测试；自定义元素注册单独成模块，不在 import 时拉起 DOM 依赖。

### R8 核心库零第三方依赖与手绘图表移出

`base.echarts` 手绘 SVG 实现已从 `packages/material` 整体移除（公共导出、`./echarts` 子路径、构建入口、自动注册、API 基线一并移除）。其受限 Editor Descriptor 载体以 `harness.semantic-chart` 迁入 `examples/browser-harness`，继续承担 Descriptor 的浏览器端验证，但不作为发布物。

### R9 承载面按贡献点接线

Engine 承载面已接入 `pluginCatalog`、`pluginCommandPort`、`pluginPanels`、`inspectorControls` 与 `runtimeContributions`。蓝图能力经 `blueprintCapability` 由运行时贡献索引读取。数据资源类型已接入 Engine 作者面：贡献索引可枚举授权类型，数据面板以选择器呈现并沿用事务期 `configSchema` 校验；`dataResourceType` id 必须满足文档 `resourceType` 命名模式。

## 6. 承载面现状

| 贡献点 | 契约与解析 | Engine 承载面 |
| --- | --- | --- |
| `material` | 已就位 | 已接线（物料目录与自动注册） |
| `command` | 已就位 | 已接线（`createBaseScreenCorePluginCommandPort`） |
| `panel` | 已就位 | 已接线（`pluginPanels`） |
| `inspectorControl` | 已就位 | 已接线（`inspectorControls`，遵循 ADR-0073 的 JSON-safe 约束） |
| `blueprintCapability` | 已就位 | 已接线（蓝图画布桥读取运行时贡献） |
| `dataResourceType` | 已就位 | 已接线（数据面板类型选择器与事务期 `configSchema` 校验） |

## 7. 验证与完成定义

已通过的静态门禁：`check:docs`、`check:boundaries`、`check:packages`、`check:api`、`format:check`、`lint`，以及 material / plugin-sdk / engine / plugin-core / plugin-manager / plugin-echarts 各包测试。

仍未闭环、需在执行环境具备后补齐：

- 在普通 shell 执行 `pnpm install`（当前会话沙箱无法创建符号链接），使 `plugins/plugin-echarts` 可经 pnpm 构建与测试。
- 执行 `pnpm verify:browser`，验证 harness 侧 `harness.semantic-chart` 与原 `base.echarts` 断言等价。
- 全量 `pnpm verify:m0`。

本 Spec 的全部任务与清单项完成后，须在同一交付批次移入 `docs/specs/archive/` 并更新索引、Baseline 与引用。

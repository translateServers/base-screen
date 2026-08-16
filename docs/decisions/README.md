# Base Screen 架构决策记录

> 状态：生效中
> 最近更新：2026-08-14
> 定位：索引 Base Screen 的架构决策、状态及其影响范围

## 使用规则

- ADR 记录影响公共契约、依赖方向、安全边界、兼容策略或工程基线的重要决策。
- 状态流转为：设计中 -> 评审中 -> 已接受 -> 已取代或已废弃。
- 已接受 ADR 不修改历史结论；方向变化时新增 ADR，并在新旧文档中互相标注。
- 评审中 ADR 不能作为实施授权。进入代码实现前还需要 acceptance-oriented Spec。
- ADR 中的示例配置用于冻结语义；精确实现文件由对应 Spec 验收。

## 决策索引

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-monorepo-toolchain-and-package-boundaries.md) | 已接受 | 2026-08-03 | Monorepo、工具链、私有阶段版本与十二包依赖边界 |

| [ADR-0002](./ADR-0002-canonical-screen-document.md) | 已接受 | 2026-08-04 | Canonical Screen Document 契约 |
| [ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md) | 已接受 | 2026-08-03 | Web Component 物料 ABI 与注册规则 |
| [ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md) | 已接受 | 2026-08-03 | 插件生命周期、贡献点和信任边界 |
| [ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md) | 已接受 | 2026-08-04 | Renderer DOM、样式、Shadow DOM 与产品元素归属 |
| [ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md) | 已接受 | 2026-08-04 | Designer Engine DOM、交互与历史策略 |
| [ADR-0007](./ADR-0007-host-resource-and-blueprint-runtime.md) | 已取代 | 2026-08-04 | Host Resource 与受限 Blueprint 运行时 |
| [ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md) | 已取代 | 2026-08-04 | 远程插件 iframe sandbox 与消息协议 |
| [ADR-0009](./ADR-0009-remote-plugin-sandbox-cross-origin-transport.md) | 已接受 | 2026-08-04 | 远程插件跨 origin iframe transport |
| [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md) | 已接受 | 2026-08-04 | Host Resource deadline 与 Blueprint 运行时 |
| [ADR-0011](./ADR-0011-nebula-importer-auditable-migration.md) | 已接受 | 2026-08-04 | Nebula importer 可审计迁移 |
| [ADR-0012](./ADR-0012-designer-project-lifecycle.md) | 已接受 | 2026-08-04 | Designer 项目生命周期 |
| [ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md) | 已接受 | 2026-08-04 | Core canonical Blueprint mutation |
| [ADR-0014](./ADR-0014-plugin-manifest-identity-only.md) | 已接受 | 2026-08-04 | Plugin Manifest identity-only 依赖 |
| [ADR-0015](./ADR-0015-runtime-contribution-authority.md) | 已接受 | 2026-08-04 | 实例级 runtime contribution authority |
| [ADR-0016](./ADR-0016-material-appearance-authoring-contract.md) | 已接受 | 2026-08-05 | Material 声明式外观作者契约 |
| [ADR-0017](./ADR-0017-designer-product-host-boundaries.md) | 已接受 | 2026-08-05 | 完整 Designer 产品的宿主边界 |
| [ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md) | 已接受 | 2026-08-05 | 宿主意图、资产与图形 Blueprint |
| [ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md) | 已接受 | 2026-08-05 | Designer 专项编辑依赖准入 |
| [ADR-0020](./ADR-0020-designer-canvas-interaction-pilot.md) | 已采纳 | 2026-08-06 | Designer 画布交互逻辑层移植（Moveable/Gesto 源码 vendor） |
| [ADR-0021](./ADR-0021-material-library-visibility.md) | 已接受 | 2026-08-07 | Material Manifest 可见性与 Designer 物料库过滤 |
| [ADR-0022](./ADR-0022-official-data-material-contracts.md) | 已接受 | 2026-08-07 | 官方图表与表格数据语义契约 |
| [ADR-0023](./ADR-0023-host-dataset-resource-integration.md) | 已接受 | 2026-08-07 | 宿主数据集目录、绑定与运行时取数 |
| [ADR-0024](./ADR-0024-designer-public-style-tokens.md) | 已接受 | 2026-08-07 | Designer 宿主可配置主题 Token |
| [ADR-0025](./ADR-0025-data-runtime-hardening.md) | 已接受 | 2026-08-09 | Data Runtime Hardening：宿主数据集边界、请求身份与共享、元数据/错误协议、初始化/变量/上下文、一次性迁移（部分取代 ADR-0010/0023 的跨组件去重归属） |
| [ADR-0026](./ADR-0026-designer-event-blueprint-authoring.md) | 已接受 | 2026-08-10 | Designer 事件 Blueprint 表单作者闭环与 Core trace；图形路径整体延后、零新增依赖（Engine 内部表单 UI 范围由 ADR-0028 移交宿主） |
| [ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md) | 已接受 | 2026-08-10 | 轻量设计器基座定位与宿主重型处理边界；部分取代 ADR-0017 的完整产品范围 |
| [ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md) | 已接受 | 2026-08-10 | 宿主作者桥与 Material Editor Descriptor：JSON-safe 声明式面板、结构化事件声明、专用提交入口；部分取代 ADR-0026 的 Engine 内部表单作者 UI 范围 |
| [ADR-0029](./ADR-0029-host-managed-material-package-distribution.md) | 已接受 | 2026-08-11 | 宿主托管可信物料包分发：宿主负责加载与信任，Base Screen 提供 `createMaterialPackage` 注册辅助；远程代码加载不进 Base Screen |
| [ADR-0030](./ADR-0030-host-material-mcp-access.md) | 已接受 | 2026-08-12 | Skill 管流程、MCP 管在线物料查询与校验、规范快照管离线兜底；生产服务与运行包仍归宿主 |
| [ADR-0031](./ADR-0031-material-library-host-state.md) | 已接受 | 2026-08-12 | 左侧物料库宿主状态投影、分类与动作事件；不改变不可变 catalog 和宿主加载边界 |
| [ADR-0032](./ADR-0032-designer-left-panel-refactor.md) | 已接受 | 2026-08-13 | 左侧面板信息架构与交互重构：缩略图网格组件库、按 Tab 隔离工具栏、折叠图标轨、图层树增强；零新依赖，既有 data-* 契约与宿主边界不变 |
| [ADR-0033](./ADR-0033-host-controlled-material-library-grouping.md) | 已接受 | 2026-08-13 | 宿主控制的多级物料库分组：JSON-safe 树形展示投影、严格 catalog 一致性、逐级导航与卡片网格；不改变 Manifest、catalog 或 ScreenDocument |
| [ADR-0034](./ADR-0034-designer-material-library-visual-hierarchy.md) | 已接受 | 2026-08-13 | Designer 物料库视觉层级：数据密集的目录路径、筛选、状态与卡片扫描体验；保持主题 Token、无抖动和既有物料分组契约 |
| [ADR-0035](./ADR-0035-material-library-feedback-workspace-placement.md) | 已接受 | 2026-08-13 | 物料加载错误控制台：底部状态栏入口与弹窗追踪失败，左栏专注搜索/分组/网格，保留宿主状态投影、动作事件、卡片标记与无抖动约束 |
| [ADR-0036](./ADR-0036-designer-viewport-native-events-toggle.md) | 已接受 | 2026-08-14 | Designer 视窗原生事件开关：状态栏「事件」与吸附/参考线同形态切换设计态交互模式；renderer 实例级 `setInteractive` 原地重渲染、宿主转发 `base-screen-material-event`，不重挂载不重取数 |
| [ADR-0037](./ADR-0037-designer-panel-collapse-fixes.md) | 已接受 | 2026-08-14 | Designer 面板折叠修复：面板宽度归控制器统一写回（折叠 48px/展开拖拽宽度/未拖拽保留宿主默认）、折叠态拖拽自动展开、折叠轨 UI（箭头旋转、防压扁、tooltip 语义）；公共契约零变化 |
| [ADR-0038](./ADR-0038-designer-host-preview-handler.md) | 已接受 | 2026-08-14 | Designer 宿主预览处理器：`previewHandler` 配置接管项目模式预览、预览操作可用性放宽、`togglePreview` 接管与回退；上收宿主手工补丁，宿主预览路由/鉴权/草稿存储仍归宿主 |
| [ADR-0039](./ADR-0039-designer-topbar-project-title.md) | 已接受 | 2026-08-14 | Designer 顶栏项目标题修复：`renderProjectStatus` 回写加载项目名称，公共契约零变化 |
| [ADR-0040](./ADR-0040-material-manifest-cover.md) | 已接受 | 2026-08-16 | Material Manifest 宿主封面字段：可选 `cover` URL 进入 Manifest（失败关闭校验），物料库卡片真实封面 + 确定性占位/回退；部分取代 ADR-0032 的「不扩展 Manifest 缩略图字段」结论 |
| [ADR-0041](./ADR-0041-material-cover-adaptive-fit.md) | 已接受 | 2026-08-16 | 物料封面自适应适配：封面加载后按自然尺寸与容器决策——小图（放大 >1.5×）与异形图（宽高比偏差 >0.35）自动 `contain` 完整显示，照片类保持 `cover`；封面加载后占位彩色渐变/网格底色收为中性表面；纯展示启发式，`cover` 契约与宿主边界不变 |
| [ADR-0042](./ADR-0042-material-library-render-scalability.md) | 已接受 | 2026-08-16 | 物料库渲染可扩展性：卡片网格项 `content-visibility: auto` + `contain-intrinsic-size: auto 140px` 跳过屏外渲染（实测首帧 500 张 ≈50ms / 2000 张 ≈160ms），搜索输入 120ms 防抖合并渲染；纯渐进增强（Safari < 18、Firefox < 125 退回全量渲染），无窗口化/分页，catalog 与宿主边界不变 |
| [ADR-0043](./ADR-0043-canvas-background-image.md) | 已接受 | 2026-08-16 | ScreenCanvas 宿主背景图片：可选 `backgroundImage` URL 与 `backgroundImageFit`（cover/contain）进入 canonical 文档，失败关闭校验（ADR-0040 URL 规则同形）、`update-canvas` null 删除语义、Renderer/Designer 同路径渲染、`setCanvasBackgroundImage` 宿主公开 API；零 fetch/代理，资产归宿主 |

## 计划决策

ADR-0025 已于 2026-08-09 接受，治理已接受、实施进行中；相关任务与验收见
[Data Runtime Hardening Spec](../specs/archive/data-runtime-hardening/spec.md)，XJ 侧见
XJ Data Hub 仓库 `.agent/specs/data-runtime-hardening/spec.md`。

ADR-0026 已于 2026-08-10 接受：事件 Blueprint 以键盘表单为唯一作者路径并新增 Core trace；图形路径整体延后，
本期不引入图库。评估证据与实施计划见 [Designer Event Blueprint Spec](../specs/archive/designer-event-blueprint/spec.md)
与 [候选评估报告](../plans/archive/designer-event-blueprint/dependency-evaluation.md)。2026-08-10 起，Engine 内部表单
作者 UI 范围由 ADR-0028 移交宿主作者桥。

ADR-0027 已于 2026-08-10 接受：Base Screen 定位为轻量、可嵌入的大屏设计器基座；项目、数据、资产、发布和
长任务的真实处理由宿主负责，Base Screen 只拥有本地作者内核、渲染内核与有界宿主端口。

ADR-0028 已于 2026-08-10 接受：物料 Manifest 可通过 JSON-safe 声明式 Editor Descriptor 描述外观/数据/交互/
事件作者字段；Engine 提供有限内建面板 primitives 与宿主作者桥（requestId/revision/身份/实例守护 + 专用提交
入口）；Blueprint 图形布局、代码编辑器、完整 ECharts option 与领域编辑器归宿主。规格见
[Designer Authoring Extension Spec](../specs/archive/designer-authoring-extension/spec.md)。

ADR-0029 已于 2026-08-11 接受：宿主托管可信物料包。宿主负责加载、审核与信任远程物料代码，Base Screen 不
fetch/dynamic import/发现远程代码；plugin-sdk 提供 `createMaterialPackage` 注册辅助，物料进入 Base Screen 后
仍遵守 ADR-0003 同 realm ABI 与实例级不可变 catalog。规格见
[Host Material Package Spec](../specs/archive/host-material-package/spec.md)。

相关背景、实施计划和规格入口见 [文档索引](../README.md)。

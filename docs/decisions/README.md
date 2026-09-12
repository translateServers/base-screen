# Base Screen 架构决策记录

> 状态：生效中
> 最近更新：2026-09-11
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
| [ADR-0075](./ADR-0075-peripheral-plugin-compatibility-policy.md) | 已接受 | 2026-09-12 | 外围插件兼容性策略：锁步批次交付 + 以 api 基线治理的 plugin-core/plugin-sdk 稳定子集，不引入版本标记 |
| [ADR-0074](./ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md) | 已接受 | 2026-09-11 | 外围插件承载位置与依赖分区：新增顶层 `plugins/` 分区，核心库依赖白名单与固定包清单不变；外围插件无运行时特权，依赖准入沿用 ADR-0019 |
| [ADR-0073](./ADR-0073-inspector-custom-form-controls.md) | 已接受 | 2026-09-10 | 属性面板插件自定义表单控件：`control: 'custom'` 与按贡献授权的实例化 |
| [ADR-0072](./ADR-0072-plugin-panel-contribution-minimal-loop.md) | 已接受 | 2026-09-10 | 插件面板贡献的最小闭环：`kind: 'panel'`、复用快照 model 与带 args 的动作回路 |
| [ADR-0071](./ADR-0071-plugin-design-context-read-access.md) | 已接受 | 2026-09-09 | 插件设计上下文只读访问：`design.read`、原子快照与 Designer `selection` |
| [ADR-0070](./ADR-0070-plugin-command-chrome-projection.md) | 已接受 | 2026-09-06 | 插件 command 贡献的 menus/shortcut 与 Designer chrome 投影 |
| [ADR-0069](./ADR-0069-independent-dataset-consumption.md) | 已接受 | 2026-09-05 | 独立数据集端口、参数权威及宿主消费重构 |
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
| [ADR-0020](./ADR-0020-designer-canvas-interaction-pilot.md) | 已接受 | 2026-08-06 | Designer 画布交互逻辑层移植（Moveable/Gesto 源码 vendor，实施与验证已完成） |
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
| [ADR-0044](./ADR-0044-host-popup-anchored-overlay-no-integration.md) | 已接受 | 2026-08-16 | 宿主弹出框与贴组件锚定弹窗对接评估结论：不做修改——宿主弹窗走既有事件/端口/作者桥/`previewHandler` 机制，不新增坐标转换 API、不扩展 material-event detail、不新增 viewport 跟随事件、不引入锚定/碰撞依赖；公共边界零变化 |
| [ADR-0045](./ADR-0045-canvas-background-panel-editing.md) | 已接受 | 2026-08-16 | 画布背景图属性面板编辑：右侧「画布」区新增 backgroundImage 文本输入与 backgroundImageFit 下拉（清空=删除并清 fit、无图禁用），经既有 `update-canvas` 事务与 canonical 校验，与 `setCanvasBackgroundImage`/文档入口语义一致；部分取代 ADR-0043 非目标 1；公共边界零变化 |
| [ADR-0046](./ADR-0046-canvas-background-image-host-button.md) | 已接受 | 2026-08-16 | 画布背景图宿主选择按钮：「画布」区背景图片输入旁新增按钮，点击派发 `base-screen-canvas-background-image-request`（requestId/instanceId/revision/current）；`requestCanvasBackgroundImage` 登记会话、`commitCanvasBackgroundImage` 会话守护提交（复用 ADR-0028 作者桥语义）；宿主自开弹出框可视化选择；未接入宿主零副作用 |
| [ADR-0047](./ADR-0047-text-material-typography.md) | 已接受 | 2026-08-16 | 文本物料排版能力：水平对齐（`textAlign`）与垂直对齐（`verticalAlign` top/middle/bottom）分离（flex 映射、缺失/top 保持 block 零回归），新增字间距 `letterSpacing`（px，0..100）与行间距 `lineSpacing`（px，0..512，增量语义：行高 = 字号 + 行间距）；新字段全部可选，旧文档零迁移，Manifest/面板经既有 schema 驱动通道自动生效，Engine 零改动 |
| [ADR-0048](./ADR-0048-canvas-background-palette.md) | 已接受 | 2026-08-16 | Canvas 调色板：严格 JSON-safe 的单色、线性渐变与径向渐变背景对象；`update-canvas` null 删除、Renderer 与背景图分层、Designer 三模式编辑与宿主 `setCanvasBackground` API；旧 `backgroundColor` 文档保持单色回退 |
| [ADR-0049](./ADR-0049-canvas-background-button-conditional-rendering.md) | 已接受 | 2026-08-16 | 画布背景图宿主按钮条件渲染与对齐：按钮默认隐藏，`canvasBackgroundImageButton?: boolean` 配置（RB3 校验）后渲染并暴露 getter；行容器承接字段间距、行内 field margin 归零使按钮与输入框同高居中；部分取代 ADR-0046 决策 1「始终渲染」 |
| [ADR-0050](./ADR-0050-unified-color-palette-control.md) | 已接受 | 2026-08-16 | 统一三段式颜色调色板控件：属性面板与 Descriptor 全部 `color` 字段共享单色/线性渐变/径向渐变控件，多色标增删、按字段缓存三模式草稿；值保持字符串，Material/Manifest/ScreenDocument 契约零变化 |
| [ADR-0051](./ADR-0051-unified-color-palette-replaces-color-input.md) | 已接受 | 2026-08-16 | 三段式调色板全面替换原生 color input：取消 ADR-0050 决策 2 的字段级门控，三种模式对所有颜色字段无条件可用；渐变渲染消费由物料渲染端负责，官方文本物料以 background-clip: text 支持渐变文字 |
| [ADR-0052](./ADR-0052-designer-canvas-text-editing.md) | 已接受 | 2026-08-16 | Designer 画布内文本直接编辑：双击可编辑文本组件进入 contenteditable overlay 编辑会话（仅 `base.text` + static 字符串 dataSource，fail-closed），Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交，提交复用 `update-components` patch dataSource（恰一条历史）；overlay 经既有 `isEditableTarget` 通道放行 IME 与原生编辑键；不侵入物料/Renderer DOM，公共契约零变化 |
| [ADR-0053](./ADR-0053-designer-multi-selection-editing.md) | 已接受 | 2026-08-16 | Designer 多选批量属性编辑：多选检查器新增批量几何（宽/高/旋转）与样式交集编辑（复用 createControl / 三段式调色板），值显示焦点组件、编辑应用到全部选中，一条事务 N 条命令（跳过锁定、逐组件 schema 校验）恰一条历史；`data-multi-property` 独立分派，单选通道零改动，公共契约零变化 |
| [ADR-0054](./ADR-0054-designer-variable-management.md) | 部分已取代 | 2026-08-16 | 变量面板入口、复制、删除保护和撤销语义仍有效；按名称引用及 host 变量结论由 ADR-0068 取代 |
| [ADR-0055](./ADR-0055-official-material-visual-capabilities.md) | 已接受 | 2026-08-16 | 官方物料视觉能力：形状（矩形/椭圆）新增圆角与阴影字段（borderRadius/shadowColor/shadowBlur/shadowOffsetX/Y，椭圆固定 50% 圆角），fill 渐变渲染为 background-image（容器同规则）——补齐 ADR-0051 渐变渲染责任到形状/容器；shadowColor 渐变跳过阴影（box-shadow 不接受 <image>）；Manifest 能力扩展，公共契约零变化 |
| [ADR-0056](./ADR-0056-image-material-url-validation.md) | 已接受 | 2026-08-16 | 图片物料 URL 校验与失败回退：静态数据源复用 `isBoundedScreenImageUrl`（与画布背景/封面同规则），非法 URL fail-closed 显示「图片地址无效」占位且不创建 img；img error 移除失效图片显示「图片加载失败」占位；公共契约零变化 |
| [ADR-0057](./ADR-0057-color-palette-gradient-from-solid.md) | 已接受 | 2026-08-16 | 调色板切换模式继承单色色系：单色 → 线性/径向渐变切换时，未定制（默认黑→白）色标按单色派生同色系渐变（起点=单色、终点=提亮，纯白加深回退）；已定制色标模式往返原样保留；派生仅发生在交互切换路径，值格式与序列化不变，公共契约零变化 |
| [ADR-0058](./ADR-0058-component-conditional-style-rules.md) | 部分已取代 | 2026-08-17 | 组件条件样式规则：文档契约、Renderer 求值与事务能力保持有效；Designer 内建编辑器由 ADR-0066 取代 |
| [ADR-0059](./ADR-0059-conditional-style-port.md) | 已接受 | 2026-08-17 | 宿主条件样式端口：渲染期同步纯函数覆盖，固定合并顺序与失败关闭回退，不进入文档 |
| [ADR-0060](./ADR-0060-material-library-item-projection.md) | 已接受 | 2026-08-23 | Designer 物料库条目投影：多个宿主条目复用一个 canonical 运行物料类型，实例默认值覆盖经 Manifest 校验 |
| [ADR-0061](./ADR-0061-host-constrained-visual-event-blueprint.md) | 部分已取代 | 2026-08-24 | 历史整屏 detached 编排宿主桥；决策 4、5、7、8 及布局归属已由 ADR-0063 取代 |
| [ADR-0062](./ADR-0062-host-left-panel-groups.md) | 已接受 | 2026-08-28 | Designer 宿主左侧分组：严格 JSON-safe Tab 描述与 `workbenchModes`、Canvas/Blueprint 模式感知导航、跨模式复用专属命名 slot、程序化选择与切换事件；宿主内容生命周期留在 light DOM，不进入文档或 Engine Store |
| [ADR-0063](./ADR-0063-designer-blueprint-workbench-shell.md) | 已接受 | 2026-08-29 | Designer Blueprint 一体化工作台壳层：共享文档/历史、Base 语义面板与严格 slot 协议、宿主中央图形渲染；部分取代 ADR-0061 |
| [ADR-0064](./ADR-0064-host-resource-authoring-intent.md) | 已接受 | 2026-08-30 | 宿主资源目录只提交严格 authoring intent；Designer 提供单事务插入、替换与拖放，删除旧素材目录端口 |
| [ADR-0065](./ADR-0065-text-auto-width-runtime-geometry.md) | 已接受 | 2026-08-31 | 官方文本自适应宽度；持久尺寸与只读运行时几何分离，统一尺寸编辑和历史语义 |
| [ADR-0066](./ADR-0066-host-owned-conditional-style-authoring.md) | 已接受 | 2026-09-01 | 条件样式作者入口归宿主：移除 Designer 内建规则编辑器，保留 `styleRules` 文档兼容、Renderer 求值与 `conditionalStylePort` |
| [ADR-0067](./ADR-0067-datav-inspired-global-variables.md) | 已取代 | 2026-09-01 | 历史 DataV 启发方案；`static \| host` 与按名称寻址由 ADR-0068 取代 |
| [ADR-0068](./ADR-0068-datav-global-variables.md) | 已接受 | 2026-09-03 | DataV 全局变量语义对齐：三类来源、完整配置、稳定 ID、Blueprint 节点与运行时句柄 |

## 计划决策

ADR-0025 已于 2026-08-09 接受，实施与验收已经完成；相关历史任务与验收见
[Data Runtime Hardening Spec](../specs/archive/data-runtime-hardening/spec.md)，XJ 侧见
XJ Data Hub 仓库 `.agent/specs/data-runtime-hardening/spec.md`。

ADR-0026 已于 2026-08-10 接受并建立 canonical 事件 Blueprint 与 Core trace。其 Engine 内部作者 UI 范围先由
ADR-0028 移交宿主作者桥，再由 ADR-0061 收敛为整屏 detached 上下文；ADR-0063 最终改为 Base Screen 拥有有界
工作台壳层和语义编辑、宿主只提供中央图形渲染。历史评估见 [Designer Event Blueprint Spec](../specs/archive/designer-event-blueprint/spec.md) 与
[候选评估报告](../plans/archive/designer-event-blueprint/dependency-evaluation.md)。

ADR-0027 已于 2026-08-10 接受：Base Screen 定位为轻量、可嵌入的大屏设计器基座；项目、数据、资产、发布和
长任务的真实处理由宿主负责，Base Screen 只拥有本地作者内核、渲染内核与有界宿主端口。

ADR-0028 已于 2026-08-10 接受：物料 Manifest 可通过 JSON-safe 声明式 Editor Descriptor 描述外观/数据/交互/
事件作者字段；Engine 提供有限内建面板 primitives 与宿主作者桥（requestId/revision/身份/实例守护 + 专用提交
入口）。ADR-0061 曾规定 Blueprint 使用整屏 detached 请求；ADR-0063 已移除该分支，当前 Blueprint 直接编辑
当前文档并由 Engine 提供工作台壳层，图形框架与布局算法仍归宿主。代码编辑器、完整 ECharts option 与领域编辑器
继续归宿主。规格见
[Designer Authoring Extension Spec](../specs/archive/designer-authoring-extension/spec.md)。

ADR-0029 已于 2026-08-11 接受：宿主托管可信物料包。宿主负责加载、审核与信任远程物料代码，Base Screen 不
fetch/dynamic import/发现远程代码；plugin-sdk 提供 `createMaterialPackage` 注册辅助，物料进入 Base Screen 后
仍遵守 ADR-0003 同 realm ABI 与实例级不可变 catalog。规格见
[Host Material Package Spec](../specs/archive/host-material-package/spec.md)。

相关背景、实施计划和规格入口见 [文档索引](../README.md)。

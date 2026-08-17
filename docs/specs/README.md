# Base Screen 功能与工程规格

> 状态：维护期（阶段封版）
> 阶段封版：2026-08-12
> 最近更新：2026-08-16
> 定位：Base Screen 处于阶段成果维护期；历史 Spec 全部归档，封版后的增量需求以新的 ADR/Spec 承载

## 当前状态

- **历史 Spec 已全部归档。** 截至 2026-08-12，全部历史 Spec 的 Tasks 与 Checklist 均已勾选完成，
  归档至 [archive/](./archive/README.md) 作为历史验收材料；维护期内的新需求不重新打开归档任务。
- **当前处于阶段成果维护期。** 现有能力基线见 [当前能力基线](../baseline/README.md)，下一阶段方向见
  [后续路线图](../roadmap/README.md)。
- **新功能必须重新建立 ADR/Spec。** 启动实施前先写已接受的 ADR 与生效中的 Spec，并登记到本页
  “生效中”区域。封版后的首个增量 Spec [Material Library Host State](./material-library-host-state/spec.md)
  已于 2026-08-12 生效（依据 [ADR-0031](../decisions/ADR-0031-material-library-host-state.md)）。

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、验收场景和完成定义。
- 实现不得静默偏离 Spec；需要改变公共边界时先更新 ADR。
- Spec 状态为“生效中”后才允许进入对应实现。
- 完成后保留 Spec 作为行为依据，不把实施细节反写为新的隐式契约。
- 已归档 Spec 只用于追溯历史决策和进度；新实现不得以其中的未完成项替代现行三件套。

## 生效中

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [Material Library Host State](./material-library-host-state/spec.md) | 契约与产品增量 | 左侧物料库宿主状态投影：严格状态 schema、分类/搜索/草稿/不可用标记与 composed 宿主动作事件；保持不可变 catalog；依据 [ADR-0031](../decisions/ADR-0031-material-library-host-state.md)；2026-08-12 生效 |
| [Designer Left Panel](./designer-left-panel/spec.md) | Designer 交互增量 | 左侧面板信息架构与交互重构：缩略图网格组件库、按 Tab 隔离工具栏、折叠图标轨、图层树增强与键盘可达性；依据 [ADR-0032](../decisions/ADR-0032-designer-left-panel-refactor.md)；2026-08-13 生效 |
| [Host Material Library Grouping](./host-material-library-grouping/spec.md) | 宿主展示投影增量 | 宿主控制的多级物料分组树：严格 JSON-safe 解析、catalog 一致性、逐级导航和物料网格；依据 [ADR-0033](../decisions/ADR-0033-host-controlled-material-library-grouping.md)；2026-08-13 生效 |
| [Designer Material Library Visual Refinement](./designer-material-library-visual-refinement/spec.md) | Designer 视觉增量 | 物料库目录路径、筛选、状态与卡片的紧凑视觉层级；保持主题 Token、可访问性、无抖动与既有分组契约；依据 [ADR-0034](../decisions/ADR-0034-designer-material-library-visual-hierarchy.md)；2026-08-13 生效 |
| [Material Library Error Console](./material-library-feedback-workspace-placement/spec.md) | Designer 错误展示增量 | 底部状态栏错误控制台追踪组件/物料加载失败，左栏不再承载错误提示；保持状态投影、宿主动作、卡片标记与无抖动；依据 [ADR-0035](../decisions/ADR-0035-material-library-feedback-workspace-placement.md)；2026-08-13 生效 |
| [Designer Viewport Native Events](./designer-viewport-native-events/spec.md) | Designer 交互增量 | 状态栏「事件」改为与吸附/参考线同形态的开关，控制设计态画布交互模式：renderer 实例级 `setInteractive` 原地重渲染，宿主经 `base-screen-material-event` 验证组件原生事件；默认关闭、零重建零重取数；依据 [ADR-0036](../decisions/ADR-0036-designer-viewport-native-events-toggle.md)；2026-08-14 生效 |
| [Designer Panel Collapse Fixes](./designer-panel-collapse-fixes/spec.md) | Designer 缺陷修复增量 | 左右面板折叠修复：宽度归控制器统一写回（折叠 48px、展开恢复拖拽宽度、未拖拽保留宿主默认）、折叠态拖拽自动展开、折叠轨箭头旋转与防压扁、tooltip 语义切换；公共契约零变化；依据 [ADR-0037](../decisions/ADR-0037-designer-panel-collapse-fixes.md)；2026-08-14 生效 |
| [Designer Host Preview Handler](./designer-host-preview/spec.md) | Designer 交互增量 | 宿主经 `previewHandler` 配置接管项目模式预览：预览操作可用性放宽、`togglePreview` 接管与回退；上收宿主手工补丁，预览路由/鉴权/草稿存储仍归宿主；依据 [ADR-0038](../decisions/ADR-0038-designer-host-preview-handler.md)；2026-08-14 生效 |
| [Designer Topbar Project Title](./designer-topbar-project-title/spec.md) | Designer 缺陷修复增量 | 顶栏项目标题修复：`renderProjectStatus` 回写加载项目名称，公共契约零变化；依据 [ADR-0039](../decisions/ADR-0039-designer-topbar-project-title.md)；2026-08-14 生效 |
| [Material Cover Thumbnail](./material-cover-thumbnail/spec.md) | 物料契约与展示增量 | Material Manifest 可选宿主封面字段 `cover`：失败关闭校验 + 物料库卡片真实封面渲染，确定性图标/色相保持占位与失败回退，缩略图区几何恒定；不进 ScreenDocument/Renderer/Viewer；依据 [ADR-0040](../decisions/ADR-0040-material-manifest-cover.md)；2026-08-16 生效 |
| [Material Cover Adaptive Fit](./material-cover-adaptive-fit/spec.md) | 物料封面展示增量 | 封面加载后按自然尺寸与容器自适应适配：小图（放大 >1.5×）与异形图（宽高比偏差 >0.35）自动 `contain` 完整显示，照片类保持 `cover`；封面加载后占位彩色渐变/网格底色收为中性表面，透明素材不透底；纯展示启发式，`cover` 契约与宿主边界不变；依据 [ADR-0041](../decisions/ADR-0041-material-cover-adaptive-fit.md)；2026-08-16 生效 |
| [Material Library Render Scalability](./material-library-render-scalability/spec.md) | 物料库渲染性能增量 | 物料卡片网格项 `content-visibility: auto` + `contain-intrinsic-size: auto 140px` 跳过屏外渲染（实测首帧 500 张 ≈50ms、2000 张 ≈160ms），搜索输入 120ms 防抖合并渲染；纯渐进增强（Safari < 18 / Firefox < 125 退回全量渲染），catalog 与宿主边界不变；依据 [ADR-0042](../decisions/ADR-0042-material-library-render-scalability.md)；2026-08-16 生效 |
| [Canvas Background Image](./canvas-background-image/spec.md) | 文档契约与宿主能力增量 | ScreenCanvas 宿主背景图片：可选 `backgroundImage` URL（失败关闭校验，ADR-0040 URL 规则同形）与 `backgroundImageFit`（cover/contain，缺省 cover）进入 canonical 文档；`update-canvas` null 删除语义；Renderer/Designer 同路径渲染；`setCanvasBackgroundImage` 宿主公开 API、属性面板「画布」区编辑（URL 输入 + 适配下拉）与「选择图片」宿主按钮（请求事件 + requestId 会话守护提交）入口语义一致；零 fetch/代理，资产归宿主；依据 [ADR-0043](../decisions/ADR-0043-canvas-background-image.md)、[ADR-0045](../decisions/ADR-0045-canvas-background-panel-editing.md)、[ADR-0046](../decisions/ADR-0046-canvas-background-image-host-button.md)；2026-08-16 生效 |
| [Text Material Typography](./text-material-typography/spec.md) | 物料能力增量 | 官方文本物料排版能力：水平对齐（`textAlign`）与垂直对齐（`verticalAlign` top/middle/bottom）独立设置（flex 映射，缺失/top 保持 block）、字间距 `letterSpacing`（px，0..100）、行间距 `lineSpacing`（px，0..512，增量语义：行高 = 字号 + 行间距）；新字段全部可选、旧文档零迁移、默认值同步（top/0/0），Manifest/面板经既有 schema 驱动通道自动生效，Engine 与文档契约零改动；依据 [ADR-0047](../decisions/ADR-0047-text-material-typography.md)；2026-08-16 生效 |
| [Canvas Background Palette](./canvas-background-palette/spec.md) | 文档契约与 Designer 增量 | ScreenCanvas 的单色、线性渐变、径向渐变调色板：严格 JSON-safe 判别联合、Core null 删除、Renderer 与背景图分层、三模式面板草稿与 `setCanvasBackground` API；旧 `backgroundColor` 保持兼容回退；依据 [ADR-0048](../decisions/ADR-0048-canvas-background-palette.md)；2026-08-16 生效 |
| [Unified Color Palette](./unified-color-palette/spec.md) | Designer 控件增量 | 自定义三段式调色板全面替换原生 color input：属性面板与 Manifest Editor Descriptor 全部 `color` 字段无条件支持单色/线性渐变/径向渐变，多色标增删、按字段缓存三模式草稿；值保持字符串、公共契约零变化；渐变渲染消费由物料负责，官方文本物料以 background-clip: text 支持渐变文字；画布背景保持结构化契约；依据 [ADR-0050](../decisions/ADR-0050-unified-color-palette-control.md)、[ADR-0051](../decisions/ADR-0051-unified-color-palette-replaces-color-input.md)；2026-08-16 生效 |
| [Designer Canvas Text Editing](./designer-canvas-text-editing/spec.md) | Designer 交互增量 | 画布内文本直接编辑：双击可编辑文本组件进入 contenteditable overlay 编辑会话（仅 `base.text` + static 字符串 dataSource，fail-closed；host-resource 数据归宿主），Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交，复用 `update-components` patch dataSource（恰一条历史）；overlay 经既有 `isEditableTarget` 通道放行 IME 与原生编辑键，不侵入物料/Renderer DOM，公共契约零变化；依据 [ADR-0052](../decisions/ADR-0052-designer-canvas-text-editing.md)；2026-08-16 生效 |
| [Designer Multi Selection Editing](./designer-multi-selection-editing/spec.md) | Designer 交互增量 | 多选批量属性编辑：多选检查器新增批量几何（宽/高/旋转）与样式交集编辑（复用 createControl / 三段式调色板），值显示焦点组件、编辑应用到全部选中，一条事务 N 条命令（跳过锁定、逐组件 schema 校验）恰一条历史；`data-multi-property` 独立分派、单选通道零改动，公共契约零变化；依据 [ADR-0053](../decisions/ADR-0053-designer-multi-selection-editing.md)；2026-08-16 生效 |
| [Designer Variable Management](./designer-variable-management/spec.md) | Designer 交互增量 | 变量管理：左侧面板「变量」Tab 提供静态变量新建/重命名/编辑值/删除与 host 变量只读展示（variableId）；提交复用 `replace-variables` 命令（恰一条历史）；删除/重命名引用保护（组件参数与蓝图引用，fail-closed）与重名保护；数据绑定/蓝图引用自动联动，公共契约零变化；依据 [ADR-0054](../decisions/ADR-0054-designer-variable-management.md)；2026-08-16 生效 |
| [Official Material Visual Capabilities](./official-material-visual-capabilities/spec.md) | 物料能力增量 | 官方形状物料视觉能力：矩形/椭圆新增圆角（borderRadius）与阴影（shadowColor/blur/offset）字段，fill 渐变渲染为 background-image（容器同规则），补齐 ADR-0051 渐变渲染责任；椭圆固定 50% 圆角且面板隐藏 borderRadius；shadowColor 渐变跳过阴影；Manifest 能力扩展、旧文档零迁移，公共契约零变化；依据 [ADR-0055](../decisions/ADR-0055-official-material-visual-capabilities.md)；2026-08-16 生效 |
| [Image Material URL Validation](./image-material-url-validation/spec.md) | 物料健壮性增量 | 图片物料 URL fail-closed 校验（复用 `isBoundedScreenImageUrl`，与画布背景/封面同规则）与加载失败占位回退：非法 URL 不创建 img、显示「图片地址无效」，img error 显示「图片加载失败」且重建不残留；公共契约零变化；依据 [ADR-0056](../decisions/ADR-0056-image-material-url-validation.md)；2026-08-16 生效 |
| [Color Palette Gradient From Solid](./color-palette-gradient-from-solid/spec.md) | Designer 控件增量 | 三段式调色板单色 → 渐变切换继承单色色系：未定制（默认黑→白）色标按单色派生（起点=单色、终点=同色系提亮，纯白加深回退），已定制色标模式往返原样保留、线性↔径向互切保留；派生仅在交互切换路径，值格式/序列化/公共契约零变化；依据 [ADR-0057](../decisions/ADR-0057-color-palette-gradient-from-solid.md)；2026-08-16 生效 |

## 已归档

全部历史 Spec 已按阶段封版归档至 [docs/specs/archive/](./archive/README.md)，目录表见归档索引，
共 33 份（截至 2026-08-12）：

- 基础能力：M0 工程基线、Contracts Foundation、Renderer And Viewer、Host Resource And Blueprint、
  Nebula Importer、Remote Plugin Sandbox
- Designer 增量：Canvas Precision、Event System、Theme Tokens、Event Blueprint、Authoring Extension
- 契约与数据：Material Library Visibility、Official Data Material Contracts、Host Dataset Integration、
  Data Runtime Hardening
- 宿主作者工具：Host Screen/Material Skill Generation、Host Skill Adoption、Host Material MCP Access、
  Host Draft Material Workflow
- 历史主线：Core Domain、Plugin Core Contract、Plugin Manager Runtime、Runtime And Ecosystem Hardening、
  Designer Engine、Designer Product Completion、Designer Workbench Control Styles、Directory Structure Rules、
  Designer Full Product、Designer Authoring And Project Lifecycle

相关计划与评审见 [计划与评审](../plans/README.md)，当前架构见 [架构文档](../architecture/README.md)。

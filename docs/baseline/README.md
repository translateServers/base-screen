# Base Screen 当前能力基线

> 状态：生效（维护期行为依据）
> 最近更新：2026-08-25（整屏交互编排宿主桥与无内建编排 UI 边界）

本基线描述 Base Screen 在 2026-08-12 阶段封版时已交付并验收的能力现状，以及封版后已生效的增量。它是维护期的行为依据：
**维护期内的任何修改都必须新建增量 Spec（并先有已接受的 ADR）**，不得以本基线或归档 Spec 直接授权实现。

- 范围边界、宿主职责与安全约束以已接受的 [ADR](../decisions/README.md) 为准（尤其 ADR-0027/0028/0029/0030）。
- 每个能力条目的验收材料与任务进度追溯见对应 [归档 Spec](../specs/archive/README.md)。
- 集成方式见 [集成指南](../usage.md)。

## 工程基线与仓库

- **Monorepo 工程基线**：pnpm/Turbo、12 个固定 package、`@base-screen/*` 公共导出、边界/子层/UI 文案门禁、
  lint/typecheck/test/build/tarball 验收（`pnpm verify:m0`）。依据：[M0 工程基线](../specs/archive/m0-engineering-baseline/spec.md)、
  [Directory Structure Rules](../specs/archive/directory-structure-rules/spec.md)、[Boundary Hygiene](../specs/archive/boundary-hygiene/spec.md)。
- **依赖纪律**：仅 `contracts` 允许外部 `zod`；React/Vue 仅为各自桥接包 peer 依赖；Moveable 逻辑层源码 vendor，
  不引入 npm 交互依赖。依据：[Designer 依赖候选评估](../plans/archive/designer-dependency-introduction/dependency-evaluation.md)、
  [ADR-0020](../decisions/ADR-0020-designer-canvas-interaction-pilot.md)。

## Canonical 文档与解析

- **Canonical Screen Document**：严格契约、fail-closed 解析、诊断、序列化与 JSON Schema 黄金产物。
  依据：[Contracts Foundation](../specs/archive/contracts-foundation/spec.md)、[Core Domain](../specs/archive/core-domain/spec.md)、
  [ADR-0002](../decisions/ADR-0002-canonical-screen-document.md)。

## Renderer 与 Viewer

- **纯展示职责**：Viewer 只消费 canonical 文档并渲染物料 DOM，不含编辑/设计逻辑；Viewer Shadow DOM 与事件边界隔离。
  依据：[Renderer And Viewer](../specs/archive/renderer-viewer/spec.md)、[ADR-0005](../decisions/ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)。

## Designer 能力

- **画布交互**：单/多选移动、选区吸附、坐标换算与瞬态预览；选中同级图层后，`]` 向上移动一位、`[` 向下移动一位，
  `Ctrl+]` / `Ctrl+[` 仍分别用于置顶/置底；`Alt+]` / `Alt+[` 按完整图层树向上/向下切换单选，跳过有效隐藏组件，
  到达边界后停止。依据：[Designer Canvas Precision](../specs/archive/designer-canvas-precision/spec.md)。
- **组件坐标快捷输入**（2026-08-28 增量）：单选未锁定组件后按 `X`，在选区左上角外侧以不随画布缩放的
  非模态双输入浮层一次编辑 canonical X/Y（px）；仅 `Enter` 保存，`Esc` 或离开浮层直接丢弃草稿。
  提交复用单条事务，普通组件同时更新两个坐标，组组件沿既有组平移语义移动可变子树，撤销一次恢复两个坐标。
  多选、无选中、有效锁定、文本输入、IME、AltGr、按键重复与活动手势均不触发；Screen Document、SDK、
  Custom Element 与宿主事件契约不变。
- **画布内容裁剪**（2026-08-28 增量）：设计态 Renderer 输出由独立内容层按 canonical 画布边界裁剪，
  超出画布的组件视觉与命中区域不显示；选区、变换手柄和参考线保留在外层作者覆盖层，贴边组件仍可编辑。
  Renderer 的 preview/viewer 展示模式以同一 canonical 画布为可见与命中边界，Designer 直接预览和独立 Viewer 行为一致；
  ScreenDocument、Renderer 公共 API 与宿主边界不变。
- **事件系统**：浏览器默认键盘/鼠标行为管控、统一命令通道、手势抑制与零宿主影响守卫。依据：[Designer Event System](../specs/archive/designer-event-system/spec.md)、
  [ADR-0006](../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)。
- **主题 Token**：宿主可配置的 Designer chrome Token、dark/light 与自有滚动条边界。依据：[Designer Theme Tokens](../specs/archive/designer-theme-tokens/spec.md)、
  [ADR-0024](../decisions/ADR-0024-designer-public-style-tokens.md)。
- **作者扩展（轻量基座）**：JSON-safe 声明式 Manifest Editor Descriptor、宿主作者桥、结构化事件声明与内建面板 primitives；
  Blueprint 图形/代码/完整领域配置编辑器及其依赖归宿主。依据：[Designer Authoring Extension](../specs/archive/designer-authoring-extension/spec.md)、
  [ADR-0028](../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)。
- **整屏事件 Blueprint 宿主桥**：canonical Blueprint 与 Core compile/trace/replace/history/诊断保持不变；Blueprint
  请求携带 detached 的完整当前文档、初始组件定位提示、在用物料事件/capability/容量投影，提交绑定 document
  generation 与外部 revision，并以一次 `replace-blueprint` 形成一条历史。Designer 只保留顶栏整屏入口和组件
  只读摘要/定位入口，不实现规则编辑器、流程画布、节点检查器、搜索、布局或试运行 UI。依据：
  [Document Blueprint Host Bridge](../specs/document-blueprint-host-bridge/spec.md)、
  [ADR-0061](../decisions/ADR-0061-host-constrained-visual-event-blueprint.md)。
- **左侧面板信息架构与交互**（封版后增量，生效中）：缩略图网格组件库、按 Tab 隔离的工具栏、折叠图标轨、
  图层树引导线与图标操作、搜索清除与网格键盘可达性；既有 data-* 契约与宿主边界不变，零新依赖。
  依据：[Designer Left Panel](../specs/designer-left-panel/spec.md)、[ADR-0032](../decisions/ADR-0032-designer-left-panel-refactor.md)。
- **宿主左侧分组扩展**（2026-08-28 增量）：Designer 接受最多 6 个严格 JSON-safe 的 `leftPanelGroups`，
  以有限内建图标生成可折叠、可键盘导航的 Tab；对应内容通过专属公开命名 slot 留在宿主 light DOM，
  `selectLeftPanelGroup` 与 composed change event 不要求访问 Shadow DOM。热更新删除当前组回退「物料」，
  宿主内容、状态、权限和请求不进入 Engine Store、ScreenDocument 或 Renderer。依据：
  [ADR-0062](../decisions/ADR-0062-host-left-panel-groups.md)。
- **视窗原生事件开关**（封版后增量，生效中）：状态栏「事件」与吸附/参考线同形态的 switch 控制设计态画布交互
  模式（默认关闭）；开启后组件原生事件经 `base-screen-material-event` 转发给宿主（与 Viewer 同形），renderer
  以实例级 `setInteractive` 原地重渲染，不重挂载、不重取数。依据：
  [Designer Viewport Native Events](../specs/designer-viewport-native-events/spec.md)、
  [ADR-0036](../decisions/ADR-0036-designer-viewport-native-events-toggle.md)。
- **面板折叠修复**（封版后缺陷修复增量，生效中）：左右面板折叠/拖宽往返收敛（折叠 48px 图标轨、展开恢复
  拖拽宽度、未拖拽保留宿主默认宽度）、折叠态拖拽分隔条自动展开、折叠轨箭头旋转与按钮防压扁、收起/展开
  tooltip 语义切换。依据：[Designer Panel Collapse Fixes](../specs/designer-panel-collapse-fixes/spec.md)、
  [ADR-0037](../decisions/ADR-0037-designer-panel-collapse-fixes.md)。
- **宿主预览处理器**（封版后增量，生效中）：`previewHandler` 配置接管项目模式预览，预览操作可用性放宽、
  `togglePreview` 接管与回退；上收宿主手工补丁，预览路由/鉴权/草稿存储仍归宿主。依据：
  [Designer Host Preview Handler](../specs/designer-host-preview/spec.md)、
  [ADR-0038](../decisions/ADR-0038-designer-host-preview-handler.md)。
- **顶栏项目标题修复**（封版后缺陷修复增量，生效中）：`renderProjectStatus` 回写加载项目名称，公共契约
  零变化。依据：[Designer Topbar Project Title](../specs/designer-topbar-project-title/spec.md)、
  [ADR-0039](../decisions/ADR-0039-designer-topbar-project-title.md)。
- **画布宿主背景图片**（封版后增量，生效中）：`ScreenCanvas` 可选 `backgroundImage` URL 与
  `backgroundImageFit`（cover/contain，缺省 cover）进入 canonical 文档并随文档持久化；失败关闭校验
  （ADR-0040 URL 规则同形）、`update-canvas` null 删除语义、Renderer/Designer 同路径渲染；宿主经
  `setCanvasBackgroundImage` 公开 API 设置/清除，属性面板「画布」区提供背景图 URL 输入、适配方式
  下拉（清空=删除并清 fit）与「选择图片」宿主按钮（默认隐藏，`canvasBackgroundImageButton` 配置后
  渲染；派发 `base-screen-canvas-background-image-request`，宿主自开弹出框可视化选择后经
  `commitCanvasBackgroundImage` 注入），入口语义一致；零 fetch/代理，资产归宿主。依据：
  [Canvas Background Image](../specs/canvas-background-image/spec.md)、
  [ADR-0043](../decisions/ADR-0043-canvas-background-image.md)、
  [ADR-0045](../decisions/ADR-0045-canvas-background-panel-editing.md)、
  [ADR-0046](../decisions/ADR-0046-canvas-background-image-host-button.md)、
  [ADR-0049](../decisions/ADR-0049-canvas-background-button-conditional-rendering.md)。

- **画布调色板**（封版后增量，生效中）：`ScreenCanvas.background` 以严格 JSON-safe 对象表达单色、线性渐变或径向渐变；未声明时保留既有 `backgroundColor` 单色语义。Renderer 以基础色、渐变、背景图片的层序一致渲染；Designer 画布区提供三模式和受限色标编辑，宿主可经 `setCanvasBackground` 提交。依据：[Canvas Background Palette](../specs/canvas-background-palette/spec.md)、[ADR-0048](../decisions/ADR-0048-canvas-background-palette.md)。
- **统一三段式颜色调色板**（封版后增量，生效中）：自定义三段式调色板全面替换原生 color input——属性面板与 Manifest Editor Descriptor 的全部 `color` 字段无条件支持单色/线性渐变/径向渐变，渐变模式支持 2..8 个色标的增删与位置编辑，单色与色标均带「透明度」滑杆（透明通道写入色值 `#rrggbbaa`，不透明保持 6 位，值仍为字符串），按字段缓存三种模式草稿；内部字段行内紧凑排布（单色 = 颜色 + 透明度一行、色标 = 颜色 + 位置一行、色标透明度与增删按钮同行、渐变参数行内，渐变模式约 290px -> 约 200px、单色约 107px -> 约 73px），模式间状态双向共享（渐变 -> 单色把选中色标完整色值含 alpha 同步为单色，transparent/非法跳过；单色 -> 渐变维持 ADR-0057 派生），颜色控件使用无边框 hex 输入（支持 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA`，提交时同步 swatch/alpha，无效草稿不写文档且无焦点 outline），颜色控件/数字输入/透明度滑杆带 aria-label；字段值仍为字符串（色值或规范化 CSS 渐变），Material/Manifest/ScreenDocument 契约零变化；渐变渲染消费由物料渲染端负责，官方文本物料以 `background-clip: text` 支持渐变文字；画布背景保持结构化契约。依据：[Unified Color Palette](../specs/unified-color-palette/spec.md)、[ADR-0050](../decisions/ADR-0050-unified-color-palette-control.md)、[ADR-0051](../decisions/ADR-0051-unified-color-palette-replaces-color-input.md)。
- **画布内文本直接编辑**（封版后增量，生效中）：双击可编辑文本组件进入 contenteditable overlay 编辑会话——仅官方文本物料且 dataSource 为 static 字符串（fail-closed，host-resource 数据归宿主）；Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交，提交复用 `update-components` patch dataSource（恰一条历史）；overlay 视觉复制物料样式（WYSIWYG），经既有 `isEditableTarget` 通道放行 IME 与原生编辑键，不侵入物料/Renderer DOM；公共契约零变化。依据：[Designer Canvas Text Editing](../specs/designer-canvas-text-editing/spec.md)、[ADR-0052](../decisions/ADR-0052-designer-canvas-text-editing.md)。
- **多选批量属性编辑**（封版后增量，生效中）：多选检查器新增批量几何（宽/高/旋转）与样式交集编辑——样式字段取所有选中组件 stylePanel 交集（空交集只显几何），控件复用既有渲染与统一三段式调色板；值显示焦点组件、编辑应用到全部选中，一条事务 N 条命令（跳过锁定、逐组件 schema 校验）恰一条历史；`data-multi-property` 独立分派、单选通道零改动；公共契约零变化。依据：[Designer Multi Selection Editing](../specs/designer-multi-selection-editing/spec.md)、[ADR-0053](../decisions/ADR-0053-designer-multi-selection-editing.md)。
- **变量管理**（封版后增量，生效中）：左侧面板「变量」Tab 提供静态变量的新建/重命名/编辑值/删除与 host 变量只读展示（`variableId`）；提交复用 `replace-variables` 命令（恰一条历史，undo/redo 免费）；删除/重命名前引用保护（组件数据源参数与 Blueprint 引用，fail-closed 拒绝）与重名保护；数据绑定下拉与蓝图引用自动联动；公共契约零变化。依据：[Designer Variable Management](../specs/designer-variable-management/spec.md)、[ADR-0054](../decisions/ADR-0054-designer-variable-management.md)。
- **官方物料视觉能力**（封版后增量，生效中）：形状物料（矩形/椭圆）新增圆角 `borderRadius`（0..512）与阴影 `shadowColor`/`shadowBlur`/`shadowOffsetX`/`shadowOffsetY`（阴影默认关闭，椭圆固定 50% 圆角且面板不暴露 borderRadius）；`fill` 渐变字符串渲染为 background-image（普通色值保持 background-color），容器 `backgroundColor` 同规则——补齐统一调色板渐变渲染责任到形状/容器；`shadowColor` 渐变时跳过阴影（box-shadow 不接受 `<image>`）；Manifest 能力扩展、旧文档零迁移，公共契约零变化。依据：[Official Material Visual Capabilities](../specs/official-material-visual-capabilities/spec.md)、[ADR-0055](../decisions/ADR-0055-official-material-visual-capabilities.md)。
- **图片物料 URL 校验与失败回退**（封版后增量，生效中）：图片物料静态数据源复用 `isBoundedScreenImageUrl` fail-closed 校验（与画布背景/封面同规则，拒绝 data:/javascript:/blob:/file:/裸相对/控制字符）——非法 URL 不创建 img、显示「图片地址无效」占位；`img` 加载失败移除失效图片并显示「图片加载失败」占位，渲染重建不残留；公共契约零变化。依据：[Image Material URL Validation](../specs/image-material-url-validation/spec.md)、[ADR-0056](../decisions/ADR-0056-image-material-url-validation.md)。
- **调色板切换模式继承单色色系**（封版后增量，生效中）：三段式调色板从单色切换到线性/径向渐变时，若色标为未定制的内置默认（黑→白），按单色色系派生——起点 = 单色、终点 = 同色系提亮（向白混合 45%，纯白等无区分度时向黑加深 35% 回退），渐变首帧即与单色同色系；已定制的渐变色标在模式往返中原样保留、线性 ↔ 径向互切保留色标与几何；派生仅发生在交互切换路径（文档解析路径不受影响），字段值格式与序列化契约不变、一条历史可 undo，公共契约零变化。依据：[Color Palette Gradient From Solid](../specs/color-palette-gradient-from-solid/spec.md)、[ADR-0057](../decisions/ADR-0057-color-palette-gradient-from-solid.md)。
- **组件条件样式规则**（封版后增量，生效中）：`ScreenComponentNode` 可选 `styleRules`（≤8 条，严格 JSON-safe、fail-closed 解析）以组件自身 `dataState.value` 为唯一条件源（有界路径 + 与 Blueprint 同集的 8 个操作符，类型不匹配/非 ready 视为不命中），命中规则按数组顺序逐键合并出 effective style；Renderer 在模型应用前求值并逐规则过物料 `styleSchema`（非法规则样式与非法 style 同路径 fail-closed），数据刷新自动重评估且不发新请求，effective style 只存在于运行时、不回写文档/历史；Core `update-components` patch 整体替换（空数组清除，锁定组件既有拦截）；Designer 单选检查器「条件样式」区提供规则增删与路径/操作符/比较值/样式覆盖编辑（复用 stylePanel 控件与三段式调色板，8 条上限、锁定只读、多选不渲染、恰一条事务）；宿主可经文档或既有公开事务通道配置，零新增宿主 API。依据：[Component Conditional Style Rules](../specs/component-conditional-style-rules/spec.md)、[ADR-0058](../decisions/ADR-0058-component-conditional-style-rules.md)。
- **宿主条件样式端口**（封版后增量，生效中）：判定与视觉映射都归宿主的告警视觉通道——Viewer/Designer `configure` 可选 `conditionalStylePort`（同步纯函数 `(componentId, dataState) => style overrides | undefined`，并提供与 `resourcePort` 同形的守卫 setter 与只读 getter）；Renderer 在同一 effective style 求值点按 base → 文档 `styleRules` → 端口覆盖的固定顺序合并，端口收到完整 `dataState`（含 idle/loading/error）可自行决定降灰等状态样式；端口覆盖过物料 `styleSchema`（非法覆盖与抛异常均忽略覆盖、保留 base+规则结果并上报诊断，不中断渲染）；effective style 仍只在运行时、不回写文档；无端口实例与现状逐字节一致，文档/Blueprint 契约零变化；设计态画布经同一 Renderer 路径预览宿主告警样式。依据：[Conditional Style Port](../specs/conditional-style-port/spec.md)、[ADR-0059](../decisions/ADR-0059-conditional-style-port.md)。

## 物料体系

- **物料契约与 ABI**：manifest 类型、校验、只读 catalog 与同 realm Web Component ABI。
  依据：[Plugin Core Contract](../specs/archive/plugin-core-contract/spec.md)、[ADR-0003](../decisions/ADR-0003-web-component-material-abi-and-registration.md)。
- **静态数据作者契约**（2026-08-23 增量）：Manifest 可选 `staticData` scalar/tabular 描述；canonical 静态
  数据源可携带字段角色 binding，tabular 静态数据与宿主数据集复用物料 adapter。Designer 提供标量表单、
  有界表格网格、列/行/类型/角色编辑、Excel/TSV 粘贴推断与高级 JSON；应用一条事务，取消零副作用，未声明
  `staticData` 的自定义物料继续使用原始 JSON 路径。依据：[ADR-0028](../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)。
- **官方数据物料契约**：图表与表格的最小数据语义契约。依据：[Official Data Material Contracts](../specs/archive/data-material-contracts/spec.md)、
  [ADR-0022](../decisions/ADR-0022-official-data-material-contracts.md)。
- **物料库可见性**：Manifest 可选 `libraryVisible` 与 Designer 物料库过滤，容器移出物料库。
  依据：[Material Library Visibility](../specs/archive/material-library-visibility/spec.md)、[ADR-0021](../decisions/ADR-0021-material-library-visibility.md)。
- **宿主托管物料包**：宿主负责加载与信任，plugin-sdk `createMaterialPackage` 注册辅助；远程代码加载不进 Base Screen。
  依据：[Host Material Package](../specs/archive/host-material-package/spec.md)、[ADR-0029](../decisions/ADR-0029-host-managed-material-package-distribution.md)。
- **草稿物料流程**：设计期显式草稿交接、目录叠加与正式发布预检。依据：[Host Draft Material Workflow](../specs/archive/host-draft-material-workflow/spec.md)。
- **在线物料 MCP**：规范快照 + 在线物料查询/校验 MCP 契约与 stdio 参考服务。依据：[Host Material MCP Access](../specs/archive/host-material-mcp-access/spec.md)、
  [ADR-0030](../decisions/ADR-0030-host-material-mcp-access.md)。
- **物料库宿主状态**（封版后增量，生效中）：严格状态 schema（ready/loading/offline/partial/update）、分类排序与搜索、
  草稿/不可用标记、composed 宿主动作事件（retry/reload/details）；保持不可变 catalog 与宿主加载边界。
  依据：[Material Library Host State](../specs/material-library-host-state/spec.md)、[ADR-0031](../decisions/ADR-0031-material-library-host-state.md)。
- **宿主多级物料分组**（封版后增量，生效中）：宿主以 JSON-safe 树投影控制组层级、名称和卡片顺序；Designer 提供全部入口、
  路径面包屑、当前层级子组与网格筛选，保持 Manifest、catalog、ScreenDocument 和 Renderer 不变。
  依据：[Host Material Library Grouping](../specs/host-material-library-grouping/spec.md)、[ADR-0033](../decisions/ADR-0033-host-controlled-material-library-grouping.md)。
- **物料库条目投影**（封版后增量，生效中）：Designer 可接收严格、JSON-safe 的 `materialLibraryItems`；多个条目
  可复用同一个 canonical `materialType`，并覆盖卡片名称、分类、封面与新实例默认值。运行构造器、文档 type 和 ABI
  仍由不可变 catalog 决定；未配置时保持一类型一卡片。依据：[ADR-0060](../decisions/ADR-0060-material-library-item-projection.md)。
- **物料库视觉层级**（封版后增量，生效中）：路径、当前层级、筛选、状态与缩略图网格采用紧凑的 data-dense/drill-down
  层级；仅消费现有 Designer Token，保留深浅主题、键盘焦点、forced-colors、reduced-motion 与无抖动约束。
  依据：[Designer Material Library Visual Refinement](../specs/designer-material-library-visual-refinement/spec.md)、[ADR-0034](../decisions/ADR-0034-designer-material-library-visual-hierarchy.md)。
- **物料加载错误控制台**（封版后增量，生效中）：失败记录、当前目录状态和恢复动作通过固定宽度的底部状态栏入口在工作区弹窗中显示；
  当前状态与最新优先的有界历史明确分区，支持稳定清空、Tab 焦点闭环、Escape/遮罩关闭和焦点返回。左侧物料库专用于搜索、分组和网格，
  保留状态 data-*、宿主动作、草稿/不可用标记、可访问性和无抖动。
  依据：[Material Library Error Console](../specs/material-library-feedback-workspace-placement/spec.md)、[ADR-0035](../decisions/ADR-0035-material-library-feedback-workspace-placement.md)。
- **物料宿主封面**（封版后增量，生效中）：Manifest 可选 `cover` URL 字段（失败关闭校验，http(s)/根相对/
  点相对/协议相对），物料库卡片在固定缩略图区内渲染真实封面，确定性分类图标/色相保持占位与失败回退，
  纯展示投影不进 ScreenDocument/Renderer/Viewer。封面加载后按自然尺寸自适应适配：小图（放大 >1.5×）与
  异形图（宽高比偏差 >0.35）自动 `contain` 完整显示、照片类保持 `cover`，占位彩色渐变/网格底色收为中性
  表面、透明素材不透底。依据：[Material Cover Thumbnail](../specs/material-cover-thumbnail/spec.md)、
  [Material Cover Adaptive Fit](../specs/material-cover-adaptive-fit/spec.md)、[ADR-0040](../decisions/ADR-0040-material-manifest-cover.md)、
  [ADR-0041](../decisions/ADR-0041-material-cover-adaptive-fit.md)。
- **物料库渲染可扩展性**（封版后增量，生效中）：物料卡片网格项 `content-visibility: auto` +
  `contain-intrinsic-size: auto 140px` 跳过屏外卡片渲染（实测首帧 500 张 ≈50ms、2000 张 ≈160ms），
  搜索输入 120ms 防抖合并渲染；纯渐进增强——不支持 CV 的浏览器（Safari < 18、Firefox < 125）退回
  全量渲染，功能零损失；无窗口化/分页，catalog 与宿主边界不变。依据：
  [Material Library Render Scalability](../specs/material-library-render-scalability/spec.md)、
  [ADR-0042](../decisions/ADR-0042-material-library-render-scalability.md)。
- **文本物料排版能力**（封版后增量，生效中）：文本物料水平对齐（`textAlign`）与垂直对齐
  （`verticalAlign` top/middle/bottom）独立设置（flex 映射，缺失/top 保持 block 零回归），
  新增字间距 `letterSpacing`（px，0..100）与行间距 `lineSpacing`（px，0..512，增量语义：
  行高 = 字号 + 行间距），并补绝对行高 `lineHeight`（px，1..512）：行高为行盒绝对基准、
  行间距在其上叠加增量（`line-height = (lineHeight ?? 字号) + 行间距`），两者并存互不冲突，
  行高缺省时保持「随字号自适应」默认；新字段全部可选、旧文档零迁移、默认值同步（top/0/0），
  Manifest 与属性面板经既有 schema 驱动通道自动生效，Engine 与文档契约零改动。依据：
  [Text Material Typography](../specs/text-material-typography/spec.md)、
  [ADR-0047](../decisions/ADR-0047-text-material-typography.md)。

## 宿主边界与数据运行时

- **轻量基座定位**：项目、数据、资产、发布、长任务等真实处理归宿主，Base Screen 通过 JSON-safe intent/port/method/event
  请求宿主能力。依据：[ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
  [ADR-0017](../decisions/ADR-0017-designer-product-host-boundaries.md)。
- **Host Resource 与 Blueprint 运行时**：opaque 资源意图、deadline 与受限运行时。依据：
  [Host Resource And Blueprint](../specs/archive/host-resource-blueprint/spec.md)、[ADR-0010](../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md)。
- **宿主数据集集成与数据运行时**：数据集目录、参数绑定、字段映射、预览、Viewer 取数闭环；请求身份与共享、
  元数据/错误协议、初始化/参数/变量/执行上下文。依据：[Host Dataset Integration](../specs/archive/host-dataset-integration/spec.md)、
  [Data Runtime Hardening](../specs/archive/data-runtime-hardening/spec.md)、[ADR-0023](../decisions/ADR-0023-host-dataset-resource-integration.md)、
  [ADR-0025](../decisions/ADR-0025-data-runtime-hardening.md)。

## 宿主作者工具（Skill）

- **宿主大屏/物料 Skill**：从宿主安全快照生成专属设计/物料创建 Skill，统一命令与 `.base-screen/tooling` 宿主工具包。
  依据：[Host Screen Skill Generation](../specs/archive/host-screen-skill-generation/spec.md)、
  [Host Material Skill Generation](../specs/archive/host-material-skill-generation/spec.md)、
  [Host Skill Adoption](../specs/archive/host-skill-adoption/spec.md)。

## 安全与插件运行时

- **远程插件 Sandbox**：不可信 iframe 插件协议、来源校验、能力缩减与跨 origin transport。
  依据：[Remote Plugin Sandbox](../specs/archive/remote-plugin-sandbox/spec.md)、[ADR-0009](../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)。
- **插件生命周期与权限**：候选预检、依赖解析、能力授权与实例级 contribution authority。
  依据：[Plugin Manager Runtime](../specs/archive/plugin-manager-runtime/spec.md)、[ADR-0015](../decisions/ADR-0015-runtime-contribution-authority.md)。

## 历史迁移

- **Nebula Importer**：离线 legacy export 转换、审计报告与 provenance。
  依据：[Nebula Importer](../specs/archive/nebula-importer/spec.md)、[ADR-0011](../decisions/ADR-0011-nebula-importer-auditable-migration.md)、
  [来源记录](../provenance/README.md)。

## 维护规则

- 修改现有能力、修复缺陷或补充验证，视影响范围新建增量 Spec；涉及公共边界先更新 ADR。
- 新需求不得重新打开归档 Spec；历史验收材料只用于追溯。

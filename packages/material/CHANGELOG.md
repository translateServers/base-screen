# @base-screen/material

## 0.2.1

### Patch Changes

- Updated dependencies [5e27baa]
- Updated dependencies [7bfdce9]
- Updated dependencies [6deb116]
- Updated dependencies [1d6b802]
- Updated dependencies [e0fa844]
- Updated dependencies [f006a00]
  - @base-screen/contracts@0.3.0
  - @base-screen/plugin-sdk@0.3.0
  - @base-screen/plugin-core@0.2.1

## 0.2.0

### Minor Changes

- 7b9d601: 检查器配置表单范式（base-screen-docs ADR-0102 D1–D3）。

  - **控件按语义推导**：描述符字段的 `control` 可以省略，解析时按字段语义补齐（新导出
    `inferBaseScreenMaterialEditorControl`）：小整数计数（props、无单位、跨度 ≤ 24）→ 步进器，有界数值 → 滑杆 + 读数
    （有 `unit` 时读数内嵌单位），无界带单位 → 带单位数字，`color` / `xxxColor` 键 → 取色器，left/center/right → 图标分段。
    `parseBaseScreenMaterialEditorDescriptor` 与 `parseBaseScreenMaterialManifest` 返回规范化后的描述符。新增作者输入类型
    `BaseScreenMaterialEditorFieldInput` / `BaseScreenMaterialEditorSectionInput` / `BaseScreenMaterialEditorDescriptorInput`。
  - **描述符是唯一表单来源**：检查器只有描述符一条渲染路径；扁平 `propertyPanel` / `stylePanel` 由引擎转换成「内容 / 样式」
    两个描述符分区后渲染。提交门禁、多选批量、条件样式、宿主条件样式都改读同一份外观字段表。色板组（连续 ≥ 3 个颜色字段合成色卡带）
    从扁平分支移到描述符渲染器，所有物料的颜色分区都会出现。
    仓库内官方物料、大屏物料与图表的扁平面板全部清空。
  - **通用配置组**（plugin-sdk）：`createBaseScreenNumberFormatConfig`（前缀、单位、小数位、显示千分位）、
    `createBaseScreenChartTitleConfig`、`createBaseScreenChartLegendConfig`、`mergeBaseScreenMaterialConfigGroups`。
    翻牌器、胶囊进度、水位图与 11 个图表改用配置组。
  - **范式审计**（plugin-sdk）：`auditBaseScreenMaterialEditorForm(manifest)` 返回 R9 / R11–R14 违规清单（可见字段预算、
    控件与推导一致、不再写扁平面板、标签文案、配置组键一致）；物料包测试对每个 manifest 断言为空。
  - **文档键变更**：`board.digital-flop` 的 `props.suffix` 改名为 `props.unit`。开关标签改为正向表述（「显示图例」
    「显示提示框」「显示千分位」「启用发光」等），「填充」改为「填充色」。

- 620c2b7: 官方物料检查器迁移到 `editorDescriptor`（ADR-0099 §2.4 待决项结案）：

  - 文本、矩形、椭圆、容器、分割线、图片、图表、表格的外观区按「结构 → 文字 → 填充与描边 → 阴影」分区；
    矩形与椭圆的阴影四项默认收起，椭圆不出现「结构」（圆角由形状固定）。字段、标签与渐变开关与扁平面板逐项一致，
    扁平 `propertyPanel` / `stylePanel` 继续保留（多选批量、条件样式按它们识别字段）。
  - 描述符字段与扁平面板同形：有界 `number`（跨度 ≤ 1000、未声明 `unit`）渲染为滑杆 + 数字读数；三档水平对齐
    （left / center / right）声明为 `select` 或 `segmented` 都画成图标分段；顶层 props/style 字段的值载体同时挂
    `data-prop` / `data-style`，检查器搜索、回车提交与自动化按同一个钩子定位。插件物料里符合条件的描述符字段
    （例如滚动字幕字号）随之恢复迁移前的滑杆形态。
  - 描述符写入顶层 props/style 键时沿用扁平面板的提交语义：清空可选数值即删除该键；改边框颜色时自动启用零宽边框。

- 591d730: 官方文本物料 `base.text` 的 `dataCapabilities` 增加 `host-resource`：读数文本可以直接读宿主资源实例（含推送式
  数据源，ADR-0104），不必再借数据集或变量中转。宿主资源选择入口（`hostResourceSelection`）仍只对图片物料开放。

### Patch Changes

- d161254: 检查器公共区的不透明度控件改为对所有物料显示（ADR-0099 §2.3）：不透明度是引擎级保留样式，Renderer 几何帧本就对所有物料统一写入，
  此前公共区却只在物料 `styleSchema` 申报了 `opacity` 时才出现，未申报的物料（如全部大屏插件物料）因此没有入口。
  物料申报的 schema 仍用于收窄取值。官方形状、容器、分割线与图片物料移除了 `stylePanel` 中不生效的 `opacity` 项，
  并不再在渲染路径自行写宿主元素的 `opacity`；文档中的 `opacity` 值与渲染结果不变。

  检查器几何区的水平 / 垂直翻转按钮同样改为对所有物料显示：翻转也是引擎级保留样式，Renderer 本就统一写入 transform，
  此前只有在 `styleSchema` 申报了 `flipX` / `flipY` 的物料才有入口；提交侧同样回落到保留 schema。

- fe97e39: 设计器「事件」开着时页面预览与查看器一致：编辑主画布时蓝图切页只换垫在下面的页面（不透明、可交互，
  主画布组件不重建，标签页选中项保留）；编辑页面时主画布内容叠在页面之上，标签页、导航按钮照样能点。
  物料不再把宿主元素的 `display` 无条件写成 `block`，组件隐藏、画板外组件与蓝图显隐不会再被覆盖。
- 15666a6: 设计器与查看器的推送数据源作者面（ADR-0104 切片 5）。

  - 工作台「更新方式」新增「实时推送」：只在实例来源能推送时出现——`host-resource` 要求资源类型贡献声明
    `delivery.push` 且宿主资源端口实现了 `subscribe`，`host-catalog` 要求宿主目录端口实现了 `subscribe`；
    `dataset` / `url-query` 不提供。实例已是 `push` 时始终如实显示，便于改回。
  - 选「实时推送」后出现「断线回退」（秒，0 为不回退，上限 86400）；来源声明 `delivery.push.append` 时
    另有「保留最近 N 行」（1..10000，缺省 1000）。变更与既有设置一样经 `base-screen-dataset-authoring-action`
    的 `update-settings` 交给宿主，`setting` 为 `refreshStrategy` / `pushFallbackInterval` / `pushRetainRows`。
  - 切换组件时「更新方式」按该组件引用实例的 `updatePolicy` 回显，不再一律从「手动」起步。
  - 检查器组头与只读事实：`push` 显示为「实时推送」或「实时推送 · 断线每 N 秒轮询」（此前误显示为「手动」）；
    提示文案说明实时推送只在预览与发布后生效，设计态只请求一次。
  - 物料基类在 `ready` 且 `stale: true` 时给宿主元素打 `data-base-screen-data-stale="true"`，恢复后移除。
  - `<base-screen-viewer>` 的 Shadow Root 带一份默认过期角标样式（右上角 8px 状态点）；宿主可用继承的
    `--base-screen-stale-indicator-display: none` 关闭、`--base-screen-stale-indicator-color` 改色。
  - 「更新方式」及推送设置现在写回文档：组件经 `dataValue` 引用的文档级实例按 `replace-data-sources`
    单条事务更新 `updatePolicy`（一次改动一个历史步骤，可撤销）；「手动」写成省略字段；面板上没有控件的
    `retain.seconds` / `retain.timeField` 原样保留。`update-settings` 宿主事件照发。
  - 不写回的情形：旧形态内联数据源（提示「更新方式将在应用数据源后写入文档」，首次应用数据集绑定新建实例时
    带上已选的「只请求一次 / 自动更新」）；宿主标 `readOnly` 的实例（提示并退回文档策略）；来源不能推送却选了
    「实时推送」（报 `DATA_SOURCE_UPDATE_POLICY_INVALID`）。撤销 / 重做后工作台按文档回显。

- Updated dependencies [591d730]
- Updated dependencies [314eda0]
- Updated dependencies [9eec106]
- Updated dependencies [c27b41a]
- Updated dependencies [1b328e6]
- Updated dependencies [7b9d601]
- Updated dependencies [7b9d601]
- Updated dependencies [cbb7022]
- Updated dependencies [7b9d601]
- Updated dependencies [591d730]
- Updated dependencies [7b9d601]
- Updated dependencies [aa547bf]
- Updated dependencies [c213715]
- Updated dependencies [6405a3d]
- Updated dependencies [c213715]
  - @base-screen/contracts@0.2.0
  - @base-screen/plugin-core@0.2.0
  - @base-screen/plugin-sdk@0.2.0

## 0.1.0

### Minor Changes

- 14fc8cd: Consolidated record of three changes to the host data boundary: the dataset port and parameter authority, global variable authoring, and host resource authoring intents.

  ### independent-dataset-consumption

  Separate tabular datasets from generic host resources. Add `ScreenHostDatasetPort`, opaque dataset
  publication identities, dataset-owned parameter constraints, host-defined catalog groups, and a
  dedicated `dataset` document source. Designer and Viewer now share the same bounded metadata and query
  lifecycle. Host resource types remain available for non-tabular resources.

  ### stable-global-variables

  Expand global variable authoring with strict host catalogs, authoring previews, atomic renames,
  explicit runtime refresh, and structured Blueprint value sources while keeping dynamic data
  ownership with the host.

  ### host-resource-authoring-intents

  Replace the legacy asset catalog adapter with strict host resource authoring intents,
  viewport-centered insertion, validated native drag/drop, and dataSource-only replacement.
  Resource discovery, permissions, previews, signing, and lifecycle remain host-owned.

- 14fc8cd: Consolidated record of seven changes to material rendering, typography and the loading surface.

  ### material-loading-container

  Provide an opt-in loading container driven by the public material presentation status. Preserve
  content nodes while loading, manage accessibility and cleanup, and expose CSS variables and parts
  for host styling without new document fields, requests, registration, or framework dependencies.
  Allow status updates to override the plain-text loading label without replacing content nodes.

  ### shared-material-loading

  Expose a framework-independent loading element factory for host-authored materials. The opt-in view inherits typography and color, isolates its styles, supports reduced motion and accessible status text, and leaves data state and lifecycle ownership with the material.

  ### text-auto-width

  Add opt-in automatic width for official text, preserving explicit lines and spaces across Designer,
  preview, and Viewer. Keep measured widths in runtime geometry without changing saved fallback sizes,
  dirty state, or history. Explicit width edits and disabling the option commit fixed widths atomically;
  height edits, movement, rotation, cancellation, copying, and inline text editing retain their intended
  document and history semantics.

  ### image-density-size

  Add one-time 1x through 4x natural-image sizing for a singly selected official image while keeping
  the resulting component size fixed and the public material and document contracts unchanged.

  ### rectangle-gradient-border

  Allow rectangle border colors to use linear or radial gradients while preserving rounded corners,
  transparent or gradient fills, shadows, and canonical component bounds.

  ### show-shape-border-color

  Enable a zero-width border when its color is changed in the Designer, including batch edits, and
  keep rendered shape borders inside the canonical component bounds to avoid geometry shifts.

  ### fix-material-render-box-size

  Fix material rendering boxes that did not match their canonical size.

  `plugin-echarts` set `width/height: 100%` on its host element in
  `renderMaterial()`, overwriting the pixel size the renderer had just written from
  `component.size` — a widget declared 480x280 rendered at 960x540, filling the whole
  canvas. It now leaves the host box alone, like the official materials.

  `base.container` drew its border without `box-sizing: border-box`, so `borderWidth`
  added to the declared size (a 1px border made the box 2px larger). It now matches what
  the shape materials already do.

  Both are covered by a new catalog-wide browser assertion
  (`BROWSER_HARNESS_MATERIAL_GEOMETRY_FAILED`) that instantiates every material in the
  catalog — including `libraryVisible: false` ones — and requires each render box to
  equal its declared size. This replaces per-material assertions, which is why the same
  bug was able to reappear in several packages unnoticed.

- bcc37a0: 官方物料集新增分割线 `base.rule`（`base-screen-rule`，另开 `./rule` 子路径）：一条线是这个物料
  的全部职责——不填充、不带标题、不描边框，因此与 `base.rectangle` 不重叠（矩形负责一块面，本物料
  负责一条线）。方向由 `props.axis`（`horizontal` / `vertical`）决定，线沿盒子一边绘制；`color` /
  `thickness` / `dash` / `opacity` 属样式。此前只能用 1px 矩形假冒分割线，而矩形的填充与圆角无法关闭。
  渲染仍遵守渲染盒不变式：物料只写自身内部样式，宽高由渲染器按 canonical `component.size` 写入。
  `@base-screen/sdk` 的自动注册随其生效。不改变 canonical 文档契约与物料 ABI。

### Patch Changes

- e468741: Require an explicit material manifest opt-in (`hostResourceSelection`) before exposing the host
  asset selection bridge; only `base.image` opts in, so host-resource materials such as metrics and
  charts no longer show the "选择素材" button.
- bcc37a0: 把物料非 ready 态的呈现收敛到一处：`@base-screen/plugin-sdk` 新增状态视图
  （`createBaseScreenMaterialStateView` / `createBaseScreenMaterialErrorView` /
  `createBaseScreenMaterialEmptyView`），loading 视图与公共加载容器从 `@base-screen/material`
  迁到 plugin-sdk，`@base-screen/material` 与 `@base-screen/sdk/material` 继续按原名 re-export。
  官方物料与大屏组件插件不再各写一份占位文案：`idle` 占位但不给文案（此前被当成「暂无数据」），
  `error` 直接呈现 contracts 侧已脱敏的 `message` 并把 `code` 落到 `data-*` 属性。
  官方物料基类另收一个受保护的盒面方法，形状与容器共用同一套填充/边框/渐变叠加/圆角/阴影实现。
  不改变 canonical 文档、Manifest 字段或物料 ABI。
- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [8537e4b]
- Updated dependencies [af22711]
- Updated dependencies [f06fc5c]
- Updated dependencies [df083f5]
- Updated dependencies [13a9c3d]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [e468741]
- Updated dependencies [bcc37a0]
- Updated dependencies [14fc8cd]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [81c3cea]

  - @base-screen/contracts@0.1.0
  - @base-screen/plugin-core@0.1.0
  - @base-screen/plugin-sdk@0.1.0

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

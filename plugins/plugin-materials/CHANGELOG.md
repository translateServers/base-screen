# @base-screen/plugin-materials

## 0.2.0

### Minor Changes

- fc7c4d1: 大屏容器与装饰体系（ADR-0101）。

  - 装饰边框 `board.border-box` 可以容纳子组件（`children: true`），能当卡片外壳；新增可选样式键 `accentColor`：
    角标与发光用强调色、边线用 `borderColor`。存量文档没有 `accentColor` 时渲染与改动前一致。新插入默认暗边线 + 亮角标，
    角标色跟随文档主题主体色。
  - 新物料「标题装饰」`board.title-decor`：只画图元（竖条、渐隐下划线、两端括号、双箭头），可容纳标题文本；
    新检查器控件「标题装饰形态选择器」`base-screen.board.title-decor-picker`。
  - 新组合「标题栏」`base-screen.board.title-bar`、「设备状态面板」`base-screen.board.device-status-panel`
    （装饰边框外壳 + 标题栏 + 状态分布 + 状态灯阵）。新导出 `PLUGIN_BOARD_FRAGMENTS`。

- fc7c4d1: 组合分片补齐（ADR-0100 第一阶段 1b 收尾）：

  - `plugin-materials` 交付第一份插件分片「设备状态卡」（`PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT`，id
    `base-screen.board.device-status-card`）：`base.container` 底座 + `base.text` 标题 + `board.status-legend` 图例 +
    `board.status-grid` 灯阵。物料库「指标」分类里带「组合」角标，插入即展开为四个普通组件。
  - 设计器命令面板（Ctrl/Cmd+K）列出物料库里的组合分片：与物料同属「素材」类（`+` 前缀可筛），说明行显示
    「组合 · <id>」，选中后按物料库同一路径整片插入。

- fc7c4d1: 按大屏组件调研重做设备状态类物料与分片（ADR-0100 §7、ADR-0099 §7）。

  - 五态色默认值改为「正常低饱和、只有故障高饱和」：运行 `#3e7b5e`、待机 `#8c7a46`、离线 `#8796a5`、未知 `#4f5d6b`，
    故障不变。键名不变，存量文档里显式写了色值的组件不受影响。
  - `board.status-legend` 展示名改为「状态分布」，新增可选开关 `showTotal`（总数）、`showBar`（占比条）与样式键 `valueColor`；
    新插入默认打开，存量文档缺省仍是单行图例。新增纯函数 `statusLegendBarSegments`。
  - `board.status-grid`：格子恒为正方形、靠左上排布，不再被拉成细长色柱；格内文字按边长自动降级；新增可选
    `sortAbnormalFirst`（新插入默认打开）；`+N` 底栏写明收起的状态。默认尺寸改为 304×84。新增纯函数
    `computeStatusGridTileSize`、`statusGridTileTextLines`、`sortStatusGridItems`、`summarizeStatusGridOverflow`。
  - 两个读数物料共用一份 12 台设备示例数据（`BOARD_DEVICE_SAMPLE_DATA`）。
  - 分片拆成「设备状态概览」（新增，`base-screen.board.device-status-overview`）与「设备状态卡」（id 不变），尺寸缩到卡片量级。
  - 新增导出 `BOARD_STATUS_PRIORITY`、`isBoardAbnormalStatus`、`PLUGIN_BOARD_DEVICE_FRAGMENTS`、
    `PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT(_ID)`。

- c1aafa9: 大屏插件物料按 ADR-0099 收敛作者面（不兼容变更，示例文档已同批改写）：

  - 滚动字幕的滚动周期改为毫秒：`speedSeconds`（秒）更名为 `periodMs`（毫秒，3000–120000，默认 20000），与轮播列表的
    `intervalMs` 同单位；检查器改用 `editorDescriptor`，单位经 `unit` 声明而不再写进 label。
  - 状态灯阵与产线工序链移除 `emptyText` prop：空态改走 `@base-screen/plugin-sdk` 的状态视图，领域文案
    （「无设备数据」「该产线无工序配置」）由物料固定给出；`data-board-status-empty` / `data-board-pipeline-empty` 钩子保留。
  - 轮播列表的等级色板从 props 移到 style：移除 `statusPalette`（json），改为四个语义色键 `criticalColor` /
    `warningColor` / `infoColor` / `unknownColor`（未知等级兜底，对应原 `statusPalette.default`），缺省回落到共用等级色板，
    并可被宿主条件样式与 `theme:` 引用覆盖。等级列 `statusColumn` 保持为 prop，检查器改为数据区的字段选择器；
    检查器整体迁移至 `editorDescriptor`，`intervalMs` 的单位经 `unit` 声明。
  - 装饰边框的线宽从 props 移到 style：`lineWidth` 更名为 `strokeWidth`（style，非必填，缺省 2px），可被条件样式覆盖；
    检查器补齐线宽、边框色与背景色入口（此前描述符只含 props 字段，单选检查器里没有颜色入口）。
  - 装饰边框移除无效的 `color`（「文字色」）样式：本物料不渲染文字，边框与角标均用 `borderColor` 着色。
  - 胶囊进度的发光从 props 移到 style：`glow` 更名为 `fillGlow`（style，非必填，缺省发光）。
  - 新增物料 `board.status-legend`（状态图例）：读一列状态值，按设备五态计数（运行 / 待机 / 故障 / 离线 / 未知），
    可绑定与状态灯阵相同的数据放在其下方，也可单独使用。状态灯阵移除内建图例（`showLegend` prop 与 `legendColor` 样式）；
    底栏只在容量溢出时显示 `+N`，颜色改用 `labelColor`。灯阵与图例的检查器均迁移至 `editorDescriptor`。
    `data-board-status-legend` / `data-state` / `data-count` 钩子由新物料保留。
  - 产线工序链移除无效的必填样式 `legendColor`（本物料不画图例，该键从未被读取）；检查器迁移至 `editorDescriptor`，
    `color` 的 label 统一为「文字色」。

  旧文档中残留的 `speedSeconds`、`emptyText`、`statusPalette`、装饰边框的 `lineWidth`、胶囊进度的 `glow`，
  状态灯阵的 `showLegend` / `legendColor`，工序链的 `legendColor`，或装饰边框的 `color` 键会被校验失败关闭，需要改写为新形态。

- 1d44e06: 新增大屏物料「标签页」（`board.tabs`）：标签来自数据（第 1 列标签、第 2 列值），点击或方向键切换并抛出
  `tabChange { index, label, value }`，蓝图按值分支即可打开对应页面（ADR-0109）。
  水位图圆形罐体改按 min(宽, 高) 取边长，组件比罐体窄时不再被切掉两侧。
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

### Patch Changes

- fe97e39: 设计器「事件」开着时页面预览与查看器一致：编辑主画布时蓝图切页只换垫在下面的页面（不透明、可交互，
  主画布组件不重建，标签页选中项保留）；编辑页面时主画布内容叠在页面之上，标签页、导航按钮照样能点。
  物料不再把宿主元素的 `display` 无条件写成 `block`，组件隐藏、画板外组件与蓝图显隐不会再被覆盖。
- cbb7022: 检查器「基础 / 全量」三层规则（base-screen-docs ADR-0102 §7.1）。

  - 基础模式只隐藏整段的效果类设置（滤镜、物料的「动效」分区）；层级、多选的编组 / 锁定 / 隐藏 / 旋转改为基础可见。
  - 基础模式面板底部显示「已隐藏 N 项 · 显示全量」，点击切到全量。
  - 「高级」不再用作名称：右栏页签改名「交互」，数据页「高级设置」改名「处理与刷新」，搜索结果角标改为「仅全量」。
  - `auditBaseScreenMaterialEditorForm` 新增 R15：字段不能单独标 `advanced`；物料分区里只有「动效」（`motion`）仅全量可见且必须标 `advanced`。
  - `board.pipeline` 的连接线色与粗细移入默认收起的「连接线」分区。

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

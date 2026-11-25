# @base-screen/engine

## 0.2.0

### Minor Changes

- 591d730: 蓝图改为节点图模型，蓝图工作台按节点图交互重做（ADR-0107）。

  **破坏性变更（文档契约）**

  - `ScreenBlueprint` 由 `{ relations, layout? }` 改为 `{ nodes, edges, layout? }`。节点六种：组件、全局变量、业务系统（单例）、
    实例就绪（单例）、定时器、条件判断；`enabled: false` 是停用的唯一写法，定时器 / 条件可带 `name`。
    执行流连线 `{ kind: 'flow', from: { node, port }, to: { node, port }, value?, payload?, transition?, requiredCapabilities? }`，
    语义连线 `{ kind: 'semantic', from: { node }, to: { node }, role }`。锚点 id：组件 `event:<事件名>` 输出、`show` / `hide` /
    `toggle` / `request-data` 输入；变量 `data-updated` 输出、`set` / `request` 输入；宿主 `event:<事件名>` / `action:<动作 id>` 输入；
    就绪 `ready`、定时器 `tick`、条件 `judge` → `yes` / `no`。
  - 变量事件 `request-state` 移除（运行时从未发出）；派生的「结构包含 / 变量依赖」连线不再出现在画布上。
  - 上限：节点 2000、连线 10000、单条路径串联条件 16、单条派生规则展开步骤 1024、派生规则 1000。
  - `migrateScreenDocument` 一次迁完 `rules` → `relations` → 节点图：被引用的组件 / 变量生成节点（沿用旧布局 id 与位置），
    每组「连续、同源、同条件」的关系生成一个条件节点；`request-state` 来源关系丢弃并记 `rejected` 决策。新增决策 kind
    `blueprint-node` / `blueprint-edge`。

  **运行时**

  - `deriveScreenBlueprintRules` 产出深度优先的步骤树（`steps`），条件在到达时求值，停用节点裁剪路径；
    `ScreenBlueprintRuleTrace.condition` 改为 `conditions[]`（`nodeId` / `edgeId` / `passed`），动作轨迹带 `edgeId`。
    变量写入引发的 `data-updated` 仍作为后续分派（级联上限 32）。

  **作者面（engine）**

  - 默认蓝图画布重做：164px 类型色卡片、先输出后输入的锚点行、28px 吸附、紫色贝塞尔连线 + 光晕 + 中点，标签仅悬停 / 选中显示；
    左键空白框选、Ctrl/Shift 加选、整组拖动；右键拖动 / 空格 / 中键平移，Ctrl+滚轮缩放；双击标题或 F2 重命名（定时器 / 条件）；
    右键菜单复用设计器菜单样式（删除、重命名、复制节点、停用 / 启用、从此节点模拟、在此处新增节点、全选、自动布局、适应画布）；
    底部模拟条按触发锚点深度优先模拟并高亮轨迹。
  - 画布协议：`selection` 改为 `{ nodes, edges }` 多选；`connect` 改为 `from` / `to` 锚点；新增 `update-node`、`reorder-edge`、
    `duplicate-nodes`、`clear-simulation`；`run-simulation` 改为 `{ nodeId, port, payload }`；状态新增 `simulationTriggers`、
    `showSemantic`，`viewRequest.type` 增加 `fit` / `auto-layout`；画布节点带 `inputs` / `outputs` 锚点、连线带 `category` 与同源顺序。
  - 工作台聚焦 `focus.kind` 改为 `component` / `variable` / `node` / `edge`（组件 / 变量尚无节点时自动加入）。
  - 检查器按「锚点信息 / 基础配置 / 节点配置 / 上下游连线」分组；连线可改目标锚点、写入值、负载、过渡、语义角色与同源执行顺序；
    多选支持批量启用 / 停用 / 删除。新增画布令牌 `--designer-blueprint-*`（黑夜 / 浅色两档）。

  **组合分片（plugin-core / engine）**

  - 分片的 `relations` 改为 `blueprint: { nodes, edges }`（`BaseScreenFragmentBlueprint`），`parseScreenBlueprintRelation`
    改为 `parseScreenBlueprintGraph`；插入结果的 `relationIds` 改为 `edgeIds`。

- 18e00e8: 页面配置「尺寸」新增常用尺寸下拉（1080P、2K、4K、720P、笔记本、4:3、竖屏、双屏 / 三屏拼接），
  选中一次提交宽高；宽高仍可直接输入，与预设都不一致时显示「自定义」。
- 329b175: 取色器支持主题色位：组件样式的颜色字段在颜色弹层里多两排色卡，「主题色」（文档带色板时的六个基础色位）与
  「状态色」（危险 / 警告 / 提示 / 正常，总是可选），与页面配置的分组同名。选中后写入 `theme:<slot>` 引用，改色板时
  组件跟着变；字段显示「主题色 · 主体色」「状态色 · 危险」这类色位名，值是引用时按当前色板显示颜色（此前显示
  `#000000`，一改就把引用覆盖成具体色值）。改成别的颜色即变回具体色值。
  页面配置的主题色板改为色板组（色卡 + 一个编辑器），基础色位与状态色位各一组。
  颜色弹层、物料分组弹层与目标屏面板的层级改用 `--designer-z-popover`（此前写死 200 / 45，高于工具提示的 40，
  色卡和按钮的提示被弹层盖住）。
- 314eda0: 组件状态（ADR-0110，取代 ADR-0058 条件样式与 ADR-0059 宿主条件样式；`styleRules` 直接删除，不写迁移，带
  `styleRules` 的文档按未知字段失败关闭）。

  - contracts：根组件新增 `states { items, judge? }`：每个状态是一组外观覆盖，「默认」是组件本身。判定取值可选组件数据、
    变量或数据源；数据源可按行查找（`where: { field, equals }`，匹配值可引用变量）。条件按顺序判定，第一条命中即生效。
    新增纯求值 `resolveScreenComponentState()`、`mergeScreenComponentStateStyle()`、`listScreenComponentStateDependencies()`。
    主题新增四个状态色位 `danger / warning / info / success`（色板里可省略，省略时取内置默认色；`readScreenThemeColor()`）。
    宿主分级表 `ScreenLevelScale`（`dataResourceType.levelScales`、`ScreenHostCatalogDescriptor.levelScales`），只在作者面使用。
    蓝图组件节点新增 `set-state`（连线必带 `stateId`）/ `reset-state` 输入与 `state-changed` 输出，动作 `component-state`、
    触发 `component-state-changed`，能力 `blueprint.action.component-state`、`blueprint.trigger.component-state-changed`。
  - core：`update-components` 的 `states` 补丁（`null` 去掉），分派结果新增 `stateEffects`。
  - renderer：按判定与蓝图设置切换组件状态，取值暂不可用时保持上一结果；数据源结果、变量变化只重算相关组件；
    渲染器选项 `onComponentStateChange`，查看器事件 `base-screen-component-state-change`、方法 `readComponentState()`。
    删除 `conditionalStylePort` 与 `refreshConditionalStyles()`。
  - plugin-core：删除 `BaseScreenConditionalStylePort` 与 `BaseScreenHostConditionalStyle*`；物料清单新增 `statePresetKeys`。
  - engine：检查器「外观状态」「判定」两段（编辑某个状态时外观改动写进该状态的覆盖，位置尺寸只读）、
    「按分级生成状态」、主题色板「状态色」；蓝图连线检查器「目标状态」。删除「条件样式」「业务条件样式」两段与
    `conditionalStylePort`、`hostConditionalStyleAuthoring`、`refreshConditionalStyles()`。

- 8c0cb72: 组合分片正式化第一阶段 1b（ADR-0100）：物料库展示组合分片。

  - 设计器新增 `materialLibraryFragments`（`configure` 选项与元素属性）：宿主声明的 `BaseScreenFragmentDefinition[]`，
    形状错误失败关闭。它与 `materialLibraryItems` 相互独立——后者须覆盖全部可见物料，分片不受这条约束。
    新增公共解析器 `parseBaseScreenMaterialLibraryFragments`，engine 公共面转发 `BaseScreenFragmentDefinition`。
  - 宿主分片与插件 `fragment` 贡献（经 `runtimeContributions.listFragments`）一起出现在物料库：
    每份分片先在空文档上按当前 catalog 试运行一次（与插入同一个事务构建器），失败的分片被隐藏并上报 `warning` 诊断，
    其余物料库不受影响；同 id 时宿主优先。
  - 分片卡片与物料按 category 混排，带「组合」角标；未给 `cover` 时按试运行几何绘制示意线框。点击、回车或拖入画布即按
    `insertComponentFragment` 的语义整片插入（可撤销，成功后整片选中）；任一组成物料不可用时卡片禁用。
  - 宿主分组新增 `fragmentIds`：分组内排在本组物料之后；未被任何分组引用的分片在「全部」视图末尾出现。
    分组导航计数同时计入物料与分片。

- 7b9d601: 组合分片第二阶段（ADR-0100）：共享数据、分片内联动与「存为组合」。

  - `contracts` 新增文档片段的独立解析入口：`parseScreenValueRef`、`parseScreenDataBinding`、
    `parseScreenDataSourceInstance`（文档级数据源实例）、`parseScreenBlueprintRelation`。复用文档校验里对应位置的
    校验函数，只判定形状；引用存在性与环判定仍属 `parseScreenDocument`。
  - 分片组合（插入意图与分片定义共用）新增：
    - `dataSources`：分片自带的文档级数据源（`key` 代替 `id`，至多 16 个）；参数里的 `data-source-field` 只能引用更早声明的分片数据源；
    - 节点 `dataValue` / `dataBinding`：读取分片数据源（与 legacy `dataSource` 互斥，`dataBinding` 需配 `data-source-field`）；
    - `relations`：端点为外壳 / 节点 `key` 的蓝图关系（至多 32 条）；
    - 外壳与节点 `rotation`（[-180, 180)）。
      分片不携带变量：任何变量引用都被拒绝。插入时数据源与关系的 key 重映射为文档内唯一 id，
      事务顺序为「数据源 → 组件 → 蓝图关系」，仍是一次可撤销提交。新增导出类型 `BaseScreenFragmentBody`、
      `BaseScreenFragmentDataSource`、`BaseScreenFragmentRelation`。
  - 物料库试运行在事务构建之后再按整份文档校验一次展开结果，与真正插入时的判定同一口径。
  - 设计器新增 `createComponentFragment(componentIds?)`：把选区（连同后代）提取为分片组合，只读；单个可容纳子节点的根成为外壳，
    选区读取的数据源（含传递依赖）与端点全在选区内的关系一起带走。选区引用变量时失败关闭；条件样式、锁定 / 隐藏状态与跨出选区的
    关系以 warning 诊断告知被舍弃。
  - `configure({ fragmentSaveAction: true })` 开启「存为组合」操作（右键菜单与命令面板）：提取成功后派发
    `BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT`（`base-screen-fragment-save-request`，detail 为
    `BaseScreenFragmentSaveRequestEventDetail`），命名、归类与存储归宿主。`base-screen/designer` 同步转发该事件、
    详情类型与 1b 遗漏的 `parseBaseScreenMaterialLibraryFragments`。

- f1242c4: 组壳（`groupMaterialType`）不再压平带内边距的容器。

  以前任何一次事务都会把每个组壳吸附到其子孙的包围盒并集，组合分片的卡片外壳、作者手搭的面板在第一次无关编辑
  （例如再插入一张卡）后就丢了内边距。现在逐边判断，依据是事务之前这条边与子项的距离：

  - 贴着子项（≤ 0.5 px）的边跟随子项——「成组」命令建出的组壳四边都贴着，行为与以前一致；
  - 留有内边距的边保持不动，只在子项越出时外扩；
  - 事务前没有子项的容器四边都保持（把组件放进空底座，底座不变）；
  - 定义某条边的子项在这条边上正被渲染测量改写（自适应宽度文本的右边界）时，这条边照旧跟随，
    渲染宽度变短后组壳仍会收回。已知代价：卡片里最宽的子项若开启自适应宽度，卡片右侧内边距会被它吃掉。

- cbb7022: 检查器「基础 / 全量」三层规则（base-screen-docs ADR-0102 §7.1）。

  - 基础模式只隐藏整段的效果类设置（滤镜、物料的「动效」分区）；层级、多选的编组 / 锁定 / 隐藏 / 旋转改为基础可见。
  - 基础模式面板底部显示「已隐藏 N 项 · 显示全量」，点击切到全量。
  - 「高级」不再用作名称：右栏页签改名「交互」，数据页「高级设置」改名「处理与刷新」，搜索结果角标改为「仅全量」。
  - `auditBaseScreenMaterialEditorForm` 新增 R15：字段不能单独标 `advanced`；物料分区里只有「动效」（`motion`）仅全量可见且必须标 `advanced`。
  - `board.pipeline` 的连接线色与粗细移入默认收起的「连接线」分区。

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

- 591d730: 主画布与从画布（ADR-0109，取代 ADR-0108 的 `popups` / `popupId`，未发布过，不写迁移）：文档新增 `subCanvases`
  （`display: 'page' | 'popup'`）、`startCanvasId`，根组件新增 `canvasId` 与 `belowSubCanvas`；`resolveScreenStartPageId()`。
  蓝图新增 `sub-canvas` 节点（open / close / toggle，opened / closed，与显示方式无关）与 `main-canvas` 单例节点
  （previous / next / back，page-changed），能力 `blueprint.trigger.canvas-event`、`blueprint.trigger.page-changed`、
  `blueprint.action.canvas-visibility`、`blueprint.action.page-navigation`。
  core 新增 `replace-sub-canvases`、`move-components` 命令与 `canvasEffects`。
  renderer 按页面分层叠放（页面背景 → 主画布「从画布下方」组件 → 当前页 → 主画布其余组件 → 弹框），只挂载当前页；
  切页依次发出弹框关闭、旧页离开、新页进入（带打开参数）与页面已切换；查看器新增 `currentPage`、`openCanvas()`、
  `closeCanvas()`、配置 `initialPageId` 与事件 `base-screen-canvas-change`。弹框行为（遮罩、Esc、焦点、九宫格位置、打开参数）沿用。
  设计器以画布底部标签条取代「画板」下拉：新建页面 / 弹框、参照底图（32%）、检查器「从画布」段（显示方式、页面背景、起始页、
  弹框设置、复制、删除）、右键「移到…」与「置于从画布下方」；状态栏「事件」打开时蓝图切页即切到该页画板。
- 7b9d601: 新建组件的颜色可以跟随文档主题（ADR-0101）。

  - 物料 manifest 新增可选字段 `themeStyle`（样式键 → 主题色位）。键必须是 `styleSchema` 里的字符串样式键，值必须是
    六个固定色位之一，最多 32 项；校验失败按 `PLUGIN_CORE_MANIFEST_FIELD_INVALID` 拒绝。
  - 新导出 `resolveBaseScreenMaterialDefaultStyle(manifest, theme)`：文档带色板时，声明的键取当前色板的颜色，
    其余键用 `defaultStyle`。写入的是解析后的颜色，不是 `theme:<slot>` 引用——检查器读得出颜色，去掉色板也不会让组件失败关闭；
    之后换色板不会连带改已有组件。
  - 设计器所有按默认值新建组件的路径（物料库点击 / 拖放、工具绘制、成组外壳、`insertComponent`、组合分片）都改用这个函数。
    组合分片里节点显式写的样式键以分片为准；物料库条目覆盖了的键不再跟随主题。

- 620c2b7: 官方物料检查器迁移到 `editorDescriptor`（ADR-0099 §2.4 待决项结案）：

  - 文本、矩形、椭圆、容器、分割线、图片、图表、表格的外观区按「结构 → 文字 → 填充与描边 → 阴影」分区；
    矩形与椭圆的阴影四项默认收起，椭圆不出现「结构」（圆角由形状固定）。字段、标签与渐变开关与扁平面板逐项一致，
    扁平 `propertyPanel` / `stylePanel` 继续保留（多选批量、条件样式按它们识别字段）。
  - 描述符字段与扁平面板同形：有界 `number`（跨度 ≤ 1000、未声明 `unit`）渲染为滑杆 + 数字读数；三档水平对齐
    （left / center / right）声明为 `select` 或 `segmented` 都画成图标分段；顶层 props/style 字段的值载体同时挂
    `data-prop` / `data-style`，检查器搜索、回车提交与自动化按同一个钩子定位。插件物料里符合条件的描述符字段
    （例如滚动字幕字号）随之恢复迁移前的滑杆形态。
  - 描述符写入顶层 props/style 键时沿用扁平面板的提交语义：清空可选数值即删除该键；改边框颜色时自动启用零宽边框。

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

- 15666a6: `refreshCatalog(catalog, { materialLibraryGrouping })`：配置了物料库分组的宿主新增或下架物料时，分组随 catalog 一起交换并按新 catalog 校验，二者同一次全有或全无；新增公共类型 `BaseScreenMaterialCatalogRefreshOptions`（base-screen-docs ADR-0105 P2）。
- 9831915: 移除设计器的对比度守卫：底栏「对比度」条目与详情弹层、画布文本对比度测量与修复预览一并删除。公开 API 去掉
  `BASE_SCREEN_GUARD_CHANGE_EVENT`（`base-screen-guard-change` 事件不再派发）、`DesignerGuardSnapshot`、
  `DesignerContrastIssue`；度量事件名去掉 `guard_fail`、`fix_preview`、`fix_apply`。core 的对比度计算函数保留
  （大屏截图探针与示例后端仍在使用）。
- 591d730: 移除场景切换（ADR-0092 §4，2026-11-23）。

  **破坏性变更**

  - 设计器元素删除 `setSceneCatalog()`、`setSceneHandler()`、`setActiveScene()`、`activeSceneId`、`sceneAvailable`。
  - 删除 `base-screen-scene-change` 事件与 `BASE_SCREEN_SCENE_CHANGE_EVENT`、`BaseScreenSceneChangeDetail`、
    `DesignerSceneDescriptor`、`DesignerSceneHandler`、`DesignerScenePlan`、`DesignerScenePrepareResult`、
    `DesignerScenePreview`、`DesignerSceneRequest`、`prepareDesignerScenePreview`。
  - 左栏顶部场景区与画布「场景预览 · 未写入」条随之移除；度量事件不再有 `scene_preview` / `scene_apply`。

  同屏内容切换请改用弹框画板（ADR-0108）或蓝图显隐与变量。

- c213715: 批 2：通用视觉层与文档级主题、实例级触发器。

  - 保留样式键扩展为行为/滤镜通用层：`passThrough`（事件穿透）、`hoverPointer`（悬浮小手）、
    `clip`（裁切超出）、`blend`（混合模式）、`filterBlur/filterBrightness/filterContrast/filterSaturate/filterHueRotate`。
    渲染器几何帧统一消费；检查器新增引擎自建「行为」「滤镜」分区（滤镜默认折叠），
    不依赖物料申报。overflow 仍归物料，3D 旋转/倾斜/缩放不做。
  - 文档级主题色板（ADR-0098）：`ScreenDocument.theme` 六个固定语义槽；组件 style 颜色值可写
    `theme:<slot>` 引用，渲染器确定性解析、悬空引用失败关闭；core 新增 `update-theme` 命令；
    画布配置新增「主题色板」分区。预设库与换肤策略归宿主。
  - 蓝图新增 `lifecycle` 触发器（`ready`，文档装载/替换后就绪一次，编辑重渲染不重发）与
    `timer` 触发器（1–86400 秒，按间隔去重调度、tick 带间隔标识、计划重编译增删、实例清空停止），
    含能力 id、relations 源形态、编译与运行时分派。工作台图投影与默认画布已内建实例节点：
    lifecycle 单例节点、每个间隔一个 timer 节点；关系库可插入、来源端口可拖拽建关系、
    检查器可改定时器间隔、删除节点级联清理关系。宿主自定义画布按公开图协议消费
    `lifecycle` / `timer` 节点（out handle 为 `event:ready` / `event:tick`）。
  - AI 物料样式签名同步纳入引擎级保留键与 `theme:<slot>` 语法说明，模型能直接引用主题色板；
    条件样式端口覆盖里的主题引用同样按失败关闭解析（补测）。

### Patch Changes

- 4f0656c: 切换画布不再卡顿：画板外组件的「隐藏且锁定」副本与参照底图的组件副本按原组件缓存复用；渲染器的 model 重赋值守卫按宿主输入的组件判定（解析克隆不再让新组件在下一次渲染被重写一遍），只改显隐的组件只切 `display`、不重写 model（上次写入时隐藏的组件重新显示仍完整重写）。示例页每次切换由约 60ms 降到约 27ms，未变组件零重写。
- fc7c4d1: 组合分片补齐（ADR-0100 第一阶段 1b 收尾）：

  - `plugin-materials` 交付第一份插件分片「设备状态卡」（`PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT`，id
    `base-screen.board.device-status-card`）：`base.container` 底座 + `base.text` 标题 + `board.status-legend` 图例 +
    `board.status-grid` 灯阵。物料库「指标」分类里带「组合」角标，插入即展开为四个普通组件。
  - 设计器命令面板（Ctrl/Cmd+K）列出物料库里的组合分片：与物料同属「素材」类（`+` 前缀可筛），说明行显示
    「组合 · <id>」，选中后按物料库同一路径整片插入。

- e2d7c76: 画布标签条放不下时可横向滚动：滚轮 / 触控板横滚标签条、溢出一侧渐隐，切换画布后保留滚动位置并把当前标签滚进可视区。页面在标签条、蓝图节点与蓝图库里改用折角文档图标，与容器的空矩形区分开。
- d161254: 检查器公共区的不透明度控件改为对所有物料显示（ADR-0099 §2.3）：不透明度是引擎级保留样式，Renderer 几何帧本就对所有物料统一写入，
  此前公共区却只在物料 `styleSchema` 申报了 `opacity` 时才出现，未申报的物料（如全部大屏插件物料）因此没有入口。
  物料申报的 schema 仍用于收窄取值。官方形状、容器、分割线与图片物料移除了 `stylePanel` 中不生效的 `opacity` 项，
  并不再在渲染路径自行写宿主元素的 `opacity`；文档中的 `opacity` 值与渲染结果不变。

  检查器几何区的水平 / 垂直翻转按钮同样改为对所有物料显示：翻转也是引擎级保留样式，Renderer 本就统一写入 transform，
  此前只有在 `styleSchema` 申报了 `flipX` / `flipY` 的物料才有入口；提交侧同样回落到保留 schema。

- fe97e39: 设计器「事件」开着时页面预览与查看器一致：编辑主画布时蓝图切页只换垫在下面的页面（不透明、可交互，
  主画布组件不重建，标签页选中项保留）；编辑页面时主画布内容叠在页面之上，标签页、导航按钮照样能点。
  物料不再把宿主元素的 `display` 无条件写成 `block`，组件隐藏、画板外组件与蓝图显隐不会再被覆盖。
- 8c0cb72: 修复真实鼠标双击进不了组。

  - 根因：选中组（或卡片外壳）后，选框拖拽层用 evenodd 的 clip-path 挖掉「选中组件的区域」，以前传入的是整棵子树。
    外壳的矩形与子组件的矩形是嵌套的，子组件区域被挖了两次、重新变成填充，于是拖拽层正好盖住了子组件。
    现在只挖显式选中的组件，子组件区域保持可点。
  - 兜底：双击落在拖拽层上时，按指针位置做几何命中，取最上层的组件，与单击拖拽层时的命中口径一致。
  - 单元测试与 browser-harness 以前都把 dblclick 直接派发到组件元素上，绕过了拖拽层，所以没有发现。harness 新增
    `clickComponentAt`（按该位置实际最上层的元素依次派发 pointerdown / pointerup / click / dblclick），文本编辑的两处双击
    改用它，组合插入用例新增「单击选中外壳 → 在子组件位置双击 → 选中子组件」断言。

- 1b328e6: 描述符条件新增可选 `target: 'props' | 'style'`：style 字段可以跟随 props 开关显示（例如读数色跟随「显示读数」）。省略时与字段同侧，存量描述符不变（base-screen-docs ADR-0105 P1）。
- 7b9d601: 组合分片正式化第一阶段（ADR-0100）：

  - `plugin-core` 成为分片形状契约的唯一所有者：新增 `BaseScreenFragmentDefinition`（物料库展示信息 + 外壳 / 节点组合）、
    `parseBaseScreenFragmentDefinition` 与 `isBaseScreenBoundedName`；`parseBaseScreenComponentFragmentInsertionIntent`
    及 `BaseScreenComponentFragmentInsertionIntent` / `BaseScreenFragmentNode` / `BaseScreenFragmentShell` / `BaseScreenFragmentEntry`
    从 engine 迁入。engine 公共面继续转发这些名称，宿主的导入路径与插入行为不变；节点 `size` 无效时的诊断路径修正为
    `['nodes', <index>, 'size']`。
  - 新增插件贡献类型 `fragment`（`BaseScreenPluginFragmentContribution`，身份串 `fragment:<id>`）：分片定义直接写进插件清单，
    不需要能力授权。`plugin-manager` 把它投影进运行时贡献索引，新增可选的 `getFragment` / `listFragments`（按插件声明顺序）。
  - `plugin-sdk` 新增 `defineBaseScreenFragment()`，失败关闭地校验并返回冻结的 `fragment` 贡献。

  物料库展示、catalog 一致性试运行与示例分片属于第一阶段后半段，尚未包含在本次变更中。

- 8c0cb72: 修复组合分片插入后的两处交互问题（ADR-0100）。

  - 插入后只选中分片的根节点（有外壳时只选外壳），不再把外壳与其子节点一起选中。此前混选的选区不满足画布拖动
    「同一父级」的前提，新插入的整片拖不动，必须重新点选才能移动。`insertComponentFragment` 同此语义。
  - 从物料库把分片拖入画布时，落点即组合包围盒左上角，可越出画布（与单个物料拖放一致，由检查器提示超出画布）。
    此前落点会被整片贴回画布内，与画布同量级的组合（如设备状态卡）几乎没有移动余量，拖到哪都落回同一处。
    点击/回车插入与公开 `insertComponentFragment` 仍按可见画布中心整片贴进画布。

- 8b54fd9: 检查器数值字段可以复位（base-screen-docs ADR-0102 §8）。

  - 数值偏离默认时，标签旁出现复位按钮：没有默认值的可选键「恢复自动」（删除该键），物料声明了默认值的「恢复默认」。
    滤镜五项与描述符的数字 / 带单位数字字段都支持；值等于默认时不显示。
  - 滤镜在「自动」时滑杆停在恒等值（亮度 / 对比度 / 饱和度 100%、模糊 0、色相 0°），读数带单位。
  - 修复滑杆数值大于 100 时被钳到 100：输入控件先设置 `min / max / step` 再赋值。

- 8c0cb72: 检查器表单控件统一视觉规格（base-screen-docs ADR-0102 第一批）。

  - 检查器只有一档控件高度 30px：几何输入、批量几何、滑杆读数、翻转 / 像素密度按钮组从 28px 改为 30px。
  - 右栏里的布尔字段只有一种开关行（新原语 `createDesignerSwitchField`）：标签在左、开关贴右、整行可点并显示手型，
    页面配置与组件检查器（状态、行为、物料字段、多选批量）完全一致；开关行不再受 74px 标签列限制，长标签换行。
  - 带单位数字、步进器、分段一律占满控件列。
  - 数字统一为与输入框相同的字体、左对齐（步进器居中除外），文字起点 9px；单位后缀 11px 等宽。
  - 翻转、像素密度按钮组改用分段控件的轨道外观；像素密度行标签列与其他字段同为 74px。
  - 描述符分区标题与内建分区同一种样式（不再有发丝线与 13px 主文字色）。
  - 多选值不同统一显示「混合」（批量几何原来写「多个值」）。
  - browser-harness 新增 `assert-inspector-form-consistency`：逐个插入全部物料并比对同类控件的计算样式。

- aa547bf: 长连接数据源契约（ADR-0104 切片 1）。只有契约与校验，运行时订阅在后续切片实现。

  - 文档：`updatePolicy.mode` 新增 `'push'`，可带 `fallbackIntervalSeconds`（断线回退轮询，1..86400 秒）
    与 `retain: { rows?, seconds?, timeField? }`（保留窗口；`seconds` 与 `timeField` 必须成对）。这两个字段只属于 `push`；
    `url-query` 来源禁止 `push`。JSON Schema 同步更新。旧版本解析器会拒绝含 `push` 的文档。
  - 宿主端口：`ScreenHostResourcePort` 与 `ScreenHostCatalogPort` 新增可选 `subscribe(request, sink, { signal, context?, retain? })`，
    同步返回 `ScreenParseResult<null>`；新类型 `ScreenSourcePushEvent`（`snapshot` / `append` / `invalidate` /
    `status` / `heartbeat`）、`ScreenPushCursor`、`ScreenSourceConnectionStatus`、`ScreenSourcePushSink`、
    `ScreenHostSubscribeOptions`、`ScreenHostCatalogSubscribeRequest`。`validateScreenDesignerHostAdapter`
    要求出现的 `subscribe` 必须是函数。
  - 能力声明：资源类型贡献 `dataResourceType.delivery` 与 `ScreenHostCatalogDescriptor.delivery`
    （`{ push?: { append?, inactivityTimeoutSeconds? } }`），新导出 `listScreenSourceDeliveryIssues`、
    `normalizeScreenSourceDelivery`、`supportsScreenSourcePush`。
  - 物料数据状态 `ready` 分支新增可选 `stale?: true`；执行触发器新增 `'push'`；观察事件新增
    `subscribed` / `unsubscribed` / `pushed` / `connection` / `resync` 及可选 `cursor`、`connection` 字段。
  - engine：数据源实例视图的 `updatePolicy` 改用契约类型 `ScreenUpdatePolicy`。

- 8c0cb72: 修复 Ctrl+A 全选后按 Delete 删不掉组件。

  - 全选只选当前编辑层级（画布根层，或双击进入的组内）的直接成员，不再把子组件和锁定组件一起选进来。
    以前组合 / 卡片插入后是父子结构，全选会父子混选，删除、移动、对齐这类要求「选区同属一个父级」的操作因此整体失效，
    而且没有任何提示。
  - 删除不再要求选区同属一个父级：父子混选（例如从图层面板多选）时只删最上层，子孙随父级级联删除。
    选区里有锁定组件时仍整体不删。

- Updated dependencies [4f0656c]
- Updated dependencies [591d730]
- Updated dependencies [314eda0]
- Updated dependencies [c27b41a]
- Updated dependencies [1b328e6]
- Updated dependencies [7b9d601]
- Updated dependencies [7b9d601]
- Updated dependencies [7b9d601]
- Updated dependencies [591d730]
- Updated dependencies [7b9d601]
- Updated dependencies [aa547bf]
- Updated dependencies [15666a6]
- Updated dependencies [d7c48f6]
- Updated dependencies [c213715]
- Updated dependencies [6405a3d]
- Updated dependencies [c213715]
  - @base-screen/renderer@0.2.0
  - @base-screen/contracts@0.2.0
  - @base-screen/core@0.2.0
  - @base-screen/plugin-core@0.2.0

## 0.1.0

### Minor Changes

- 14fc8cd: Consolidated record of five changes to Designer canvas editing and the visual layer tree.

  ### insert-component-public-api

  Add `designer.insertComponent(intent)` so a host can add a component by material type: it
  builds the node from the manifest defaults, drops it at the visible canvas centre when no
  position is given, commits one undoable transaction and selects the new component. Until
  now a host had to either hand-build a full `ScreenComponentNode` (re-expanding
  defaultSize/defaultProps/defaultStyle/dataSource itself) or drive the private drag MIME
  that the docs forbid host code from touching, which left automation, AI-generated screens
  and template instantiation without a supported entry point. `update-components` patches
  replace `props` wholesale, so partial patches still have to spread the existing props.

  This also collapses long-standing duplication: the manifest -> node construction was
  inlined in the material-library drop, tool-draw, panel-add and group-create paths, and
  `nextComponentId` was copied five times. Both now live in one
  `common/operations/material-component` module that the internal paths and the new public
  API share, so there is a single place for id generation, default data-source derivation
  and canvas clipping to change.

  `docs/usage.md` additionally gained the material-manifest field reference (all 15 required
  fields plus 6 optional ones), a self-contained minimum custom material example, the
  `insertComponent` contract, and two capability boundaries that previously surfaced as
  apparent host bugs: the property panel has no component `name` field, and custom-element
  registration cannot run under Node/SSR.

  ### clip-designer-canvas-content

  Clip rendered component content to the canonical canvas boundary in Designer, preview, and Viewer surfaces while keeping authoring overlays available for edge editing.

  ### add-designer-coordinate-entry

  Add an X-key, Enter-only coordinate entry popover for atomically editing the canonical position of
  one unlocked Designer component, including group translation, validation, focus restoration, and
  undo.

  ### add-layer-selection-shortcuts

  Add repeatable Alt-bracket shortcuts for selecting adjacent components in the complete visual layer tree without changing the document or history.

  ### add-layer-step-shortcuts

  Add bracket shortcuts for moving the current sibling layer selection one visual step up or down while preserving existing front/back shortcuts and editable-field behavior.

- f06fc5c: Rework the designer's form-control layer on the ported design system. Native `title` tooltips are
  replaced by a single `data-tip` floating layer (delayed reveal, instant on keyboard focus, Escape
  suppression, hit-scan fallback for disabled controls), control geometry and states follow the
  prototype (30px controls, shadow borders, hover/focus/error/success/disabled/readonly/mixed),
  checkboxes gain the indeterminate glyph, buttons become borderless with a hover that only changes
  the surface, and the four bespoke segmented controls share one shape. Two controls are added: a
  stepper (`- / value / +` with bounds) declared through the material editor descriptor vocabulary
  as `control: 'stepper'` (requires a bounded number field), and a date field (input + anchored
  calendar popover) used by dataset parameters of type `date`. The data workbench's limited
  multi-field binding gets the chip trigger and type-tagged popover from the prototype.
- fec0c41: Align the designer icon family with the ported prototype — every glyph is now drawn on the shared
  24-unit grid with 1.7 stroke and round caps, and the registry adopts the prototype's names
  (`close`/`type`/`rect`/`fit`/`chart-bar`/`distribute-h`/`distribute-v`). The public
  `BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS` vocabulary follows, replacing `text`, `chart` and
  `container` with `type`, `chart-bar` and `rect`; hosts that pass the old names must rename them.
  Ad-hoc 16×16 toolbar, save-status, menu-check and help-close glyphs are replaced by registry icons,
  and the theme toggle now swaps the sun/moon pair with the host theme. The prototype leaves the hand,
  ellipse and zoom tools as disabled placeholder buttons with no sprite entry, so those three glyphs
  are redrawn on the same grid rather than sourced from the prototype.
- c78ecea: Re-base the designer panels on the ported design system. The left rail becomes the prototype's
  raised 48px tab strip (60px vertical tabs, pill selection with the accent icon), the panel header
  gains the count pill and a BUILTIN/HOST/PLUGIN scope label, material cards move to the neutral
  grid-textured thumbnails with 8px radii, layer rows use the accent-surface primary selection
  (pill) and the neutral secondary tier, inspector tabs become left-aligned light pills, sections
  get the hairline title row, and the command palette cards plus toasts drop their borders for
  shadow rings (toast tones now colour the icon only). Enumerated controls render through a new
  custom select (trigger + popover + hidden native select) in the inspector, canvas settings and
  the dataset role binding, keeping the native element as the value carrier.
- 14fc8cd: Consolidated record of six changes to the Designer workbench shell, left panel and inspector.

  ### host-left-panel-groups

  Add bounded host-defined Designer left-panel groups with named slots, keyboard-safe navigation,
  runtime fallback, and public selection/change APIs.

  ### refine-error-console

  Refine the bounded Designer error console with explicit current/history sections, newest-first
  records, stable history clearing, contextual counts, backdrop dismissal, and trapped keyboard focus.

  ### fix-nested-menu-flyout

  Fix the topbar three-level menu so nested flyouts stay usable: hovering into a deeper nested submenu no longer collapses its parent, and a submenu panel that hosts an expanded nested flyout no longer clips that flyout, so it stays visible and clickable.

  ### descriptor-number-defaults

  Create array item numeric defaults within the existing schema bounds, so adding items with required positive or negative numeric fields succeeds without weakening validation or changing saved values.

  ### designer-host-back-button

  Add an optional Designer-owned topbar back button that emits a composed host navigation request.

  ### remove-canvas-thumbnail-authoring

  Remove the incomplete canvas thumbnail capture and upload controls and the output-only
  `thumbnailUrl` presentation field. Screen thumbnail capture, upload, storage, and listing remain
  host-owned; Material Manifest `cover` rendering is unchanged.

- ec4582a: Rebuild the designer workbench visual base on the ported design system — light theme is now the
  default (`theme="dark"` keeps the dark override and the public `--base-screen-designer-*` surface
  is unchanged) — and restructure the workspace chrome: a top-level menubar (file/edit/view/tools)
  replaces the "more" menu, the work-mode switch is centered, the status bar groups metrics on the
  right, the toolbar gains fit/reset zoom controls, and the command palette opens with Ctrl/Cmd+K.
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

- e12e6cb: Add host material catalog hot refresh per ADR-0090: `plugin-core` compares two catalogs by type and
  separates manifest-only changes from constructor/tagName/adapter changes; `renderer` validates a
  candidate catalog against the current document and swaps it without disposing the runtime, remounting
  only changed implementations and preserving data-source state for unchanged types; the Designer gains
  `refreshCatalog(catalog)`, which preflights schema, library grouping, children capability and
  blueprint event references, then re-renders or rolls back atomically.
- e12e6cb: Replace the canvas-specific background image host protocol with the unified host resource selection
  bridge per ADR-0089. `requestHostResourceSelection` dispatches a single request event for either the
  canvas background or a legacy image component; `commitHostResourceSelection` validates the pending
  session and writes one Core transaction (no URL, token, or header is stored). The old
  `requestCanvasBackgroundImage` / `commitCanvasBackgroundImage` methods, their event and request types,
  and the `canvasBackgroundImageButton` flag are removed in favor of `hostResourceSelectionButton`.
  The SDK designer entry re-exports the selection event and its contract types for host apps.
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

- 14fc8cd: Consolidated record of eight changes to the plugin runtime and its contribution surface: runtime contributions, registration orchestration, activation semantics, the capability pipeline, the authoring wiring for resource types, and the panel element contract.

  ### plugin-runtime-contributions

  Let plugins contribute runtime behaviour, not just interfaces (ADR-0076).

  Until now every contribution kind landed on the **authoring surface** (material, panel,
  inspectorControl) or on **resource types** (dataResourceType). A plugin could add a widget
  but could not participate in what a document _does_. Two capabilities were declared in the
  document contract with nothing able to supply them: `processorId` was a string passed
  through to the host with no registry, and `host-action.actionId` had no registry and no
  authorization at all — an unchecked funnel where the host silently interpreted any id.

  Two new contribution kinds close that gap:

  - `dataProcessor` — `{ id, name, configSchema }`. The document's `processorId` now resolves
    against declared processors; an unresolvable id fails closed instead of being forwarded.
  - `blueprintAction` — `{ id, name, payloadSchema, requiredCapability }`. The document's
    `host-action.actionId` must reference a declared action, authorized under
    declared ∩ granted ∩ supported like commands. Undeclared ids are rejected by the manager
    rather than reaching the host.

  Both are **host→plugin** directions: the manager routes to the plugin's own handler, so
  neither requires a host-provided port factory. Plugins reach them through
  `dataProcessors` / `blueprintActions` handler records, validated for one-to-one
  correspondence with their declarations. Two capabilities (`data.process`,
  `blueprint.action.execute`) join the capability table.

  No document-contract change was needed: `processorId` and `actionId` were already opaque
  strings under the existing id patterns, so the screen schema, golden artifact and parser are
  untouched. Plugins remain same-realm trusted code (ADR-0004) — this adds no user-authored
  script execution and no sandbox, and processing stays the host's responsibility (ADR-0027).

  Also adds `@base-screen/plugin-pipeline`, the first plugin whose contributions are purely
  runtime: a `topBy` processor and a `spotlight` action, with no UI element at all.

  ### converge-plugin-registration

  Converge plugin registration with contribution declaration: plugin-sdk gains
  createPluginRegistration, which pre-checks every custom element tag conflict before the
  first define, registers plugin packages, host materials and panel/control elements in one
  call, and returns the plugin-manager input directly; the manager's createCommandPort
  option is now truly optional, and plugin-core exports isValidCustomElementName.

  ### table-driven-capability-pipeline

  Drive the capability pipeline from a declarative table: `PLUGIN_CAPABILITY_DESCRIPTORS`
  declares every supported capability once (id, required port factory, blueprint marker);
  capability authorization, port compatibility and blueprintCapability contribution checks
  all read the same table, so adding a capability is a one-row change.

  ### converge-activation-failure-blast-radius

  Converge the activation failure blast radius: per-plugin atomic activation replaces the
  whole-set rollback. Attributable preflight failures (manifest parsing, capability grants,
  registry resolution, cross-plugin contribution conflicts with deterministic first-wins)
  and runtime activate() failures exclude only the failing plugin and cascade to its declared
  dependents; surviving plugins publish normally. The manager snapshot gains a failures list
  for per-plugin observability, while malformed input and unresolvable standalone materials
  remain global gates.

  ### lazy-plugin-activation

  Add lazy plugin activation: `activation: 'lazy'` defers plugin activate() hooks until
  their contributions are first used through the manager (contribution commands, panel
  actions) or an explicit `ensureActive(pluginId)`, which activates the declared dependency
  chain in topological order. Preflight and catalog publication are unchanged, so
  authorization is never relaxed; lazy failures land in snapshot.failures and refuse retry.
  Eager remains the default.

  ### wire-data-resource-type-authoring

  Wire the dataResourceType contribution into the designer authoring surface: the runtime
  contribution index can enumerate resource types, the data panel renders an authorized type
  picker, and dataResourceType ids must satisfy the document resourceType name pattern so
  authored sources parse as canonical documents.

  ### host-skill-kit-adoption

  **Removed — kept as a historical record.** The host Skill kit this entry describes no longer
  exists: `skills/`, `tooling/material-mcp-server/`, `tooling/pack-host-skill-kit.mjs`, the
  `verify:material-mcp` and `pack:host-skill-kit` scripts, `tests/host-skills/` and the
  material-handoff fixtures were judged obsolete and deleted, so the repository carries no kit
  directory, no host-skill manuals and no packaging command. Nothing here is a live capability;
  the statement as originally written remains in git history.

  ### panel-model-optional

  Widen `BaseScreenPluginPanelElement['model']` to `BaseScreenPluginDesignSnapshot | undefined` so
  it matches the Engine's real write ordering. The Engine mounts a panel element (firing
  `connectedCallback`) and only afterwards writes the snapshot, and it writes nothing at all
  while the document is not ready — so a panel that trusted the previous non-optional type
  and read `this.model` on connect would throw. The two shipped panel examples
  (`plugins/plugin-echarts`, the browser-harness fixture) are updated to return
  `undefined` honestly and degrade in render, and `docs/usage.md` now documents the panel
  lifecycle contract alongside the injection-control contrast (controls are given their
  model before being attached, so they are unaffected).

- afc60b0: Add host-driven realtime conditional styling. `BaseScreenViewerElement.refreshConditionalStyles()`
  and `BaseScreenDesignerElement.refreshConditionalStyles()` re-evaluate the current
  `conditionalStylePort` snapshot for mounted materials without refetching data, touching the canonical
  document, or recording history. The Designer preview now receives the same host port, and the port
  contract documents that hosts must publish a new alarm/visual snapshot before invalidating. The
  examples demonstrate SSE alarm snapshots → port → style-only refresh across the vanilla, React and
  Vue hosts.

- 061fa02: Reduce host integration protocol and lifecycle boilerplate while retaining the full element API.

  Engine exposes an isolated, lightweight authoritative project snapshot and change event. Designer mount controllers and framework components project the accepted initial snapshot and subsequent state through `onProjectState`, without a duplicate project read or host state machine. Failed normalized-document commits retain the previous project revision.

  Mount diagnostics carry the actual failure phase, instance availability and recovery mode through controllers, framework callbacks and fallback rendering. Existing one-argument diagnostics callbacks remain supported. Catalog refresh failures retain the active instance; configuration, project load and teardown failures have distinct contexts.

  Standard runtimes accept framework bridge catalog entries directly, preserving tabular data adapters through the existing registration and authorization plan. Full host examples use one standard runtime and tracked mounts, with online-material changes committed through `setCatalog`.

  Host-kit adds transport-neutral project and dataset adapters over existing host business callbacks. REST adapters reuse the same migration, contract validation, cancellation and error handling. Validated-result observers receive isolated request data, results and errors; observer mutations or failures cannot alter the port result. Host-owned business requests, authorization, persistence, asset management and alarm transports remain outside Engine. Query operations also receive their per-request execution context, preserving host tracing and project revision audit without shared state.

  Restore the ten stable `plugin.chart.*` chart-family identities already consumed by the production host, including their manifests, dataset adapters and ECharts options, so upgrading the host does not silently remove existing charts.

- 061fa02: Add a public host token layer (`--bs-host-*`) for host-owned panels.

  Hosts that render their own content into a named designer slot (for example the left-panel
  `leftPanelGroups` slots) had no consumable design tokens: `designer-tokens.css` is injected into the
  engine shadow root via `?inline`, and no package exported any CSS. Every host therefore copied the
  palette by hand — the three example hosts shipped an identical dark-only copy, so their panel stayed
  dark after the workbench switched to `theme="light"`.

  - `@base-screen/engine/host-tokens.css` and `@base-screen/sdk/host-tokens.css` publish a baked token
    layer with the public prefix `--bs-host-`: 33 theme pairs (surfaces, text, borders, accent, focus
    ring, elevation, semantic colours, primary action, scrollbar, modal scrim) plus 47 shared geometry
    and typography tokens (space, radius, control height, icon size, row height, card geometry, font, tracking,
    motion). Card geometry (`--bs-host-card-min-width` / `-gap` / `-thumb-aspect`) is shared with the material
    library, so a host asset card and a built-in material card have the same width and thumbnail ratio.
  - The file is generated from `designer-tokens.css` by `tooling/build/host-tokens.mjs`; token values are
    never hand-written. Generation unwraps the `--base-screen-designer-*` override hooks to their baked
    fallbacks and remaps internal `var(--designer-*)` references, so no engine-internal name leaks into
    the public layer.
  - Tokens are scoped with zero-specificity `:where(.bs-host)` and
    `:where(.bs-host[theme="light"], base-screen-designer[theme="light"] .bs-host)`, so hosts can override
    a single token from any class selector. The layer only declares custom properties plus `color-scheme`.
  - `pnpm check:host-tokens` guards the layer: regeneration must be byte-identical, every source token
    must exist, no internal name may leak, theme tokens must be declared in both blocks, and the public
    name set must match a compatibility snapshot (removing or renaming a token requires editing it).

  Name stability is the contract; values are visual tuning. The public layer does not add new spacing or
  type steps and does not raise the 30/28px control geometry to a 44px target — doing so would make host
  panels looser than the adjacent built-in panels.

### Patch Changes

- 253e4c3: Add canonical Blueprint graph layout metadata and a capability-gated component visibility action,
  including ordered runtime effects, trace output, renderer transitions, and reference cleanup.
- b9d0b80: Add the agent-fusion change flow to the designer: transaction provenance, ghost-draft proposals with
  unit-level adoption, pointer-based history revert, the right-pane changes tab, the intent composer with
  scope confirmation, review mode, target-display overlays, presentation lock, and host-defined scene
  switching with ghost preview and one-transaction apply.
- f2f4976: Stop a successful `save()` from resetting the designer session. When the adapter returns content that
  matches what was submitted, `applySaveResult` now pins the clean baseline to the current document
  reference instead of replacing the document through the session, which previously re-rendered every
  material, cleared `selectedComponentIds`/`focusedComponentId` and rebuilt the undo history — so an
  autosave fired while the author was typing or dragging dropped the selection and the field focus. The
  document is still adopted when the adapter normalizes it to different content, and edits made while a
  save is in flight still leave the project dirty.
- 8537e4b: Replace persisted Blueprint rules with first-class component relations: canonical `blueprint.relations`
  (behavior and semantic), runtime rule derivation without persistence, legacy rules migration, a
  relationship-first canvas with component/variable/host nodes, semantic and containment edges, and
  updated host canvas examples.
- a36a9fa: Add `insertComponentFragment` to `<base-screen-designer>`: insert a pre-arranged set of atomic
  components as one undoable transaction. Nodes carry anchor-relative offsets, the fragment is
  translated as a whole (never per-node clipped), `props`/`style` merge over manifest defaults before
  schema validation, and the shell is validated by `designCapabilities.children` rather than library
  visibility so `base.container` can act as the group shell. Preset storage stays with the host;
  `parseBaseScreenComponentFragmentInsertionIntent` is exported for host-side pre-validation. See
  ADR-0087.
- fec0c41: Finish the design-prototype port for the engine-only surfaces (design-port batches 4a-4b). The data workbench step list marks its current step with the neutral navigation tier — `control-active` surface, primary text, 600 weight, neutral position bar — instead of raw accent text that measured about 3.7:1 on the panel surface and failed AA; the data preview tabs adopt the inspector's light-pill tab language, and the static-data tab pressed state adopts the unified segmented-control tier. Opening the data workbench now also hides the canvas toolbar, rulers and canvas stage the way blueprint mode already does, so the canvas no longer paints under the opaque overlay, and closing restores it through the same resize path as mode switching. Canvas overlays are unified into the accent family: snap guides and persistent guides use the accent (persistent guides previously used the contrast-corrected warning olive, a status colour), measurement readouts use the contrast-safe `accent-text` token (5.6:1 light / 6.2:1 dark), and the canvas hover ring is a visible 45% accent ring rather than a 10% `accent-surface` wash that read as no feedback at all. Numeric sliders are redrawn in the prototype's value-control language — a 6px pill track plus a 14px custom thumb with a 2px surface-coloured ring — replacing native `appearance: auto` painting driven by `accent-color`, which also wires the `--designer-range-track` token declared but left unconsumed since the first batch. Dialog surfaces drop their real 1px border for the overlay family's shadow-as-border treatment. Cleanup: two tokens with no consumers are removed, the ruler canvas fallback literals move off the pre-port zinc greys, and blueprint panel CSS loses fourteen classes that no longer have DOM producers. Public API, tokens and document contracts are unchanged.
- 7b82b87: 修复组件文本作者化、图层重命名、自适应文本与页面配置面板的既有缺陷：宿主文本提交按规范数据源视图解析并写回文档级实例（保留变量引用）；图层树渲染排队重入，避免重命名输入框在提交后残留；对齐参考改用选区实际起止边界；渲染器在模型未重赋时不再覆盖 `max-content` 自适应宽度；六档缩放分段按两行走道撑高，第二行不再压到下一字段。
- 13a9c3d: Merge the host variable ports into a single source catalog port (D1) and make host request identity the
  data source instance instead of the component.

  - `ScreenHostVariablePort` + `ScreenHostVariableCatalogPort` become `ScreenHostCatalogPort`
    (`list` / `describe` / `resolve`); the `variableCatalog` and `variables` capabilities collapse into
    `hostCatalog`, and the variable-named request fields (`variableId`, `initialValue`, `controlled`,
    `processorId`, `autoUpdate`) are gone — those concepts belong to the document-level data source.
  - `ScreenHostCatalogDescriptor` reuses `ScreenDatasetParameterDefinition` for `parameters` and can
    declare `readOnly`.
  - `ScreenHostResourceRequest.componentId` and `ScreenDatasetQueryRequest.componentId` become
    `dataSourceId`; the designer/viewer pass the instance id of the component's value reference and fall
    back to the component id until the document-level instance path lands.
  - Designer element and viewer expose `hostCatalogPort` instead of `variablePort` +
    `variableCatalogPort`; the variables panel reads entries through `readScreenVariableRecord`, so a
    single-form variable record renders in the existing groups.

- e468741: Require an explicit material manifest opt-in (`hostResourceSelection`) before exposing the host
  asset selection bridge; only `base.image` opts in, so host-resource materials such as metrics and
  charts no longer show the "选择素材" button.
- 5c3b99b: Hide the inspector's data-source tab for materials that declare no data capabilities. The tab is
  removed with the `hidden` attribute, but the inspector writes an explicit `display` on its tabs whose
  selector outranks the shared `.designer-tab[hidden]` fallback, so the tab kept rendering on
  components such as `base.rectangle` and did nothing when clicked.
- a36a9fa: Clicking a locked component on the canvas now clears the selection instead of preserving it. The
  renderer does not apply `pointer-events` to locked materials, so a locked full-canvas backdrop —
  the common big-screen "don't let me nudge the background" pattern — was the hit target for every
  blank point, which made click-to-deselect unreachable. Dragging out of a locked component still
  starts a marquee, and locked components remain non-selection-targets in the committed selection.
- 79fbf58: Remove the Designer's built-in conditional style rule editor while preserving document rules,
  runtime evaluation, and host-managed transaction support.
- 7b82b87: Remove deprecated Blueprint canvas protocol shims: legacy `condition`/`action`/`trigger` node and
  edge kinds, node/edge `ruleId`/`actionIndex`/`condition`/`action`/`summary`/`unconnected` fields,
  and the `BaseScreenBlueprintCanvasNodeSummary` type. Delete the unused blueprint summary module and
  update the default canvas plus the three example hosts to the relation-only graph contract.
- 14fc8cd: Consolidated record of five changes that gave shared cross-package semantics a single owner. Each entry keeps the statement the per-change file carried; the extended rationale remains in git history.

  ### single-source-diagnostic-order

  Give the diagnostic order a single source of truth. The canonical comparator lived in
  `@base-screen/contracts` but was never exported, so four packages kept their own
  line-for-line copies of the same ordering rules: `@base-screen/core`
  (`internal/diagnostics.ts`), `@base-screen/plugin-core`, `@base-screen/plugin-manager` and
  `@base-screen/plugin-sdk`. `contracts` now exports `compareScreenDiagnostics` and the
  uncapped `sortScreenDiagnostics`, and those four copies are deleted in favour of imports.

  The four copies were logically identical to the canonical comparator, so this changes no
  ordering anywhere. Sorting limits and the `DIAGNOSTIC_LIMIT_REACHED` sentinel stay with
  each caller: Contracts' collector is phase-aware and resolves the sentinel path from the
  phase, while the plugin-side collectors use an empty path, so those are different
  semantics and were deliberately not merged.

  This is the first of a series consolidating shared semantics onto their owner. The two
  remaining divergent copies — `packages/contracts/src/dataset/diagnostics.ts` and the
  renderer's — sort by `path.join('/')` string comparison and therefore order
  `['components',10]` before `['components',2]`. They are not touched here and are addressed
  separately, because aligning them does change observable ordering.

  ### single-source-json-semantics-and-hierarchy-seam

  Give the shared core↔renderer semantics single owners, and widen the hierarchy seam.

  **Structural JSON equality** was implemented four times — `@base-screen/core`'s internal
  `equality.ts`, the renderer's `jsonEquals` (whose own comment admitted it mirrored Core), and
  `@base-screen/plugin-sdk`'s `areEqual`. `contracts` now owns `screenJsonEquals` and those three
  copies are deleted. The three were logically identical, so no comparison result changes.

  `@base-screen/plugin-manager`'s preflight equality is deliberately **not** merged into it: that
  one answers "is the runtime object equal to its canonical parse", so it reads own _data_
  properties only (a getter must not masquerade as a match) and includes non-enumerable keys.
  Different question, different implementation, now documented as such.

  **Data source validation** no longer requires callers to hand-build a document. Two engine call
  sites assembled a whole `ScreenDocument` — canvas, a synthetic component, variables, blueprint —
  just to validate one `dataSource` field. `contracts` now exposes `parseScreenDataSource`, which
  owns that envelope and returns the canonical data source; diagnostics come back relative to the
  data source. The accept/reject decision is unchanged because it still runs the same document
  validation path, and both callers discarded the inner diagnostics anyway. The envelope is
  relocated rather than eliminated: removing it outright would mean re-deriving the fail-closed
  diagnostics that the component-level validator emits, which is a redesign of the most
  safety-critical module, not a consolidation.

  **The hierarchy seam is wider.** `contracts`/`core` already had `getAncestorIds`,
  `getDescendantIds`, `getDescendantSet`, `getAncestorDepth`, `getRootIds` and the `ComponentIndex`
  type, but only `buildComponentIndex` and `getPainterOrder` were public, so six consumers rebuilt
  parent/child maps by hand. Those queries are now exported. Two engine sites were converted where
  the result is provably identical — `selectionSubtree` (same set, document order, and it gains the
  query's cycle guard and the document-keyed index cache) and `groupEditingPath` (same root-first
  name path, with the dangling-ancestor stop preserved). The remaining sites are left alone: the
  renderer's hidden check interleaves session overrides that these queries do not model, and the
  inspector's descendant walk is breadth-first while the shared query is depth-first, so converting
  it would change observable ordering.

  ### single-source-contribution-kind-vocabulary

  Give the contribution-kind vocabulary a single implementation point. Adding one contribution
  kind used to require editing six independent switch/if chains across ten source files (plus
  three regenerated API reports) — the last such addition, `blueprintAction` + `dataProcessor`,
  touched three files in plugin-core, six in plugin-manager and one in plugin-sdk.

  `@base-screen/plugin-core` now owns a `ContributionKindDescriptor` table declaring, once per
  kind: its field allowlist, its identity string form, its id lexeme, its kind-specific
  validation and its runtime handler field. `validateContribution` (205 lines of switch) reads
  that table, and the unknown-kind diagnostic is unchanged. The table itself stays internal;
  the package exposes a narrow behaviour interface instead:
  `BaseScreenPluginContributionKind`, `BaseScreenPluginContributionHandlerField`,
  `contributionHandlerField`, `declaredContributionIds`, `listContributionHandlerKinds`,
  `contributionIdentity`, and `readContributionHandlerRecord` (with its input/result types).

  `@base-screen/plugin-manager` keeps its own `CONTRIBUTION_KIND_PLAN` for manager-only facts
  (index bucket, authorization gate) keyed by the exported kind union, so the table is
  **exhaustive** — a new kind that misses its entry is a compile error rather than a silently
  missing projection. Its three near-identical `collect*` functions collapse into one
  parameterized collector; the duplicated contribution identity is deleted; contribution index
  projection no longer branches per kind.

  `@base-screen/plugin-sdk`'s handler reader is deleted in favour of the shared one, so
  "declarations and handlers correspond one-to-one" exists once instead of twice with different
  array handling.

  `@base-screen/contracts` adds `isScreenComponentId` and `isScreenVariableName`, replacing
  three local regex literals of the same patterns in `contracts`, `core` and `engine` and three
  `new RegExp(pattern)` re-wraps in plugin-core.

  No contribution kind, capability, diagnostic code, message, path or public signature changed.
  The API reports gain only additions.

  Known asymmetry preserved: the "declared capability" check still reports
  `PLUGIN_CORE_CAPABILITY_UNDECLARED` for `command` only; `blueprintAction` carries the same
  `requiredCapability` field but fails closed through the authorization intersection without a
  diagnostic. That was true before this change and is left as-is deliberately, and separately:
  lazy activation still merges command handlers only, so `blueprintAction` and `dataProcessor`
  contributions remain unreachable in `activation: 'lazy'` mode — also pre-existing.

  ### single-source-extension-vocabulary

  Give the plugin extension vocabulary a single source of truth. The ten blueprint
  capability ids now live in `@base-screen/contracts` (`SCREEN_BLUEPRINT_CAPABILITY_IDS`,
  `SCREEN_BLUEPRINT_CAPABILITIES`, and the two single-point constants), and both the
  plugin-manager capability table and the engine's blueprint rule normalization read that
  list instead of keeping private copies that could drift into silent authorization
  failures. `@base-screen/core` re-exports the component-visibility constant from contracts
  so its public API is unchanged. Command chrome menus are now declared once in
  `@base-screen/plugin-core` (`BASE_SCREEN_PLUGIN_COMMAND_MENUS`, with
  `BaseScreenPluginContextMenu` for the context-menu subset) and the manifest validator
  derives its allowlist from it. No contribution kinds, capabilities or behavioral
  semantics were added or changed.

  ### converge-diagnostic-order

  Align the last three divergent diagnostic orderings with the canonical one. These are
  **observable ordering changes**, called out individually:

  1. **`@base-screen/renderer`** — `renderer-diagnostics.ts` sorted by `path.join('/')` string
     comparison, i.e. `['components',10]` came before `['components',2]`. It also had no
     message tiebreak. It now uses the canonical comparator: path segments compare by type
     (numeric segments numerically), then `code`, then `message`.
  2. **`@base-screen/contracts`** (internal, not part of the public report) — the dataset
     module carried its own copy of the same joined-string comparison, so dataset parse
     results ordered `['fields',10]` before `['fields',2]` and disagreed with the rest of the
     platform. It now delegates to the canonical comparator.
  3. **`@base-screen/plugin-manager`** — the preflight reporting order was a third rule that
     compared path _length_ first and ignored segment types. It now uses the canonical
     comparator.

  What a consumer actually sees: the `diagnostics` array inside a `ScreenParseResult` may be
  ordered differently than before when two diagnostics share a path prefix but differ by a
  numeric index of 10 or more, or when they share both path and code and differ only by
  message. No diagnostic is added, removed, or changed in `code`, `path`, `message`, or
  `severity`, and no signature changed.

  `@base-screen/renderer`'s `sortDiagnostics` is internal (it is not part of `renderer.api.md`),
  and `@base-screen/contracts`' dataset sorter is not exported, so no public report changes.
  No test pinned the old orderings: the renderer, dataset and preflight suites assert codes,
  attribution and counts rather than relative order, and all of them pass unchanged.

- e12e6cb: Keep thin components clickable on the canvas. `hitTestScreenComponents` accepts an optional
  `minimumThickness` that widens the hit band of under-thin axes in the component's local frame, so a
  2px `base.rule` divider or a hairline-bordered container still has a target after zooming out. The
  gesture controller uses it only as a fallback when the DOM hit lands on nothing: a 10 screen-pixel
  band is converted back to canvas units, so the feel is the same at any zoom level, while ordinary
  components keep hit-testing strictly inside their own box and blank clicks still start a marquee.
- 748e133: Add UI authoring for document-level shared data source instances, custom Blueprint event-field
  paths, and conditional style rules. The data panel now recognizes `dataValue` consumers, edits
  legacy dataset components into shared instances without keeping both forms, and supports reusing an
  existing instance; the Blueprint inspector accepts undeclared event fields such as `row.city`; the
  appearance panel can add, remove, reorder and edit up to eight color style rules with the same
  `styleRules` transaction used by canonical documents.
- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [8537e4b]
- Updated dependencies [af22711]
- Updated dependencies [14fc8cd]
- Updated dependencies [f06fc5c]
- Updated dependencies [df083f5]
- Updated dependencies [7b82b87]
- Updated dependencies [13a9c3d]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [e468741]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [f72a47b]
- Updated dependencies [81c3cea]

  - @base-screen/contracts@0.1.0
  - @base-screen/core@0.1.0
  - @base-screen/renderer@0.1.0
  - @base-screen/plugin-core@0.1.0

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

- 061fa02: Add an optional product composition layer for host integration.

  `createBaseScreenRuntime()` registers the product elements and official materials, activates plugins through one
  authorization plan, and exposes the merged catalog and contribution surfaces. `mountDesigner()` and `mountViewer()`
  append, configure, initialize, and release elements through a tracked handle while preserving the full element API.
  `createBaseScreenDesignerMountController()` and `createBaseScreenViewerMountController()` add a framework-agnostic
  attach/detach lifecycle for thin host bindings, including option snapshots, diagnostics, and async detach races.
  `adoptBaseScreenRuntime()` projects an already-active host manager and catalog into the same runtime shape without
  re-activating plugins, while `@base-screen/sdk/plugin-core` re-exports plugin contracts so hosts do not need a direct
  `@base-screen/plugin-core` dependency.

  Designer mounts infer official tool and group roles from the active catalog and honor explicit overrides. Each runtime
  owns at most one Designer session; a second mount fails without replacing the first session's plugin binding.
  `setCatalog()` refreshes inherited mounted catalogs by default, rolls back earlier updates on failure, and supports an
  explicit `future-mounts` target. Viewer `refreshCatalog()` preserves document and data state. Mount controllers keep
  other options as initialization snapshots and serialize pending attach/detach operations.

  Explicit `blueprintCapabilities` and `createBaseScreenBlueprintCapabilityPlugin()` derive contributions and grants
  from one capability list. SDK entrypoints expose the public configuration and host event types needed by consumers.
  Designer main, ghost, and preview renderers receive the same host data ports, and initialized dataset ports cannot be
  silently replaced. Disposal is idempotent under reentrant cleanup and still releases the host when unbinding fails.

  The existing `defineBaseScreen*()`, `configure()`, port, slot, command, and manual lifecycle APIs remain available.

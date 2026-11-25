# base-screen

## 0.3.0

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

- d7c48f6: 推送式数据源运行时（ADR-0104 切片 2）。

  - `updatePolicy.mode: 'push'` 的实例在 Viewer / 预览态经宿主端口 `subscribe` 订阅；设计态（`mode: 'design'`）
    不订阅，只做一次拉取。订阅身份与请求键一致：参数或来源变化即退订并重新订阅，`refreshData` 重新订阅、
    不额外 resolve；`suspendData`、`clear`、`dispose` 退订。退订后旧 sink 上的事件一律丢弃。
  - 五类事件：`snapshot` 替换结果；`append` 追加表格行（只在资源类型声明 `delivery.push.append` 时接受，
    行字段必须属于现有 fields）；`invalidate` 同键 resolve、期间保留当前值；`status` 更新连接状态；
    `heartbeat` 只刷新静默计时。首个快照前保持 loading，超时（`resourceTimeoutMs`）报 `HOST_RESOURCE_TIMEOUT`。
  - 游标 `{ epoch, revision }`：重复丢弃；跳号或换 epoch 的增量进入重同步，丢弃后续增量直到新快照。
  - 保留窗口：`retain.rows`（缺省 1000，仅 append 型或声明了 retain 的来源）与 `retain.seconds` + `timeField`
    （以数据里最新一行时间为基准）从头部裁剪，再按 1 MiB 体积上限裁剪。
  - 按帧合并通知：每个实例每帧最多重投影一次，观察事件 `pushed` 按帧聚合。
  - 过期：连接 `reconnecting` / `suspended`、重同步中或超过 `delivery.push.inactivityTimeoutSeconds`
    时，组件的 `ready` 数据状态带 `stale: true`；`failed` 进 error 且不保留旧值；从未有值时 `suspended`
    报 `HOST_RESOURCE_UNAVAILABLE`，之后的快照仍可恢复。
  - 门控与回退：来源不支持推送时，配了 `fallbackIntervalSeconds` 就按间隔轮询并报 warning 诊断，
    否则报 `HOST_RESOURCE_UNAVAILABLE`；订阅中的实例在 `suspended` 期间按同一间隔轮询，`open` 后停止。

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

- c213715: 检查器作者面与智能体提示词三项增强：

  - Manifest Editor Descriptor 新增 `segmented` 控件（2–4 个枚举选项的分段选择，fail-closed 校验），复用既有分段原语与原生 select 值流水线。
  - `styleSchema` 校验接受引擎级保留样式键 `opacity` / `flipX` / `flipY`：渲染器几何帧本就统一消费它们，物料无需重复申报；物料自行申报时仍以申报的 schema 为准。
  - 新增 `describeBaseScreenMaterialStyleForAi(manifest)`：从 styleSchema + editorDescriptor 确定性派生带注释的 TS 类型签名（含嵌套路径、枚举与范围），供宿主塞进智能体提示词；示例三端与共享后端已接入该签名。

- 6405a3d: Manifest Editor Descriptor 新增 `spacing` 控件：四个边距用一个对象值承载（`top` / `right` / `bottom` / `left`），
  检查器按控件容器的实际宽度在一行四格与两行两列之间自适应；四边相等时收成一个输入，标签旁的链图标可统一四边（以上边距为准）或分开设置；单位只声明一次；缺任一边或非数字时校验失败关闭。
- 591d730: 官方文本物料 `base.text` 的 `dataCapabilities` 增加 `host-resource`：读数文本可以直接读宿主资源实例（含推送式
  数据源，ADR-0104），不必再借数据集或变量中转。宿主资源选择入口（`hostResourceSelection`）仍只对图片物料开放。
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
- e2d7c76: 画布标签条放不下时可横向滚动：滚轮 / 触控板横滚标签条、溢出一侧渐隐，切换画布后保留滚动位置并把当前标签滚进可视区。页面在标签条、蓝图节点与蓝图库里改用折角文档图标，与容器的空矩形区分开。
- d161254: 检查器公共区的不透明度控件改为对所有物料显示（ADR-0099 §2.3）：不透明度是引擎级保留样式，Renderer 几何帧本就对所有物料统一写入，
  此前公共区却只在物料 `styleSchema` 申报了 `opacity` 时才出现，未申报的物料（如全部大屏插件物料）因此没有入口。
  物料申报的 schema 仍用于收窄取值。官方形状、容器、分割线与图片物料移除了 `stylePanel` 中不生效的 `opacity` 项，
  并不再在渲染路径自行写宿主元素的 `opacity`；文档中的 `opacity` 值与渲染结果不变。

  检查器几何区的水平 / 垂直翻转按钮同样改为对所有物料显示：翻转也是引擎级保留样式，Renderer 本就统一写入 transform，
  此前只有在 `styleSchema` 申报了 `flipX` / `flipY` 的物料才有入口；提交侧同样回落到保留 schema。

- 8c0cb72: 修复真实鼠标双击进不了组。

  - 根因：选中组（或卡片外壳）后，选框拖拽层用 evenodd 的 clip-path 挖掉「选中组件的区域」，以前传入的是整棵子树。
    外壳的矩形与子组件的矩形是嵌套的，子组件区域被挖了两次、重新变成填充，于是拖拽层正好盖住了子组件。
    现在只挖显式选中的组件，子组件区域保持可点。
  - 兜底：双击落在拖拽层上时，按指针位置做几何命中，取最上层的组件，与单击拖拽层时的命中口径一致。
  - 单元测试与 browser-harness 以前都把 dblclick 直接派发到组件元素上，绕过了拖拽层，所以没有发现。harness 新增
    `clickComponentAt`（按该位置实际最上层的元素依次派发 pointerdown / pointerup / click / dblclick），文本编辑的两处双击
    改用它，组合插入用例新增「单击选中外壳 → 在子组件位置双击 → 选中子组件」断言。

- 8c0cb72: 修复组合分片插入后的两处交互问题（ADR-0100）。

  - 插入后只选中分片的根节点（有外壳时只选外壳），不再把外壳与其子节点一起选中。此前混选的选区不满足画布拖动
    「同一父级」的前提，新插入的整片拖不动，必须重新点选才能移动。`insertComponentFragment` 同此语义。
  - 从物料库把分片拖入画布时，落点即组合包围盒左上角，可越出画布（与单个物料拖放一致，由检查器提示超出画布）。
    此前落点会被整片贴回画布内，与画布同量级的组合（如设备状态卡）几乎没有移动余量，拖到哪都落回同一处。
    点击/回车插入与公开 `insertComponentFragment` 仍按可见画布中心整片贴进画布。

- 8c0cb72: 修复 Ctrl+A 全选后按 Delete 删不掉组件。

  - 全选只选当前编辑层级（画布根层，或双击进入的组内）的直接成员，不再把子组件和锁定组件一起选进来。
    以前组合 / 卡片插入后是父子结构，全选会父子混选，删除、移动、对齐这类要求「选区同属一个父级」的操作因此整体失效，
    而且没有任何提示。
  - 删除不再要求选区同属一个父级：父子混选（例如从图层面板多选）时只删最上层，子孙随父级级联删除。
    选区里有锁定组件时仍整体不删。

## 0.2.0

### Minor Changes

- 525acda: 移除 `base-screen/react` 与 `base-screen/vue` 子路径。这两个入口此前只是对 `@base-screen/react` / `@base-screen/vue` 的转发，却让 `base-screen` 与桥接包互相依赖，形成包图环，导致 `turbo run build` 直接以循环依赖失败、dist 无法重建。框架组件改为直接使用独立桥接包，三个包版本同步。

  迁移方式：

  ```diff
  - import { BaseScreenDesigner } from 'base-screen/react';
  + import { BaseScreenDesigner } from '@base-screen/react';
  ```

  ```diff
  - import { BaseScreenDesigner } from 'base-screen/vue';
  + import { BaseScreenDesigner } from '@base-screen/vue';
  ```

  未安装桥接包的工程需要补装对应依赖；不需要框架组件的工程无需改动，`base-screen` 的其余子路径（`/viewer`、`/designer`、`/contracts`、`/engine`、`/host-kit` 等）保持不变。

  同时补齐 `base-screen/material/auto-register`：单包消费者此前只能通过 private 的 `@base-screen/material` 注册内置物料，与 `base-screen` 内联的副本混用会因构造函数不同而触发 `PLUGIN_CORE_IDENTITY_CONFLICT`。该入口让宿主只装 `base-screen` 即可完成元素与物料注册。

- 3647b6c: 设计器改为「首帧骨架 + 分帧水合」：新增 `mountBaseScreenDesignerSkeleton`，元素连接后先绘制与最终布局同尺寸的骨架，物料库与画布文档在后续帧补齐（`data-designer-state="loading|ready|error"`、`data-designer-canvas-state="pending|ready"`）。只注入 `catalog` 即会替换骨架并进入 `ready`，不再要求额外调用 `configure()`；catalog 15s 内未到达时停止脉冲并切换到可识别的错误态（`data-designer-skeleton-state="error"`），之后到达仍可恢复。查看器同样在 catalog 或文档到达前显示画布骨架（`data-viewer-state="loading|ready"`），首次渲染落定后自动撤除。
- 设计器入口按作者面拆分为按需加载的异步 chunk，首屏只保留默认工作台路径：

  - 右侧「数据源」面板的实现移入独立 chunk，首次切到数据源页签或调用数据源相关方法时才加载。加载完成前的模式请求排队合并、命令缓存按序重放，占位盒与最终面板同尺寸，不产生布局位移。
  - 事件 Blueprint 工作台（面板、图投影与默认中央画布）移入独立 chunk，仅在宿主提供中央画布、声明 `initialWorkbenchMode: 'blueprint'`、点击蓝图页签或从变量面板加入节点时加载。加载前 `setWorkbenchMode`、画布 slot 与命令事件都有确定行为：非法参数同步失败、模式请求只保留最后一次、画布命令有界缓存并在桥接连接后原序重放、加载失败降级为可识别诊断且不重试。ADR-0091 的一体化工作台边界与公开 slot/command/state 协议保持不变。
  - 外围 `plugin-materials` 的 ECharts 渲染改为动态 import，图表实例首次渲染时才加载 ECharts 运行时。

  实测设计器首屏 eager 从拆分前约 407 KB gz 降到 346.26 KB gz：数据源面板约 -33 KB，事件工作台 -27.35 KB，两个异步 chunk 合计 69.50 KB gz。

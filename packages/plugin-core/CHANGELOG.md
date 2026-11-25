# @base-screen/plugin-core

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

- 7b9d601: 新建组件的颜色可以跟随文档主题（ADR-0101）。

  - 物料 manifest 新增可选字段 `themeStyle`（样式键 → 主题色位）。键必须是 `styleSchema` 里的字符串样式键，值必须是
    六个固定色位之一，最多 32 项；校验失败按 `PLUGIN_CORE_MANIFEST_FIELD_INVALID` 拒绝。
  - 新导出 `resolveBaseScreenMaterialDefaultStyle(manifest, theme)`：文档带色板时，声明的键取当前色板的颜色，
    其余键用 `defaultStyle`。写入的是解析后的颜色，不是 `theme:<slot>` 引用——检查器读得出颜色，去掉色板也不会让组件失败关闭；
    之后换色板不会连带改已有组件。
  - 设计器所有按默认值新建组件的路径（物料库点击 / 拖放、工具绘制、成组外壳、`insertComponent`、组合分片）都改用这个函数。
    组合分片里节点显式写的样式键以分片为准；物料库条目覆盖了的键不再跟随主题。

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

- c213715: 检查器作者面与智能体提示词三项增强：

  - Manifest Editor Descriptor 新增 `segmented` 控件（2–4 个枚举选项的分段选择，fail-closed 校验），复用既有分段原语与原生 select 值流水线。
  - `styleSchema` 校验接受引擎级保留样式键 `opacity` / `flipX` / `flipY`：渲染器几何帧本就统一消费它们，物料无需重复申报；物料自行申报时仍以申报的 schema 为准。
  - 新增 `describeBaseScreenMaterialStyleForAi(manifest)`：从 styleSchema + editorDescriptor 确定性派生带注释的 TS 类型签名（含嵌套路径、枚举与范围），供宿主塞进智能体提示词；示例三端与共享后端已接入该签名。

- 6405a3d: Manifest Editor Descriptor 新增 `spacing` 控件：四个边距用一个对象值承载（`top` / `right` / `bottom` / `left`），
  检查器按控件容器的实际宽度在一行四格与两行两列之间自适应；四边相等时收成一个输入，标签旁的链图标可统一四边（以上边距为准）或分开设置；单位只声明一次；缺任一边或非数字时校验失败关闭。

### Patch Changes

- Updated dependencies [591d730]
- Updated dependencies [314eda0]
- Updated dependencies [c27b41a]
- Updated dependencies [7b9d601]
- Updated dependencies [591d730]
- Updated dependencies [aa547bf]
- Updated dependencies [c213715]
  - @base-screen/contracts@0.2.0

## 0.1.0

### Minor Changes

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
- e12e6cb: Add host material catalog hot refresh per ADR-0090: `plugin-core` compares two catalogs by type and
  separates manifest-only changes from constructor/tagName/adapter changes; `renderer` validates a
  candidate catalog against the current document and swaps it without disposing the runtime, remounting
  only changed implementations and preserving data-source state for unchanged types; the Designer gains
  `refreshCatalog(catalog)`, which preflights schema, library grouping, children capability and
  blueprint event references, then re-renders or rolls back atomically.
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

- 81fa908: Close the two asymmetries the previous plugin-runtime batch deliberately left open: runtime
  contributions were unreachable under lazy activation, and one contribution kind skipped its
  declaration check.

  ### runtime-contribution-lazy-reachability

  Under `activation: 'lazy'`, `blueprintAction` and `dataProcessor` contributions were
  **declared, authorized and visible in the authoring surface, but unreachable at execution
  time**: using one failed closed with `PLUGIN_CORE_CONTRIBUTION_UNKNOWN`, exactly as if the
  plugin had never declared it.

  The cause was not a missing branch. Eager activation merged all three handler kinds
  (command / blueprintAction / dataProcessor) into three maps, while lazy activation merged
  only commands — two implementations of one rule, so they could disagree, and they did.

  The three maps now live behind one `ContributionHandlerRegistry` that both activation paths
  use, and the lazy-activation index (contribution id → declaring plugin) is built from the
  same "executable handler" predicate as the executable set. First use of any of the three —
  command, blueprint action or data processor — now wakes its plugin in dependency-topological
  order. "Will this trigger lazy activation?" and "can it actually run afterwards?" can no
  longer give two different answers.

  Behaviour change to note: a host running `activation: 'lazy'` that previously relied on these
  two contribution kinds being unavailable will now see them execute.

  ### undeclared-capability-single-source

  `PLUGIN_CORE_CAPABILITY_UNDECLARED` is now reported for **every contribution kind that
  carries a capability field**, not just commands. An action whose `requiredCapability` was
  never listed in the manifest's `capabilities` previously stayed in the manifest and simply
  never executed; it is now a preflight failure with a diagnostic.

  The rule is read from the `plugin-core` contribution-kind descriptor (`capabilityField`,
  exposed through a new narrow `contributionCapabilityField` accessor) instead of being
  restated as a kind list in the manager's plan table. The duplicated list was the reason the
  `blueprintAction` check went missing: one source said the kind requires a declared
  capability, the other — the one that was actually enforced — did not know about it.

  Also corrected in this batch, outside the packages: the host-action wiring example in
  `docs/usage/events-and-actions.md` and the browser harness both read `action.actionId` from
  the blueprint host-action port, which carries `{ name, payload }` — `name` is the document's
  `host-action.actionId`. Passing the event through unmapped left `actionId` undefined, so
  every blueprint-dispatched action was rejected at the manager while the host saw nothing
  wrong.

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

### Patch Changes

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

- e468741: Require an explicit material manifest opt-in (`hostResourceSelection`) before exposing the host
  asset selection bridge; only `base.image` opts in, so host-resource materials such as metrics and
  charts no longer show the "选择素材" button.
- afc60b0: Add host-driven realtime conditional styling. `BaseScreenViewerElement.refreshConditionalStyles()`
  and `BaseScreenDesignerElement.refreshConditionalStyles()` re-evaluate the current
  `conditionalStylePort` snapshot for mounted materials without refetching data, touching the canonical
  document, or recording history. The Designer preview now receives the same host port, and the port
  contract documents that hosts must publish a new alarm/visual snapshot before invalidating. The
  examples demonstrate SSE alarm snapshots → port → style-only refresh across the vanilla, React and
  Vue hosts.
- 2dc2b3e: Resolve host data per document-level data source instance instead of per component.

  - New `DataSourceRuntime` owns one entry per instance: request key, cached result, generation and
    in-flight slot. Two components that read the same instance with the same evaluated params share one
    host request and project it independently (`path` + `dataBinding` stay out of the request key), an
    unmounting reader no longer aborts the request, and `updatePolicy.mode:'once'` reuses a ready result
    on repeated renders.
  - `SourceQueryPort` replaces the dataset-only port and dispatches by `ScreenDataSourceSource.kind` to the
    dataset, resource or catalog port; every request carries `dataSourceId`.
  - `renderer-host-resource.ts` is gone: the remaining per-component work is projection
    (`renderer-data-source.ts`), while mounted state keeps only `projectionKey` + `dataState`.
  - `plugin-core` gains `screenValueRefAccepted(capabilities, ref, source)`, the single mapping from a
    `ScreenValueRef` (plus its source) to the manifest's `dataCapabilities`; catalog sources count as
    `variable`, as they did before the port merge.

- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [8537e4b]
- Updated dependencies [af22711]
- Updated dependencies [df083f5]
- Updated dependencies [13a9c3d]
- Updated dependencies [14fc8cd]
- Updated dependencies [14fc8cd]
- Updated dependencies [14fc8cd]
- Updated dependencies [81c3cea]

  - @base-screen/contracts@0.1.0

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

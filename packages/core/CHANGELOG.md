# @base-screen/core

## 0.3.0

### Minor Changes

- 5e27baa: 生成产物的版面硬校验（ADR-0112 S1）：

  - contracts 新增 4 个诊断码 `LAYOUT_FONT_TOO_SMALL`、`LAYOUT_OUT_OF_BOUNDS`、`LAYOUT_OVERLAP`、`LAYOUT_CONTRAST_LOW`。
  - core 新增纯函数 `auditScreenLayout(document, options)`：字号下限、越界（含弹框从画布）、同级部分重叠（完整包住视为有意叠放）、能静态确定背景时的对比度；可按组件子集审计，严重级别默认 `error`。
  - `computeMinimumLegibleFontPx` 从 engine 下沉到 core，新增 `resolveScreenFontFloorPx`（无目标屏参数时 1920 宽 16px 等比换算）；engine 改为从 core 导入。
  - 渲染探针的字号检查默认开启，与静态审计同一口径。

- 7bfdce9: 智能体提案评审收口（ADR-0111）：

  - 契约新增 5 个诊断码 `CHANGE_DOCUMENT_UNAVAILABLE`、`CHANGE_PROPOSAL_EMPTY`、`CHANGE_PROPOSAL_NO_EFFECT`、`CHANGE_DRAFT_PENDING`、`CHANGE_PREVIEW_UNAVAILABLE`；`submitChangeProposal` 拒绝时至少带一条诊断。
  - core `diffScreenDocuments` 的组件差异新增 `type`、`parentId`、`status`、`dataBinding`、`canvasId`、`belowSubCanvas` 六个字段；改了这些字段的组件此前不出现在差异里。
  - 整屏替换合并为单一不可拆单元，只能整体采纳或放弃；提案区只读列出新增 / 移除 / 画布与数据源，单元徽标为「替换」。
  - 草案层不透明：受影响的旧组件（含只读了被改数据源的组件）在草案期间隐藏，被移除的组件原位留虚线轮廓与「将移除」标记；整屏替换不画逐组件轮廓；画布级变化整份预览。
  - 草案条「对比旧版 / 退出对比」改为「查看旧版 / 返回草案」两态切换。

- 1d6b802: 示例数据标记（ADR-0112 S2 契约部分）：

  - contracts：`ScreenValueRef` 的 `inline` 分支新增可选 `sample?: true`，只能写 `true`，缺省即普通常量；JSON Schema 黄金产物同步。新增诊断码 `PUBLISH_SAMPLE_DATA_PRESENT`。
  - core：新增 `listSampleValueRefs(document)`，按文档顺序列出组件 `dataValue`、数据源参数、变量值三处带标记的取值，不深扫 props / style。

- 3d0f236: 蓝图级联模拟下沉 `core`（ADR-0115 D6）。

  - `core` 新增 `simulateScreenBlueprint(document, event, options)` 与 `SCREEN_BLUEPRINT_SIMULATION_MAX_DEPTH`：从一个事件出发逐次分派，变量值改变后分派它的 `data-updated`，从画布开合与页面导航按查看器的顺序级联；请求类动作只登记。结果给出每次分派的轨迹、级联超限或求值失败，以及模拟结束时变了的变量、显隐变了的组件、引用变量且求值结果变了的数据源参数。纯函数，不取数、不调宿主动作。
  - `engine`：蓝图工作台的「模拟」改用它，轨迹与原先一致。
  - `host-kit`：筛选联动采纳前，按画像样本逐个取值造来源事件交给 `simulateScreenBlueprint`，看目标实例参数会不会变成不同的合法取值；页签（`tabChange.value`）与数值类（`valueClick.value`）负载也纳入模拟，不再记「未模拟」。

- cb20d1f: 文档级集合的按 id 局部命令与提案单元分组提示（ADR-0115 D4、D5）。

  - `core` 新增六条命令：`add-data-sources`、`update-data-source-params`（合并参数，`null` 删除）、`add-variables`、`remove-variables`、`add-blueprint-elements`、`remove-blueprint-elements`（删节点连带删掉接在它上面的连线与布局位置）。只动点名的项，其余原样保留；新增遇到已有 id、删除 / 更新遇到不存在的 id 都失败；引用完整性仍由文档校验把关。整体替换命令不变。
  - `engine`：`DesignerChangeProposalInput.groups` 可选分组提示（`label`、`commandIndexes`、`notes`），按它拆采纳单元；分组须恰好覆盖全部命令、互不重叠、每组能单独成立，否则忽略提示走默认拆分，整屏替换仍不拆。单元新增 `notes`，评审面逐行列出（文档级变化没有组件差异行时靠它说明）。新增 `remainingChangeProposalInput`，采纳 / 忽略一个单元后分组下标随剩余命令重排。
  - `host-kit`：`editIntent` 改用上述局部命令写联动（不再整体替换变量、数据源与蓝图），版面与联动都变了时返回 `groups`（「版面与内容」「联动」，联动组带新增 / 去掉的说明）。`IntentEditCommand` 去掉三条整体替换命令，新增六条局部命令；新增 `IntentEditGroup`。

- 82cdf39: 状态外观预置下沉 `core`，MCP 补行为工具（ADR-0115 D8、D10）。

  - `core` 新增 `screenStatePresetStyle(source, tone)` 与 `ScreenStatePresetSource`：给语义色调算出状态要覆盖的样式键（清单声明的 `statePresetKeys` 优先，否则推断主色、描边色与 `danger` 时的发光），规则与原先 engine 的一致。
  - `engine`：`designerStatePresetStyle` 改用 core 的规则；新增公开的 `readDesignerStatePresetSource(manifest)`，从外观区读出键表。
  - `host-kit`：`IntentCatalogMaterial.statePreset` 可选；阈值状态按它生成外观，与设计器「按分级生成状态」一致，缺省退回只换文字色。三端示例宿主的目录摘要带上键表。
  - `tooling/screen-mcp-server`：`compile_screen_intent` 接受 `capabilities` 与数据集样本 `values`，返回编译出的 `behaviors`，说明里写明联动、阈值状态与 `gaps`；新增 `simulate_blueprint`（一个事件及其级联的模拟，返回各层触发的规则与结束时变了的变量、显隐、数据源参数）。冒烟检查更新为 17 个工具。

### Patch Changes

- Updated dependencies [5e27baa]
- Updated dependencies [7bfdce9]
- Updated dependencies [6deb116]
- Updated dependencies [1d6b802]
  - @base-screen/contracts@0.3.0

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

- 253e4c3: Add canonical Blueprint graph layout metadata and a capability-gated component visibility action,
  including ordered runtime effects, trace output, renderer transitions, and reference cleanup.
- b9d0b80: Add the agent-fusion change flow to the designer: transaction provenance, ghost-draft proposals with
  unit-level adoption, pointer-based history revert, the right-pane changes tab, the intent composer with
  scope confirmation, review mode, target-display overlays, presentation lock, and host-defined scene
  switching with ghost preview and one-transaction apply.
- 8537e4b: Replace persisted Blueprint rules with first-class component relations: canonical `blueprint.relations`
  (behavior and semantic), runtime rule derivation without persistence, legacy rules migration, a
  relationship-first canvas with component/variable/host nodes, semantic and containment edges, and
  updated host canvas examples.
- af22711: Add document-level data source commands and value-reference evaluation to Core.

  - `replace-data-sources` replaces the whole `dataSources` collection with structural sharing (instances
    whose content did not change stay reference-equal), and `ScreenComponentPatch` gains `dataValue` /
    `dataBinding` so a component can point at an instance output.
  - Net component changes now include the components that read a rewritten instance
    (`componentsReferencingDataSources`), because the value lives on the instance chain rather than on the
    component.
  - `evaluateScreenValueRef` / `collectScreenValueRefDependencies` / `validateScreenDataBinding` land in
    `core/data/value-ref.ts`; `core/data/host-dataset.ts` keeps only re-exports of the same implementations
    until the renderer asks the host per instance.
  - `MAX_DATA_SOURCE_VALUE_BYTES` is now part of the contracts public surface so Core and the parser share
    one byte budget.

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

- e12e6cb: Keep thin components clickable on the canvas. `hitTestScreenComponents` accepts an optional
  `minimumThickness` that widens the hit band of under-thin axes in the component's local frame, so a
  2px `base.rule` divider or a hairline-bordered container still has a target after zooming out. The
  gesture controller uses it only as a fallback when the DOM hit lands on nothing: a 10 screen-pixel
  band is converted back to canvas units, so the feel is the same at any zoom level, while ordinary
  components keep hit-testing strictly inside their own box and blank clicks still start a marquee.
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

- 061fa02: Add a single source for canvas background capability.

  Canvas background was described in five places (contract schema, Core patch whitelist, designer palette,
  agent rules/tool schema, three host compilers). When the contract grew gradients, the last two went silent
  instead of failing: the agent answered "画布只支持纯色" for a capability that already shipped.

  - `SCREEN_CANVAS_FIELDS` and `SCREEN_CANVAS_BACKGROUND_TYPES` are now public. The field list is referenced
    by `core` instead of being copied, and the type list is derived from the zod background schema so a new
    background form cannot appear in only one of them.
  - `isScreenCanvasPaletteColor` / `isScreenCanvasBackground` expose the palette and gradient rules (stops,
    ascending positions, angle/position bounds) so hosts validate with the contract instead of hand-written
    regexes that accepted values the renderer cannot draw (`#12345`).

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

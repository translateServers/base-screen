# @base-screen/renderer

## 0.2.0

### Minor Changes

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
- Updated dependencies [c27b41a]
- Updated dependencies [1b328e6]
- Updated dependencies [7b9d601]
- Updated dependencies [7b9d601]
- Updated dependencies [7b9d601]
- Updated dependencies [591d730]
- Updated dependencies [7b9d601]
- Updated dependencies [aa547bf]
- Updated dependencies [c213715]
- Updated dependencies [6405a3d]
- Updated dependencies [c213715]
  - @base-screen/contracts@0.2.0
  - @base-screen/core@0.2.0
  - @base-screen/plugin-core@0.2.0

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

- e12e6cb: Add host material catalog hot refresh per ADR-0090: `plugin-core` compares two catalogs by type and
  separates manifest-only changes from constructor/tagName/adapter changes; `renderer` validates a
  candidate catalog against the current document and swaps it without disposing the runtime, remounting
  only changed implementations and preserving data-source state for unchanged types; the Designer gains
  `refreshCatalog(catalog)`, which preflights schema, library grouping, children capability and
  blueprint event references, then re-renders or rolls back atomically.
- afc60b0: Add host-driven realtime conditional styling. `BaseScreenViewerElement.refreshConditionalStyles()`
  and `BaseScreenDesignerElement.refreshConditionalStyles()` re-evaluate the current
  `conditionalStylePort` snapshot for mounted materials without refetching data, touching the canonical
  document, or recording history. The Designer preview now receives the same host port, and the port
  contract documents that hosts must publish a new alarm/visual snapshot before invalidating. The
  examples demonstrate SSE alarm snapshots → port → style-only refresh across the vanilla, React and
  Vue hosts.

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

### Patch Changes

- 253e4c3: Add canonical Blueprint graph layout metadata and a capability-gated component visibility action,
  including ordered runtime effects, trace output, renderer transitions, and reference cleanup.
- 8537e4b: Replace persisted Blueprint rules with first-class component relations: canonical `blueprint.relations`
  (behavior and semantic), runtime rule derivation without persistence, legacy rules migration, a
  relationship-first canvas with component/variable/host nodes, semantic and containment edges, and
  updated host canvas examples.
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

- f72a47b: Add a `componentFailurePolicy` renderer option. The viewer uses `skip` so one invalid
  component no longer blanks the whole screen; render diagnostics are returned with the
  successful render and surface through `base-screen-diagnostic` for host error UI.
- 81c3cea: Derive viewer variables from data source instances and drop the host batch-resolve path.

  - `ViewerVariableController` computes every variable from the document's value reference: `inline`
    values come from the document, `data-source-field` values from `DataSourceRuntime` (one cache, via
    `renderer.evaluateValueRef`); an unsettled or failed instance falls back to `initialValue` instead of
    writing `undefined`. When an instance settles, only the variables that depend on it are recomputed and
    pushed — and only when the value actually changed.
  - `viewer-host-variable-resolution.ts` and the host batch resolve are gone; `refreshVariables()` now
    refreshes the instances that derived variables depend on (a pure `inline` document makes no host call).
  - New `ViewerDataSourceScheduler` owns `updatePolicy.mode === 'auto'`: one `setTimeout` chain per instance,
    viewer-only, suspended on disconnect and disposed on unload.
  - Variable writes (`handle.set` and blueprint `set-variable`) share one guard: `controlled: false` returns
    the new `VARIABLE_WRITE_FORBIDDEN` diagnostic.
  - `BaseScreenRenderer` gains `prepareDataSources` / `refreshDataSource` / `readDataSourceValue` /
    `isDataSourceSettled` / `evaluateValueRef` and an `onDataSourceSettled` option so the viewer can prime a
    document's variable instances and render once, instead of fetching twice.

- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [8537e4b]
- Updated dependencies [af22711]
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
- Updated dependencies [81c3cea]

  - @base-screen/contracts@0.1.0
  - @base-screen/core@0.1.0
  - @base-screen/plugin-core@0.1.0

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

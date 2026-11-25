# @base-screen/plugin-sdk

## 0.2.0

### Minor Changes

- 9eec106: 在线作者面（base-screen-docs ADR-0105）：

  - 物料规格 `BaseScreenMaterialSpec` 与 `parseBaseScreenMaterialSpec` / `compileBaseScreenMaterialSpec`：字段按分区声明（分区决定 props / style 与检查器分段），控件由推导决定，读数格式走配置组，数据形状为无 / 单值 / 多行（按角色）；派生 `createBaseScreenMaterialSpecDataAdapter`、`normalizeBaseScreenMaterialSpecValue`、`createBaseScreenMaterialSpecSampleDataset`。
  - 渲染函数物料：`createBaseScreenRenderedMaterialPresenter`、`createBaseScreenRenderedMaterialElement`、`createBaseScreenSpecMaterialDefinition`、`formatBaseScreenMaterialNumber`。骨架统一四态、重绘与失败隔离，作者只写数据就绪时的绘制。
  - 体检：`auditBaseScreenMaterialSpec`（原子判定、门禁规则、表单审计与渲染代码静态检查）、`auditBaseScreenFragment`（组合 F 规则），结论类型 `BaseScreenAuthoringFinding` 与 `sortBaseScreenAuthoringFindings` / `hasBaseScreenAuthoringErrors`。
  - 样式键词典运行时副本 `BASE_SCREEN_STYLE_KEY_DICTIONARY` / `BASE_SCREEN_REGISTERED_STYLE_KEYS` / `BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS`；词典新增趋势语义色 `positiveColor` / `negativeColor`。
  - 读数格式配置组的 `prefix` / `unit` 接受字符串作为默认值。

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

### Patch Changes

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
  - @base-screen/plugin-core@0.2.0

## 0.1.0

### Minor Changes

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

- bcc37a0: 把物料非 ready 态的呈现收敛到一处：`@base-screen/plugin-sdk` 新增状态视图
  （`createBaseScreenMaterialStateView` / `createBaseScreenMaterialErrorView` /
  `createBaseScreenMaterialEmptyView`），loading 视图与公共加载容器从 `@base-screen/material`
  迁到 plugin-sdk，`@base-screen/material` 与 `@base-screen/sdk/material` 继续按原名 re-export。
  官方物料与大屏组件插件不再各写一份占位文案：`idle` 占位但不给文案（此前被当成「暂无数据」），
  `error` 直接呈现 contracts 侧已脱敏的 `message` 并把 `code` 落到 `data-*` 属性。
  官方物料基类另收一个受保护的盒面方法，形状与容器共用同一套填充/边框/渐变叠加/圆角/阴影实现。
  不改变 canonical 文档、Manifest 字段或物料 ABI。
- 14fc8cd: Consolidated record of four changes that established the peripheral plugin zone and the first real consumer of the plugin author surface.

  ### plugin-board-materials

  Add `@base-screen/plugin-board-materials`: a peripheral plugin that ships four large-screen
  widgets (digital flop, scroll board, water level, decorative border box), its own inspector
  control, and a document-transaction command.

  It fills a gap left by the two existing peripheral plugins: `plugin-echarts` is the
  rendering-class plugin that carries a third-party dependency, `plugin-metrics` is the
  declarative plugin with no DOM at all — this one is the rendering-class plugin with **zero**
  third-party dependencies, proving that a plugin can deliver real product content (not just a
  test probe) using only native DOM/SVG.

  The plugin also exercises the plugin-sdk author path end-to-end (`definePlugin` validates its
  manifest at construction), contributes an `inspectorControl` that it authorizes for its own
  material's `control: 'custom'` field, and ships a command that reads the current selection and
  commits an undoable `update-components` transaction.

  ### board-widgets-atomic

  Make the large-screen widgets atomic: remove every built-in title.

  Each widget now does exactly one thing. `board.digital-flop` shows a number,
  `board.water-level` shows a level, `board.scroll-board` scrolls tabular rows,
  `board.border-box` draws a frame. None of them renders a title or description
  anymore; the host composes a title by placing a `base.text` next to the widget,
  as the feature case now demonstrates.

  Built-in titles were the wrong default: they locked the widget's internal layout
  (and its padding) to one specific arrangement, could not be wrapped, styled or
  aligned independently of the widget, and made the widget unusable in any context
  that did not want a heading. Atomic widgets compose in more directions.

  Removed props: `title` from all four widgets; `showTitleBar` from `board.border-box`.
  Removed styles: `titleColor`/`titleFontSize` (`fontSize` on the border box) from the
  matching widgets. `board.border-box`'s `fontSize` went with its title bar. Data-bearing
  props that are part of the reading itself (`prefix`/`suffix` on the flop, the scroll
  board's header row) are kept — those are not descriptions.

  A unit test now pins the rule: no widget schema, default props, or property panel may
  declare a title-like field, so the constraint is executable rather than a convention.

  ### plugin-metrics-declarative-example

  Add `@base-screen/plugin-metrics`: a declarative, DOM-free peripheral plugin that
  declares a `dataResourceType` (`metricsSummary`, with a strict `configSchema`) and
  the `blueprintCapability` it needs. It complements `plugin-echarts` — that one is the
  rendering-class plugin with a third-party dependency; this one is the functional-class
  plugin with zero external dependencies and no custom element, so it builds and
  validation runs in any environment. The runtime validates its own manifest through
  `definePlugin`, making it the first end-to-end example of the plugin-sdk author path.

  ### full-stack-host-examples-and-vue-external-consumer

  Restructure `examples/` around a full-stack host case: one shared backend plus three
  feature-equivalent front ends, so the "how a host actually embeds Base Screen" path is
  executable rather than described.

  `examples/shared-backend` (NestJS + Prisma/SQLite) owns storage, retrieval and concurrency
  control: canonical Screen Documents are stored as opaque JSON behind a documented REST
  contract, `PUT` enforces a host-side `revision` optimistic lock, and a deterministic mock
  metrics endpoint feeds the bundled `host-resource` data binding. `examples/vanilla-host`,
  `examples/react-host` and `examples/vue-host` are pure static SPAs that consume only
  public `@base-screen/*` entries and implement the same three pages (list, designer edit with
  debounced autosave, read-only viewer), the same host project adapter, the same host data
  channel, and one host-owned `host-app.kpi-card` material each — written with a native custom
  element, a React bridge and a Vue SFC respectively, all under the same manifest, so one
  canonical document renders identically in all three.

  All three front ends run the same state machines through **zustand**: a list store
  (`idle → loading → ready` / `loading → error`, with `load` / `create` / `remove`) and a
  per-screen session store (`idle → loading → ready → dirty → saving → saved`, with
  `saving → failed` and `saving → conflict` branches) shared by the editor and viewer pages.
  The store semantics and the user-facing status text are identical across the three stacks;
  only the binding differs — `zustand`'s `create` plus selector subscriptions in React, the
  framework-agnostic `zustand/vanilla` store consumed through a `shallowRef`-based composable
  in Vue and through `subscribe` in the vanilla app.

  The infrastructure carrier moved out of `examples/` to make that structure honest:
  `examples/browser-harness` became `tooling/verification/browser-harness` (it is the repo's
  own feature matrix and Playwright evidence, not a usage example). Its gate is
  unchanged apart from the path. The minimal-Vanilla/Viewer consumer used by
  `pnpm verify:tarball` is now generated inline instead of copied from an example directory,
  so the gate no longer depends on the shape of `examples/`.

  `pnpm verify:tarball` copies `examples/vue-host` outside the repo, swaps every
  `@base-screen/*` dependency for the same-batch tarballs, and runs typecheck, build and a
  browser loop asserting registration, material rendering, host-resource data binding, the
  host project adapter's revision increment on save, and the viewer. The backend is stubbed
  through Playwright `page.route` for that gate — it exists to prove the published ABI and the
  host integration path, while backend behavior is covered by the jest unit and e2e suites
  shipped in `examples/shared-backend`. That makes it an external-consumer check rather than an
  in-repo example.

  Building these surfaced authoring friction worth recording: the designer must be connected
  to the DOM before `configure`/`load` or its canvas stays empty; every ancestor in the height
  chain needs a definite height; `update-components` replaces `props` wholesale, so partial
  patches drop required fields; a material's render box is pinned to the canonical
  `component.size`, so materials must not write `width`/`height`; the React bridge does not
  propagate document styles into the designer shadow root (the Vue bridge does), so React
  materials must be self-styled; and `vue-tsc` cannot yet run on the repo's TypeScript 7, so
  the Vue example pins TypeScript 5.9 for its own typecheck. These are documented in the
  example READMEs.

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
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [81c3cea]

  - @base-screen/contracts@0.1.0
  - @base-screen/plugin-core@0.1.0

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

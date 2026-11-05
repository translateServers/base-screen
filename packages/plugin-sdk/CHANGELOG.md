# @base-screen/plugin-sdk

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

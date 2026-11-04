# @base-screen/sdk

## 0.1.0

### Minor Changes

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

- bcc37a0: 官方物料集新增分割线 `base.rule`（`base-screen-rule`，另开 `./rule` 子路径）：一条线是这个物料
  的全部职责——不填充、不带标题、不描边框，因此与 `base.rectangle` 不重叠（矩形负责一块面，本物料
  负责一条线）。方向由 `props.axis`（`horizontal` / `vertical`）决定，线沿盒子一边绘制；`color` /
  `thickness` / `dash` / `opacity` 属样式。此前只能用 1px 矩形假冒分割线，而矩形的填充与圆角无法关闭。
  渲染仍遵守渲染盒不变式：物料只写自身内部样式，宽高由渲染器按 canonical `component.size` 写入。
  `@base-screen/sdk` 的自动注册随其生效。不改变 canonical 文档契约与物料 ABI。

### Patch Changes

- b9d0b80: Add the agent-fusion change flow to the designer: transaction provenance, ghost-draft proposals with
  unit-level adoption, pointer-based history revert, the right-pane changes tab, the intent composer with
  scope confirmation, review mode, target-display overlays, presentation lock, and host-defined scene
  switching with ghost preview and one-transaction apply.
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
- f72a47b: Add a `componentFailurePolicy` renderer option. The viewer uses `skip` so one invalid
  component no longer blanks the whole screen; render diagnostics are returned with the
  successful render and surface through `base-screen-diagnostic` for host error UI.
- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [f2f4976]
- Updated dependencies [8537e4b]
- Updated dependencies [a36a9fa]
- Updated dependencies [af22711]
- Updated dependencies [14fc8cd]
- Updated dependencies [fec0c41]
- Updated dependencies [f06fc5c]
- Updated dependencies [fec0c41]
- Updated dependencies [c78ecea]
- Updated dependencies [14fc8cd]
- Updated dependencies [ec4582a]
- Updated dependencies [df083f5]
- Updated dependencies [7b82b87]
- Updated dependencies [13a9c3d]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [e12e6cb]
- Updated dependencies [e468741]
- Updated dependencies [5c3b99b]
- Updated dependencies [a36a9fa]
- Updated dependencies [bcc37a0]
- Updated dependencies [14fc8cd]
- Updated dependencies [bcc37a0]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [79fbf58]
- Updated dependencies [7b82b87]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [748e133]
- Updated dependencies [f72a47b]
- Updated dependencies [81c3cea]
  - @base-screen/contracts@0.1.0
  - @base-screen/core@0.1.0
  - @base-screen/engine@0.1.0
  - @base-screen/plugin-manager@0.1.0
  - @base-screen/renderer@0.1.0
  - @base-screen/material@0.1.0
  - @base-screen/plugin-sdk@0.1.0

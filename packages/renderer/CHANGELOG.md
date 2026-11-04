# @base-screen/renderer

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

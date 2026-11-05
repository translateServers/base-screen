# @base-screen/engine

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

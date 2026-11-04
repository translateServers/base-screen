# @base-screen/plugin-core

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

  Make the host Skill kit adoptable by an external project without cloning Base Screen.

  `skills/` lived only in the source repository — no package tarball carried it — so an external host
  had to clone Base Screen before it could use agent-assisted authoring. `pnpm pack:host-skill-kit`
  now emits a self-contained `base-screen-host-skill-kit/` directory plus a matching `.tgz`: the two
  generators, the coordinator, the shared helpers and the six host-skill manuals. Verified end to end
  against a fresh host with no Base Screen checkout — the kit installs, both Skills generate, offline
  `verify` passes, and the generated material Skill's own validator accepts a real host material while
  rejecting a duplicate type.

  Two prerequisite defects found by that run and fixed:

  - The stated package set was incomplete. Even for a native material the generated Skill tells authors
    to call `createMaterialDefinition`, which lives in `@base-screen/plugin-sdk`, yet only
    `contracts`/`core`/`plugin-core` were listed. `plugin-sdk` is now listed in the kit README,
    `docs/usage.md` §3.4 and the management Skill, with `react`/`vue` noted as conditional.
  - The kit README pointed at `docs/host-skill-manuals/` inside the Base Screen repository, which an
    external host cannot read. Those manuals now ship inside the kit and the README references them.

  Also extracted the package loader both generators had duplicated into
  `skills/shared/host-package-loader.mjs` (registered in the tooling manifest so it is distributed),
  and rewrote its failure message to name the required packages and both resolution routes instead of
  the previous bare "Cannot load @base-screen/contracts".

  Note for release: a packaged `@base-screen/*` tarball must never contain `file:` dependencies
  pointing at a supplier machine path. The generators resolve packages from any workspace, so what
  matters is that released tarballs carry either workspace-resolvable or registry-resolvable specs.

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

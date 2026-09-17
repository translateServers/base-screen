---
'@base-screen/contracts': minor
'@base-screen/engine': minor
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-pipeline': minor
'@base-screen/plugin-sdk': minor
---

Consolidated record of eight changes to the plugin runtime and its contribution surface: runtime contributions, registration orchestration, activation semantics, the capability pipeline, the authoring wiring for resource types, and the panel element contract.

### plugin-runtime-contributions

Let plugins contribute runtime behaviour, not just interfaces (ADR-0076).

Until now every contribution kind landed on the **authoring surface** (material, panel,
inspectorControl) or on **resource types** (dataResourceType). A plugin could add a widget
but could not participate in what a document *does*. Two capabilities were declared in the
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

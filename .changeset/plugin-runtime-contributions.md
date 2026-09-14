---
'@base-screen/contracts': minor
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-sdk': minor
'@base-screen/plugin-pipeline': minor
---

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

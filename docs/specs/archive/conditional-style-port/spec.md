# Conditional Style Port Spec

> 归档：2026-08-30（已完成）
> Status: Active
> Updated: 2026-08-17
> Authority: [ADR-0059](../../../decisions/ADR-0059-conditional-style-port.md)
> Related: [ADR-0058](../../../decisions/ADR-0058-component-conditional-style-rules.md),
> [ADR-0016](../../../decisions/ADR-0016-material-appearance-authoring-contract.md),
> [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)
> Tasks: [tasks.md](./tasks.md)
> Acceptance: [checklist.md](./checklist.md)
> Matrix: [test-matrix.md](./test-matrix.md)

## Goal

Let hosts own both alarm decision rules and their visual mapping while the screen consumes only the
result: a synchronous pure-function `conditionalStylePort` resolved by the Renderer at the ADR-0058
effective-style projection point, merged after the base style and document `styleRules`, with zero
document/Blueprint contract changes.

## Requirements

### P1 Contracts (plugin-core)

plugin-core SHALL export `BaseScreenConditionalStyleRequest` (`componentId: string`;
`dataState: BaseScreenMaterialDataState`) and `BaseScreenConditionalStylePort`
(`resolve(request): ScreenJsonObject | undefined`). The port SHALL NOT enter contracts, the document,
JSON Schema, or serialization. No new limits, dependencies, or packages SHALL be introduced.

### P2 Renderer projection

The Renderer SHALL accept an optional `conditionalStylePort` and, at each effective-model resolution
(first mount, reconcile, dataState update), call `resolve` once per component with the component id
and its full current `dataState` (including idle/loading/error). The effective style SHALL merge in
the fixed order base style → matched document `styleRules` → port overrides, later writes winning
per key. A port result SHALL be validated by merging it over the base + matched-rules style and
passing the same Manifest `styleSchema` validation path as ADR-0016 decision 6: an invalid override
SHALL be ignored for that evaluation (base + rules result kept), reporting one error diagnostic
through the existing channel with the component identified. A `resolve` exception SHALL be isolated
identically: overrides ignored, one diagnostic, the render continues, and other components are
unaffected. The effective style SHALL remain runtime-only and SHALL NOT be written back to the
document or create history entries. Instances without a port SHALL behave byte-identically to today.

### P3 Viewer and Designer configuration

`BaseScreenViewerConfiguration` and `BaseScreenDesignerConfiguration` SHALL gain an optional
`conditionalStylePort`. `configure` SHALL validate its shape (object with a `resolve` function)
before any mutation; an invalid port SHALL fail the whole configure with zero side effects. Both
elements SHALL expose a guarded setter (rejected after Renderer initialization with a lifecycle
diagnostic) and a read-only getter, mirroring `resourcePort`. A configured Designer SHALL preview
host alarm styles on the design canvas through the same Renderer path.

### P4 Host integration

Hosts SHALL implement `resolve` as a synchronous pure function of `(componentId, dataState)`; async
data SHALL flow through `resourcePort`/`refreshData` to produce a new `dataState` that naturally
re-evaluates the port. The browser harness SHALL demonstrate a host-owned threshold mapping via the
port (value crossing a boundary flips color and returns when it crosses back), alongside the existing
document-rules demo, with no style knowledge in the document for the port-driven component.

### P5 Quality

Focused tests SHALL cover renderer merge order, non-ready dataStates reaching the port, invalid
override fail-closed behavior, exception isolation, and configure validation for both elements.
`pnpm verify:m0` SHALL pass, and the test matrix SHALL map every requirement to its evidence.

## Non-goals

- Alarm decision logic, thresholds, hysteresis, or notifications (inside the host port).
- Async resolve, caching protocols, or port lifecycle management.
- Conditional props, geometry, or visibility; Blueprint trigger/action changes; `styleRules`
  document contract changes.
- New dependencies or packages.

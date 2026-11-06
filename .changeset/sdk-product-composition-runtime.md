---
'@base-screen/sdk': minor
---

Add an optional product composition layer for host integration.

`createBaseScreenRuntime()` registers the product elements and official materials, activates plugins through one
authorization plan, and exposes the merged catalog and contribution surfaces. `mountDesigner()` and `mountViewer()`
append, configure, initialize, and release elements through a tracked handle while preserving the full element API.
`createBaseScreenDesignerMountController()` and `createBaseScreenViewerMountController()` add a framework-agnostic
attach/detach lifecycle for thin host bindings, including option snapshots, diagnostics, and async detach races.
`adoptBaseScreenRuntime()` projects an already-active host manager and catalog into the same runtime shape without
re-activating plugins, while `@base-screen/sdk/plugin-core` re-exports plugin contracts so hosts do not need a direct
`@base-screen/plugin-core` dependency.

The existing `defineBaseScreen*()`, `configure()`, port, slot, command, and manual lifecycle APIs remain unchanged.

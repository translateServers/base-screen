---
'@base-screen/sdk': minor
'@base-screen/renderer': minor
'@base-screen/engine': patch
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

Designer mounts infer official tool and group roles from the active catalog and honor explicit overrides. Each runtime
owns at most one Designer session; a second mount fails without replacing the first session's plugin binding.
`setCatalog()` refreshes inherited mounted catalogs by default, rolls back earlier updates on failure, and supports an
explicit `future-mounts` target. Viewer `refreshCatalog()` preserves document and data state. Mount controllers keep
other options as initialization snapshots and serialize pending attach/detach operations.

Explicit `blueprintCapabilities` and `createBaseScreenBlueprintCapabilityPlugin()` derive contributions and grants
from one capability list. SDK entrypoints expose the public configuration and host event types needed by consumers.
Designer main, ghost, and preview renderers receive the same host data ports, and initialized dataset ports cannot be
silently replaced. Disposal is idempotent under reentrant cleanup and still releases the host when unbinding fails.

The existing `defineBaseScreen*()`, `configure()`, port, slot, command, and manual lifecycle APIs remain available.

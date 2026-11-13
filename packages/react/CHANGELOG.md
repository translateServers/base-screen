# @base-screen/react

## 0.1.0

### Minor Changes

- 061fa02: Let host assembly arrive late without a render gate.

  `BaseScreenDesigner` and `BaseScreenViewer` now take `runtime` and `mountOptions` as `null`. A `null` input means
  "not ready yet": the component mounts nothing, keeps diagnostics empty, and renders `renderFallback` / the
  `fallback` slot if the host provides one. As soon as both inputs are non-null it mounts through the same
  controller; setting either back to `null` releases the current mount handle without disposing the shared runtime.
  `null → value` is an identity change, exactly like a new `remountKey`.

  Ports and the project adapter must be submitted in one `configure` pass, and hosts assemble them asynchronously
  (plugin manager activation, alarm snapshots, project metadata). Until now every host had to gate the component
  itself — an early return with a placeholder `<div>` in React, `v-if` plus a placeholder node in Vue. That gate is
  now part of the component contract, so a host expresses "not ready" by passing `null` instead of hiding the
  component, and the placeholder disappears from both examples.

- 061fa02: Add thin BaseScreenDesigner and BaseScreenViewer components for the SDK composition layer.

  The components bind `createBaseScreenDesignerMountController()` and
  `createBaseScreenViewerMountController()` to React and Vue lifecycles. They expose mount options, diagnostics,
  mounted handles, and explicit remount keys while leaving catalog, document, plugin, command, and port behavior in
  `@base-screen/sdk`. Unmounting a component releases only its own mount handle, never the shared runtime.

  Catalog changes refresh the mounted element after framework commit instead of remounting it. Other configuration
  changes update the next initialization snapshot; runtime, document/project identity, provided element, and explicit
  remount keys control remounting. Pending cleanup completes before a replacement controller mounts.

  React materials accept `wrapRoot(node, model)` for host Providers. Vue materials accept `configureApp(app)` for
  plugins and dependency injection, and recover cleanly after configuration failures. Vue component exports retain
  required props, precise mounted-handle callbacks, and typed fallback slots with declarations compatible with the
  minimum Vue peer version.

- 061fa02: Reduce host integration protocol and lifecycle boilerplate while retaining the full element API.

  Engine exposes an isolated, lightweight authoritative project snapshot and change event. Designer mount controllers and framework components project the accepted initial snapshot and subsequent state through `onProjectState`, without a duplicate project read or host state machine. Failed normalized-document commits retain the previous project revision.

  Mount diagnostics carry the actual failure phase, instance availability and recovery mode through controllers, framework callbacks and fallback rendering. Existing one-argument diagnostics callbacks remain supported. Catalog refresh failures retain the active instance; configuration, project load and teardown failures have distinct contexts.

  Standard runtimes accept framework bridge catalog entries directly, preserving tabular data adapters through the existing registration and authorization plan. Full host examples use one standard runtime and tracked mounts, with online-material changes committed through `setCatalog`.

  Host-kit adds transport-neutral project and dataset adapters over existing host business callbacks. REST adapters reuse the same migration, contract validation, cancellation and error handling. Validated-result observers receive isolated request data, results and errors; observer mutations or failures cannot alter the port result. Host-owned business requests, authorization, persistence, asset management and alarm transports remain outside Engine. Query operations also receive their per-request execution context, preserving host tracing and project revision audit without shared state.

  Restore the ten stable `plugin.chart.*` chart-family identities already consumed by the production host, including their manifests, dataset adapters and ECharts options, so upgrading the host does not silently remove existing charts.

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

## 0.0.1

### Patch Changes

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
- Updated dependencies [bcc37a0]
- Updated dependencies [14fc8cd]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [81c3cea]
  - @base-screen/contracts@0.1.0
  - @base-screen/plugin-core@0.1.0
  - @base-screen/plugin-sdk@0.1.0

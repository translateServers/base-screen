---
'@base-screen/react': minor
'@base-screen/vue': minor
---

Add thin BaseScreenDesigner and BaseScreenViewer components for the SDK composition layer.

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

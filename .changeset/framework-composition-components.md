---
'@base-screen/react': minor
'@base-screen/vue': minor
---

Add thin BaseScreenDesigner and BaseScreenViewer components for the SDK composition layer.

The components bind `createBaseScreenDesignerMountController()` and
`createBaseScreenViewerMountController()` to React and Vue lifecycles. They expose mount options, diagnostics,
mounted handles, and explicit remount keys while leaving catalog, document, plugin, command, and port behavior in
`@base-screen/sdk`. Unmounting a component releases only its own mount handle, never the shared runtime.

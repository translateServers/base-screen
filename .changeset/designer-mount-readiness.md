---
'@base-screen/react': minor
'@base-screen/vue': minor
---

Let host assembly arrive late without a render gate.

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

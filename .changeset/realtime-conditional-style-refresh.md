---
'@base-screen/renderer': minor
'@base-screen/engine': minor
'@base-screen/plugin-core': patch
---

Add host-driven realtime conditional styling. `BaseScreenViewerElement.refreshConditionalStyles()`
and `BaseScreenDesignerElement.refreshConditionalStyles()` re-evaluate the current
`conditionalStylePort` snapshot for mounted materials without refetching data, touching the canonical
document, or recording history. The Designer preview now receives the same host port, and the port
contract documents that hosts must publish a new alarm/visual snapshot before invalidating. The
examples demonstrate SSE alarm snapshots → port → style-only refresh across the vanilla, React and
Vue hosts.

---
'@base-screen/renderer': patch
'@base-screen/sdk': patch
---

Add a `componentFailurePolicy` renderer option. The viewer uses `skip` so one invalid
component no longer blanks the whole screen; render diagnostics are returned with the
successful render and surface through `base-screen-diagnostic` for host error UI.

---
'@base-screen/plugin-manager': minor
---

Add lazy plugin activation: `activation: 'lazy'` defers plugin activate() hooks until
their contributions are first used through the manager (contribution commands, panel
actions) or an explicit `ensureActive(pluginId)`, which activates the declared dependency
chain in topological order. Preflight and catalog publication are unchanged, so
authorization is never relaxed; lazy failures land in snapshot.failures and refuse retry.
Eager remains the default.

---
'@base-screen/plugin-core': patch
---

Widen `BaseScreenPluginPanelElement['model']` to `BaseScreenPluginDesignSnapshot | undefined` so
it matches the Engine's real write ordering. The Engine mounts a panel element (firing
`connectedCallback`) and only afterwards writes the snapshot, and it writes nothing at all
while the document is not ready — so a panel that trusted the previous non-optional type
and read `this.model` on connect would throw. The two shipped panel examples
(`plugins/plugin-echarts`, the browser-harness fixture) are updated to return
`undefined` honestly and degrade in render, and `docs/usage.md` now documents the panel
lifecycle contract alongside the injection-control contrast (controls are given their
model before being attached, so they are unaffected).

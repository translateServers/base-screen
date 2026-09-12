---
'@base-screen/plugin-metrics': minor
---

Add `@base-screen/plugin-metrics`: a declarative, DOM-free peripheral plugin that
declares a `dataResourceType` (`metricsSummary`, with a strict `configSchema`) and
the `blueprintCapability` it needs. It complements `plugin-echarts` — that one is the
rendering-class plugin with a third-party dependency; this one is the functional-class
plugin with zero external dependencies and no custom element, so it builds and
validation runs in any environment. The runtime validates its own manifest through
`definePlugin`, making it the first end-to-end example of the plugin-sdk author path.

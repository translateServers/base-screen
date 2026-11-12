---
'@base-screen/engine': minor
'@base-screen/sdk': minor
'@base-screen/react': minor
'@base-screen/vue': minor
'@base-screen/host-kit': minor
'@base-screen/plugin-echarts': minor
---

Reduce host integration protocol and lifecycle boilerplate while retaining the full element API.

Engine exposes an isolated, lightweight authoritative project snapshot and change event. Designer mount controllers and framework components project the accepted initial snapshot and subsequent state through `onProjectState`, without a duplicate project read or host state machine. Failed normalized-document commits retain the previous project revision.

Mount diagnostics carry the actual failure phase, instance availability and recovery mode through controllers, framework callbacks and fallback rendering. Existing one-argument diagnostics callbacks remain supported. Catalog refresh failures retain the active instance; configuration, project load and teardown failures have distinct contexts.

Standard runtimes accept framework bridge catalog entries directly, preserving tabular data adapters through the existing registration and authorization plan. Full host examples use one standard runtime and tracked mounts, with online-material changes committed through `setCatalog`.

Host-kit adds transport-neutral project and dataset adapters over existing host business callbacks. REST adapters reuse the same migration, contract validation, cancellation and error handling. Validated-result observers receive isolated request data, results and errors; observer mutations or failures cannot alter the port result. Host-owned business requests, authorization, persistence, asset management and alarm transports remain outside Engine. Query operations also receive their per-request execution context, preserving host tracing and project revision audit without shared state.

Restore the ten stable `plugin.chart.*` chart-family identities already consumed by the production host, including their manifests, dataset adapters and ECharts options, so upgrading the host does not silently remove existing charts.

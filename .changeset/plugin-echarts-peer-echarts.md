---
'@base-screen/plugin-echarts': patch
---

Declare `echarts` as a peer dependency (`^6.1.0`) instead of a bundled direct dependency, so the host's installed ECharts is shared and the plugin does not add a second copy. Hosts must install `echarts` themselves. See ADR-0097.

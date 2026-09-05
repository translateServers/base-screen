---
'@base-screen/contracts': patch
'@base-screen/engine': patch
'@base-screen/material': patch
'@base-screen/plugin-core': patch
'@base-screen/renderer': patch
'@base-screen/sdk': patch
---

Separate tabular datasets from generic host resources. Add `ScreenHostDatasetPort`, opaque dataset
publication identities, dataset-owned parameter constraints, host-defined catalog groups, and a
dedicated `dataset` document source. Designer and Viewer now share the same bounded metadata and query
lifecycle. Host resource types remain available for non-tabular resources.

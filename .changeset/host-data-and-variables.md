---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/engine': minor
'@base-screen/material': minor
'@base-screen/plugin-core': patch
'@base-screen/renderer': minor
'@base-screen/sdk': minor
---

Consolidated record of three changes to the host data boundary: the dataset port and parameter authority, global variable authoring, and host resource authoring intents.

### independent-dataset-consumption

Separate tabular datasets from generic host resources. Add `ScreenHostDatasetPort`, opaque dataset
publication identities, dataset-owned parameter constraints, host-defined catalog groups, and a
dedicated `dataset` document source. Designer and Viewer now share the same bounded metadata and query
lifecycle. Host resource types remain available for non-tabular resources.

### datav-global-variables

Expand global variable authoring with strict host catalogs, authoring previews, atomic renames,
explicit runtime refresh, and structured Blueprint value sources while keeping dynamic data
ownership with the host.

### host-resource-authoring-intents

Replace the legacy asset catalog adapter with strict host resource authoring intents,
viewport-centered insertion, validated native drag/drop, and dataSource-only replacement.
Resource discovery, permissions, previews, signing, and lifecycle remain host-owned.

---
'@base-screen/plugin-manager': minor
---

Drive the capability pipeline from a declarative table: `PLUGIN_CAPABILITY_DESCRIPTORS`
declares every supported capability once (id, required port factory, blueprint marker);
capability authorization, port compatibility and blueprintCapability contribution checks
all read the same table, so adding a capability is a one-row change.

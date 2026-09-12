---
'@base-screen/contracts': minor
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/engine': minor
---

Wire the dataResourceType contribution into the designer authoring surface: the runtime
contribution index can enumerate resource types, the data panel renders an authorized type
picker, and dataResourceType ids must satisfy the document resourceType name pattern so
authored sources parse as canonical documents.

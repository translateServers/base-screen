---
'@base-screen/contracts': patch
'@base-screen/core': patch
'@base-screen/engine': patch
'@base-screen/renderer': patch
---

Merge the host variable ports into a single source catalog port (D1) and make host request identity the
data source instance instead of the component.

- `ScreenHostVariablePort` + `ScreenHostVariableCatalogPort` become `ScreenHostCatalogPort`
  (`list` / `describe` / `resolve`); the `variableCatalog` and `variables` capabilities collapse into
  `hostCatalog`, and the variable-named request fields (`variableId`, `initialValue`, `controlled`,
  `processorId`, `autoUpdate`) are gone — those concepts belong to the document-level data source.
- `ScreenHostCatalogDescriptor` reuses `ScreenDatasetParameterDefinition` for `parameters` and can
  declare `readOnly`.
- `ScreenHostResourceRequest.componentId` and `ScreenDatasetQueryRequest.componentId` become
  `dataSourceId`; the designer/viewer pass the instance id of the component's value reference and fall
  back to the component id until the document-level instance path lands.
- Designer element and viewer expose `hostCatalogPort` instead of `variablePort` +
  `variableCatalogPort`; the variables panel reads entries through `readScreenVariableRecord`, so a
  single-form variable record renders in the existing groups.

---
'@base-screen/contracts': patch
'@base-screen/core': patch
---

Add document-level data source commands and value-reference evaluation to Core.

- `replace-data-sources` replaces the whole `dataSources` collection with structural sharing (instances
  whose content did not change stay reference-equal), and `ScreenComponentPatch` gains `dataValue` /
  `dataBinding` so a component can point at an instance output.
- Net component changes now include the components that read a rewritten instance
  (`componentsReferencingDataSources`), because the value lives on the instance chain rather than on the
  component.
- `evaluateScreenValueRef` / `collectScreenValueRefDependencies` / `validateScreenDataBinding` land in
  `core/data/value-ref.ts`; `core/data/host-dataset.ts` keeps only re-exports of the same implementations
  until the renderer asks the host per instance.
- `MAX_DATA_SOURCE_VALUE_BYTES` is now part of the contracts public surface so Core and the parser share
  one byte budget.

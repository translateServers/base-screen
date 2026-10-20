---
'@base-screen/plugin-core': patch
'@base-screen/renderer': patch
---

Resolve host data per document-level data source instance instead of per component.

- New `DataSourceRuntime` owns one entry per instance: request key, cached result, generation and
  in-flight slot. Two components that read the same instance with the same evaluated params share one
  host request and project it independently (`path` + `dataBinding` stay out of the request key), an
  unmounting reader no longer aborts the request, and `updatePolicy.mode:'once'` reuses a ready result
  on repeated renders.
- `SourceQueryPort` replaces the dataset-only port and dispatches by `ScreenDataSourceSource.kind` to the
  dataset, resource or catalog port; every request carries `dataSourceId`.
- `renderer-host-resource.ts` is gone: the remaining per-component work is projection
  (`renderer-data-source.ts`), while mounted state keeps only `projectionKey` + `dataState`.
- `plugin-core` gains `screenValueRefAccepted(capabilities, ref, source)`, the single mapping from a
  `ScreenValueRef` (plus its source) to the manifest's `dataCapabilities`; catalog sources count as
  `variable`, as they did before the port merge.

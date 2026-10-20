---
'@base-screen/contracts': patch
'@base-screen/renderer': patch
---

Derive viewer variables from data source instances and drop the host batch-resolve path.

- `ViewerVariableController` computes every variable from the document's value reference: `inline`
  values come from the document, `data-source-field` values from `DataSourceRuntime` (one cache, via
  `renderer.evaluateValueRef`); an unsettled or failed instance falls back to `initialValue` instead of
  writing `undefined`. When an instance settles, only the variables that depend on it are recomputed and
  pushed — and only when the value actually changed.
- `viewer-host-variable-resolution.ts` and the host batch resolve are gone; `refreshVariables()` now
  refreshes the instances that derived variables depend on (a pure `inline` document makes no host call).
- New `ViewerDataSourceScheduler` owns `updatePolicy.mode === 'auto'`: one `setTimeout` chain per instance,
  viewer-only, suspended on disconnect and disposed on unload.
- Variable writes (`handle.set` and blueprint `set-variable`) share one guard: `controlled: false` returns
  the new `VARIABLE_WRITE_FORBIDDEN` diagnostic.
- `BaseScreenRenderer` gains `prepareDataSources` / `refreshDataSource` / `readDataSourceValue` /
  `isDataSourceSettled` / `evaluateValueRef` and an `onDataSourceSettled` option so the viewer can prime a
  document's variable instances and render once, instead of fetching twice.

# Acceptance Checklist

- [x] Documents without `styleRules` parse, render, and round-trip byte-identically; no migration is required.
- [x] Rule parsing rejects unknown keys, more than 8 rules, duplicate ids, out-of-range id/path lengths, missing `value` for non-`exists` operators, present `value` for `exists`, and non-object style values, with no stripping or coercion.
- [x] The committed schema golden artifact reflects the `styleRules` contract.
- [x] `update-components` replaces `styleRules` wholesale, keeps locked-target rejection, and preserves net-change/no-op semantics with exactly one history entry per commit.
- [x] Renderer evaluates rules against the component's own `dataState.value` only: non-ready states match nothing, ordering operators apply only to finite numbers, `contains` applies only to strings/arrays, and type mismatches never error.
- [x] Matched rules merge in document order with per-key override; the merged effective style passes the material `styleSchema`; an invalid rule style fails closed with the mounted tree unchanged and an existing-channel diagnostic.
- [x] Effective style never enters the document, history, or dirty state.
- [x] Data refresh re-evaluates rules from retained raw values without new host requests; Viewer and Designer render identical results.
- [x] The inspector section edits path/operator/value/style with centralized UI text, stylePanel-driven controls (including the color palette), the 8-rule cap, single-transaction commits, and no layout jitter.
- [x] The section is absent for multi-selection and read-only for effectively locked components.
- [x] The browser harness demonstrates a threshold crossing both ways (trigger and restore) without host-side imperative style mutation.
- [x] Test matrix maps every requirement to committed automated evidence, and `pnpm verify:m0` passes.

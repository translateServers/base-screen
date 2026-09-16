---
'@base-screen/contracts': minor
'@base-screen/core': patch
'@base-screen/plugin-core': patch
'@base-screen/plugin-manager': patch
'@base-screen/plugin-sdk': patch
'@base-screen/sdk': patch
---

Give the diagnostic order a single source of truth. The canonical comparator lived in
`@base-screen/contracts` but was never exported, so four packages kept their own
line-for-line copies of the same ordering rules: `@base-screen/core`
(`internal/diagnostics.ts`), `@base-screen/plugin-core`, `@base-screen/plugin-manager` and
`@base-screen/plugin-sdk`. `contracts` now exports `compareScreenDiagnostics` and the
uncapped `sortScreenDiagnostics`, and those four copies are deleted in favour of imports.

The four copies were logically identical to the canonical comparator, so this changes no
ordering anywhere. Sorting limits and the `DIAGNOSTIC_LIMIT_REACHED` sentinel stay with
each caller: Contracts' collector is phase-aware and resolves the sentinel path from the
phase, while the plugin-side collectors use an empty path, so those are different
semantics and were deliberately not merged.

This is the first of a series consolidating shared semantics onto their owner. The two
remaining divergent copies — `packages/contracts/src/dataset/diagnostics.ts` and the
renderer's — sort by `path.join('/')` string comparison and therefore order
`['components',10]` before `['components',2]`. They are not touched here and are addressed
separately, because aligning them does change observable ordering.

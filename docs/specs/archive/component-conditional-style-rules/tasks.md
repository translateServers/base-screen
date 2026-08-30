# Tasks

- [x] R1: Add `ScreenComponentStyleRule` contract types, strict fail-closed parsing, serialization, and JSON Schema coverage; regenerate the schema golden artifact.
- [x] R2: Extend `ScreenComponentPatch` with `styleRules` whole-array replacement and verify locked-target and net-change semantics.
- [x] R3: Implement Renderer rule evaluation (path resolution, operator semantics, ordered merge, styleSchema fail-closed) and effective-style projection on initial render, adaptation, and data refresh.
- [x] R4: Implement the Designer inspector "条件样式" section: rule list, add/remove, path/operator/value editing, stylePanel-driven style controls, draft validation, and single-transaction commit.
- [x] R5: Demonstrate a threshold-warning component in the browser harness, including automatic re-evaluation and base-style restoration.
- [x] R6: Complete focused tests, update the test matrix, and pass `pnpm verify:m0`.
- [x] Register the capability in the active-spec index and the capability baseline document.

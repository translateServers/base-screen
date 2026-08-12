# Host Draft Material Workflow Test Matrix

| Area | Case | Evidence |
| --- | --- | --- |
| Handoff | Valid request/candidate/catalog association | `tests/material-handoff.test.ts` |
| Handoff | Unknown fields, path traversal, credential-like field, duplicate/mismatch | `tests/material-handoff.test.ts` |
| Handoff | Public manifest parser through standalone validator | `tests/material-handoff.test.ts` |
| Generator | Deterministic output and optional provenance compatibility | `tests/host-screen-skill-generator.test.ts`, `tests/host-material-skill-generator.test.ts` |
| Overlay | Explicit draft catalog and published-only rejection | `tests/host-screen-skill-generator.test.ts` |
| Overlay | Inconsistent duplicate type is rejected | generated `validate-screen-document.mjs` conflict branch |
| Adoption | Formal check/sync/verify, drift, failure atomicity, vendor guard | `tests/host-skill-adoption.test.ts` |
| Browser | Formal/draft package catalog, unload/reconfigure, publish preflight | `pnpm verify:browser` |
| Quality | Formatting, lint, types, tests, build, package/API/boundary/tarball gates | `pnpm verify:m0` |

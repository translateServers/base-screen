# Test Matrix

| Requirement | Automated evidence | Quality gate |
| --- | --- | --- |
| R1 Contracts | `packages/contracts/tests/document/document.test.ts`, `packages/contracts/tests/types/host.test.ts`, dataset contract tests, schema/serialize tests | contracts test, typecheck, schema golden |
| R2 Host adapter | `packages/contracts/tests/types/host.test.ts`, `packages/engine/tests/browser/controllers/designer-dataset-controller.test.ts` | contracts/engine tests and typecheck |
| R3 Core/materials | `packages/core/tests/data/host-dataset.test.ts`, `packages/plugin-core/tests/data-contracts.test.ts`, `packages/material/tests/index.test.ts`, renderer projection cases | core/plugin-core/material/renderer tests |
| R4 Viewer runtime | `packages/renderer/tests/renderer.test.ts` R4 request projection, variable blocking, refresh coalescing, timeout/late result cases; `viewer.test.ts` lifecycle guard | renderer test and typecheck |
| R5 Designer authoring | `packages/engine/tests/browser/controllers/designer-dataset-controller.test.ts` R5 source-mode, parameter transaction, and role binding cases; Playground/browser workflow verifies automatic descriptor restoration, host connection state, no preview action, stable inspector geometry, and fully visible dataset actions | engine test/typecheck and Playground/browser harness |
| R6 Harness/quality | `scripts/verify-browser-harness.mjs` table/chart, variable requery, refresh, safe failure, timeout, isolation; API/boundary/tarball checks | browser, API, boundary, tarball, `pnpm verify:m0` |

Every new case is named or annotated with R1-R6. Renamed or moved cases must update this matrix.

# Test Matrix

| Requirement | Automated evidence | Quality gate |
| --- | --- | --- |
| R1 Contracts | `packages/contracts/tests/document/document.test.ts` styleRules parse/serialize/bounds cases; schema golden diff | contracts test, typecheck, schema golden |
| R2 Core | `packages/core/tests/commands/apply.test.ts` styleRules patch, locked-target, and no-op cases | core test and typecheck |
| R3 Renderer | `packages/renderer/tests/renderer.test.ts` rule evaluation, ordered merge, non-ready/type-mismatch non-matches, styleSchema fail-closed, refresh re-evaluation without re-request | renderer test and typecheck |
| R4 Designer | `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts` conditional-style-rules rendering/editing/commit cases; `packages/engine/tests/common/operations/designer-style-rule-operations.test.ts` rule draft validation cases | engine test, typecheck, and lint (UI text scan) |
| R5 Harness | `scripts/verify-browser-harness.mjs` threshold crossing and base-style restoration | browser harness verification |
| R6 Quality | This matrix; `pnpm verify:m0` | format, lint, typecheck, test, build, packages, API, engine-import, tarball |

Every new case is named or annotated with R1-R6. Renamed or moved cases must update this matrix.

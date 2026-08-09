# Test Matrix

| Requirement | Automated evidence | Quality gate |
| --- | --- | --- |
| R1 Contracts | `packages/contracts/tests/document/document.test.ts`, `packages/contracts/tests/types/host.test.ts`, dataset contract tests, schema/serialize tests | contracts test, typecheck, schema golden |
| R2 Host adapter | `packages/contracts/tests/types/host.test.ts`, `packages/engine/tests/browser/controllers/designer-dataset-controller.test.ts` | contracts/engine tests and typecheck |
| R3 Core/materials | `packages/core/tests/data/host-dataset.test.ts`, `packages/plugin-core/tests/data-contracts.test.ts`, `packages/material/tests/index.test.ts`, renderer projection cases | core/plugin-core/material/renderer tests |
| R4 Viewer runtime | `packages/renderer/tests/renderer.test.ts` R4 request projection, variable blocking, and timeout/late-result cases; `viewer.test.ts` lifecycle guard. Reconciliation, refresh coalescing, and targeted-refresh correctness are NOT claimed by this matrix: the committed implementation has known defects (unchanged same-key renders can cancel in-flight requests; `refreshData(componentId)` can degrade into a full refresh) that are tracked and re-verified under the Data Runtime Hardening spec | renderer test and typecheck |
| R5 Designer authoring | `packages/engine/tests/browser/controllers/designer-dataset-controller.test.ts` R5 source-mode, parameter transaction, and role binding cases; `designer-style.test.ts` verifies sticky action containment; Playground/browser workflow measures automatic descriptor restoration, host connection state, no preview action, stable inspector geometry, and all four visible bounds of dataset actions | engine test/typecheck and Playground/browser harness |
| R6 Harness/quality | `scripts/verify-browser-harness.mjs` table/chart rendering, variable requery, safe failure, and instance isolation. Refresh/reconciliation/timeout evidence is NOT claimed here: the corrected state-machine semantics, real browser E2E, and query-count proof are re-verified under the Data Runtime Hardening spec; API/boundary/tarball checks | browser, API, boundary, tarball, `pnpm verify:m0` |

Every new case is named or annotated with R1-R6. Renamed or moved cases must update this matrix.

## 证据更正（2026-08-09）

本矩阵原先对 R4/R6 声明了未经验证的 reconciliation、刷新合并、定向刷新与浏览器 timeout 证据。
这些行为在真实宿主接入后被发现存在缺陷（相同资源的无关 render 可能取消 in-flight 请求；定向刷新
可能退化为全量刷新），因此相关证据改为由 [Data Runtime Hardening 测试矩阵](../data-runtime-hardening/test-matrix.md)
（生效中，证据状态 Planned）接管，包含 raw vs projection key、deferred render retention、定向/未知刷新、
共享/非共享请求、真实浏览器 E2E 与查询次数证明。本矩阵保留 R1-R3、R5 的既有证据与已完成任务，
不重写历史结论。

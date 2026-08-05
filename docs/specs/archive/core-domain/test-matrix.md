# Core Domain Test Matrix

> 状态：生效中
> 最近更新：2026-08-04
> 依据：[Core Domain Spec](./spec.md)、[tasks.md](./tasks.md)、[checklist.md](./checklist.md)

| Requirement | 自动化证据 | 质量门 |
| --- | --- | --- |
| R1 Document State | `history/history.test.ts` 的 `commits, undoes, and redoes document snapshots` | `pnpm --filter @base-screen/core test` |
| R2 不可变命令 | `commands/apply.test.ts` 的多目标更新与 mutable command JSON | 同上 |
| R3 fail closed 目标 | `commands/apply.test.ts` 的 missing target、reparent parent/cycle | 同上 |
| R4 locked 继承 | `commands/apply.test.ts` 的 locked descendant update/remove | 同上 |
| R5 transaction 原子性 | `commands/apply.test.ts` 的 rollback、limit、final net changes | 同上 |
| R6 history snapshot | `history/history.test.ts` 的 commit/undo/redo | 同上 |
| R7 redo branch | `history/history.test.ts` 的 branch after undo | 同上 |
| R8 状态隔离 | `state/state.test.ts` 的 viewport 与 interaction transitions | 同上 |
| R9 确定性几何 | `geometry/geometry.test.ts` 的 round trip、rotation、overflow | 同上 |
| R10 命中顺序 | `geometry/geometry.test.ts` 与 `hierarchy/hierarchy.test.ts` 的 painter/hit order | 同上 |
| R11 语义校验分层 | `validation/validate-semantics.test.ts` 与 `internal/document.ts` | 同上 |
| R12 纯包边界 | `package.test.ts`、`scripts/verify-tarballs.mjs` 的 Core consumer | `pnpm verify:tarball` |
| R13 Blueprint 纯 API | `blueprint/runtime.test.ts` 与 `scripts/check-api.mjs` | `pnpm check:api` |

`pnpm verify:m0` 聚合 format、lint、typecheck、test、build、边界、API 和 tarball 证据。测试到 Requirement 的反向映射以上表的文件及用例名称为准。

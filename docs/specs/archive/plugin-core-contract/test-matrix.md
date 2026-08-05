# Plugin Core Contract Test Matrix

> 状态：生效中
> 最近更新：2026-08-04
> 依据：[Plugin Core Contract Spec](./spec.md)、[tasks.md](./tasks.md)、[checklist.md](./checklist.md)

| Requirement | 自动化证据 | 质量门 |
| --- | --- | --- |
| R1 纯协议包 | `plugin-core.test.ts` 与 `scripts/verify-tarballs.mjs` 的 Plugin Core consumer | `pnpm verify:tarball` |
| R2 Material identity | `plugin-core.test.ts` 的 strict detached manifest 与 identity rejection | `pnpm --filter @base-screen/plugin-core test` |
| R3 纯数据 Manifest | `plugin-core.test.ts` 的 executable/cyclic/dangerous data rejection | 同上 |
| R4 Element Model | `packages/renderer` model write 和 browser harness 的 Material model assertions | `pnpm verify:browser` |
| R5 标准事件 | `plugin-core.test.ts` 的 event parser，`packages/renderer` event gate tests | `pnpm test`、`pnpm verify:browser` |
| R6 Material Catalog | `plugin-core.test.ts` 的 ordered, detached, duplicate, double-instance cases | `pnpm --filter @base-screen/plugin-core test` |
| R7 Plugin Manifest | `plugin-core.test.ts` 的 strict manifest, duplicate contribution, dependency cases | 同上 |
| R8 生命周期限权 | `packages/plugin-manager/tests/manager.test.ts` 的 activation rollback/session invalidation | `pnpm --filter @base-screen/plugin-manager test` |
| R9 Command Port | `packages/plugin-manager/tests/manager.test.ts` 的 session port invalidation | 同上 |
| R10 JSON/resource boundary | `packages/contracts/tests/json/json.test.ts` 与 Plugin Core event/manifest limits | `pnpm --filter @base-screen/contracts test` |
| R11 诊断确定性 | `plugin-core.test.ts` 的 deterministic cyclic event diagnostics | `pnpm --filter @base-screen/plugin-core test` |
| R12 框架中立声明 | package manifests、`scripts/check-boundaries.mjs`、tarball ATTW/publint | `pnpm verify:m0` |
| R13 Plugin Catalog | `plugin-core.test.ts` 的 ordered readonly plugin catalog snapshot | `pnpm --filter @base-screen/plugin-core test` |

`pnpm verify:m0` 聚合 format、lint、typecheck、test、build、边界、API 和 tarball 证据。测试到 Requirement 的反向映射以上表的文件及用例名称为准。

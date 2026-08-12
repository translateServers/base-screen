# 宿主托管物料包实施计划

> 状态：已实现
> 日期：2026-08-11
> 权威：[ADR-0029](../../../decisions/ADR-0029-host-managed-material-package-distribution.md)
> 规格：[Host Material Package Spec](../../../specs/archive/host-material-package/spec.md)

## 1. 范围

- 不新增第十三个核心 package；不把网络加载放进 Base Screen。
- plugin-sdk 增加 `createMaterialPackage` 注册辅助（创建期完整校验 + 显式 define）。
- browser-harness 演示宿主托管物料包的加载 → define → catalog → Viewer 闭环。

## 2. 文件变更

| 文件 | 内容 |
| --- | --- |
| `packages/plugin-sdk/src/index.ts` | `CreateMaterialPackageOptions`、`BaseScreenMaterialPackage`、`createMaterialPackage`、`defineMaterialPackage` 与诊断排序辅助 |
| `packages/plugin-sdk/tests/package.test.ts` | R1/R2 全部场景的 23 个聚焦用例（含预检无部分注册、上限、畸形输入、accessor 抛错、非法适配器、注册拒绝、排序确定性） |
| `examples/browser-harness/hosted-material-package.ts` | 模拟宿主托管的可信物料包（两个物料、auto-register 风格入口） |
| `examples/browser-harness/main.ts` | 宿主受控 `import()` 动态加载、define、构建独立 catalog、`createHostedPackageDemo` |
| `scripts/verify-browser-harness.mjs` | 1440 视口新增 `BROWSER_HARNESS_HOSTED_PACKAGE_FAILED` 断言 |
| `docs/decisions/ADR-0029-*.md`、`docs/specs/host-material-package/*`、`docs/plans/host-material-package/*`、`docs/usage.md` 等 | 决策、Spec 三件套、索引与集成说明 |

## 3. 验证

- `pnpm --filter @base-screen/plugin-sdk test && pnpm --filter @base-screen/plugin-sdk lint`
- `pnpm verify:fast`（format/format:check/lint/typecheck/test/build/check:packages/check:api/check:engine-import）
- `pnpm verify:browser`（含托管包断言）

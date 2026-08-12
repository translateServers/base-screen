# Test matrix

| Requirement | Scenario | Evidence |
| --- | --- | --- |
| R1 | create 校验通过、materials 冻结、id 透传、不触碰浏览器全局；define 注册并返回 entries | `packages/plugin-sdk/tests/package.test.ts`（creates a validated package… / define registers every material…） |
| R2 | 非法 id / 空列表 / 超过 512 项 / 非对象 options / 非数组 materials / 空 entry / accessor 抛错 / 非法适配器 / 重复 type / 重复 tagName / 非法 manifest / 静态 manifest 不一致 / 预检冲突无部分注册 / 注册拒绝 / 冲突诊断排序 / 无注册表 / 幂等 / 适配器透传 | `packages/plugin-sdk/tests/package.test.ts`（rejects an invalid package id … carries dataset adapters into catalog entries，23 用例） |
| R3 | 宿主受控 `import()` 动态加载 → define → 独立 catalog → Viewer 渲染闭环；不影响主 catalog | `examples/browser-harness/hosted-material-package.ts`（含 auto-register 风格入口）+ `examples/browser-harness/main.ts`（动态加载 + createHostedPackageDemo）+ `scripts/verify-browser-harness.mjs`（BROWSER_HARNESS_HOSTED_PACKAGE_FAILED 分支，1440 视口） |
| R4 | 演示文档只引用 `harness.hosted-badge` type；package id 不进文档 | `examples/browser-harness/main.ts`（createHostedPackageDemo 的 document fixture） |
| R5 | `pnpm verify:browser` 全流程通过，含托管包内容渲染断言 | `scripts/verify-browser-harness.mjs` |
| R6 | Draft package catalog composition, unload/reconfigure restoration, publication preflight | `examples/browser-harness/main.ts` + `scripts/verify-browser-harness.mjs` |

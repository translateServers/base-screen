# Material Library Host State Test Matrix

| Requirement | 场景 | 证据 |
| --- | --- | --- |
| R1 | 有效状态；未知字段；非法 status/count/type；重复与上限 | `packages/engine/tests/material-library-state.test.ts`；`designer-runtime-config.test.ts` |
| R2 | 未配置兼容；loading/ready/offline/partial/error/update 状态和动作 | `designer-workspace.test.ts`；`designer-runtime-config.test.ts`；`assertMaterialLibraryHostState` browser harness |
| R3 | 分类排序与筛选；搜索；草稿/不可用；无结果 | `designer-workspace.test.ts`；panel controller tests；`assertMaterialLibraryHostState` browser harness |
| R4 | retry/reload/details composed event；setter 仅更新 UI；catalog 不可变 | `designer-runtime-config.test.ts`；`assertMaterialLibraryHostState` browser harness |
| R5 | 公共导出和消费者兼容 | `public-api.test.ts`；check:api、check:boundaries、build、verify:tarball、verify:m0 |

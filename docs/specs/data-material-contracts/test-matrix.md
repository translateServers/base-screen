# Test Matrix

| Requirement | 自动化证据 | 质量门 |
| --- | --- | --- |
| R1 表格数据 | `data-contracts.test.ts` table dataset and duplicate column cases | `pnpm --filter @base-screen/plugin-core test` |
| R2 图表数据 | `data-contracts.test.ts` series/point cases | 同上 |
| R3 严格边界 | `data-contracts.test.ts` unknown field, duplicate id, invalid value cases | 同上 |
| R4 职责隔离 | public exports and package boundary typecheck | `pnpm --filter @base-screen/plugin-core typecheck` |
| R5 官方图表物料 | `packages/material/tests/index.test.ts` chart manifest, constructor and auto-register cases | `pnpm --filter @base-screen/material test` |
| R6 官方表格物料 | `packages/material/tests/index.test.ts` table manifest, constructor and auto-register cases | 同上 |
| R7 默认数据 | `plugin-core.test.ts` defaultData detached/unsafe cases；`renderer/tests/resource-state-machine.test.ts` R7 无数据源回退 case；`material/tests/index.test.ts` R7 官方示例数据契约 case | `pnpm --filter @base-screen/plugin-core test` + `pnpm --filter @base-screen/renderer test` + `pnpm --filter @base-screen/material test` |
| R8 内容表单与初始化 | `material/tests/index.test.ts` R5 数据驱动 case；`engine/tests/browser/controllers/designer-panel-controller.test.ts` material add 静态初始化 cases；`examples/browser-harness`、`examples/playground` 文档改为静态数据内容 | `pnpm --filter @base-screen/material test` + `pnpm --filter @base-screen/engine test` + `pnpm verify:playground` |

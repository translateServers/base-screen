# Test Matrix

| Requirement | 自动化证据 | 质量门 |
| --- | --- | --- |
| R1 表格数据 | `data-contracts.test.ts` table dataset and duplicate column cases | `pnpm --filter @base-screen/plugin-core test` |
| R2 图表数据 | `data-contracts.test.ts` series/point cases | 同上 |
| R3 严格边界 | `data-contracts.test.ts` unknown field, duplicate id, invalid value cases | 同上 |
| R4 职责隔离 | public exports and package boundary typecheck | `pnpm --filter @base-screen/plugin-core typecheck` |
| R5 官方图表物料 | `packages/material/tests/index.test.ts` chart manifest, constructor and auto-register cases | `pnpm --filter @base-screen/material test` |
| R6 官方表格物料 | `packages/material/tests/index.test.ts` table manifest, constructor and auto-register cases | 同上 |

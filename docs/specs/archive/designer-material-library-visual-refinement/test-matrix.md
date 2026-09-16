# Designer Material Library Visual Refinement Test Matrix

> 状态：已完成（2026-08-13）
> 依据：ADR-0034

| Requirement | 场景 | 自动化证据 | 状态 |
| --- | --- | --- | --- |
| R1 | 分组路径、子组计数、筛选和状态在固定高度轨道中建立单一当前态 | `designer-style.test.ts`、`verify-browser-harness.mjs` | 通过 |
| R2 | 两列卡片网格、固定缩略图区、名称/type、收藏与状态标记不互相遮挡 | `designer-style.test.ts`、`verify-browser-harness.mjs` 截图 | 通过 |
| R3 | 焦点、forced-colors、reduced-motion、键盘导航与 hover 无抖动 | `designer-style.test.ts`、`verify-browser-harness.mjs` | 通过 |
| R4 | 深浅主题、宿主 Token 覆盖和未分组 category chips 兼容 | `designer-style.test.ts`、`verify-browser-harness.mjs` | 通过 |
| R5 | 格式化、Engine 测试、浏览器与完整交付门禁 | `pnpm verify:browser`、`pnpm verify:m0` | 通过 |

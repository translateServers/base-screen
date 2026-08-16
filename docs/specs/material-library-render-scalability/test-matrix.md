# Material Library Render Scalability Test Matrix

> 状态：进行中（2026-08-16）

| Req | Case | 位置 | 状态 |
| --- | --- | --- | --- |
| R1 | `.material-card-wrap` 计算样式 `content-visibility: auto`（真实浏览器） | `scripts/verify-browser-harness.mjs`（探针实例卡片） | ⬜ |
| R1 | 既有封面渲染/缩略图几何/分组断言回归通过（CV 不改变可见卡片几何） | `scripts/verify-browser-harness.mjs` 既有断言 | ⬜ |
| R1 | 性能基准（本机 Chromium，复刻卡片样式）：500 张首帧 ≈50ms（无 CV ≈93ms）、2000 张 ≈160ms（无 CV ≈289ms）；滚动 500~5000 张平均帧 ≤10ms | 基准页实测记录（ADR-0042 决策依据） | ⬜ |
| R2 | 连续输入 120ms 窗口内合并为一次渲染（第二次输入重置计时器） | `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts`（fake timers） | ⬜ |
| R2 | 防抖窗口未到不渲染（`#materialSearch` 不更新、无 DOM 副作用） | 同上 | ⬜ |
| R2 | clear 按钮/Escape 取消未决计时器，推进时间后无残留渲染 | 同上 | ⬜ |
| R2 | 既有 clear/Escape/Enter 键盘路径回归通过 | 同上（既有断言） | ⬜ |
| R3 | catalog/`materialLibraryState`/宿主动作/分组断言回归不变 | 既有 engine 测试 + harness | ⬜ |
| 门禁 | engine lint/typecheck/test | `pnpm --filter @base-screen/engine lint` 等 | ⬜ |
| 门禁 | `pnpm verify:fast` 全量 | 仓库根 | ⬜ |
| 门禁 | `pnpm verify:browser`（含 CV 断言） | 仓库根 | ⬜ |

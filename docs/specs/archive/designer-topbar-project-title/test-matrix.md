# Designer Topbar Project Title Test Matrix

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

| 需求 | 浏览器 harness 验证 | 宿主浏览器验证 |
| --- | --- | --- |
| R1 标题回写 | `assertTopbarProjectName` 断言 harness 项目名「浏览器验证」 | xjdatahub 顶栏显示「测试」 |
| R2 稳定 | 顶栏几何断言无布局抖动（既有 geometry 断言） | 标题更新无布局抖动 |
| R3 质量 | 直接文档模式保持默认「未命名大屏」 | 直接文档模式顶栏保持默认 |

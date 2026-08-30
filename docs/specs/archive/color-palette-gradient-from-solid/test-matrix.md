# Color Palette Gradient From Solid Test Matrix

> 状态：已完成（2026-08-16，`pnpm verify:browser` 4 viewport 全绿）

| 需求 | 聚焦单元测试（engine dom） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 切换派生 | 派生算法：`#ff0000` → [`#ff0000`, `#ff7373`]；`#000000` → `#737373` 提亮；`#ffffff` → `#a6a6a6` 加深回退；`#f00` 短 hex 规范化；`#ff000080` 保留 alpha；`transparent`/非法不派生 | 新建矩形单色改 `#ff0000` 切线性渐变：文档 fill 为 `linear-gradient(90deg, #ff0000 0%, #ff7373 100%)`，面板色标起点/终点一致 |
| R2 保留自定义 | 自定义色标（非默认）模式往返保留；线性 ↔ 径向互切保留 | （DOM 断言同 R1 行：切换后面板色标仍为派生对） |
| R3 派生边界 | 文档值为渐变时按文档色标渲染；切换 solid→radial 同派生 | 派生提交后 Ctrl+Z 撤销恢复切换前单色（恰一条历史） |
| R4 质量 | 全部聚焦测试通过（engine 539 用例，含新增 7） | `pnpm verify:browser` 断言通过 |
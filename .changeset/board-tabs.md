---
"@base-screen/plugin-materials": minor
---

新增大屏物料「标签页」（`board.tabs`）：标签来自数据（第 1 列标签、第 2 列值），点击或方向键切换并抛出
`tabChange { index, label, value }`，蓝图按值分支即可打开对应页面（ADR-0109）。
水位图圆形罐体改按 min(宽, 高) 取边长，组件比罐体窄时不再被切掉两侧。

---
'@base-screen/material': minor
'@base-screen/sdk': minor
---

官方物料集新增分割线 `base.rule`（`base-screen-rule`，另开 `./rule` 子路径）：一条线是这个物料
的全部职责——不填充、不带标题、不描边框，因此与 `base.rectangle` 不重叠（矩形负责一块面，本物料
负责一条线）。方向由 `props.axis`（`horizontal` / `vertical`）决定，线沿盒子一边绘制；`color` /
`thickness` / `dash` / `opacity` 属样式。此前只能用 1px 矩形假冒分割线，而矩形的填充与圆角无法关闭。
渲染仍遵守渲染盒不变式：物料只写自身内部样式，宽高由渲染器按 canonical `component.size` 写入。
`@base-screen/sdk` 的自动注册随其生效。不改变 canonical 文档契约与物料 ABI。

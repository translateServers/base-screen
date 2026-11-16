---
'@base-screen/sdk': patch
'base-screen': patch
---

设计器改为「首帧骨架 + 分帧水合」：新增 `mountBaseScreenDesignerSkeleton`，元素连接后先绘制与最终布局同尺寸的骨架，物料库与画布文档在后续帧补齐（`data-designer-state="loading|ready|error"`、`data-designer-canvas-state="pending|ready"`）。只注入 `catalog` 即会替换骨架并进入 `ready`，不再要求额外调用 `configure()`；catalog 15s 内未到达时停止脉冲并切换到可识别的错误态（`data-designer-skeleton-state="error"`），之后到达仍可恢复。查看器同样在 catalog 或文档到达前显示画布骨架（`data-viewer-state="loading|ready"`），首次渲染落定后自动撤除。

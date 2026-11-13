---
'@base-screen/sdk': minor
'base-screen': minor
---

设计器支持先挂首帧骨架再绑定运行时：新增 `mountBaseScreenDesignerSkeleton`，骨架模式下物料库与画布文档分帧水合，宿主可在运行时与项目数据就绪前先渲染界面。查看器同样在 catalog 或文档到达前显示画布骨架（`data-viewer-state="loading|ready"`），首次渲染落定后自动撤除。

---
'base-screen': minor
'@base-screen/material': minor
---

官方文本物料 `base.text` 的 `dataCapabilities` 增加 `host-resource`：读数文本可以直接读宿主资源实例（含推送式
数据源，ADR-0104），不必再借数据集或变量中转。宿主资源选择入口（`hostResourceSelection`）仍只对图片物料开放。

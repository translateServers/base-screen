---
'base-screen': patch
'@base-screen/engine': patch
'@base-screen/material': patch
---

检查器公共区的不透明度控件改为对所有物料显示（ADR-0099 §2.3）：不透明度是引擎级保留样式，Renderer 几何帧本就对所有物料统一写入，
此前公共区却只在物料 `styleSchema` 申报了 `opacity` 时才出现，未申报的物料（如全部大屏插件物料）因此没有入口。
物料申报的 schema 仍用于收窄取值。官方形状、容器、分割线与图片物料移除了 `stylePanel` 中不生效的 `opacity` 项，
并不再在渲染路径自行写宿主元素的 `opacity`；文档中的 `opacity` 值与渲染结果不变。

---
"@base-screen/engine": patch
"@base-screen/material": patch
"@base-screen/plugin-materials": patch
---

设计器「事件」开着时页面预览与查看器一致：编辑主画布时蓝图切页只换垫在下面的页面（不透明、可交互，
主画布组件不重建，标签页选中项保留）；编辑页面时主画布内容叠在页面之上，标签页、导航按钮照样能点。
物料不再把宿主元素的 `display` 无条件写成 `block`，组件隐藏、画板外组件与蓝图显隐不会再被覆盖。

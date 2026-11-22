---
'base-screen': minor
'@base-screen/plugin-core': minor
---

Manifest Editor Descriptor 新增 `spacing` 控件：四个边距用一个对象值承载（`top` / `right` / `bottom` / `left`），
检查器按控件容器的实际宽度在一行四格与两行两列之间自适应；四边相等时收成一个输入，标签旁的链图标可统一四边（以上边距为准）或分开设置；单位只声明一次；缺任一边或非数字时校验失败关闭。

---
'@base-screen/plugin-sdk': patch
'@base-screen/material': patch
'@base-screen/sdk': patch
---

把物料非 ready 态的呈现收敛到一处：`@base-screen/plugin-sdk` 新增状态视图
（`createBaseScreenMaterialStateView` / `createBaseScreenMaterialErrorView` /
`createBaseScreenMaterialEmptyView`），loading 视图与公共加载容器从 `@base-screen/material`
迁到 plugin-sdk，`@base-screen/material` 与 `@base-screen/sdk/material` 继续按原名 re-export。
官方物料与大屏组件插件不再各写一份占位文案：`idle` 占位但不给文案（此前被当成「暂无数据」），
`error` 直接呈现 contracts 侧已脱敏的 `message` 并把 `code` 落到 `data-*` 属性。
官方物料基类另收一个受保护的盒面方法，形状与容器共用同一套填充/边框/渐变叠加/圆角/阴影实现。
不改变 canonical 文档、Manifest 字段或物料 ABI。

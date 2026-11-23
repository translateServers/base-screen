---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/renderer': minor
'@base-screen/engine': minor
'base-screen': minor
---

主画布与从画布（ADR-0109，取代 ADR-0108 的 `popups` / `popupId`，未发布过，不写迁移）：文档新增 `subCanvases`
（`display: 'page' | 'popup'`）、`startCanvasId`，根组件新增 `canvasId` 与 `belowSubCanvas`；`resolveScreenStartPageId()`。
蓝图新增 `sub-canvas` 节点（open / close / toggle，opened / closed，与显示方式无关）与 `main-canvas` 单例节点
（previous / next / back，page-changed），能力 `blueprint.trigger.canvas-event`、`blueprint.trigger.page-changed`、
`blueprint.action.canvas-visibility`、`blueprint.action.page-navigation`。
core 新增 `replace-sub-canvases`、`move-components` 命令与 `canvasEffects`。
renderer 按页面分层叠放（页面背景 → 主画布「从画布下方」组件 → 当前页 → 主画布其余组件 → 弹框），只挂载当前页；
切页依次发出弹框关闭、旧页离开、新页进入（带打开参数）与页面已切换；查看器新增 `currentPage`、`openCanvas()`、
`closeCanvas()`、配置 `initialPageId` 与事件 `base-screen-canvas-change`。弹框行为（遮罩、Esc、焦点、九宫格位置、打开参数）沿用。
设计器以画布底部标签条取代「画板」下拉：新建页面 / 弹框、参照底图（32%）、检查器「从画布」段（显示方式、页面背景、起始页、
弹框设置、复制、删除）、右键「移到…」与「置于从画布下方」；状态栏「事件」打开时蓝图切页即切到该页画板。

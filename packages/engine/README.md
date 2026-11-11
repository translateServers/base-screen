# @base-screen/engine

Designer 会话、画布交互、检查器和工作台编排。提供 `<base-screen-designer>` 自定义元素
（`BaseScreenDesignerElement`），构建在 `@base-screen/renderer` 之上。

发布入口无副作用：导入 `@base-screen/engine` 不会注册自定义元素，也不触碰
localStorage/sessionStorage（注册经 `@base-screen/sdk/designer` 或 `defineBaseScreenDesigner()`）。

`configure()` 仅 `catalog` 必填；`projectAdapter`、各类宿主端口、左侧分组与 slot 均为可选。
项目会话模式与直接文档模式不可混用。宿主面板令牌经 `@base-screen/engine/host-tokens.css`
（由 sdk 转发）。接入与职责划分见根 [README](../../README.md#与宿主的职责划分)。
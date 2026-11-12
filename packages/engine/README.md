# @base-screen/engine

Designer 会话、画布交互、检查器和工作台编排。提供 `<base-screen-designer>` 自定义元素
（`BaseScreenDesignerElement`），构建在 `@base-screen/renderer` 之上。

发布入口无副作用：导入 `@base-screen/engine` 不会注册自定义元素，也不触碰
localStorage/sessionStorage（注册经 `@base-screen/sdk/designer` 或 `defineBaseScreenDesigner()`）。

`configure()` 仅 `catalog` 必填；`projectAdapter`、各类宿主端口、左侧分组与 slot 均为可选。
项目会话模式与直接文档模式不可混用。宿主面板令牌经 `@base-screen/engine/host-tokens.css`
（由 sdk 转发）。接入与职责划分见根 [README](https://github.com/translateServers/base-screen/blob/master/README.md#与宿主的职责划分)。

`getProjectState()` 返回权威项目会话的隔离轻量快照：`phase`、`dirty`、`project: { projectId, name, revision } | null`，不包含完整文档或宿主 metadata。初始/卸载时为 `unloaded`，直接文档模式可为 `ready` 且 `project: null`。订阅 `BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT` 获取加载、保存、冲突、dirty、重载及卸载变化；晚订阅先读一次 getter。事件与 getter 来自同一会话，宿主修改快照不影响内部状态。
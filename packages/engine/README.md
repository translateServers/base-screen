# @base-screen/engine

Designer 会话、画布交互、检查器和工作台编排。提供 `<base-screen-designer>` 自定义元素
（`BaseScreenDesignerElement`），构建在 `@base-screen/renderer` 之上。

发布入口无副作用：导入 `@base-screen/engine` 不会注册自定义元素，也不触碰
localStorage/sessionStorage（注册经 `base-screen/designer` 或 `defineBaseScreenDesigner()`）。

`configure()` 仅 `catalog` 必填；`projectAdapter`、各类宿主端口、左侧分组与 slot 均为可选。
项目会话模式与直接文档模式不可混用。宿主面板令牌经 `@base-screen/engine/host-tokens.css`
（由 sdk 转发）。接入与职责划分见根 [README](https://github.com/translateServers/base-screen/blob/master/README.md#与宿主的职责划分)。

`getProjectState()` 返回权威项目会话的隔离轻量快照：`phase`、`dirty`、`project: { projectId, name, revision } | null`，不包含完整文档或宿主 metadata。初始/卸载时为 `unloaded`，直接文档模式可为 `ready` 且 `project: null`。订阅 `BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT` 获取加载、保存、冲突、dirty、重载及卸载变化；晚订阅先读一次 getter。事件与 getter 来自同一会话，宿主修改快照不影响内部状态。

## 容器尺寸契约

设计器以 `<base-screen-designer>` 自身为容器（而不是视口）分档，尺寸口径是宿主元素的内容盒
（已包含 `.designer` 自身的 1px 边框）。宿主不要给该元素加 `padding`，否则档位边界会有偏差。

| 容器尺寸 | 档位 | 面板 |
| --- | --- | --- |
| 宽 ≥ 1044 | `full` | 左 336 / 右 336，画布 ≥ 360 |
| 宽 896–1043 | `compact` | 左 248 / 右 276，画布 ≥ 360 |
| 宽 < 896 或高 < 640 | `degraded` | 隐藏编辑界面，只显示可读尺寸提示 |

引擎不再声明 `:host` 最小尺寸，宿主可以自由收缩舞台；尺寸不足时给出提示而不是溢出。
宿主元素上会维护 `data-size-tier`（`full` / `compact` / `degraded`）与布尔属性
`data-size-degraded`，并在档位变化时派发 `base-screen-designer-size-change`
（`detail: { tier, degraded, width, height }`，JSON-safe）。宿主可据此收起自己的侧栏：
例如收到 `degraded` 后折叠外侧导航，把宽度让给设计器。属性恢复比 CSS 分档晚 2px
（滞回），避免宿主侧栏在阈值附近反复开合。

面板宽度会按容器预算夹紧（容器内容宽 − 两条手柄 − 360 画布下限），超预算时先缩检查器
到 276、再缩左侧到 200。夹紧只影响渲染宽度，用户拖拽/持久化的偏好值在容器变宽后自动恢复。
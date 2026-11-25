---
'base-screen': minor
'@base-screen/engine': minor
'@base-screen/renderer': patch
'@base-screen/material': patch
---

设计器与查看器的推送数据源作者面（ADR-0104 切片 5）。

- 工作台「更新方式」新增「实时推送」：只在实例来源能推送时出现——`host-resource` 要求资源类型贡献声明
  `delivery.push` 且宿主资源端口实现了 `subscribe`，`host-catalog` 要求宿主目录端口实现了 `subscribe`；
  `dataset` / `url-query` 不提供。实例已是 `push` 时始终如实显示，便于改回。
- 选「实时推送」后出现「断线回退」（秒，0 为不回退，上限 86400）；来源声明 `delivery.push.append` 时
  另有「保留最近 N 行」（1..10000，缺省 1000）。变更与既有设置一样经 `base-screen-dataset-authoring-action`
  的 `update-settings` 交给宿主，`setting` 为 `refreshStrategy` / `pushFallbackInterval` / `pushRetainRows`。
- 切换组件时「更新方式」按该组件引用实例的 `updatePolicy` 回显，不再一律从「手动」起步。
- 检查器组头与只读事实：`push` 显示为「实时推送」或「实时推送 · 断线每 N 秒轮询」（此前误显示为「手动」）；
  提示文案说明实时推送只在预览与发布后生效，设计态只请求一次。
- 物料基类在 `ready` 且 `stale: true` 时给宿主元素打 `data-base-screen-data-stale="true"`，恢复后移除。
- `<base-screen-viewer>` 的 Shadow Root 带一份默认过期角标样式（右上角 8px 状态点）；宿主可用继承的
  `--base-screen-stale-indicator-display: none` 关闭、`--base-screen-stale-indicator-color` 改色。
- 「更新方式」及推送设置现在写回文档：组件经 `dataValue` 引用的文档级实例按 `replace-data-sources`
  单条事务更新 `updatePolicy`（一次改动一个历史步骤，可撤销）；「手动」写成省略字段；面板上没有控件的
  `retain.seconds` / `retain.timeField` 原样保留。`update-settings` 宿主事件照发。
- 不写回的情形：旧形态内联数据源（提示「更新方式将在应用数据源后写入文档」，首次应用数据集绑定新建实例时
  带上已选的「只请求一次 / 自动更新」）；宿主标 `readOnly` 的实例（提示并退回文档策略）；来源不能推送却选了
  「实时推送」（报 `DATA_SOURCE_UPDATE_POLICY_INVALID`）。撤销 / 重做后工作台按文档回显。

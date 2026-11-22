---
'base-screen': minor
'@base-screen/sdk': minor
'@base-screen/contracts': minor
'@base-screen/plugin-core': minor
'@base-screen/engine': patch
---

长连接数据源契约（ADR-0104 切片 1）。只有契约与校验，运行时订阅在后续切片实现。

- 文档：`updatePolicy.mode` 新增 `'push'`，可带 `fallbackIntervalSeconds`（断线回退轮询，1..86400 秒）
  与 `retain: { rows?, seconds?, timeField? }`（保留窗口；`seconds` 与 `timeField` 必须成对）。这两个字段只属于 `push`；
  `url-query` 来源禁止 `push`。JSON Schema 同步更新。旧版本解析器会拒绝含 `push` 的文档。
- 宿主端口：`ScreenHostResourcePort` 与 `ScreenHostCatalogPort` 新增可选 `subscribe(request, sink, { signal, context?, retain? })`，
  同步返回 `ScreenParseResult<null>`；新类型 `ScreenSourcePushEvent`（`snapshot` / `append` / `invalidate` /
  `status` / `heartbeat`）、`ScreenPushCursor`、`ScreenSourceConnectionStatus`、`ScreenSourcePushSink`、
  `ScreenHostSubscribeOptions`、`ScreenHostCatalogSubscribeRequest`。`validateScreenDesignerHostAdapter`
  要求出现的 `subscribe` 必须是函数。
- 能力声明：资源类型贡献 `dataResourceType.delivery` 与 `ScreenHostCatalogDescriptor.delivery`
  （`{ push?: { append?, inactivityTimeoutSeconds? } }`），新导出 `listScreenSourceDeliveryIssues`、
  `normalizeScreenSourceDelivery`、`supportsScreenSourcePush`。
- 物料数据状态 `ready` 分支新增可选 `stale?: true`；执行触发器新增 `'push'`；观察事件新增
  `subscribed` / `unsubscribed` / `pushed` / `connection` / `resync` 及可选 `cursor`、`connection` 字段。
- engine：数据源实例视图的 `updatePolicy` 改用契约类型 `ScreenUpdatePolicy`。

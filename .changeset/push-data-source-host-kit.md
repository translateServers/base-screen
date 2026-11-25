---
'@base-screen/host-kit': minor
---

推送订阅 helper（ADR-0104 切片 3）。

- `createSseSubscribe({ url, mapEvent?, events?, fetchSnapshot?, cursorFromEventId?, suspendAfterMs?, withCredentials?, EventSource? })`：
  返回可直接作为端口 `subscribe` 的函数。基于原生 `EventSource`，不自写重试；映射推送事件，从 `Last-Event-ID`
  （`<epoch>:<revision>`）补齐游标；连接状态映射为 `open` / `reconnecting` / `suspended` / `failed`；提供 `fetchSnapshot`
  时每次（重新）打开后拉取快照，拉取期间的增量暂存并按游标去重；`signal` abort 即关闭。
- `createSubscriptionHub({ keyOf, open, lingerMs?, replayRows? })`：按键引用计数复用上游连接，迟到订阅者收到连接状态与
  合成快照，最后一个订阅者离开后延迟 `lingerMs`（缺省 2000）关闭，上游 `failed` 时立即关闭并清空缓存。
- 新类型 `HostKitSubscribe`、`HostKitSubscriptionHub`、`SubscriptionHubOptions`、`SseSubscribeOptions`、
  `HostKitSseMessage`、`HostKitPushSnapshot`、`HostKitEventSource`、`HostKitEventSourceConstructor`。

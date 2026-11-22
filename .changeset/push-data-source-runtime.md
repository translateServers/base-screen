---
'base-screen': minor
'@base-screen/renderer': minor
---

推送式数据源运行时（ADR-0104 切片 2）。

- `updatePolicy.mode: 'push'` 的实例在 Viewer / 预览态经宿主端口 `subscribe` 订阅；设计态（`mode: 'design'`）
  不订阅，只做一次拉取。订阅身份与请求键一致：参数或来源变化即退订并重新订阅，`refreshData` 重新订阅、
  不额外 resolve；`suspendData`、`clear`、`dispose` 退订。退订后旧 sink 上的事件一律丢弃。
- 五类事件：`snapshot` 替换结果；`append` 追加表格行（只在资源类型声明 `delivery.push.append` 时接受，
  行字段必须属于现有 fields）；`invalidate` 同键 resolve、期间保留当前值；`status` 更新连接状态；
  `heartbeat` 只刷新静默计时。首个快照前保持 loading，超时（`resourceTimeoutMs`）报 `HOST_RESOURCE_TIMEOUT`。
- 游标 `{ epoch, revision }`：重复丢弃；跳号或换 epoch 的增量进入重同步，丢弃后续增量直到新快照。
- 保留窗口：`retain.rows`（缺省 1000，仅 append 型或声明了 retain 的来源）与 `retain.seconds` + `timeField`
  （以数据里最新一行时间为基准）从头部裁剪，再按 1 MiB 体积上限裁剪。
- 按帧合并通知：每个实例每帧最多重投影一次，观察事件 `pushed` 按帧聚合。
- 过期：连接 `reconnecting` / `suspended`、重同步中或超过 `delivery.push.inactivityTimeoutSeconds`
  时，组件的 `ready` 数据状态带 `stale: true`；`failed` 进 error 且不保留旧值；从未有值时 `suspended`
  报 `HOST_RESOURCE_UNAVAILABLE`，之后的快照仍可恢复。
- 门控与回退：来源不支持推送时，配了 `fallbackIntervalSeconds` 就按间隔轮询并报 warning 诊断，
  否则报 `HOST_RESOURCE_UNAVAILABLE`；订阅中的实例在 `suspended` 期间按同一间隔轮询，`open` 后停止。

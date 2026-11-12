# @base-screen/host-kit

宿主接入辅助：把示例里反复手抄、抄错就运行时失败的端口样板收编为上游公共 helper。
只依赖 `@base-screen/contracts`，支持复用宿主业务 API 或注入 `fetch`，不引入存储、网络重试或业务降级。

## 提供

| 导出 | 用途 |
| --- | --- |
| `createHostProjectAdapter({ load, save, migrate? })` | 复用业务函数与响应映射，统一迁移、信封校验、取消与冲突映射 |
| `createHostDatasetPort({ groups?, list, describe, query })` | 复用业务函数，统一数据契约校验、取消、分组缓存与错误映射 |
| `createHttpProjectAdapter({ baseUrl, fetch?, migrate? })` | 项目会话适配器：`GET/PUT /screens/:id`，读取迁移、revision 冲突映射 |
| `createRestDatasetPort({ baseUrl, fetch? })` | 数据集端口：`GET /datasets*`，内置四条硬规矩与错误码映射、`queryScope: 'dataset'` |
| `createHostKitHttp` / `toHostKitSearch` / `toAbortSignal` | 最小 JSON HTTP 客户端与 query/signal 桥接 |

REST helper 对接[示例后端 REST 契约](https://github.com/translateServers/base-screen/blob/master/examples/README.md#rest-契约由-shared-backend-实现三端共用)，
并复用同一业务回调核心。宿主后端路径或 JSON 形状不同时可提供 `mapping`；已有业务 API 函数时
直接使用 `createHostProjectAdapter` / `createHostDatasetPort`，无需重建 HTTP 客户端或协议样板。

```ts
import { createHttpProjectAdapter, createRestDatasetPort } from '@base-screen/host-kit';

const projectAdapter = createHttpProjectAdapter({ baseUrl: 'http://127.0.0.1:3000/api' });
const datasetPort = createRestDatasetPort({ baseUrl: 'http://127.0.0.1:3000/api' });
```

数据集端口的四条硬规矩（剥 groups、signal 在第二参、不下发 componentId、错误码映射）见
[examples/README](https://github.com/translateServers/base-screen/blob/master/examples/README.md#datasetport-的四条硬规矩)。告警快照、故障注入等业务
extras 归宿主，可在业务 `execute` 中添加参数，并通过 `onQueryResult` 维护。

业务操作提供 `execute(request, signal)`，返回 `{ ok: true, data }` 或
`{ ok: false, error: { code, message, status? } }`；可选 `response(payload, request)` 把业务
响应投影为 canonical 形状。数据集查询的 `execute` 第三参透传该次 `ScreenResourceExecutionContext`（可选），用于宿主审计与项目/revision 定位，并发请求互不串值；默认 REST 不下发此上下文。`signal` 是已桥接的原生 `AbortSignal`，即使业务函数不支持中断，
核心也会丢弃取消后的响应。项目读取先迁移后校验完整信封，保存直接校验；revision 保持 opaque，
仅默认示例 REST 映射将其转为数字。

```ts
import { createHostDatasetPort } from '@base-screen/host-kit';

const datasetPort = createHostDatasetPort({
  list: {
    execute: (request, signal) => businessApi.list(request, signal),
    response: (payload) => ({
      items: payload.entries,
      ...(payload.cursor === undefined ? {} : { nextCursor: payload.cursor }),
    }),
  },
  describe: { execute: (request, signal) => businessApi.describe(request.datasetId, signal) },
  query: { execute: (request, signal) => businessApi.query(request.datasetId, request.params, signal) },
  onQueryResult: ({ request, result, error }) => {
    // result 已经过 contracts 校验；取消不通知，error 保留业务错误码。
    updateHostStatus(request.datasetId, result.ok, error?.code);
  },
});
```

`onQueryResult`、`onDescribeResult`、`onListResult` 以及项目的 `onLoadResult` / `onSaveResult`
收到请求数据（去掉 `signal`）、结果与错误的深克隆隔离副本。观察逻辑修改请求或结果、
同步抛错或异步拒绝都不会改变调用者的数据与端口返回值。分组成功结果缓存 60 秒，失败与取消不缓存。
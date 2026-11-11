# @base-screen/host-kit

宿主接入辅助：把示例里反复手抄、抄错就运行时失败的端口样板收编为上游公共 helper。
只依赖 `@base-screen/contracts`，使用可注入的 `fetch`，不引入存储、网络重试或业务降级。

## 提供

| 导出 | 用途 |
| --- | --- |
| `createHttpProjectAdapter({ baseUrl, fetch?, migrate? })` | 项目会话适配器：`GET/PUT /screens/:id`，读取迁移、revision 冲突映射 |
| `createRestDatasetPort({ baseUrl, fetch? })` | 数据集端口：`GET /datasets*`，内置四条硬规矩与错误码映射、`queryScope: 'dataset'` |
| `createHostKitHttp` / `toHostKitSearch` / `toAbortSignal` | 最小 JSON HTTP 客户端与 query/signal 桥接 |

这些 helper 对接[示例后端 REST 契约](../../examples/README.md#rest-契约由-shared-backend-实现三端共用)。
宿主后端契约不同时，注入自定义 `fetch` 或自行实现端口；helper 只覆盖通用契约形状。

```ts
import { createHttpProjectAdapter, createRestDatasetPort } from '@base-screen/host-kit';

const projectAdapter = createHttpProjectAdapter({ baseUrl: 'http://127.0.0.1:3000/api' });
const datasetPort = createRestDatasetPort({ baseUrl: 'http://127.0.0.1:3000/api' });
```

数据集端口的四条硬规矩（剥 groups、signal 在第二参、不下发 componentId、错误码映射）见
[examples/README](../../examples/README.md#datasetport-的四条硬规矩)。告警快照、故障注入等业务
extras 归宿主，需要时在端口外再包一层。
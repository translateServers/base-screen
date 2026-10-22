# Host API

Base Screen 全栈示例群的**共享后端**：NestJS REST API + Prisma/SQLite。
React、Vue、Vanilla 三个前端（`examples/*-host`）联调的都是这一个后端，
契约完全一致（见下方 REST 契约表）。

## 架构

```
shared-backend/
├── prisma/
│   ├── schema.prisma        # 数据模型（唯一 schema 源）
│   └── migrations/          # 提交式迁移（含 migration_lock.toml）
├── data/                    # SQLite 数据目录（.gitkeep 保留目录，*.db 被 gitignore）
├── src/
│   ├── main.ts              # 引导：CORS、全局前缀 api、Swagger
│   ├── app.module.ts        # 组合根：全局 ValidationPipe / 异常过滤器 / 日志拦截器
│   ├── prisma/              # PrismaModule（global）+ PrismaService 单例
│   ├── screens/             # 大屏文档 CRUD + revision 乐观锁 + 空库播种
│   ├── metrics/             # 确定性 mock 指标时序（mulberry32 + 固定 seed）
│   ├── health/              # 存活探针
│   └── common/              # AllExceptionsFilter（统一错误体）、LoggingInterceptor
└── test/                    # jest 单测 + supertest e2e（独立 test.db）
```

**职责边界**：后端只存取 canonical Screen Document（`document` 列是不透明 JSON），
不理解其内部结构。写入前做**有界结构校验**（顶层字段形状、组件数量上限、序列化体积上限，
见 `src/screens/screen-document-guard.ts`），失败关闭、不做默认值填充与未知字段剥离；
权威的 canonical schema 校验发生在宿主前端与设计器提交路径上。

本工程**刻意不依赖 `@base-screen/contracts`**：该包是仅 ESM 的，而 NestJS + Jest 是 CJS 运行时，
硬引会带来 ESM/CJS 互操作负担，而宿主本来也不该理解文档内部结构。并发控制由宿主（本工程）负责：
`revision` 不匹配即 409，Base Screen 不做乐观锁。

## 技术选型理由

| 选择 | 理由 |
| --- | --- |
| NestJS | 模块/DI/管道/过滤器/拦截器的工程骨架，Swagger 即文档，测试生态成熟 |
| Prisma + SQLite | 声明式 schema + 提交式迁移；SQLite 零外部服务，示例可独立运行 |
| 自定义 Client `output`（`src/generated/prisma-client`） | 规避 pnpm 隔离 node_modules 下默认输出路径的解析问题（该目录 gitignore） |
| 数据库路径给成 `file:../data/screens.db` | SQLite 相对路径以 **schema 目录** 为基准；schema 在 `prisma/` 下，需回退一层才落到工程的 `data/` |
| TypeScript 5.9.3 | 与三个前端及 vue-tsc 对齐的稳定版本（根仓 TS 7 尚未被该工具链支持） |
| 不依赖 `@base-screen/contracts` | 它是仅 ESM 包，而 NestJS + Jest 是 CJS 运行时；宿主持有的是不透明 JSON，只需有界结构校验 |
| e2e 独立 test.db | 与开发/生产库隔离，重复运行不污染种子数据 |

## REST 契约

| 方法与路径 | 请求 | 成功响应 | 失败响应 |
| --- | --- | --- | --- |
| `GET /api/health` | — | `{ status: 'ok' }` | — |
| `GET /api/screens` | — | `{ screens: [{ id, name, revision, updatedAt }] }` | — |
| `POST /api/screens` | `{ name }` | `201 { screen: Screen }` | `400 INVALID_REQUEST` |
| `GET /api/screens/:id` | — | `{ screen: Screen }` | `404 NOT_FOUND` |
| `PUT /api/screens/:id` | `{ document, revision }` | `{ screen: Screen }`（revision+1） | `404 NOT_FOUND` / `409 REVISION_CONFLICT` / `400 DOCUMENT_INVALID` |
| `DELETE /api/screens/:id` | — | `{ ok: true }` | `404 NOT_FOUND` |
| `GET /api/metrics/series?metric=cpu_usage&points=24` | — | `{ metric, unit, points: [{ t, value }] }` | `400 UNKNOWN_METRIC` / `400 INVALID_POINTS` |
| `GET /api/metrics/ranking?dimension=region&limit=6` | — | `{ dimension, unit, items: [{ name, value }] }` | `400 UNKNOWN_DIMENSION` / `400 INVALID_LIMIT` |

`Screen = { id, name, revision, document, createdAt, updatedAt }`（时间为 ISO 字符串）。
错误体统一 `{ error, message }`。指标目录：`cpu_usage`（%）、`memory_usage`（%）、
`request_rate`（req/s），以及 DataV 种子使用的 `sales_total`（万元）、`order_count`（单）、
`visitor_count`（人）、`conversion_rate`（%）、`target_completion`（%）、
`service_satisfaction`（%）、`member_repurchase`（%）；`points` 为 1..120 的整数，默认 24。
排行固定为 `region`（6 个区域）与 `channel`（4 个渠道），`limit` 为 1..20，默认 6。

空库播种三条记录：「默认销售大屏」是 50+ 组件的 DataV 风格成品文档，「系统监控大屏」保留
原来的最小卡片文档（覆盖宿主自有物料路径），「生产监控大屏」是覆盖四种 dataSource 的数据层
成品文档。种子只在空库执行；本地想重新播种时删除
`data/screens.db` 后重启，或直接跑冒烟脚本（它使用独立库并自动迁移）。

`GET /api/docs` 提供 OpenAPI 文档（Swagger UI）。

## 运行

```bash
pnpm install                                   # 仓库根（首次）
pnpm --filter @base-screen-example/shared-backend dev # 开发：migrate deploy + watch 模式
```

启动后 API 在 <http://127.0.0.1:3000>，`/api/docs` 查看接口文档。
前端联调见 [`examples/README.md`](../README.md)。

## 迁移与播种

- schema 变更：`pnpm --filter @base-screen-example/shared-backend exec prisma migrate dev --name <描述>`，
  产物（`prisma/migrations/`）随提交进仓库。
- `dev` / `start` 前自动 `prisma migrate deploy`，无需手动同步 schema。
- 空库首次启动由 `ScreensService.onModuleInit` 幂等播种三条演示大屏
  （`默认销售大屏`、`系统监控大屏`、`生产监控大屏`），dev / start / e2e 行为一致。
- 数据库文件：`data/screens.db`（gitignore）；连接信息见 `.env`（非机密默认值）。

## 测试

```bash
pnpm --filter @base-screen-example/shared-backend test
```

- `test/screens.service.spec.ts`：revision 乐观锁、非法文档拒绝、播种、P2025 映射。
- `test/metrics.service.spec.ts`：确定性断言（同参数同结果）、未知指标失败关闭。
- `test/app.e2e-spec.ts`：真实 AppModule + 独立 test.db，覆盖
  create/update/409/404 生命周期与统一错误体。
  jest `globalSetup` 自动执行 `prisma migrate deploy`。

两个错误码由 Service 抛出而非 DTO 校验（`UNKNOWN_METRIC`、`INVALID_POINTS`），
DTO 只拦"形状不对"（归一为 `INVALID_REQUEST`）——契约里承诺的错误码因此始终可断言。

## 数据绑定演示的落点

起始文档中 `stage-cpu` 组件的 `dataSource` 为 `host-resource`
（`resourceType: 'demo_metric'`、`resourceId: 'cpu_usage'`）。前端宿主数据通道
（resourcePort）把它解析为一次 `/api/metrics/series` 查询并投影为 `ScreenTabularDataset`，
不发明新协议。

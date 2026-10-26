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
│   ├── screens/             # 大屏文档 CRUD + revision 乐观锁 + 启动期按名字补种
│   ├── assets/              # 宿主素材库：上传/列表/内容/引用保护 + 演示图播种
│   ├── material-packages/   # 在线物料包：只存宿主审核后的 ESM + Manifest，不执行
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
| `GET /api/assets` | 可选 `?scope=temporary`、`?screenId=` | `{ assets: [Asset] }`（无参数仅公共；`screenId` 返回公共 + 该屏临时；`scope=temporary` 返回全部临时） | `400 ASSET_SCOPE_INVALID` / `404 SCREEN_NOT_FOUND` |
| `POST /api/assets` | multipart `file`；可选 `?scope=temporary&screenId=` | `201 { asset: Asset }`（带临时参数时写入当前大屏） | `400 ASSET_TYPE_UNSUPPORTED` / `ASSET_CONTENT_INVALID` / `ASSET_SCOPE_INVALID`；超过 5 MB 为 `413` |
| `GET /api/assets/:id/content` | — | PNG / JPEG / WebP / GIF 二进制（公共 `Cache-Control: immutable`；临时 `no-store`） | `404 ASSET_NOT_FOUND` |
| `DELETE /api/assets/:id` | — | `{ deleted: true, id }` | `404` / `409 ASSET_IN_USE` + `refScreens` |
| `GET /api/material-packages` | — | `{ packages: [{ id, type, name, code, manifest, revision, ... }] }` | — |
| `POST /api/material-packages` | `{ type, name, manifest, code }` | `201 { package }` | `400`（命名空间/Manifest/代码） / `409 MATERIAL_TYPE_EXISTS` |
| `PUT /api/material-packages/:id` | `{ type, name, manifest, code, revision }` | `{ package }`（revision+1） | `400` / `409 REVISION_CONFLICT` |
| `PATCH /api/material-packages/:id/visibility` | `{ visible }` | `{ package }`（只改 `libraryVisible`） | `404` |
| `DELETE /api/material-packages/:id` | — | `{ deleted: true, id }` | `404` / `409 MATERIAL_IN_USE` + `refScreens` |
| `GET /api/metrics/series?metric=cpu_usage&points=24` | — | `{ metric, unit, points: [{ t, value }] }` | `400 UNKNOWN_METRIC` / `400 INVALID_POINTS` |
| `GET /api/metrics/ranking?dimension=region&limit=6` | — | `{ dimension, unit, items: [{ name, value }] }` | `400 UNKNOWN_DIMENSION` / `400 INVALID_LIMIT` |
| `GET /api/demo/alarms` | — | `{ revision, alarms: Alarm[] }` | — |
| `GET /api/demo/alarms/stream` | — | SSE：先 snapshot，随后 raise / clear / ack / suppress / heartbeat | — |
| `POST /api/demo/alarms/raise` | `{ key, level?, message? }` | `201 { alarm: Alarm }` | `400` |
| `POST /api/demo/alarms/clear` | `{ key }` | `201 { changed }` | `400` |
| `POST /api/demo/alarms/ack` | `{ key }` | `201 { changed }` | `400` |
| `POST /api/demo/alarms/suppress` | `{ key, suppressed }` | `201 { changed }` | `400` |
| `POST /api/demo/alarms/reset` | — | `201 { revision, alarms }` | — |

`Screen = { id, name, revision, document, createdAt, updatedAt }`（时间为 ISO 字符串）。
`Asset = { id, name, mimeType, byteSize, contentPath, referenceCount, temporary, screenId,
screenName, expiresAt, createdAt }`。`temporary=true` 是设计器临时上传，绑定当前大屏并默认
7 天有效；公共素材的 `screenId/screenName/expiresAt` 为 `null`。文档里只保存 `host_image`
的 `resourceType` + `resourceId`，不保存 `contentPath` 或任何 URL。示例不做鉴权，
`screenId` 过滤只是应用层可见性。错误体统一 `{ error, message }`。
指标目录：`cpu_usage`（%）、`memory_usage`（%）、
`request_rate`（req/s），以及成品种子使用的 `sales_total`（万元）、`order_count`（单）、
`visitor_count`（人）、`conversion_rate`（%）、`target_completion`（%）、
`service_satisfaction`（%）、`member_repurchase`（%）；生产监控屏另有 `oee`（%）、
`device_online_rate`（%）、`output_count`（件）、`alarm_open`（条）、`line_load`（%）、
`energy_ratio`（%），实时告警演示屏再追加 `alarm_critical` / `alarm_warning` / `alarm_info`
（条，口径是近 1 小时新增）；`points` 为 1..120 的整数，默认 24。
排行固定为 `region`（6 个区域）与 `channel`（4 个渠道），`limit` 为 1..20，默认 6。

`Alarm = { id, key, level: 'warning' | 'critical' | 'info', message, raisedAt, acknowledged, suppressed }`。
告警状态在内存中，进程重启即回到初始 warning；`reset` 恢复初始快照。真实告警平台的持久化、
确认/屏蔽生命周期与传输凭证由宿主接入，本示例只演示宿主适配层与 SSE 推送。

启动期补种五条记录（按名字补齐：缺哪张插哪张，已有行不覆盖）：「默认销售大屏」是 50+ 组件的成品风格文档，「系统监控大屏」保留
原来的最小卡片文档（覆盖宿主自有物料路径），「生产监控大屏」是覆盖四种 dataSource 的数据层
成品文档，「实时告警演示大屏」是告警链路专用屏（流水 + KPI + 等级色块，组件 id 对齐宿主
`alarm.open` 绑定），「空气质量监测大屏」是三个自建 SQLite 数据源 + 真实快照（Open-Meteo CAMS）
的城市空气质量案例。新增种子在旧库重启后自动补上；想彻底重置成出厂状态才需要删
`data/screens.db`，或直接跑冒烟脚本（它使用独立库并自动迁移）。

在线物料包（`MaterialPackage`）只存 `type`（稳定文档身份）、`name`、ESM `code`、Manifest JSON
与 revision；同一 `type` 至多一条。后端不执行代码、不解析 Component 实现，发布前校验
`host.online.*` 命名空间、Manifest 的 `type`/`name`/`tagName` 与代码必须有 default export；
`PUT` 使用 revision 乐观锁，`type` 创建后不可改。下架只改 Manifest 的 `libraryVisible`；
删除前扫描已保存文档中的 `component.type`，被引用返回 `409 MATERIAL_IN_USE` 与 `refScreens`。
代码与 Manifest 的体积上限分别是 200 KiB / 64 KiB。

素材库在空表（按公共素材计数）时由 `AssetSeedService` 生成六张确定性 PNG（代码见
`src/assets/asset-images.ts`），文件落在 `data/assets/`（gitignore），`ASSET_SEED=0` 可关闭，
`ASSET_DIR` 可覆盖目录（测试用）。上传只接受 PNG / JPEG / WebP / GIF 且会校验文件头；
SVG 需要消毒/栅格化，示例不接收。删除前扫描所有已保存文档中的 `host_image` 引用与画布背景的
内容 URL，被引用时返回 `409 ASSET_IN_USE` 与 `refScreens`。

**临时素材**：设计器 `POST /api/assets?scope=temporary&screenId=<id>` 写入，`temporary=true`、
`expiresAt=now+7d`。`ScreensService.update` 成功后对文档引用的临时素材续期；
`ScreensService.remove` 删除该屏未再被引用的临时素材；`AssetCleanupService` 每小时扫描
过期且无引用的临时素材并删除行与文件（仍被引用的续期），`ASSET_CLEANUP_INTERVAL_MS=0`
可关闭定时器（测试）。

数据源侧同时幂等生成 `data/datasources/city-air.db` 并播种三条只读 SQLite 源
（`custom.air-live` / `custom.air-trend` / `custom.air-rank`）。它们与用户自建数据源共用
同一套路径守卫、只读执行器、测试/预览/目录投影；快照来源与 AQI 口径见
`src/datasets/air-quality-snapshot.ts` 文件头。

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
- 启动时由 `ScreensService.onModuleInit` 按名字幂等补种五条演示大屏（只插缺失的，不覆盖已有行）
  （`默认销售大屏`、`系统监控大屏`、`生产监控大屏`、`实时告警演示大屏`、`空气质量监测大屏`），
  dev / start / e2e 行为一致；数据源播种由 `DatasourceSeedService` 负责（含 `city-air.db`
  的幂等生成），素材播种由 `AssetSeedService` 负责（仅空表时生成）。
- 数据库文件：`data/screens.db`（gitignore）；连接信息见 `.env`（非机密默认值）。

## 测试

```bash
pnpm --filter @base-screen-example/shared-backend test
```

- `test/screens.service.spec.ts`：revision 乐观锁、非法文档拒绝、播种、P2025 映射。
- `test/metrics.service.spec.ts`：确定性断言（同参数同结果）、未知指标失败关闭。
- `test/app.e2e-spec.ts`：真实 AppModule + 独立 test.db，覆盖
  create/update/409/404 生命周期与统一错误体。
- `test/assets.e2e-spec.ts`：上传/内容读取/引用扫描/删除保护与未知 id；临时上传按屏过滤、
  临时内容 `no-store`、保存续期、删屏清理、过期 sweep，文件目录由 `ASSET_DIR=data/assets/test`
  隔离；`test/asset-images.spec.ts` 校验生成的 PNG 结构与确定性。
- `test/screens.service.spec.ts`：除 revision/播种/删除外，还断言保存后续期与删屏后清理的
  Service 调用，以及续期/清理失败不反向报错。
- `test/material-packages.e2e-spec.ts`：命名空间/Manifest/代码校验、重复类型、revision 乐观锁、
  上下架与引用保护；在线物料不执行代码。
  jest `globalSetup` 自动执行 `prisma migrate deploy`。

两个错误码由 Service 抛出而非 DTO 校验（`UNKNOWN_METRIC`、`INVALID_POINTS`），
DTO 只拦"形状不对"（归一为 `INVALID_REQUEST`）——契约里承诺的错误码因此始终可断言。

## 数据绑定演示的落点

起始文档中 `stage-cpu` 组件的 `dataSource` 为 `host-resource`
（`resourceType: 'demo_metric'`、`resourceId: 'cpu_usage'`）。前端宿主数据通道
（resourcePort）把它解析为一次 `/api/metrics/series` 查询并投影为 `ScreenTabularDataset`，
不发明新协议。

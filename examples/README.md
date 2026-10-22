# Examples

Base Screen 的示例群：**一个共享后端 + 三个对等前端**，外加两个基础设施载体（基座回归与工具链）。

```text
examples/
├── shared-backend/     NestJS + Prisma/SQLite 共享后端（唯一后端，三端共用）
├── react-host/         Vite + React 19 SPA
├── vue-host/           Vite + Vue 3 SPA（同时是 verify:tarball 的外部消费者载体）
└── vanilla-host/       Vite + 原生 TypeScript SPA

../tooling/verification/browser-harness/   基座自身特性矩阵 + Playwright 断言（pnpm verify:browser）
../tooling/material-mcp-server/            面向上层工具链的物料模板 MCP provider
```

三个前端是"宿主应用"的三种写法：都是纯静态 SPA，经 HTTP 联调同一个后端，
功能完全对等（见下方矩阵）。它们演示的是**宿主侧**要做什么——文档 CRUD、把
`<base-screen-designer>` / `<base-screen-viewer>` 嵌进自己的页面、实现项目适配器与
数据通道、以及宿主自有物料。

## 三个前端的技术对照

| 关注点 | React | Vue | Vanilla |
| --- | --- | --- | --- |
| 构建 | Vite 8 + `@vitejs/plugin-react` | Vite 8 + `@vitejs/plugin-vue` | Vite 8 |
| 路由 | `react-router-dom`（HashRouter） | `vue-router`（hash history） | 自实现 hash 路由（约 60 行） |
| 视图组织 | 函数组件 + hooks | SFC + composables | DOM 构建助手 + 视图模块 |
| 状态管理 | zustand `create` + selector hook | zustand `vanilla` store + composable 桥接 | zustand `vanilla` store + `subscribe` |
| 自有物料 | `createReactMaterialDefinition`（样式内联） | `createVueMaterialDefinition`（SFC + 应用样式表） | 自定义元素 + manifest |
| 类型检查 | `tsc --noEmit` | `vue-tsc --noEmit` | `tsc --noEmit` |
| dev 端口 | 5174 | 5175 | 5173 |

三端的状态机**统一由 zustand 承载**，因此同一用例在三端的行为与文案由同一套迁移规则保证：

| store | 状态机 | 迁移 |
| --- | --- | --- |
| `store/screens-store.ts` | 列表 | `idle → loading → ready` / `loading → error`（可重试）；动作 `load` / `create` / `remove` |
| `store/screen-session-store.ts` | 当前大屏会话（编辑页与查看页共用） | `idle → loading → ready → dirty → saving → saved`，分支 `saving → failed`（可重试）、`saving → conflict`（须重载）、`loading → error`（终态） |

绑定方式按各栈习惯选择，store 语义完全相同：React 用 `zustand` 的 `create` + selector（只在选中切片变化时重渲染）；
Vue / Vanilla 用框架无关的 `zustand/vanilla`，分别经 composable 的 `shallowRef` 快照与 `subscribe` 消费。
状态文案（"正在保存…"/"已保存（版本 N）"/冲突提示）也由 store 生成，三端不再各自拼字符串。

Toast 不进 store：它是带定时器的瞬时 DOM 副作用，不是应用状态。

## 页面与流程（三端一致）

| 路由 | 页面 | 关键行为 |
| --- | --- | --- |
| `#/` | 大屏列表 | 卡片列表、新建（POST 后跳编辑）、删除（二次确认）、空态 / 错误态 / 骨架屏 |
| `#/screens/:id/edit` | 设计器编辑 | 嵌入 `<base-screen-designer>`；宿主 project adapter 载入与保存；自动保存规格见下 |
| `#/screens/:id/view` | 只读查看 | 嵌入 `<base-screen-viewer>` 播放 canonical 文档 |

编辑页的两条铁律（三端代码里都有注释）：

1. **先挂载，再 `configure` / `load`**：画布与渲染器在自定义元素 *connected* 时才建立；
   对还没进 DOM 的设计器调用不会报错，但画布会一直是空的。
2. **设计器是 DOM 节点，不是框架组件**：用 ref 拿占位容器后 `appendChild`，
   不要塞进框架的 vnode / 模板。

### 编辑页自动保存规格（三端逐条一致）

引擎只在脏态 *翻转* 时发 `base-screen-dirty-change`，之后连续编辑不再通知；移除设计器元素会
取消在飞行的项目请求。三端因此共用同一套宿主侧规则，只有语法不同：

- **防抖**：`dirty → true` 后 `1200ms` 触发 `save()`；同一时刻只允许一次保存在飞行（`saveFlight` 复用）。
- **飞行期补排**：保存进行中又变了脏时宿主自己记着，落定后再排一次——引擎不会再发事件。
- **失败退避**：失败按 `5000ms` 起指数退避重试，上限 `60000ms`，成功后回到基准值；文案由 store 生成。
- **冲突止血**：收到 `base-screen-project-conflict` 后停止自动保存（revision 已过期，重试只会再冲突一次），由用户重载。
- **返回前落地**：顶栏返回先 `await` 保存再路由；异步清理路径只清定时器，不假装能 flush。

## REST 契约（由 shared-backend 实现，三端共用）

| 方法与路径 | 请求 | 成功响应 | 失败响应 |
| --- | --- | --- | --- |
| `GET /api/health` | — | `{ status: 'ok' }` | — |
| `GET /api/screens` | — | `{ screens: [{ id, name, revision, updatedAt }] }` | — |
| `POST /api/screens` | `{ name }` | `{ screen: Screen }` | `400 INVALID_REQUEST` |
| `GET /api/screens/:id` | — | `{ screen: Screen }` | `404 NOT_FOUND` |
| `PUT /api/screens/:id` | `{ document, revision }` | `{ screen: Screen }`（revision+1） | `404` / `409 REVISION_CONFLICT` / `400 DOCUMENT_INVALID` |
| `DELETE /api/screens/:id` | — | `{ ok: true }` | `404 NOT_FOUND` |
| `GET /api/metrics/series?metric=&points=` | — | `{ metric, unit, points: [{ t, value }] }` | `400 UNKNOWN_METRIC` / `400 INVALID_POINTS` |
| `GET /api/metrics/ranking?dimension=&limit=` | — | `{ dimension, unit, items: [{ name, value }] }` | `400 UNKNOWN_DIMENSION` / `400 INVALID_LIMIT` |

`Screen = { id, name, revision, document, createdAt, updatedAt }`；错误体统一
`{ error, message }`。`document` 是 canonical Screen Document JSON——后端只存取，
其 schema 归 `@base-screen/contracts` 所有。

导出字段（`resourceId: 'cpu_usage'` 的演示指标）由 `GET /api/metrics/series` 提供，
三端通过宿主数据通道（resourcePort）消费，见下方"数据绑定"。

## 运行

```bash
pnpm install                 # 仓库根（首次）

# 终端 1：共享后端（必须先起，三端都连它）
pnpm dev:shared-backend     # http://127.0.0.1:3000 ，接口文档 /api/docs

# 终端 2：任选一个前端
pnpm dev:vanilla-host       # http://127.0.0.1:5173
pnpm dev:react-host         # http://127.0.0.1:5174
pnpm dev:vue-host           # http://127.0.0.1:5175
```

前端 dev server 通过 Vite `proxy` 把 `/api` 转发到 `3000`，因此**前后端可以分开启停**；
构建产物是纯静态站点，同样支持独立部署（API 地址运行时解析，见各前端 `src/lib/api-base.ts`）。

## 冒烟验证

冒烟脚本会自己拉起"已构建的后端"与"前端 preview"，因此**必须先构建**：

```bash
pnpm --filter @base-screen-example/shared-backend build
pnpm --filter @base-screen-example/vanilla-host build   # React / Vue 同理

pnpm verify:examples        # 依次跑三端冒烟
```

三端断言集合一致：种子列表渲染、设计器注册并挂载、指标读数经 host-resource
数据通道渲染出后端数值、查看器播放种子文档、指标接口确定性、**生产监控大屏的数据层六条**
（首屏灯阵/工序链/告警流水、URL 播种、变量联动、空结果、失败保留上一帧、后台暂停），
以及无未捕获页面错误。数据层断言的详细口径见下文「数据层接入」。

G–L 段是本轮新增的**数据源后台管理**闭环（三端逐字同构）：台账列表与筛选、REST 新建→
测试→保存→设计器目录可见、SQLite 表模式与 SQL 模式（固定值 / 变量两种参数绑定）、
失败态与预览截断、删除被引用时的 409 保护、header 掩码与字段变化二次确认。
冒烟**不点设计器内的深层数据源面板**：那几层用 API 克隆「生产监控大屏」的文档并改绑数据源，
再在查看页断言真的出数（选中模板屏是因为手工拼的最小文档会被 canonical 解析器拒掉）。

## 成品屏与 DataV 风格种子

三张 1920×1080 的成品文档，打开即可播放（默认销售 / 生产监控 / 系统监控）：

**「默认销售大屏」**——DataV 风格，顶栏 + 4 张 KPI 翻牌卡 + 渠道环形图 + 24h 面积趋势 +
目标水位 + 区域订单柱图 + 轮播排行 + 3 条胶囊进度 + 底部滚动字幕，共 50+ 个原子组件。
它演示三件事：

1. **外围插件就是物料来源**：DataV 四件套（`datav.border-box` / `digital-flop` /
   `scroll-board` / `water-level`）与两个新物料（`datav.capsule-progress` /
   `datav.marquee`）来自 `@base-screen/plugin-datav-materials`；图表来自
   `@base-screen/plugin-echarts`（line / bar / area / pie）。宿主只做两件事：
   注册元素、把 manager 的 snapshot 合进 catalog。
2. **插件贡献必须被授权**：三个 `dataResourceType`（`demo_metric` / `demo_series` /
   `demo_ranking`）由宿主自有插件声明，`runtimeContributions` 同时交给设计器与
   查看器；漏掉声明时 host-resource 组件会被渲染器直接丢弃（画布空白）。
3. **查看态等比缩放**：查看器按文档 `canvas` 尺寸计算 `min(vw/cw, vh/ch)`，用
   `translate + scale` 居中；工具栏与舞台平级，不随大屏放大。

**「生产监控大屏」**——数据层成品，**四种 dataSource 全覆盖**：

| dataSource | 组件 | 数据来自 |
| --- | --- | --- |
| `dataset` | 设备状态灯阵 / 告警流水 / 产线工序链 | `monitor.devices` / `monitor.alarms` / `monitor.pipeline`（`/api/datasets`） |
| `variable` | 当前产线 / 时间窗 / 数据源状态 / 告警播报 / 时钟 / 更新时间 | 3 个 `static` 变量（可交互）+ 3 个 `production.*` 宿主只读变量 |
| `host-resource` | 5 张 KPI（OEE / 在线率 / 产量 / 目标达成 / 未处理告警）+ 产量趋势 + 产线负载排行 | `demo_metric` / `demo_series` / `demo_ranking`（`/api/metrics`） |
| `static` | 标题、标签、班组绩效表、三个选择器 | 文档内字面量 |

它同时是「物料形状 × 数据形状」的对照样本：`datav.status-grid` 承载多实体灯阵（48 台设备
一眼扫完），`datav.pipeline` 承载保序工序链（哪道卡住），`datav.scroll-board` 承载带等级色条
的告警流水（逐条读），三者消费的是同一个后端的三张表。

「系统监控大屏」保留原来的轻量卡片文档，用来覆盖宿主自有物料
`host-app.metric-value` 这条最小路径，也证明旧文档没有被新种子破坏。

## 数据层接入

两个端口在 `configure` 时提交（渲染器创建时捕获，**之后再赋值会被拒绝**）：

| 端口 | 实现文件（三端同名） | 职责 |
| --- | --- | --- |
| `datasetPort` | `src/screen/host-dataset-port.ts` | `list` / `describe` / `query` → `/api/datasets*`；声明 `queryScope: 'dataset'` 开启同参数并发合并 |
| `hostCatalogPort` | `src/screen/host-catalog-port.ts` | 来源目录与取值：`list` / `describe` 供设计器变量面板列出宿主来源（`previewable: true`），`resolve` 求值 `data-source` 变量（`production.clock` / `notice` / `status`，`readOnly: true`） |

轮询由 `src/screen/host-refresh-controller.ts` 驱动（**只有查看页装，设计态不轮询**）。

### datasetPort 的四条硬规矩

1. **`list` 必须剥掉 `groups`**：`ScreenDatasetEntries` 是 strictObject，多一个键 contracts
   解析就失败；分组由 `groups()` 单独取，且复用 `list({limit:1})` 的 `groups` 字段缓存 60s。
2. **`query` 的 abort signal 在第二个参数**（`ScreenDatasetQueryRequest` 里没有 signal）；
   被取消时返回 `{ ok: false, diagnostics: [] }`——空诊断表示"取消"，不是失败。
3. **不下发 `componentId`**：后端 `forbidNonWhitelisted` 会 400；`params` 已由基座按
   `describe().parameters` 校验求值，端口只负责拼 query string。
4. **错误映射**：404 / `UNKNOWN_DATASET` → `HOST_DATASET_UNAVAILABLE`；400 / 422 →
   `HOST_DATASET_PARAMETER_INVALID`；网络失败 / 5xx → `HOST_DATASET_UNAVAILABLE`；
   响应形状不对 → `HOST_DATASET_INVALID`。

> 注意：渲染器在物料边界会把非冻结码归一成 `HOST_RESOURCE_FAILED`（冻结集只有 8 个码）。
> 因此屏上角标对「参数非法」与「数据集 404」都显示「数据更新失败」——**精确原因由宿主的
> `production.status` 变量承载**，物料角标只表达"这块数据不新鲜了"。

### 变量分层

- `static`（`line` / `window` / `severity`）：文档内可变，URL 播种与蓝图 `set-variable`
  写的都是它。查看页的 `?line=` 播种**改写文档副本里的 `initialValue` 与内联取值**而不是调
  `getVariable().set()`——后者依赖首次成功渲染后才会写入的变量表，首帧前必然失败且静默。
- `data-source`（`production.clock` / `notice` / `status`）：宿主只读，由
  `hostCatalogPort.resolve` 求值。端口不向运行时抛异常：来源失败时返回失败诊断，
  渲染器把实例记为 error，变量沿用 `initialValue`——单个来源失败不会让**整屏不渲染**。

### 轮询与降级

节拍按**数据源身份**而不是物料 type 决定（同一份数据画成灯阵还是表格，刷新频率一致）：

| 数据源 | 间隔 |
| --- | --- |
| `monitor.alarms` | 3s |
| `monitor.devices`、`demo_metric` 的 oee / online_rate / output_count / alarm_open | 5s |
| `monitor.pipeline`、`demo_metric` 的 line_load | 15s（负载变化慢，取 15s；与 PRD 的 5s 不同属有意取舍） |
| `demo_metric` 的 energy_ratio、`demo_series`、`demo_ranking` | 60s |
| 其它（含 `variable` 数据源组件） | 30s |

> `variable` 数据源组件**不产生网络请求**（值来自宿主的 `hostCatalogPort.resolve`），但它仍参与 30s 节拍：
> 到点会重新求值一次，用来刷新 `production.clock` / `production.status` 这类宿主状态文案。

- **一个 250ms 心跳扫到期表**，不是每组件一个定时器；在飞行中的组件跳过（不叠加）。
- **后台标签页不累积欠账**：`hidden` 时停心跳且不记 `nextDue`；恢复 `visible` 立刻全量补
  一次并把节拍整体推后。
- **失败降级**：已经画过一帧的组件在 `error` 时**保留上次画面**，只在右上角加 12px 角标
  （无动画、不改变几何）；从未成功过才显示 SDK 占位。`loading` 从不清楚屏（否则轮询会闪）。
- **状态 chip**：查看页顶栏 `[data-viewer-status]`，在线=绿、离线=橙，文本与屏内
  `production.status` 同一套语义。

> 角标计数请用 **`[data-datav-degraded-badge]`**。角标节点同时带 `data-datav-degraded`，
> 宿主元素也同步该属性（样式钩子），因此 `[data-datav-degraded]` 会命中两个节点。

### URL 参数

三端都是 HashRouter，**查询串写在 hash 里**：`#/screens/<id>/view?line=LINE-B`。

| 参数 | 语义 |
| --- | --- |
| `?line=LINE-A\|LINE-B\|LINE-C` | 播种 `line`（非法值忽略并 warn） |
| `?window=60\|240\|1440` | 播种 `window`（分钟） |
| `?severity=all\|critical\|warning\|info` | 播种 `severity` |
| `?poll=0` | 关闭轮询（`tickNow` 也随之不可用） |
| `?poll=<ms>` | 所有组件用同一天花板间隔（测试用） |
| `?fail=500` | 每次 dataset query 追加 `fail=500`（**仅在设置 `DATASET_FAIL_INJECTION=1` 的环境生效**；未开启时该参数按未声明参数拒成 400。首帧即失败时只有占位 + 离线 chip，没有角标——没有上一帧可保留） |
| `?smoke=1` | 挂 `window.__baseScreenHost`：只有 `tickNow()` / `refreshNow()` / `status()` 三个入口 |


## 数据绑定演示

起始文档里那张卡片**不是一个物料**，而是四个原子物料按 zIndex 叠出来的：`stage-card-bg`
（`base.rectangle` 底座与边框）、`stage-card-title`（`base.text`）、`stage-card-rule`
（`base.rule`）与 `stage-card-value`。四个节点都是根节点——组壳的几何由引擎持有，配置了
`groupMaterialType` 之后任何一次事务都会把 `base.container` 吸附到其子孙的包围盒并集，拿它当
父节点会在第一次无关编辑时压平卡片的内缩留白。其中 `stage-card-value` 的 `dataSource` 是 `host-resource`
（`resourceType: 'demo_metric'`、`resourceId: 'cpu_usage'`）。三端各自的
`src/screen/host-data-channel.ts` 把它解析成一次 `/api/metrics/series` 查询，
经物料的 tabular 适配器投影为组件视图模型——这正是宿主接入真实数据源的形态。

物料 `host-app.metric-value`（只画「数值 + 单位」的原子读数）在三个前端里各写一遍（React 组件 /
Vue SFC / 原生自定义元素），但 `type`、`tagName` 与 schema 完全一致，因此**同一份 canonical
文档能在三端渲染**。三端的 `configure` 都带 `groupMaterialType: 'base.container'`，所以多选原子
物料即可成组整体移动/缩放/旋转；要成套插入同一份组合，用 `insertComponentFragment`，预设 JSON
由宿主自己存。

三端的数据通道都支持三种宿主资源类型，投影形状与绑定角色一一对应：

| resourceType | resourceId | 返回表格 | 消费物料与绑定角色 |
| --- | --- | --- | --- |
| `demo_metric` | 指标名 | `value`（最新点） | 翻牌器 / 水位图 / 胶囊进度：`value` |
| `demo_series` | 指标名 | `t` + `value`（全量序列） | ECharts 折线/面积/柱状：`dimension` + `measures` |
| `demo_ranking` | `region` / `channel` | `name` + `value` | 环形图 / 柱状图：`dimension` + `measures`；轮播列表：`columns` |

三种类型同时由宿主自有插件声明为 `dataResourceType` 贡献——这不是可选装饰：一旦
`runtimeContributions` 传给渲染器，未声明的类型会被拒绝，表现为「文档有组件、画布空白」。

## 数据源后台管理

入口：顶栏「数据源」tab 或直接访问 `#/datasources`（三端一致）。列表的**名称列**下方是
datasetId，**点一下即复制**（`navigator.clipboard`；剪贴板不可用时退化为选中文本）。
数据源是**资产**：
类型 → 连接配置 → 测试连通性 → 预览数据 → 被引用情况，最后在设计器的数据源面板里被绑定。

### 四类数据源

| 类型 | 用户填什么 | 取数方式 |
| --- | --- | --- |
| `sqlite` | 受管目录里的 `.db` 文件名 + 表模式（表/列/等值过滤）或 SQL 模式（单条 `SELECT`/`WITH`） | 只读连接 + 命名参数绑定 |
| `rest` | 完整 URL + 0..10 个 header + 0..10 个查询参数声明 | 服务端 `GET`，响应必须是对象数组或 `{rows:[...]}` |
| `static` | 列定义 + 行数据（≤200 行 / 64 KiB，单元格只允许标量） | 直接返回 |
| `builtin` | —— | 4 个内置数据集的代码常量（只读，不可增删改） |

### 状态语义

| 状态 | 含义 | 进设计器目录？ | `describe` / `query` |
| --- | --- | --- | --- |
| `ready` | 最近一次测试成功且字段非空 | ✅ | 200 |
| `draft` | 创建后从未测试成功（含保存时必填参数没有值） | ❌ | 404 `DATASET_NOT_READY` |
| `error`（列表徽标「异常」） | 最近一次测试失败（`lastTest.code` 给分类） | ❌ | 404 `DATASET_NOT_READY` |
| `builtin` | 内置（`ready` 的只读特例，合成状态，不入库） | ✅ | 200 |

> **为什么未就绪是 404 而不是 200 + 空字段**：空字段列表会被渲染器当成「0 列/无数据」，
> 值班员看到的是「这张屏没数据」——这是误导。404 走的是已经建好的降级路径（保留上一帧 +
> 角标 + 状态转离线），这是诚实。目录本来就过滤未就绪的数据源，正常流程绑不到 `draft`；
> 只有手改文档才会撞上，这种时候报错比空表有用。
>
> `ready` 之后**运行时**失败（库被删、SQL 报错、上游 500）**不会**被改写成 `NOT_READY`：
> 它按原错误码返回，由宿主映射 `HOST_DATASET_UNAVAILABLE` 并保留上一帧——否则会把人误导去
> 管理页重测。

### 安全边界（SQLite）

| 边界 | 行为 |
| --- | --- |
| 只读 | 首 token 必须是 `SELECT`/`WITH`；`INSERT/UPDATE/DELETE/REPLACE/CREATE/DROP/ALTER/VACUUM/REINDEX/ATTACH/DETACH/PRAGMA` 整词拒绝 → 400 `READONLY_VIOLATION`。连接本身也是 `readOnly:true`，写操作被驱动二次拒绝（执行后文件 SHA-256 与 mtime 不变） |
| 单语句 | 只有词法 `normal` 态的分号才是分隔符：`SELECT ';'`、`SELECT 1 -- ; DROP` 都合法；第二条语句 → 400 `MULTI_STATEMENT` |
| 行数与体积 | 未写 `LIMIT` 也最多 500 行；结果 ≤1 MiB；超限只标 `truncated`，不报错 |
| 超时 | 单次 3 s，超时 `SIGKILL` 执行子进程 → 422 `QUERY_TIMEOUT`；主进程与其它查询不受影响 |
| 路径 | 只能选受管目录内的 `.db` 文件名：`^[\w.-]+\.db$` + `realpath` 父目录比较（挡符号链接）+ 宿主库 basename 黑名单（`screens.db`/`test.db`/`smoke-*.db`）。错误与响应里不含任何绝对路径 |
| 受管目录 | `examples/shared-backend/data/datasources/`。**必须是独立子目录**：`data/` 里放着宿主自己的库，把 `data/` 当受管目录等于把 `Screen` 表（含全部大屏文档）暴露成可选数据源；启动时会断言「受管目录 ≠ `data/`」 |
| 语法 | 注释未闭合、引号未闭合、空语句 → **400 `INVALID_SQL`**（责任在提交表单的人，与"这次查不出"分开）；`?`/`$x`/`@x` 占位符 → 400 `UNDECLARED_PARAMETER`（只支持 `:name`） |
| 二进制列 | `BLOB` 列在表结构接口里标 `supported:false`、UI 不可勾选；SQL 模式结果里出现二进制列 → `INVALID_SHAPE`（预览/测试是 200 + `ok:false`，保存则落 `error`） |

REST 侧：只允许 `http:`/`https:`（含重定向目标）、8 s 预算、最多 3 跳重定向、响应体 1 MiB，
错误五分类 `UNREACHABLE` / `UNAUTHORIZED` / `UPSTREAM_ERROR` / `INVALID_SHAPE` / `INVALID_REQUEST`。

header 的校验（在**发请求之前**，失败一律 400 `INVALID_REQUEST`，不会落到 fetch 层被误判成
`UNREACHABLE`）：名字必须匹配 RFC 7230 token（≤128 字符）；**值里不允许出现 `\r` / `\n`**
（CRLF 注入）；值长度 ≤4096 字符。

### 放一个自己的库进去

```bash
cp my-data.db examples/shared-backend/data/datasources/
# 回到管理页 → 新建 → SQLite → 点「刷新」→ 下拉里出现 my-data.db
```

`workshop.db` 是**启动时幂等生成**的演示库（`devices` 24 行 / `work_logs` 600 行 /
`device_photos` 含 BLOB / 视图 `v_fault_devices`），随服务启动出现在下拉里；
它不进 Git（`*.db` 被忽略），文件已存在则跳过生成，所以你在里面加的表不会被覆盖。

### 接口

| # | 方法与路径 | 说明 |
| --- | --- | --- |
| 1 | `GET /api/datasources?type=&query=&limit=&offset=` | `{items,total,catalogVisibleCount}`；内置 + 自建，自建在前（`updatedAt` desc）、内置置底 |
| 2 | `GET /api/datasources/:datasetId` | 详情；header 只给 `{name, valueMasked:'••••••••', hasValue}`，SQLite 只给文件名 |
| 3 | `POST /api/datasources` | 201；**保存即取数一次**，成功且字段非空 → `ready`，失败 → `error`（不阻塞保存） |
| 4 | `PUT /api/datasources/:datasetId` | 同上；`type` 不可改；header 传空串/掩码 = 保留原值 |
| 5 | `DELETE /api/datasources/:datasetId` | 被引用 → 409 `DATASOURCE_IN_USE` + `refScreens`（不级联、不改别人的文档） |
| 6 | `POST /api/datasources/test` | 草稿配置，不落库；**配置/安全类错误 4xx**、**连通性错误 200 + `ok:false`**（见下方分界说明） |
| 7 | `POST /api/datasources/:datasetId/test` | 用库里的配置（含真实 header 原值）测试并落状态 |
| 8 | `POST /api/datasources/preview` | 草稿预览：`rows` ≤20、`rowCount` ≤500（真实行数）；错误分界同 #6 |
| 9 | `GET /api/datasources/database-files` | 受管目录内的 `.db`（排除宿主库） |
| 10 | `GET /api/datasources/database-files/:name/tables` | 表/视图 + 列（`supported:false` = BLOB） |

`/test` 与 `/preview` 的**失败分两类**（前端据此决定"改表单"还是"再试一次"）：

| 类别 | HTTP | 错误码 |
| --- | --- | --- |
| 配置 / 安全类 | **4xx**（`{error,message}`） | `PATH_NOT_ALLOWED`、`READONLY_VIOLATION`、`MULTI_STATEMENT`、`UNDECLARED_PARAMETER`、`MISSING_PARAMETER`、`TABLE_NOT_FOUND`、`UNKNOWN_COLUMN`、`DUPLICATE_COLUMN`、`INVALID_REQUEST`、`TOO_LARGE`、`INVALID_SQL` |
| 连通性 / 上游类 | **200 + `ok:false`** | `UNREACHABLE`、`UNAUTHORIZED`、`UPSTREAM_ERROR`、`INVALID_SHAPE`、`QUERY_TIMEOUT` |
| 契约路由 `/api/datasets/:id/query`（对照组） | 运行时失败按 **5xx**，**`QUERY_TIMEOUT` 为 500** | 宿主把 400/422 映射成 `HOST_DATASET_PARAMETER_INVALID`、5xx 映射成 `HOST_DATASET_UNAVAILABLE`；超时给 422 会让屏上显示「参数错误」，把人引去改参数 |

> 早先两类都是 200，前端只能靠 `code` 猜"是表单错了还是接口没通"；而且 A17 明确要求越权路径
> 给 400。现在「你提交了不允许的配置」是 4xx，「这一次没测通」仍是 200。
> `POST /api/datasources/:datasetId/test`（用**已存配置**测试）与 `/test` **同一套口径**：
> 它只是配置来源不同（库内 vs 请求体），语义都是"执行一次探测"。

绑定侧（设计器/查看器走这条）：

- `GET /api/datasets` 的目录 = 4 个内置 + 只含 `ready` 的自建（`groupId: 'custom'`，分组名
  「自定义数据源」）；上限 50 条（内置 4 + 最近 46 个自建，超出部分只影响设计器可见性，
  管理页仍能看到全部）。
- `catalogVisibleCount` = 实际进目录的自建条数（≤46）。管理页用它与 `total` 比较后提示
  「设计器面板仅显示最近 46 个自建数据源」——`total` 含内置与草稿，拿它猜不准。
- `GET /api/datasets/:id` 与 `/:id/query`：未就绪 404 `DATASET_NOT_READY`；`query` 接受该数据源
  **声明的参数名**，响应键集严格为 `{fields, rows, totalRowCount}`。

### 已知限制

- 页面上**不提供上传** `.db`（要手工放进 `data/datasources/` 再点刷新）；P1。
- 只接 SQLite：MySQL/Postgres/ClickHouse 等外部驱动需要连接串、凭据与连接池，本轮不做。
- REST 源在「表单未改动 + header 是掩码」时，**预览**拿不到明文 header（`/preview` 只吃草稿
  配置）——这类源请用「测试连接」（`#7` 用库内原值）。抽屉里对未改动的表单会自动选这条路径。
- 编辑被引用的数据源时若字段集合变化，会先弹二次确认；保存**不阻止**，运行时按
  `HOST_DATASET_BINDING_INVALID` 降级（保留上次值 + 角标），需要到大屏里重新绑定。

## 验收项追溯（PRD A1–A20）

只列**实际有断言**的覆盖点。「三端 smoke」指三个 `scripts/smoke.mjs` 里同构的段落；
「根测试」指 `tests/examples/*.test.ts` 与后端 jest。

| PRD | 覆盖位置 | 断言要点 |
| --- | --- | --- |
| A1 | 后端 `datasets.service.spec` + e2e | `?query=告警` 只命中 `monitor.alarms`，`groups` 长度 1 |
| A2 | 后端 `datasets.service.spec` + e2e | `describe` 5 字段 / 2 参数 / 3 个 allowedValues |
| A3 | 后端 `datasets.service.spec` + 根测试 | `describe.fields` 与 `query.fields` 逐字段相同；绑定字段是数据集字段的子序列 |
| A4 / A5b | 三端 smoke（B 段） | dataset query 串含 `line=LINE-B`，无 `[object Object]` |
| A5 | 三端 smoke（A 段） | 三个 `dataset` 组件各 1 次 query；`production.*` 变量不产生网络请求 |
| A6 | 三端 smoke（C 段） | 点选择器 → 该数据集出现新的 `line=LINE-B` query |
| A7 | 三端 smoke（A 段） | `demo_*` 请求数在首屏稳定（不被新链路挤掉） |
| A8 | 三端 smoke（A/B 段） | 告警 query 串同时含 `line`/`window`/`level` 三个参数 |
| A9 | 三端 smoke（`tickNow`） | `tickNow()` 后请求数增加（读数变化由 `clock` 变量承载） |
| A10 | 三端 smoke（F 段） | hidden 期间 `tickNow()` 不发请求；恢复 visible 后补一次 |
| A11 | 未覆盖 | 需要 Playwright 挂起请求 + 并发去重，属人眼/后续专项 |
| A12 | 三端 smoke（C/E 段）+ 根测试 | 屏上联动走蓝图；HTTP 层 400 由后端 e2e 断言 |
| A13 | 三端 smoke（E 段） | 成功后注入 500：保留上一帧 + 角标 + 离线 chip（连续两次采样） |
| A14 | 三端 smoke（D 段） | LINE-C：0 格 + 空文案 + 无角标 + 仍在线 |
| A15 | `plugins/plugin-datav-materials/tests/values.test.ts` | 越界读数不改数：`clampPercent(120)=100`（液面）但对 `formatWaterLevelLabel(120,1)` 断言文本 `120.0%`。PRD 原写 `gauge`，本轮 `gauge` 未实现，由 `water-level` 承载同一条规则 |
| A15b | `tests/examples/host-catalog-port.test.ts` | 来源求值抛错时端口返回失败诊断而非 reject；渲染器把实例记为 error、变量沿用 `initialValue`，整屏照常渲染 |
| A16 / A17 | `plugins/plugin-datav-materials/tests/{status-grid,pipeline}.test.ts` + `tests/best-practices/dataset-material-best-practice.test.ts` | 字段不存在、角色不存在、字段数越界 → `HOST_DATASET_BINDING_INVALID`；根测试只做**正向**校验，负例在物料测试与 best-practices 里 |
| A18 | `tests/best-practices/dataset-material-best-practice.test.ts`（`dataset binding value type gate`） | 角色 `valueTypes` 不含字段实际类型 → 拒绝：把 `stages` 的 `throughput`(number) 换成 date 字段必须失败，换回 number 必须通过（对照组排除"因别的原因失败"） |
| A19 | 根测试 `tests/examples/datav-monitor-document.test.ts` + 后端 `screens.service.spec` | 四种 dataSource 各 ≥1（含 6 个 `variable` 组件）、6 个变量、3 条种子 |
| A20 | `pnpm verify:examples` | 三端各自跑同一组断言，且 tile/节点/行数/请求串完全一致 |
| （A5/A6 的下游）蓝图规则静态校验 | `tests/examples/datav-monitor-document.test.ts` | 每条规则的 `componentId` / `variableId` / `eventName` 都存在，`eventName` ∈ 该物料 manifest 的 events |

### 数据源后台管理（PRD A25–A39）

| PRD | 覆盖位置 | 断言要点 |
| --- | --- | --- |
| A25 | 三端 smoke（G 段） | 顶栏「数据源」→ `#/datasources`、tab `aria-current=page`、点「大屏」回 `#/`、直接访问可达 |
| A26 | 三端 smoke（G 段） | 6 行（4 内置 + 2 播种）、表头 7 列、播种 REST 徽标「草稿」/ 播种静态「就绪」、内置 4 行在末尾且无编辑/删除、`scrollWidth <= clientWidth` |
| A27 | 三端 smoke（G 段） | 搜索「示例」=2、筛选「内置」=4、SQLite + 不存在的关键词 → 空态 + 「清空筛选」→ 回 6 行 |
| A28 | 三端 smoke（H 段） | 新建 REST（地址用脚本的 `API_BASE`，不硬编码 3000）→ 测试 `rowCount=12`、字段恰 `t/device/value` 且 `value` 为 number → 保存「就绪」→ 目录命中；**编辑器绑定**用 API 克隆监控屏文档改绑后，查看页出 12 格 |
| A29 | 三端 smoke（I 段） | 表模式 `workshop.db`/`devices`/勾 `id,name,status` → 预览 20 行 → 保存「就绪」+ `configSummary='workshop.db · devices'` → 目录 `groupId=custom` → 改绑后查看页 24 格、契约查询首行 `id` 非空 |
| A30 | 三端 smoke（I 段） | SQL 模式 + `:status`（默认 `fault`）→ 预览全 `fault`；保存后固定值 `running` 的屏 12 格、变量（`dsStatus` 初值 `fault`）的屏 6 格，且 `?status=running` 查询结果全 `running` |
| A31 | 三端 smoke（J 段） | 地址 `http://127.0.0.1:9/none` → 测试文案含「地址不可达」+「检查 URL」→ 保存仍成功、列表徽标为「异常」 |
| A32 | 三端 smoke（J 段） | 静态 30 行 → 预览表 20 行 + 「共 30 行」；`work_logs` 600 行 → 「已截断至 500 行」 |
| A33 | 三端 smoke（K 段） | 删除被引用 → 「无法删除」+ 引用屏名 → 「去解绑」→ `#/screens/<id>/edit` 且编辑器加载 → 返回列表该行仍在 → 「知道了」关闭 |
| A34 | 三端 smoke（G 段） | 内置行点「测试连接」→ 「内置数据集，无需连接」 |
| A35 | 三端 smoke（L 段） | 带 `X-API-Key` 新建后页面文本不含明文；编辑抽屉值留空且占位 `••••••••`；SQLite 摘要不含 `data/` 或盘符 |
| A36 | 三端 smoke（L 段）+ 根测试 | 取消勾选 `status` 保存 → 「字段变化会影响 N 张大屏」+ 屏名 → 「仍然保存」→ 查看页标题仍在（不白屏）、灯阵 0 格 + `Host dataset binding is invalid.`；根测试用物料真实 role 断言 `HOST_DATASET_BINDING_INVALID` 的正反例 |
| A37 | 根测试 `tests/examples/datasource-contract.test.ts` | 内置条目取自 `DATASET_DEFINITIONS`、自建参数取自 `parametersToDefinitions` → 过 Entries/Definition/Tabular 三个解析器；`description:null` 合法、空串非法、tabular 多一个键非法 |
| A38 | 根测试 `tests/examples/vanilla-datasource-route.test.ts` | `#/datasources` 与 `?type=sqlite` 命中；`#/datasources/x` not-found；`#/screens/:id/edit`、`?line=` 行为不变 |
| A39 | 根测试 `tests/examples/datasource-binding.test.ts` | `custom.*` 文档通过 `parseScreenDocument`；绑定字段都在 `fields` 内 → 通过，缺字段/角色不足 → `HOST_DATASET_BINDING_INVALID`（角色取自 `PLUGIN_DATAV_STATUS_GRID_MANIFEST`，不手抄） |

> 未列出的子项（配色对比度、字号、动画节奏等纯视觉项）由人眼验收，不进自动化。

## 分层与职责

- **后端**负责存储、检索、并发控制（revision 乐观锁）与数据查询；不理解文档内部结构。
- **前端**负责页面、路由、状态与宿主侧适配器（项目存取、数据通道、宿主物料）。
- **Base Screen**负责当前实例内的 canonical 文档编辑与渲染——它不碰网络、不实现存储。

## 相关入口

- [基座特性矩阵](../tooling/verification/browser-harness/cases.html)：人眼逐项验证入口（`pnpm dev:browser-harness`）
- [物料模板 MCP provider](../tooling/material-mcp-server)：面向上层工具链
- [仓库分层与检查门禁](../AGENTS.md)：包边界、依赖规则与验证命令

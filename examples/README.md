# Examples

Base Screen 的示例群：**一个共享后端 + 三个对等前端**，外加两个基础设施载体（基座回归与工具链）。

```text
examples/
├── host-api/           NestJS + Prisma/SQLite 共享后端（唯一后端，三端共用）
├── host-app-react/     Vite + React 19 SPA
├── host-app-vue/       Vite + Vue 3 SPA（同时是 verify:tarball 的外部消费者载体）
└── host-app-vanilla/   Vite + 原生 TypeScript SPA

../harness/browser-harness/   基座自身特性矩阵 + Playwright 断言（pnpm verify:browser）
../tooling/material-mcp-server/  面向上层工具链的物料模板 MCP provider
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

## REST 契约（由 host-api 实现，三端共用）

| 方法与路径 | 请求 | 成功响应 | 失败响应 |
| --- | --- | --- | --- |
| `GET /api/health` | — | `{ status: 'ok' }` | — |
| `GET /api/screens` | — | `{ screens: [{ id, name, revision, updatedAt }] }` | — |
| `POST /api/screens` | `{ name }` | `{ screen: Screen }` | `400 INVALID_REQUEST` |
| `GET /api/screens/:id` | — | `{ screen: Screen }` | `404 NOT_FOUND` |
| `PUT /api/screens/:id` | `{ document, revision }` | `{ screen: Screen }`（revision+1） | `404` / `409 REVISION_CONFLICT` / `400 DOCUMENT_INVALID` |
| `DELETE /api/screens/:id` | — | `{ ok: true }` | `404 NOT_FOUND` |
| `GET /api/metrics/series?metric=&points=` | — | `{ metric, unit, points: [{ t, value }] }` | `400 UNKNOWN_METRIC` / `400 INVALID_POINTS` |

`Screen = { id, name, revision, document, createdAt, updatedAt }`；错误体统一
`{ error, message }`。`document` 是 canonical Screen Document JSON——后端只存取，
其 schema 归 `@base-screen/contracts` 所有。

导出字段（`resourceId: 'cpu_usage'` 的演示指标）由 `GET /api/metrics/series` 提供，
三端通过宿主数据通道（resourcePort）消费，见下方"数据绑定"。

## 运行

```bash
pnpm install                 # 仓库根（首次）

# 终端 1：共享后端（必须先起，三端都连它）
pnpm dev:host-api            # http://127.0.0.1:3000 ，接口文档 /api/docs

# 终端 2：任选一个前端
pnpm dev:host-app-vanilla    # http://127.0.0.1:5173
pnpm dev:host-app-react      # http://127.0.0.1:5174
pnpm dev:host-app-vue        # http://127.0.0.1:5175
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
数据通道渲染出后端数值、查看器播放种子文档、指标接口确定性、无未捕获页面错误。

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

## 分层与职责

- **后端**负责存储、检索、并发控制（revision 乐观锁）与数据查询；不理解文档内部结构。
- **前端**负责页面、路由、状态与宿主侧适配器（项目存取、数据通道、宿主物料）。
- **Base Screen**负责当前实例内的 canonical 文档编辑与渲染——它不碰网络、不实现存储。

## 相关入口

- [基座特性矩阵](../harness/browser-harness/cases.html)：人眼逐项验证入口（`pnpm dev:browser-harness`）
- [物料模板 MCP provider](../tooling/material-mcp-server)：面向上层工具链
- [仓库分层与检查门禁](../AGENTS.md)：包边界、依赖规则与验证命令

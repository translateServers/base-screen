# Host App · Vanilla

Base Screen 全栈示例群的 **Vanilla 前端**：Vite + 原生 TypeScript SPA，
联调共享后端 [`examples/shared-backend`](../shared-backend)（NestJS + Prisma/SQLite）。
React / Vue / Vanilla 三个前端功能完全对等，本工程是零框架的参考实现。

## 架构

```
src/
├── main.ts                    # 入口：注册物料/元素、挂载外壳、启动 hash 路由
├── router.ts                  # hash 路由 + 视图模块动态 import（路由级代码分割）
├── store/                     # zustand store：screens-store（列表状态机）+ screen-session-store（会话状态机）
├── types.ts                   # 与后端 REST 契约对齐的投影类型
├── lib/
│   ├── api-base.ts            # API Base 运行时解析（注入 > 构建期 env > 同源相对）
│   ├── api.ts                 # Result 风格 fetch 封装：统一错误体、GET 幂等重试、AbortSignal
│   ├── logger.ts              # 轻量日志（debug 仅 dev）
│   ├── dom.ts                 # 最小 DOM 构建助手
│   ├── format.ts / navigation.ts
├── screen/
│   ├── register.ts            # 自有物料条目，直接交给标准 SDK runtime 注册
│   ├── metric-value.ts            # 三端共有的「指标读数」manifest（host-resource 能力 + 表格适配）
│   ├── metric-value-element.ts    # Vanilla 自定义元素实现 + tabularDataAdapter
│   ├── project-adapter.ts     # 宿主项目适配器：load/save，宿主维护 revision
│   └── host-data-channel.ts   # resourcePort：host-resource -> /api/metrics/series
├── views/                     # screen-list / screen-edit / screen-view / not-found
├── components/                # app-shell / error-banner / toast / spinner
└── styles/                    # base（令牌）/ layout（响应式外壳）/ components
```

## 技术选型理由

| 选择 | 理由 |
| --- | --- |
| 零前端框架 | Vanilla 栈的题目本身；DOM 构建助手 + hash 路由即可覆盖三页流程 |
| hash 路由 | 静态托管无需 SPA fallback；与 React/Vue 两端路由行为对等 |
| zustand（`zustand/vanilla`） | 状态机与 React / Vue 两端同源同一套迁移；Vanilla 直接 `getState()` / `subscribe()` 消费，无需框架绑定 |
| 运行时 API Base | `window.__HOST_APP_CONFIG__.apiBaseUrl` > `VITE_API_URL` > 同源 `/api`；同一产物可切换后端，冒烟脚本即用注入模式 |
| TypeScript 5.9.3 | 与三个工程及工具链对齐的稳定版本（根仓 TS 7 尚未被该工具链支持） |

## 运行

```bash
pnpm install                                        # 仓库根（首次）
pnpm dev:shared-backend                             # 终端 1：共享后端 :3000
pnpm dev:vanilla-host                               # 终端 2：本前端 :5173（/api 代理到后端）
```

- 列表页 `#/`：新建 / 编辑 / 查看 / 删除
- 编辑页 `#/screens/:id/edit`：SDK Designer 挂载控制器嵌入 `<base-screen-designer>`，权威项目状态与分阶段诊断经回调提供；保存走宿主 project adapter
  （顶栏「保存」显式触发；revision 乐观锁，冲突时 toast 提示）；逐条规格见
  [../README.md](../README.md) 的「编辑页保存规格」
- 查看页 `#/screens/:id/view`：`<base-screen-viewer>` 只读播放

## 冒烟

```bash
pnpm --filter @base-screen-example/shared-backend build
pnpm --filter @base-screen-example/vanilla-host build
pnpm --filter @base-screen-example/vanilla-host verify
```

冒烟脚本自动起已构建的后端（:3210）与前端 preview（:3222），断言：种子列表、
设计器挂载、指标读数经 host-resource 数据通道渲染后端数值、查看器播放、
指标接口确定性、无未捕获页面错误。

## 横切规格（三端对等）

- 响应式：≥1200px 完整外壳；768–1199px 紧凑内边距；<768px 单列。设计器容器查询
  在窄/矮容器会提示空间不足（引擎行为），编辑页在小屏给桌面端提示。
- 错误处理：`api.ts` 返回 Result 风格；统一 ErrorBanner + 重试；GET 网络失败重试 1 次。
- 日志：`lib/logger.ts`（scope + 时间戳，debug 仅开发模式）。
- 性能：视图动态 import、列表单次拉取、保存由顶栏显式触发（宿主不轮询文档变化）。
- 样式稳定：骨架屏尺寸固定；hover 只改边框/背景色，不改几何。

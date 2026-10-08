# Host App · Vue

Base Screen 全栈示例群的 **Vue 前端**：Vite + Vue 3 SPA，
联调共享后端 [`examples/host-api`](../host-api)（NestJS + Prisma/SQLite）。
React / Vue / Vanilla 三个前端功能完全对等。

本工程同时是 `pnpm verify:tarball` 的**外部消费者**载体：CI 会把它复制到仓库外、
把 `@base-screen/*` 依赖换成同批次真实 tarball，再跑类型检查 / 构建 / 浏览器冒烟，
以证明"宿主自建 Vue 工程从发布物消费 ABI"这条路成立。

## 架构

```
src/
├── main.ts                     # 入口：注册物料/元素、挂载 Vue 应用与路由
├── router.ts                   # vue-router（hash history，与三端对等）
├── App.vue                     # 外壳 + RouterView
├── types.ts                    # 与后端 REST 契约对齐的投影类型
├── store/                      # zustand：screens-store（列表状态机）、screen-session-store（会话状态机）
├── composables/use-stores.ts   # 把 zustand store 快照桥接进 Vue 响应式系统
├── lib/
│   ├── api-base.ts             # API Base 运行时解析（注入 > 构建期 env > 同源相对）
│   ├── api.ts                  # Result 风格 fetch 封装：统一错误体、GET 幂等重试、AbortSignal
│   ├── logger.ts / format.ts / toast.ts
├── screen/
│   ├── register.ts             # 设计器/查看器/官方物料/自有物料注册（公开入口，幂等）
│   ├── metric-value.ts             # 三端共有的「指标读数」manifest
│   ├── metric-value-material.ts    # Vue 桥（createVueMaterialDefinition + mapModel + 表格适配）
│   ├── project-adapter.ts      # 宿主项目适配器：load/save，宿主维护 revision
│   └── host-data-channel.ts    # resourcePort：host-resource -> /api/metrics/series
├── components/                 # AppShell / ScreenList / ScreenEditor / ScreenViewer /
│                               # ErrorBanner / SkeletonGrid / MetricValue(SFC 物料)
└── styles/                     # base（令牌）/ layout（响应式外壳）/ components（含 .metric-value）
```

## 技术选型理由

| 选择 | 理由 |
| --- | --- |
| Vite + Vue 3 SPA | 与 React / Vanilla 两端形态统一（纯前端 + 共享后端），`vue` 版本与仓库其余工程对齐 |
| vue-router（hash history） | 免 SPA fallback，三端路由行为对等 |
| zustand（`zustand/vanilla`）+ composable 桥接 | store 不依赖 Vue，与另两端同源同一套迁移语义；composable 用 `shallowRef` 同步快照，组件照常模板消费 |
| `shallowRef` 持有设计器 | 自定义元素内部状态无需 Vue 响应式代理（引擎内部持有自己的状态，代理只会增加开销） |
| 物料样式写在应用样式表 | Vue 桥接会把文档全局样式规则传播进设计器 shadow root，SFC 物料样式随 `src/styles/components.css` 生效（React 桥接无此能力，故那边用内联样式） |
| vue-tsc + TypeScript 5.9.3 | SFC 类型检查；版本与仓库其余工程及工具链对齐（根仓 TS 7 尚未被该工具链支持） |

## 运行

```bash
pnpm install                                        # 仓库根（首次）
pnpm dev:host-api                                   # 终端 1：共享后端 :3000
pnpm dev:host-app-vue                               # 终端 2：本前端 :5175（/api 代理到后端）
```

- 列表页 `/`：新建 / 编辑 / 查看 / 删除
- 编辑页 `/screens/:id/edit`：`<base-screen-designer>` 嵌入，自动保存走宿主 project adapter
  （revision 乐观锁，冲突时 toast 提示）；防抖 / 重试 / 返回前落地的逐条规格见
  [../README.md](../README.md) 的「编辑页自动保存规格」
- 查看页 `/screens/:id/view`：`<base-screen-viewer>` 只读播放

## 冒烟

```bash
pnpm --filter @base-screen-example/host-api build
pnpm --filter @base-screen-example/host-app-vue build
pnpm --filter @base-screen-example/host-app-vue verify
```

断言与 React / Vanilla 两端逐条一致：种子列表、设计器挂载、指标读数经
host-resource 数据通道渲染后端数值、查看器播放、指标确定性、无未捕获页面错误。

## 横切规格（三端对等）

- 响应式：≥1200px 完整外壳；768–1199px 紧凑内边距；<768px 单列。
- 错误处理：`api.ts` Result 风格 + ErrorBanner + 重试；GET 网络失败重试 1 次。
- 日志：`lib/logger.ts`（scope + 时间戳，debug 仅开发模式）。
- 性能：视图静态导入（单包一次拉取，不做路由级代码分割）、列表单次拉取、保存防抖 + 单飞复用 + 失败退避重试。
- 样式稳定：骨架屏尺寸固定；hover 只改边框/背景色，不改几何。

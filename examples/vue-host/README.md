# Host App · Vue

Base Screen 全栈示例群的 **Vue 前端**：Vite + Vue 3 SPA，
联调共享后端 [`examples/shared-backend`](../shared-backend)（NestJS + Prisma/SQLite）。
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
│   ├── register.ts             # 自有物料条目，直接消费框架桥产物
│   ├── composition-runtime.ts  # 返回应用内同一份标准 runtime
│   ├── host-runtime.ts         # 官方 runtime 组合 + 宿主在线物料业务
│   ├── host-resource-plugin.ts # 三个 dataResourceType 贡献（demo_metric/series/ranking）
│   ├── metric-value.ts             # 三端共有的「指标读数」manifest
│   ├── metric-value-material.ts    # Vue 桥（createVueMaterialDefinition + mapModel + 表格适配）
│   ├── project-adapter.ts      # 宿主项目适配器：load/save，宿主维护 revision
│   └── host-data-channel.ts    # resourcePort：标量/时序/排行三种投影
├── components/                 # AppShell / ScreenList / ScreenEditor / ScreenViewer /
│                               # ErrorBanner / SkeletonGrid / MetricValue(SFC 物料)
└── styles/                     # base（令牌）/ layout（响应式外壳 + 查看器缩放）/ components
```

## 技术选型理由

| 选择 | 理由 |
| --- | --- |
| Vite + Vue 3 SPA | 与 React / Vanilla 两端形态统一（纯前端 + 共享后端），`vue` 版本与仓库其余工程对齐 |
| vue-router（hash history） | 免 SPA fallback，三端路由行为对等 |
| zustand（`zustand/vanilla`）+ composable 桥接 | store 不依赖 Vue，与另两端同源同一套迁移语义；composable 用 `shallowRef` 同步快照，组件照常模板消费 |
| `shallowRef` 持有设计器 | 自定义元素内部状态无需 Vue 响应式代理（引擎内部持有自己的状态，代理只会增加开销） |
| 编辑页用 `@base-screen/vue` 薄封装 | 与 React 端同一条路径：`BaseScreenDesigner` 负责挂载/配置/加载/销毁，宿主订阅句柄事件而不是自己 `appendChild`；装配未就绪时 `runtime` / `mountOptions` 传 `null`，组件不挂载，宿主不需要 `v-if` 与占位节点 |
| 物料样式写在应用样式表 | Vue 桥接会把文档全局样式规则传播进设计器 shadow root，SFC 物料样式随 `src/styles/components.css` 生效（React 桥接无此能力，故那边用内联样式） |
| 外围插件作为物料来源 | 大屏四件套 / 胶囊进度 / 滚动字幕与图表都来自同一个 `plugin-materials`；宿主只注册元素并合并 manager 的 snapshot，不在示例里重写一套图表与动效 |
| vue-tsc + TypeScript 5.9.3 | SFC 类型检查；版本与仓库其余工程及工具链对齐（根仓 TS 7 尚未被该工具链支持） |

## 运行

```bash
pnpm install                                        # 仓库根（首次）
pnpm dev:shared-backend                             # 终端 1：共享后端 :3000
pnpm dev:vue-host                                   # 终端 2：本前端 :5175（/api 代理到后端）
```

- 列表页 `/`：新建 / 编辑 / 查看 / 删除
- 编辑页 `/screens/:id/edit`：嵌入 `@base-screen/vue` 的 `<BaseScreenDesigner>` 薄封装，
  挂载 / `configure` / `load` / 销毁由 SDK 挂载控制器编排，宿主只留端口接线与显式保存
  （顶栏「保存」显式触发；revision 乐观锁，冲突时 toast 提示）；逐条规格见
  [../README.md](../README.md) 的「编辑页保存规格」
- 查看页 `/screens/:id/view`：`<base-screen-viewer>` 只读播放

## 冒烟

```bash
pnpm --filter @base-screen-example/shared-backend build
pnpm --filter @base-screen-example/vue-host build
pnpm --filter @base-screen-example/vue-host verify
```

断言与 React / Vanilla 两端逐条一致：种子列表、设计器挂载、指标读数经
host-resource 数据通道渲染后端数值、查看器播放、指标确定性、无未捕获页面错误。

## 横切规格（三端对等）

- 响应式：≥1200px 完整外壳；768–1199px 紧凑内边距；<768px 单列。
- 错误处理：`api.ts` Result 风格 + ErrorBanner + 重试；GET 网络失败重试 1 次。
- 日志：`lib/logger.ts`（scope + 时间戳，debug 仅开发模式）。
- 性能：视图静态导入（单包一次拉取，不做路由级代码分割）、列表单次拉取、保存由顶栏显式触发（宿主不轮询文档变化）。
- 样式稳定：骨架屏尺寸固定；hover 只改边框/背景色，不改几何。

# Host App · React

Base Screen 全栈示例群的 **React 前端**：Vite + React 19 SPA，
联调共享后端 [`examples/shared-backend`](../shared-backend)（NestJS + Prisma/SQLite）。
React / Vue / Vanilla 三个前端功能完全对等。

## 架构

```
src/
├── main.tsx                    # 入口：注册物料/元素、HashRouter 挂载
├── App.tsx / routes.tsx        # 路由表（与 Vanilla / Vue 两端逐条对等）
├── types.ts                    # 与后端 REST 契约对齐的投影类型
├── store/                      # zustand：screens-store（列表状态机）、screen-session-store（会话状态机）
├── lib/
│   ├── api-base.ts             # API Base 运行时解析（注入 > 构建期 env > 同源相对）
│   ├── api.ts                  # Result 风格 fetch 封装：统一错误体、GET 幂等重试、AbortSignal
│   ├── logger.ts / format.ts
├── screen/
│   ├── register.tsx            # 自有物料条目，直接交给标准 SDK runtime 注册
│   ├── metric-value.ts             # 三端共有的「指标读数」manifest
│   ├── metric-value-material.tsx   # React 物料桥（createReactMaterialDefinition + mapModel + 表格适配）
│   ├── project-adapter.ts      # 宿主项目适配器：load/save，宿主维护 revision
│   └── host-data-channel.ts    # resourcePort：host-resource -> /api/metrics/series
├── components/                 # app-shell / screen-list / screen-editor / screen-viewer /
│                               # error-banner / spinner / toast
└── styles/                     # base（令牌）/ layout（响应式外壳）/ components
```

## 技术选型理由

| 选择 | 理由 |
| --- | --- |
| Vite + React 19 SPA | 与 Vue / Vanilla 两端形态统一（纯前端 + 共享后端），版本与根仓依赖对齐 |
| react-router-dom（HashRouter） | hash history 免 SPA fallback，三端路由行为对等 |
| zustand（`create` + selector） | 状态机与另两端同源同一套迁移语义；selector 订阅使组件只在选中切片变化时重渲染 |
| SDK 组合层挂载设计器 | `BaseScreenDesigner` 管理挂载句柄；权威项目状态和分阶段诊断由回调提供，宿主只留业务端口与接线 |
| 物料样式内联 | React 桥接不传播文档全局样式进 shadow root（Vue 桥接会），物料样式必须自包含 |
| TypeScript 5.9.3 | 与三个工程及工具链对齐的稳定版本（根仓 TS 7 尚未被该工具链支持） |

## 运行

```bash
pnpm install                                        # 仓库根（首次）
pnpm dev:shared-backend                             # 终端 1：共享后端 :3000
pnpm dev:react-host                                 # 终端 2：本前端 :5174（/api 代理到后端）
```

- 列表页 `/`：新建 / 编辑 / 查看 / 删除
- 编辑页 `/screens/:id/edit`：嵌入 `@base-screen/react` 的 `<BaseScreenDesigner>` 薄封装，
  挂载 / `configure` / `load` / 销毁由 SDK 挂载控制器编排；装配未就绪时把 `runtime` 与
  `mountOptions` 传 `null`，组件自己不挂载。保存走宿主 project adapter
  （顶栏「保存」显式触发；revision 乐观锁，冲突时 toast 提示）；逐条规格见
  [../README.md](../README.md) 的「编辑页保存规格」
- 查看页 `/screens/:id/view`：`<base-screen-viewer>` 只读播放

## 冒烟

```bash
pnpm --filter @base-screen-example/shared-backend build
pnpm --filter @base-screen-example/react-host build
pnpm --filter @base-screen-example/react-host verify
```

断言与 Vanilla 端逐条一致：种子列表、设计器挂载、指标读数经 host-resource
数据通道渲染后端数值、查看器播放、指标确定性、无未捕获页面错误。

## 横切规格（三端对等）

- 响应式：≥1200px 完整外壳；768–1199px 紧凑内边距；<768px 单列。
- 错误处理：`api.ts` Result 风格 + ErrorBanner + 重试；GET 网络失败重试 1 次。
- 日志：`lib/logger.ts`（scope + 时间戳，debug 仅开发模式）。
- 性能：视图静态导入（单包一次拉取，不做路由级代码分割）、列表单次拉取、保存由顶栏显式触发（宿主不轮询文档变化）。
- 样式稳定：骨架屏尺寸固定；hover 只改边框/背景色，不改几何。

# 专项案例怎么看

改一个功能往往会碰到 `contracts`、`engine`、`sdk` 和示例。本页只回答两件事：改完去哪看，以及日常跑哪条命令。不要为此引入 Storybook 或其它案例框架——Designer 是装配体，专项案例就是现有 harness。

默认 `/` 与 `?designer` **保持 Playwright 路径**。人眼目录在独立导航页，设计器里的案例舱只在显式带 `case` / `cases` 时出现。

## 先打开哪里

```bash
pnpm dev:browser-harness
```

终端给出本地地址后，先打开 **`/cases.html`**。那是专项案例导航页：可按改动面包或关键词筛选大屏设计器案例，再进对应场景。

| 目的 | URL |
| --- | --- |
| 专项案例导航页 | `/cases.html` |
| 默认 Viewer + Designer 对照（验收基线） | `/` |
| 全屏设计器，无案例舱 | `/?designer` |
| 打开案例舱，不跳到具体场景 | `/?designer&cases=1` |
| 跳到一条专项案例 | `/?designer&case=<id>` |
| 物料分组压力（长名称 / 浮层） | `/?designer&case=material-groups` |

设计器左下角的案例舱用于场景内切换，右上角「目录」回到 `/cases.html`。

另有两个不设 dev 页的示例（导航页不列，供宿主接入与工具链参考）：最小 Vanilla / Vite Viewer 宿主见 `examples/host-quickstart`（由 `pnpm verify:tarball` 验证）；物料模板 MCP provider 见 `examples/material-mcp-server`（由 `pnpm verify:material-mcp` 验证）。

## 改了哪里，看哪条案例

按**最可能被碰到的包**选案例，而不是按文件名猜。一条功能仍可能跨多层；先看人眼案例，再跑该行的聚焦测试。

| 你改的内容 | 先看 | 日常命令 | 交付前 |
| --- | --- | --- | --- |
| 文档字段、解析、命令形状 | 契约测试；人眼看是否仍能 load | `pnpm --filter @base-screen/contracts test` | `pnpm verify:m0` |
| 事务 / 历史 / Blueprint 语义 | `/?designer&case=blueprint` | `pnpm --filter @base-screen/core test` | `pnpm verify:browser` |
| 画布、选区、图层、检查器外壳 | `/?designer&case=canvas` | `pnpm --filter @base-screen/engine test` | `pnpm verify:browser` |
| 物料库分组、封面、窄面板浮层 | `/?designer&case=material-groups` | `pnpm --filter @base-screen/engine test` | `pnpm verify:browser` |
| 插件命令、菜单、快捷键 | `/?designer&case=plugin-command` | `pnpm --filter @base-screen/plugin-manager test` | `pnpm verify:browser` |
| 插件面板 model / action | `/?designer&case=plugin-panel` | `pnpm --filter @base-screen/plugin-core test` | `pnpm verify:browser` |
| 检查器 `control: 'custom'` | `/?designer&case=inspector-control` | `pnpm --filter @base-screen/engine test` | `pnpm verify:browser` |
| 数据集端口、绑定、四态 | `/?designer&case=dataset` | `pnpm --filter @base-screen/renderer test` | `pnpm verify:browser` |
| 官方物料 Manifest / 面板、语义图表 | `/?designer&case=semantic-chart` | `pnpm --filter @base-screen/material test` | `pnpm verify:browser` |
| 宿主作者桥、组件文本提交 | `/?designer&case=host-authoring` | `pnpm --filter @base-screen/engine test` | `pnpm verify:browser` |
| 变量目录与刷新 | `/?designer&case=variables` | `pnpm --filter @base-screen/engine test` | `pnpm verify:browser` |
| Vue / React 物料桥 | `/?designer&case=canvas`（含桥接按钮） | `pnpm --filter @base-screen/vue test` | `pnpm verify:browser` |
| Viewer 纯展示 | `/` 右侧 Viewer | `pnpm --filter @base-screen/renderer test` | `pnpm verify:browser` |

自动化证据在 `scripts/browser-harness/` 下按功能域分目录的 `assert-*.mjs`（域模块内部按原断言职责分节，导出函数名不变）；调用顺序与视口编排由 `scripts/browser-harness/run-browser-harness.mjs` 统一决定。历史需求对照见归档 Spec 的 `test-matrix.md`，那些文件不授权新实现。

## 案例目录

目录文案以 [`examples/browser-harness/feature-case-catalog.ts`](../../examples/browser-harness/feature-case-catalog.ts) 为准；场景跳转在 `feature-cases.ts`。

| `case` | 打开后看什么 | 对应断言（域模块） |
| --- | --- | --- |
| `canvas` | 默认演示文档与官方物料 | `canvas/assert-canvas.mjs`、桌面基线 |
| `material-groups` | 超长分组名、钻取、分类浮层 | `materials/assert-materials.mjs` |
| `plugin-command` | 选中副标题后走命令面板 / `Ctrl+Shift+P` | `plugins/assert-plugins.mjs` |
| `plugin-panel` | 左栏 Harness panel 的选区与 nudge | 同上 |
| `inspector-control` | 授权语气控件写入；未授权标签降级 | 同上 |
| `dataset` | 排行卡与数据面板绑定 | `dataset/assert-dataset.mjs` |
| `semantic-chart` | 语义图表演示物料的分组、字段与高级折叠 | `blueprint/assert-blueprint.mjs` |
| `blueprint` | 交互编排工作台与宿主图形槽 | `blueprint/assert-blueprint.mjs` |
| `host-authoring` | 右下角宿主作者面板 | `authoring/assert-workbench.mjs` |
| `variables` | 左侧变量目录 | `variables/assert-variables.mjs` |

`inspector-control` 会往当前项目里加一块演示物料；只用于人眼核对，不影响默认 `/` 与 `?designer` 验收文档。

## 一条功能会改多处时

按层往下走，缺哪层补哪层，不要从示例倒推领域逻辑：

1. `packages/contracts`：文档 / 命令 / 端口形状
2. `packages/core` 或 `plugin-core`：事务、校验、catalog
3. `packages/engine`：`common/` 纯逻辑，`browser/` DOM
4. `packages/material` / `plugin-manager` / `plugin-sdk`：物料或插件作者面
5. `packages/sdk`：只转发公共入口
6. `examples/browser-harness`：人眼案例（本页的 `?case=`）
7. `scripts/browser-harness/assert-*.mjs`：自动证据

日常用表里的 `pnpm --filter` 或单文件 `pnpm exec vitest run <file>`。视觉或交互改完再 `pnpm verify:browser`。影响包、构建产物或公共契约时才跑 `pnpm verify:m0`。

## 新增案例

1. 在 `FEATURE_CASE_CATALOG` 增加一条：`id`、看什么、改哪些包、聚焦命令；再在 `feature-cases.ts` 补 `apply()`。
2. `apply()` 只许用公开 Custom Element API 和已有 `data-*` 选择器（与 Playwright 相同），不要读 Engine 私有 Store。
3. 需要独立文档或物料分组时用 URL 开关（现有 `material-group-stress`），不要改默认 `screenDocument`。
4. 同步更新本页表格。
5. 有自动证据时在对应 `assert-*.mjs` 补断言；不要为了目录去新增 Storybook。

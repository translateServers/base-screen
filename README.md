# Base Screen

Base Screen 是一个轻量、可嵌入、跨框架的大屏设计器基座。它基于 Screen Document、Web Components 和物料
目录提供 Viewer、Designer、官方基础物料以及 React/Vue 物料桥接能力；项目、数据、资产、发布和长任务的
真实处理由宿主负责，Base Screen 只保留本地作者内核、渲染内核与有界宿主端口。

## 集成入口

面向其他项目的安装、初始化、Viewer、Designer、宿主资源和自定义物料说明，参见[集成指南](./docs/usage.md)。
当前包为私有包：同一 pnpm workspace 可直接接入；独立仓库必须使用发布方提供的完整同批次包集，
单个 SDK tarball 不是可独立安装的交付物。

## 仓库开发

本仓库开发环境要求 Node.js `22.23.2`、pnpm `11.18.0`。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dev:browser-harness
```

## 示例

- `examples/browser-harness`：浏览器端 Viewer、Designer、官方物料、项目适配器和插件管理器组合示例。
- `examples/vue-harness`：Vue 物料桥接和 ECharts 渲染示例。
- `examples/runtime-harness`：远程插件沙箱、宿主资源和蓝图运行时验证示例。

## 开发检查

```bash
pnpm format:check
pnpm lint
pnpm check:docs
pnpm typecheck
pnpm test
pnpm build
pnpm verify:m0
```

公共声明或 package 子路径有意变化时，运行 `pnpm api:report` 更新并审查
`packages/*/etc/*.api.md`，同时为受影响包补充 Changeset。`pnpm check:api` 只校验基线，
不会自动接受 API 漂移。

`pnpm lint` 还会运行 `pnpm check:file-size`：新文件必须遵守仓库的分层行数上限，已有超限文件
按 `scripts/file-size-baseline.json` 中的逐文件精确上限冻结。拆分或缩减已有文件后运行
`pnpm file-size:baseline` 下调基线；该命令不会接受新增超限文件或已有文件继续增长。

仓库设计约束、决策、规格、计划和来源记录从 [文档索引](./docs/README.md) 进入。

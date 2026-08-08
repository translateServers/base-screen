# Base Screen

Base Screen 是一个基于 Screen Document、Web Components 和物料目录的可视化屏幕运行时，提供 Viewer、Designer、官方基础物料以及 React/Vue 物料桥接能力。

## 集成入口

面向其他项目的安装、初始化、Viewer、Designer、宿主资源和自定义物料说明，参见[集成指南](./docs/usage.md)。当前包为私有包，需要从组织内部 registry、workspace 或发布方提供的构建产物获取。

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
pnpm typecheck
pnpm test
pnpm build
pnpm verify:m0
```

仓库设计约束、决策、规格、计划和来源记录从 [文档索引](./docs/README.md) 进入。

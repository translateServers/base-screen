# Host Quickstart

这是面向宿主项目的最小 Viewer 示例，只导入 `@base-screen/*` 公共入口，不依赖仓库源码路径。

当前 Base Screen 包仍是私有 `0.0.0` 包，因此本目录不声明一个可能误导外部项目的安装来源。
先按 [`docs/usage/getting-started.md`](../../docs/usage/getting-started.md) 的“安装和注册”一节，从同一 workspace 或发布方提供的
完整、同批次制品安装依赖，再把 `index.html` 和 `src/` 复制到 Vite 项目即可。

`pnpm verify:tarball` 会自动把本示例复制到仓库外的临时项目，安装真实 tarball，执行 TypeScript
检查、Vite 生产构建并用 Chromium 验证 Viewer 渲染结果。示例采用 640×360 原始像素模式；生产页的
自适应缩放见[使用指南的 Viewer 分篇](../../docs/usage/viewer.md)。

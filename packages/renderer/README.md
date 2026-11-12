# @base-screen/renderer

物料模型与 DOM 渲染，保持纯展示职责。提供 `<base-screen-viewer>` 自定义元素
（`BaseScreenViewerElement`），消费 Screen Document 与物料目录进行只读渲染，不含任何编辑/设计逻辑。

设计器（`@base-screen/engine`）构建在本包之上；本包不依赖也不感知设计器。宿主通常经
`@base-screen/sdk/viewer` 使用本包，而非直接依赖。

`configure()` 接收 `catalog` 与可选的宿主端口（`resourcePort` / `datasetPort` / `hostCatalogPort` /
`conditionalStylePort` 等）；端口在渲染器创建时捕获，之后再赋值会被拒绝。契约与解析归
`@base-screen/contracts`。接入见根 [README](https://github.com/translateServers/base-screen/blob/master/README.md#在你的应用中使用)。
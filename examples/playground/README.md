# Base Screen Playground

这是一个由 Vue 驱动的宿主应用示例。页面状态、数据集目录、变量端口和资源端口都由
Vue 应用管理，`base-screen-viewer` 仍通过公开属性消费 canonical Screen Document。

启动：

```sh
pnpm dev:playground
```

案例路由：

- `/`：基础物料
- `/designer`：Vue 宿主中的全屏大屏设计器
- `/dataset`：宿主数据集运行时
- `/binding`：表格/图表字段绑定
- `/errors`：安全失败状态

在数据案例中按 `Ctrl+R` 或 `Cmd+R` 可触发 Viewer 手动刷新。

数据页工具栏可以切换模拟数据集和 `region` 变量，也可以打开延迟或失败开关，观察真实的
loading、ready 和 error 状态。示例数据与端口实现位于 `mock-data.ts`，可作为接入真实 API
时的替换边界。

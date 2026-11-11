# @base-screen/vue

把 SDK 挂载控制器接到 Vue 生命周期，并将 Vue 组件桥接为 Base Screen 物料。

- `BaseScreenDesigner` / `BaseScreenViewer`：组件卸载只释放当前挂载句柄，不释放共享 `runtime`；
  改变 `remountKey` 或框架 `key` 才重新挂载。`#fallback` 插槽投影挂载失败诊断。
- `createVueMaterialDefinition()`：把 Vue SFC 定义成物料。

peer 依赖：`vue` `^3.5.0`。用法见根 [README](../../README.md#react--vue-薄封装)。

```vue
<BaseScreenDesigner :runtime="runtime" :remount-key="screenId" :mount-options="mountOptions" />
```
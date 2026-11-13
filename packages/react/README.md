# @base-screen/react

把 SDK 挂载控制器接到 React 生命周期，并将 React 组件桥接为 Base Screen 物料。

- `BaseScreenDesigner` / `BaseScreenViewer`：组件卸载只释放当前挂载句柄，不释放共享 `runtime`；
  改变 `remountKey` 或框架 `key` 才重新挂载。
- `runtime` 或 `mountOptions` 传 `null` 表示尚未就绪：不挂载、诊断保持为空，两者都就绪后自动挂载；
  任一退回 `null` 则释放句柄。宿主装配是异步的（插件激活、端口、项目适配器），未就绪交给组件表达，
  不需要条件渲染加占位节点。
- `BaseScreenViewer` 的 `runtime` 接受 `base-screen/viewer` 的 `createBaseScreenViewerRuntime()` 返回的轻量 runtime，也接受完整 `BaseScreenRuntime`；`BaseScreenDesigner` 需要完整 runtime。
- Designer 的 `onProjectState(state)` 提供挂载成功时的初始项目快照及后续状态，无需补请求或维护一份保存状态机。
- `onDiagnostics(diagnostics, context)` 与 `renderFallback(diagnostics, context)` 提供失败阶段、实例可用性和恢复方式；目录更新失败不会销毁当前设计器。旧的单参数回调保持可用。
- `createReactMaterialDefinition()`：把 React 组件定义成物料（样式自包含），返回条目可直接放入 `createBaseScreenRuntime({ materials })`。

peer 依赖：`react` / `react-dom` `^19.1.0`。React 18 宿主请改走 imperative 的
`<base-screen-designer>` 元素路径（见根 [README](https://github.com/translateServers/base-screen/blob/master/README.md#react--vue-薄封装)）。

```tsx
import { BaseScreenDesigner } from '@base-screen/react';

<BaseScreenDesigner runtime={stage?.runtime ?? null} mountOptions={stage?.mountOptions ?? null} />;
```
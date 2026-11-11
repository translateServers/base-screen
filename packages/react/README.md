# @base-screen/react

把 SDK 挂载控制器接到 React 生命周期，并将 React 组件桥接为 Base Screen 物料。

- `BaseScreenDesigner` / `BaseScreenViewer`：组件卸载只释放当前挂载句柄，不释放共享 `runtime`；
  改变 `remountKey` 或框架 `key` 才重新挂载。
- `createReactMaterialDefinition()`：把 React 组件定义成物料（样式自包含）。

peer 依赖：`react` / `react-dom` `^19.1.0`。React 18 宿主请改走 imperative 的
`<base-screen-designer>` 元素路径（见根 [README](../../README.md#react--vue-薄封装)）。

```tsx
import { BaseScreenDesigner } from '@base-screen/react';

<BaseScreenDesigner runtime={runtime} remountKey={screenId} mountOptions={mountOptions} />;
```
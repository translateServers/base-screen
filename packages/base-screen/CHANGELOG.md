# base-screen

## 0.2.0

### Minor Changes

- 525acda: 移除 `base-screen/react` 与 `base-screen/vue` 子路径。这两个入口此前只是对 `@base-screen/react` / `@base-screen/vue` 的转发，却让 `base-screen` 与桥接包互相依赖，形成包图环，导致 `turbo run build` 直接以循环依赖失败、dist 无法重建。框架组件改为直接使用独立桥接包，三个包版本同步。

  迁移方式：

  ```diff
  - import { BaseScreenDesigner } from 'base-screen/react';
  + import { BaseScreenDesigner } from '@base-screen/react';
  ```

  ```diff
  - import { BaseScreenDesigner } from 'base-screen/vue';
  + import { BaseScreenDesigner } from '@base-screen/vue';
  ```

  未安装桥接包的工程需要补装对应依赖；不需要框架组件的工程无需改动，`base-screen` 的其余子路径（`/viewer`、`/designer`、`/contracts`、`/engine`、`/host-kit` 等）保持不变。

  同时补齐 `base-screen/material/auto-register`：单包消费者此前只能通过 private 的 `@base-screen/material` 注册内置物料，与 `base-screen` 内联的副本混用会因构造函数不同而触发 `PLUGIN_CORE_IDENTITY_CONFLICT`。该入口让宿主只装 `base-screen` 即可完成元素与物料注册。

- 3647b6c: 设计器改为「首帧骨架 + 分帧水合」：新增 `mountBaseScreenDesignerSkeleton`，元素连接后先绘制与最终布局同尺寸的骨架，物料库与画布文档在后续帧补齐（`data-designer-state="loading|ready|error"`、`data-designer-canvas-state="pending|ready"`）。只注入 `catalog` 即会替换骨架并进入 `ready`，不再要求额外调用 `configure()`；catalog 15s 内未到达时停止脉冲并切换到可识别的错误态（`data-designer-skeleton-state="error"`），之后到达仍可恢复。查看器同样在 catalog 或文档到达前显示画布骨架（`data-viewer-state="loading|ready"`），首次渲染落定后自动撤除。
- 设计器入口按作者面拆分为按需加载的异步 chunk，首屏只保留默认工作台路径：

  - 右侧「数据源」面板的实现移入独立 chunk，首次切到数据源页签或调用数据源相关方法时才加载。加载完成前的模式请求排队合并、命令缓存按序重放，占位盒与最终面板同尺寸，不产生布局位移。
  - 事件 Blueprint 工作台（面板、图投影与默认中央画布）移入独立 chunk，仅在宿主提供中央画布、声明 `initialWorkbenchMode: 'blueprint'`、点击蓝图页签或从变量面板加入节点时加载。加载前 `setWorkbenchMode`、画布 slot 与命令事件都有确定行为：非法参数同步失败、模式请求只保留最后一次、画布命令有界缓存并在桥接连接后原序重放、加载失败降级为可识别诊断且不重试。ADR-0091 的一体化工作台边界与公开 slot/command/state 协议保持不变。
  - 外围 `plugin-materials` 的 ECharts 渲染改为动态 import，图表实例首次渲染时才加载 ECharts 运行时。

  实测设计器首屏 eager 从拆分前约 407 KB gz 降到 346.26 KB gz：数据源面板约 -33 KB，事件工作台 -27.35 KB，两个异步 chunk 合计 69.50 KB gz。

---
'base-screen': patch
'@base-screen/react': patch
'@base-screen/vue': patch
---

移除 `base-screen/react` 与 `base-screen/vue` 子路径。这两个入口此前只是对 `@base-screen/react` / `@base-screen/vue` 的转发，却让 `base-screen` 与桥接包互相依赖，形成包图环，导致 `turbo run build` 直接以循环依赖失败、dist 无法重建。框架组件改为直接使用独立桥接包，三个包版本同步。

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

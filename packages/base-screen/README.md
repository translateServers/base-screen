# base-screen

大屏设计器基座：把 **Viewer（只读展示）**、**Designer（可视化编辑）**、物料体系与插件体系装进一个包，
按子路径引入，浏览器内以 Web Components 对外。

单包分发：内部实现全部内联，宿主不需要安装 `@base-screen/*` 之类的内部包。

## 安装

```bash
npm install base-screen
```

以框架组件方式使用时，带上框架本身即可：

```bash
# React
npm install base-screen react react-dom

# Vue
npm install base-screen vue
```

## 子路径

| 子路径 | 用途 |
| --- | --- |
| `base-screen` | `createBaseScreenRuntime()` 组合层：同时注册 Designer、Viewer 与官方物料 |
| `base-screen/viewer` | 只读组合层与 `<base-screen-viewer>`（不引入 Designer） |
| `base-screen/designer` | 注册 `<base-screen-designer>` |
| `base-screen/react` | React 组件桥接 |
| `base-screen/vue` | Vue 组件桥接 |
| `base-screen/contracts` | Screen Document、宿主契约、严格解析、诊断与 JSON Schema |
| `base-screen/core` | 文档命令、事务、历史与 Blueprint 运行时 |
| `base-screen/renderer` | 物料模型与 DOM 渲染 |
| `base-screen/engine` | Designer 会话、画布交互与检查器编排 |
| `base-screen/material` | 官方物料实现与注册辅助 |
| `base-screen/plugin-core` / `plugin-manager` / `plugin-sdk` | 插件与物料作者使用的契约与管理层 |
| `base-screen/plugins` | 插件相关导出的合集入口 |
| `base-screen/host-kit` | 宿主接入辅助：REST 项目适配器与数据集端口 |
| `base-screen/host-tokens.css` | 宿主面板设计令牌（唯一公共样式面） |
| `*/auto-register` | 副作用入口：导入即注册元素 |

## 最小示例

```ts
import { parseScreenDocument } from 'base-screen/contracts';
import { defineBaseScreenTextMaterial } from 'base-screen/material';
import { createBaseScreenViewerRuntime } from 'base-screen/viewer';

const parsed = parseScreenDocument(screenDocumentJson);
if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message);

const text = defineBaseScreenTextMaterial();
if (!text.ok) throw new Error(text.diagnostics[0]?.message);

const result = await createBaseScreenViewerRuntime({
  instanceId: 'my-app',
  materials: [text.value],
});
if (!result.ok) throw new Error(result.diagnostics[0]?.message);

const mounted = await result.value.mountViewer(container, { document: parsed.value });
if (!mounted.ok) throw new Error(mounted.diagnostics[0]?.message);

// 页面卸载释放句柄，应用退出释放 runtime
await mounted.value.dispose();
await result.value.dispose();
```

宿主侧的项目读取与数据集端口可以直接复用 `base-screen/host-kit`：

```ts
import { createHttpProjectAdapter, createRestDatasetPort } from 'base-screen/host-kit';

const projectAdapter = createHttpProjectAdapter({ baseUrl: 'https://api.example.com' });
const datasetPort = createRestDatasetPort({ baseUrl: 'https://api.example.com' });
```

## 框架组件

```tsx
import { BaseScreenViewer, BaseScreenDesigner } from 'base-screen/react';
```

```vue
<script setup lang="ts">
import { BaseScreenViewer, BaseScreenDesigner } from 'base-screen/vue';
</script>
```

`@base-screen/react` 与 `@base-screen/vue` 也可以单独安装，功能与 `base-screen/react`、
`base-screen/vue` 完全等价：二选一即可，不要在同一工程里混用两种入口。

## 运行环境

- 仅 ESM，面向浏览器；集成边界是 Web Components，需要真实 DOM，**不支持 CJS `require` 与 SSR**。
- 运行时依赖只有 `zod`；`react` / `react-dom` / `vue` 是可选 peer，不用对应子路径就不会被安装。
- 设计令牌是唯一的非 JS 公共导出，用 `import 'base-screen/host-tokens.css'` 引入。
- 需要现代浏览器（`target: baseline-widely-available`）。

## 文档

- 仓库主页与接入指南：[github.com/translateServers/base-screen](https://github.com/translateServers/base-screen)
- 示例宿主（React / Vue / 原生）：[examples](https://github.com/translateServers/base-screen/tree/master/examples)

## License

MIT

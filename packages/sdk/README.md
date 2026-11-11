# @base-screen/sdk

Viewer、Designer、物料与插件的产品级组合入口。只组合各包公共 API，不实现领域逻辑。

## 入口

| 子入口 | 用途 |
| --- | --- |
| `@base-screen/sdk` | `createBaseScreenRuntime()` / `adoptBaseScreenRuntime()` 组合层 |
| `@base-screen/sdk/viewer` | 注册 `<base-screen-viewer>`（不引入 Designer） |
| `@base-screen/sdk/designer` | 注册 `<base-screen-designer>` |
| `@base-screen/sdk/{contracts,core,renderer,engine,plugins,plugin-core,material}` | 转发对应包的公共导出 |
| `@base-screen/sdk/host-tokens.css` | 宿主面板设计令牌（唯一公共样式面，ADR-0095） |
| `*/auto-register` | 副作用入口：导入即注册元素 |

## 最小用法

```ts
import { createBaseScreenRuntime } from '@base-screen/sdk';

const result = await createBaseScreenRuntime({ instanceId: 'my-app' });
if (!result.ok) throw new Error(result.diagnostics[0]?.message);
const runtime = result.value;

const mounted = await runtime.mountViewer(container, { document });
// 页面卸载释放句柄，应用退出释放 runtime
await mounted.value.dispose();
await runtime.dispose();
```

接入步骤、独立仓库 tarball 配方与环境门槛见仓库根 [README](../../README.md#在你的应用中使用)。
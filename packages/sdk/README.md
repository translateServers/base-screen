# @base-screen/sdk（内部包）

Viewer、Designer、物料与插件的产品级组合入口。只组合各包公共 API，不实现领域逻辑。

**这个包不对外发布。** 它作为构建输入内联进公开单包 `base-screen`，宿主安装并使用的是
`base-screen` 及其子路径；源码内部仍按 `@base-screen/sdk` 组织，便于按包测试与维护。

## 对外入口（由 `base-screen` 暴露）

| 子入口 | 用途 |
| --- | --- |
| `base-screen` | `createBaseScreenRuntime()` / `adoptBaseScreenRuntime()` 组合层 |
| `base-screen/viewer` | `createBaseScreenViewerRuntime()` 只读组合层与 `<base-screen-viewer>` 注册（不引入 Designer） |
| `base-screen/designer` | 注册 `<base-screen-designer>` |
| `base-screen/{contracts,core,renderer,engine,plugins,plugin-core,material}` | 转发对应包的公共导出 |
| `base-screen/host-kit` | 宿主接入辅助（REST 项目适配器与数据集端口） |
| `base-screen/react`、`base-screen/vue` | 框架桥接入口；也可单独安装 `@base-screen/react` / `@base-screen/vue` |
| `base-screen/host-tokens.css` | 宿主面板设计令牌（唯一公共样式面，ADR-0095） |
| `*/auto-register` | 副作用入口：导入即注册元素 |

仅支持 ESM 与浏览器 DOM，不支持 CJS `require` 或 SSR。

## 最小 Viewer 用法

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
const runtime = result.value;

const mounted = await runtime.mountViewer(container, { document: parsed.value });
if (!mounted.ok) throw new Error(mounted.diagnostics[0]?.message);
// 页面卸载释放句柄，应用退出释放 runtime
await mounted.value.dispose();
await runtime.dispose();
```

`createBaseScreenViewerRuntime()` 的参数默认 `{}`，默认目录为空，无 `officialMaterials` 选项；不会静态导入全部官方物料。显式 `materials` 可传注册成功的 catalog 条目（如 `text.value`）或 `createMaterialDefinition()` 创建的定义。返回的 `BaseScreenViewerRuntime` 提供 `mountViewer()`、`setCatalog()`、`manager` 与 `dispose()`，只供 Viewer 共享，不提供 Designer 挂载。

React/Vue 的 `BaseScreenViewer` 可消费该只读接口，也兼容完整 runtime。需要 Designer 时从根入口调用 `createBaseScreenRuntime()`，默认注册 Designer、Viewer 与官方物料。轻量入口隔离浏览器 bundle；内部包已内联进同一个产物，不会再额外安装 `engine` 等包。

`materials` 可直接接收 React/Vue 桥产出的 catalog 条目，表格数据适配器随同注册，无需手动补构造器静态属性；物料包与定义仍可使用。插件授权仍显式声明。

Designer 挂载控制器的 `onProjectState(state)` 在挂载成功后立即提供一次权威项目快照，再订阅后续变化；状态只有 `phase`、`dirty` 和 `project: { projectId, name, revision } | null`，不复制文档或另建状态机。命令式宿主也可通过 `handle.element.getProjectState()` 与 `BASE_SCREEN_PROJECT_STATE_CHANGE_EVENT` 读取和订阅。

`onDiagnostics(diagnostics, context)` 的第二参提供失败 `phase`、`instanceAvailable` 和 `recovery`。目录热刷新失败保留实例并允许 `retry-catalog`；配置/加载失败需要 `remount`；释放失败不再声明可用实例。旧的单参数回调继续有效。官方挂载失败结果带 `mountPhase`，无需解析诊断文案。

接入步骤、公共 npm 安装与离线 tarball 验证见仓库根 [README](https://github.com/translateServers/base-screen/blob/master/README.md#在你的应用中使用)。单包分发之后，`base-screen` 的运行时依赖只有 `zod`，不再需要成批 tarball 与 overrides。

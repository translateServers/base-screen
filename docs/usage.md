# Base Screen 集成指南

本文面向需要在自己的 Web 应用中使用 Base Screen 的项目开发者，不介绍 Base Screen 仓库本身的开发流程。

Base Screen 提供两类运行时：

- **Viewer**：把 Screen Document 渲染成只读的可视化页面。
- **Designer**：在 Viewer 基础上提供拖拽、选中、属性编辑、撤销和重做。

组件和物料通过 Web Components 工作，React、Vue 项目不需要替换应用自身的根框架。

## 1. 准备依赖

应用至少需要以下包：

```text
@base-screen/contracts  文档类型、解析和诊断
@base-screen/plugin-core 物料目录和物料契约
@base-screen/sdk        Viewer、Designer 和组合入口
@base-screen/material   官方基础物料
```

React 或 Vue 自定义物料再增加对应的桥接包：

```text
@base-screen/react
@base-screen/vue
```

当前这些包在仓库中标记为私有包。接入方需要使用项目提供的内部 npm registry、workspace 依赖或构建产物；依赖的具体来源由发布方配置，本文不假设它们已经发布到公共 npm。

## 2. 初始化运行时

在浏览器环境中，应用启动时注册 SDK 元素和官方物料：

```ts
import '@base-screen/sdk/auto-register';
import '@base-screen/material/auto-register';
```

这两个入口分别注册：

- `base-screen-viewer`
- `base-screen-designer`
- 官方 `base.*` 物料 Custom Element

如果应用需要处理注册失败、只注册部分物料，使用显式注册 API。自动注册入口应只在浏览器启动代码中执行一次。

## 3. 创建物料目录

Viewer 和 Designer 通过物料目录查找文档中的 `type`。自动注册 Custom Element 不会自动创建目录，应用仍需要把要使用的物料加入目录：

```ts
import {
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenRectangleMaterialElement,
  BaseScreenTextMaterialElement,
} from '@base-screen/material';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';

const catalog = createBaseScreenMaterialCatalog([
  {
    manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
    constructor: BaseScreenTextMaterialElement,
  },
  {
    manifest: BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
    constructor: BaseScreenRectangleMaterialElement,
  },
]);
```

目录应包含文档可能出现的所有物料类型。官方物料包括文本、矩形、椭圆、图片、容器、图表和表格；应用可以只加入实际需要的类型。

## 4. 准备 Screen Document

Screen Document 是渲染和编辑的唯一数据输入。它是 JSON 兼容数据，应用可以从接口、数据库或项目文件中获取。

```ts
import type { ScreenDocument } from '@base-screen/contracts';

const screenDocument: ScreenDocument = {
  canvas: {
    width: 960,
    height: 540,
    backgroundColor: '#17212b',
  },
  components: [
    {
      id: 'title',
      type: 'base.text',
      name: '标题',
      parentId: null,
      position: { x: 80, y: 80 },
      size: { width: 500, height: 72 },
      rotation: 0,
      zIndex: 1,
      status: { locked: false, hidden: false },
      props: {},
      style: {
        color: '#ffffff',
        fontSize: 42,
        fontWeight: '700',
        textAlign: 'left',
      },
      dataSource: { type: 'static', value: '销售看板' },
    },
  ],
  variables: [],
  blueprint: { rules: [] },
};
```

从不可信来源读取文档时，使用 `parseScreenDocument(value)` 校验：

```ts
import { parseScreenDocument } from '@base-screen/contracts';

const parsed = parseScreenDocument(input);
if (!parsed.ok) {
  console.error(parsed.diagnostics);
  return;
}
const validDocument = parsed.value;
```

解析器是严格校验器。应用不要自行删除未知字段、补默认值或强制转换类型。

## 5. 嵌入 Viewer

Viewer 适合大屏预览、发布页和只读用户界面：

```ts
import type { BaseScreenViewerElement } from '@base-screen/sdk';

const viewer = document.querySelector('base-screen-viewer');
if (!(viewer instanceof HTMLElement)) {
  throw new Error('缺少 base-screen-viewer');
}

const viewerElement = viewer as BaseScreenViewerElement;
viewerElement.catalog = catalog;
viewerElement.document = validDocument;
```

设置 `catalog` 或 `document` 会触发初始化，之后不能再替换 `catalog` 和 `resourcePort`（会被拒绝并产生诊断）。需要用到宿主资源时，必须在初始化之前设置 `resourcePort`：

```ts
viewerElement.resourcePort = resourcePort; // 先设置端口
viewerElement.catalog = catalog;
viewerElement.document = validDocument;
```

运行中需要更换目录或资源端口时，先调用 `unload()`，再重新设置依赖和文档。

HTML：

```html
<base-screen-viewer></base-screen-viewer>
```

建议监听诊断事件，至少记录无法渲染的物料和无效蓝图：

```ts
viewerElement.addEventListener('base-screen-diagnostic', (event) => {
  console.error('Base Screen diagnostic', event);
});
```

Viewer 常用属性：

- `catalog`：物料目录。初始化后不能直接替换；需要更换目录时先调用 `unload()`。
- `document`：当前文档。重新赋值会重新渲染。
- `resourcePort`：宿主资源解析端口，供 `host-resource` 数据源使用。初始化后不能直接替换。
- `resourceTimeoutMs`：资源解析 deadline，必须在 Viewer 初始化前设置，默认 15,000 毫秒。
- `runtimeContributions`：运行时能力索引，用于蓝图能力和资源类型校验。
- `blueprintRuntimePort`：蓝图向宿主发送事件的端口。
- `blueprintHostActionPort`：蓝图请求宿主执行动作的端口。
- `variablePort`：解析文档中 `host` 变量的端口，必须在 `catalog` 初始化前设置。
- `refreshData(componentId?)`：重新查询全部数据源，或只重新查询指定组件。

## 6. 宿主数据集

数据面板提供“无数据”“静态数据”和“宿主数据集”三个入口。API、数据库、全局状态或其他
数据基础设施不直接成为 Designer 表单；宿主把它们注册成稳定的数据集，并继续负责鉴权、租户、
查询、缓存和审计。

宿主数据集使用两个独立端口：

- `datasetCatalogPort`：让 Designer 发现数据集，并读取安全的名称、字段和参数编辑元数据。
- `resourcePort`：接收组件 ID、资源标识和已经求值的普通 JSON 参数，返回数据结果。

变量参数再通过可选的 `variablePort` 求值。字段绑定和变量引用只保存在 Screen Document 中，
不会发送给宿主查询端口：

```ts
designerElement.datasetCatalogPort = datasetCatalogPort;
designerElement.resourcePort = resourcePort;
designerElement.variablePort = variablePort;
```

一个典型宿主可以把不同底层来源统一注册到自己的目录中：

```ts
const datasetCatalogPort = {
  async list({ query, cursor, limit, signal }) {
    return hostDatasets.list({ query, cursor, limit, signal });
  },
  async describe({ resourceType, resourceId, signal }) {
    return hostDatasets.describe({ resourceType, resourceId, signal });
  },
};

const resourcePort = {
  async resolve({ componentId, resourceType, resourceId, params }, { signal }) {
    return hostDatasets.resolve({
      componentId,
      resourceType,
      resourceId,
      params,
      signal,
    });
  },
};
```

这里的 `hostDatasets` 可以在宿主内部路由到 API、数据库查询、缓存或应用全局状态；Base Screen
只识别目录中的稳定资源标识，不知道也不持久化底层连接方式。

数据面板会先列出数据集，再读取描述，最后把 literal/variable 参数和物料字段角色作为一次
Core transaction 应用。官方 `base.table` 使用 `columns` 角色，`base.chart` 使用 `dimension`
和 `measures` 角色。数据集响应必须符合 `ScreenTabularDataset` 契约；无效响应会进入安全错误状态。

Viewer 使用相同的端口：

```ts
viewerElement.variablePort = variablePort;
viewerElement.resourcePort = resourcePort;
viewerElement.catalog = catalog;
viewerElement.document = validDocument;
viewerElement.refreshData('sales-chart');
```

宿主负责鉴权、查询、缓存和权限校验；Base Screen 不持久化 transport 配置或敏感信息。

## 7. 嵌入 Designer

Designer 适合后台配置页和大屏编排页：

```html
<base-screen-designer></base-screen-designer>
```

```ts
import type { BaseScreenDesignerElement } from '@base-screen/sdk';

const designer = document.querySelector('base-screen-designer');
if (!(designer instanceof HTMLElement)) {
  throw new Error('缺少 base-screen-designer');
}

const designerElement = designer as BaseScreenDesignerElement;
designerElement.catalog = catalog;
designerElement.toolMaterialTypes = {
  text: 'base.text',
  rectangle: 'base.rectangle',
  ellipse: 'base.ellipse',
  image: 'base.image',
};
designerElement.document = validDocument;
```

保存编辑结果时监听 `base-screen-change`：

```ts
import type { ScreenDocument } from '@base-screen/contracts';

designerElement.addEventListener('base-screen-change', (event) => {
  const nextDocument = (event as CustomEvent<{ document: ScreenDocument }>).detail.document;
  saveToApplication(nextDocument);
});
```

`toolMaterialTypes` 中的每个类型都必须存在于目录。需要支持编组时，再配置 `groupMaterialType`，并确保该物料的 `designCapabilities.children` 为 `true`。

## 8. 项目加载和保存

Designer 的项目读写通过 `projectAdapter` 注入，应用负责连接自己的 API、鉴权和并发控制：

```ts
designerElement.projectAdapter = {
  capabilities: { publish: false },
  async load({ projectId }) {
    const response = await api.getProject(projectId);
    return parseProjectResponse(response);
  },
  async save({ projectId, revision, document: nextDocument }) {
    const response = await api.saveProject(projectId, revision, nextDocument);
    return parseProjectResponse(response);
  },
};
```

`load` 和 `save` 必须返回 `ScreenParseResult<ScreenProjectEnvelope>`。保存请求中的 `revision` 用于并发控制；收到 `PROJECT_CONFLICT` 时不要静默覆盖服务端数据，应提示用户重新加载或处理冲突。

绑定适配器后，通过 `load(projectId)` 加载项目：

```ts
const loaded = await designerElement.load('my-project');
if (!loaded.ok) {
  showProjectError(loaded.diagnostics);
  return;
}
saveToApplication(loaded.value.document);
```

项目模式（绑定适配器 + `load(projectId)`）与直接文档模式（只设置 `document`，不绑定适配器）是两种独立用法；不要在项目模式下直接设置 `document`。

## 9. 宿主资源

文档只保存资源类型、资源 ID 和参数，不保存 token、请求头或数据库连接信息。应用通过 `resourcePort` 解析资源：

```ts
import type { ScreenHostResourcePort } from '@base-screen/contracts';

const resourcePort: ScreenHostResourcePort = {
  async resolve({ source }, { signal }) {
    const value = await api.resolveResource(source.resourceType, source.resourceId, source.params, signal);
    return { ok: true, value, diagnostics: [] };
  },
};

viewerElement.resourcePort = resourcePort;
designerElement.resourcePort = resourcePort;
```

端口必须在 `catalog`/`document` 初始化之前设置（见第 5 节）；Designer 初始化后替换端口同样需要先 `unload()`。

资源解析失败或超时会进入物料的数据错误状态。资源端口应自行执行鉴权、参数白名单和返回值裁剪。

## 10. 物料事件和蓝图事件

Viewer 会把物料事件冒泡为 `base-screen-material-event`：

```ts
viewerElement.addEventListener('base-screen-material-event', (event) => {
  const detail = (event as CustomEvent).detail;
  console.log(detail.componentId, detail.type, detail.name, detail.payload);
});
```

文档中的蓝图可以把物料事件转换为宿主事件。应用可以通过 `blueprintRuntimePort` 接收这些事件：

```ts
viewerElement.blueprintRuntimePort = {
  emit(event) {
    applicationEventBus.publish(event);
  },
};
```

蓝图只能使用应用通过 `runtimeContributions` 授权的 capability 和资源类型。不要把任意函数、凭据或宿主服务对象写入 Screen Document。

## 11. React 和 Vue

React/Vue 应用可以把现有组件包装为 Base Screen 物料，不需要让 Screen Document 保存框架组件名。文档只引用稳定的物料 `type`。

React：

```ts
import { createReactMaterialDefinition } from '@base-screen/react';

const definition = createReactMaterialDefinition({
  manifest,
  component: AppBadge,
  eventProps: { valueClick: 'onValueClick' },
});
```

Vue：

```ts
import { createVueMaterialDefinition } from '@base-screen/vue';

const definition = createVueMaterialDefinition({
  manifest,
  component: AppBadge,
  eventProps: { valueClick: 'onValueClick' },
});
```

定义返回成功后，把 `definition.value` 加入应用的物料目录。自定义物料的 `type` 和 `tagName` 必须稳定且唯一，manifest 与 Custom Element 上的静态 manifest 必须完全一致。

## 12. 生命周期和清理

- 一个页面可以创建多个 Viewer 或 Designer 实例，每个实例独立设置 `catalog` 和 `document`。
- 页面卸载前移除实例即可；长生命周期场景下，更换目录或资源端口前先调用 `unload()`。
- 不要直接操作 Viewer/Designer 内部 Shadow DOM。通过公开属性、端口和 Custom Event 与组件交互。
- 不要把 `@base-screen/*/src` 路径、仓库内部 fixture 或 harness 作为应用依赖。

## 13. 故障排查

- **没有内容**：确认自动注册已执行、目录包含文档中的 `type`，并检查 `base-screen-diagnostic`。
- **尺寸为 0**：确保宿主容器有明确尺寸；第三方 React/Vue 组件根元素应设置 `width: 100%; height: 100%`。
- **修改目录不生效**：调用 `unload()` 后重新设置目录和文档。
- **事件没有触发**：确认物料 manifest 声明了事件，并且 Viewer 处于交互模式；蓝图还需要对应的 capability 授权。
- **保存失败**：保留并展示 diagnostics；`PROJECT_CONFLICT` 需要重新加载最新 revision 后处理。

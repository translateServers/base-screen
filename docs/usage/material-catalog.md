# 创建物料目录

> 返回[宿主使用指南](../usage.md)。


注册 Custom Element 不会自动创建物料目录。每个 Viewer/Designer 都必须获得一个目录，且
目录要包含当前文档可能出现的全部物料 `type`。

下面是只支持文本和矩形的最小目录：

```ts
import {
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';

const text = defineBaseScreenTextMaterial();
const rectangle = defineBaseScreenRectangleMaterial();
if (!text.ok || !rectangle.ok) throw new Error('官方物料注册失败');

const catalog = createBaseScreenMaterialCatalog([text.value, rectangle.value]);
```

`define*Material()` 成功值就是可放入 catalog 的 entry，并且重复调用同一 constructor 时幂等。
不要在多个模块里无条件直接调用 `customElements.define()`。

官方物料还包括椭圆、图片、容器、图表和表格。文本、图表、表格使用宿主
表格数据时，目录项还要分别携带包中导出的 `*_TABULAR_DATA_ADAPTER`。文本的 `value` 角色接收
一个字符串、数值、布尔或日期字段，显示数据集首行对应值；空行或空值投影为空文本。文本原有的
标量静态数据保持不变；在 Designer 中只暴露「宿主数据集」，不再额外显示通用「宿主资源」选项。
`harness/browser-harness` 包含完整官方目录；三个宿主前端示例（`examples/host-app-*`）各演示一个宿主自有物料。

## 物料 manifest 字段参考

物料 manifest 是**严格**对象：未知字段会被拒绝；下表除标注「可选」外全部必填。
写自有物料时照此表即可，不必去读示例工程。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | ✓ | 物料类型标识，形如 `vendor.name`；文档 `components[].type` 引用它 |
| `tagName` | ✓ | 该物料的 Custom Element 标签名，须含连字符且全小写 |
| `name` | ✓ | 物料显示名 |
| `category` | ✓ | 物料库分类名 |
| `keywords` | ✓ | 搜索关键词数组，可为空数组 |
| `defaultSize` | ✓ | `{ width, height }`，拖入/程序化插入时的初始尺寸 |
| `defaultProps` | ✓ | 初始 props，须满足 `propsSchema` |
| `defaultStyle` | ✓ | 初始 style，须满足 `styleSchema` |
| `propsSchema` | ✓ | 属性 JSON Schema（根为 `object`），驱动属性面板与提交校验 |
| `propertyPanel` | ✓ | 属性面板字段列表，可为空数组 |
| `styleSchema` | ✓ | 样式 JSON Schema（根为 `object`） |
| `stylePanel` | ✓ | 样式面板字段列表，可为空数组 |
| `events` | ✓ | 该物料派发的事件名数组，可为空数组 |
| `dataCapabilities` | ✓ | 数据来源能力子集：`static` / `dataset` / `host-resource` / `variable` |
| `designCapabilities` | ✓ | `{ resize, rotate, children }` 三个布尔值 |
| `defaultData` | 可选 | 静态默认数据；存在时新组件初值为 `{ type: 'static', value: defaultData }` |
| `staticData` | 可选 | `{ kind: 'scalar', valueType }` 或 `{ kind: 'tabular', defaultBinding }` |
| `dataBinding` | 可选 | 数据绑定角色声明（宿主数据集字段映射用） |
| `libraryVisible` | 可选 | 设为 `false` 时不出现在物料库，也不能被程序化插入 |
| `editorDescriptor` | 可选 | 声明式作者面板描述符（见 [Blueprint 工作台与宿主高级编辑器](./blueprint.md)）；自定义控件经此引用 |
| `cover` | 可选 | 物料库封面 |

> `propsSchema` / `styleSchema` 中被 `required` 引用的字段在提交时按 schema 校验。常见错误是把
> 枚举字段写成别的类型：例如枚举约定为 `'400' | '700'` 时传数字 `600`，提交会报
> `PLUGIN_CORE_MANIFEST_FIELD_INVALID`。

## 宿主自有物料的最小完整示例

下面是一个**自包含**的自定义物料（不依赖任何示例工程），可直接复制：

```ts
import type {
  BaseScreenMaterialManifest,
  BaseScreenMaterialModel,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';

const MANIFEST: BaseScreenMaterialManifest = {
  type: 'acme.stock-card',
  tagName: 'acme-stock-card',
  name: '库存卡',
  category: '业务',
  keywords: ['库存'],
  defaultSize: { width: 260, height: 120 },
  defaultProps: { title: '仓库', stock: 0 },
  defaultStyle: { color: '#e8eefb' },
  propsSchema: {
    kind: 'object',
    properties: {
      title: { kind: 'string' },
      stock: { kind: 'number', minimum: 0 },
    },
    required: ['title', 'stock'],
  },
  propertyPanel: [
    { prop: 'title', label: '名称', control: 'text' },
    { prop: 'stock', label: '库存', control: 'number' },
  ],
  styleSchema: { kind: 'object', properties: { color: { kind: 'string' } }, required: [] },
  stylePanel: [{ style: 'color', label: '文字色', control: 'color' }],
  events: [],
  dataCapabilities: ['static'],
  designCapabilities: { resize: true, rotate: true, children: false },
};

class AcmeStockCardElement extends HTMLElement {
  // createMaterialDefinition 会校对静态 manifest 与传入 manifest 一致，务必写上。
  static readonly manifest = MANIFEST;

  #model: BaseScreenMaterialModel | undefined;
  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) throw new Error('Stock card model has not been set.');
    return this.#model;
  }
  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    // 按 value.props / value.style / value.dataState 渲染；不要缓存跨实例状态。
  }
  connectedCallback(): void {
    this.style.display = 'block';
  }
}

const definition = createMaterialDefinition({ manifest: MANIFEST, element: AcmeStockCardElement });
if (!definition.ok) throw new Error('物料定义无效');
const entry = definition.value.define();
if (!entry.ok) throw new Error('物料注册失败');
```

`createMaterialDefinition(...).define()` 等价于「校验 manifest + 注册 Custom Element」，
返回值为可放入 catalog 的 entry。自定义元素必须实现 `model` 的 getter/setter——
宿主写 model，元素自行渲染。

> **物料渲染盒必须等于 `component.size`。** 渲染器在写入 `model` 之前，已经把 canonical
> `component.size` 写成宿主元素的像素 `width`/`height`，所以：
>
> - **不要**在 `renderMaterial()` 里再写宿主元素的 `width`/`height`——最常见的
>   `width: 100%; height: 100%` 会把组件撑满整个画布，而不是声明的尺寸。内部布局请用子元素的
>   `100%` 表达，宿主元素本身只设不参与几何的属性。
> - **画边框的物料要设 `box-sizing: border-box`**，否则 `borderWidth` 会加在声明尺寸之外
>   （1px 边框让实际盒子大 2px）。官方形状与容器物料都这么做。
> - `display` 由渲染器按组件 `hidden` 状态接管（`none`/`block`），物料不要与它争抢。
>
> 唯一例外是 `base.text` 的自适应宽度：其宽度由引擎测量后投影回文档，物料写 `max-content`
> 是为了让浏览器可测量。这条不变式由 `pnpm verify:browser` 的目录级断言
> （`BROWSER_HARNESS_MATERIAL_GEOMETRY_FAILED`）兜底，覆盖 `catalog` 内每个物料。

> 注册依赖浏览器 `customElements` 全局，**不能在 Node/SSR 侧调用**；服务端渲染项目只能把注册
> 放进客户端入口。在 Node 里调用 `define*Material()` 会返回 `ok: false`，且原因不是物料本身有问题。

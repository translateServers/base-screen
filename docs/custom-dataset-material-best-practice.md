# 数据集驱动自定义组件最佳实践

本指南用浏览器演示中的「数据集排行卡」说明一条最短、可复制的闭环：

```text
宿主数据集描述 -> 组件字段角色 -> 自动首轮映射 -> adapter 投影 -> 四态渲染
```

完整可运行源码位于
[`examples/browser-harness/hosted-material-package.ts`](../examples/browser-harness/hosted-material-package.ts)，
封面位于
[`examples/browser-harness/public/dataset-ranking-cover.svg`](../examples/browser-harness/public/dataset-ranking-cover.svg)。
运行 `pnpm dev:browser-harness` 后，设计器的「最佳实践」分组会显示该组件，画布上也有一个已绑定
「订单数据集」的实例。

## 为什么这样拆分

成熟可视化产品普遍把数据来源、字段映射和组件渲染分开：DataV 组件先声明接收字段，再在数据面板映射
数据源字段并查看响应；Grafana 用统一 DataFrame 连接数据源与 Panel；Superset 以 Dataset 为中心配置
可视化。Base Screen 采用同样的职责拆分，但保持宿主中立：

- **宿主数据集**负责查询、权限、参数、字段说明与原始表格结果。
- **Manifest**只声明组件需要的语义角色和字段类型，不保存 URL、SQL、Token 或查询代码。
- **Designer**按类型自动完成首轮字段映射，用户只需核对；需要时仍可手动更换。
- **adapter**把标准表格数据投影为组件自己的最小视图模型。
- **Custom Element**只渲染视图模型，并处理加载中、空数据、失败和成功四种状态。

参考资料：

- [阿里云 DataV：组件数据源配置](https://help.aliyun.com/zh/datav/datav-7/user-guide/widget-data-source-configuration)
- [Grafana：Build a data source plugin](https://grafana.com/developers/plugin-tools/tutorials/build-a-data-source-plugin)
- [Apache Superset：Creating Visualization Plugins](https://superset.apache.org/docs/contributing/creating-viz-plugins/)

## 一、Manifest 声明组件需要什么

排行卡只需要一个分类字段和一个数值字段，因此使用 Base Screen 已约定的 `dimension` / `measures`
角色。默认静态数据同时给出字段、样例行和默认映射，使组件被拖入画布后立即有确定画面。

```ts
const manifest = {
  dataCapabilities: ['static', 'host-resource'],
  dataBinding: {
    roles: [
      {
        id: 'dimension',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['string', 'date'],
      },
      {
        id: 'measures',
        minFields: 1,
        maxFields: 1,
        valueTypes: ['number'],
      },
    ],
  },
  defaultData: {
    fields: [
      { id: 'category', label: '区域', valueType: 'string' },
      { id: 'amount', label: '营收', valueType: 'number', unit: '万元' },
    ],
    rows: [{ category: '华东', amount: 128 }],
  },
  staticData: {
    kind: 'tabular',
    defaultBinding: { fields: { dimension: ['category'], measures: ['amount'] } },
  },
};
```

角色应描述视觉语义，而不是具体数据库列名。排行类组件优先使用 `dimension` / `measures`，表格使用
`columns`；只有组件确实拥有不同视觉语义时才创建自定义角色。

## 二、adapter 隔离数据集与组件内部模型

adapter 是可信运行时代码，不进入 Manifest 或 Screen Document。它只读取已通过 Base Screen 校验的字段
绑定和数据集，并返回 JSON-safe 结果：

```ts
const adapter = {
  adapt({ dataset, fields }) {
    const dimension = fields.dimension?.[0];
    const measure = fields.measures?.[0];
    if (dimension === undefined || measure === undefined) return invalidBinding();
    return {
      ok: true,
      value: {
        items: dataset.rows.flatMap((row) => {
          const label = row[dimension.id];
          const value = row[measure.id];
          return typeof label === 'string' && typeof value === 'number'
            ? [{ label, value }]
            : [];
        }),
      },
      diagnostics: [],
    };
  },
};
```

组件源码因此不需要知道数据集 ID、字段 ID 或查询方式。更换数据集时，只要用户把兼容字段映射到相同角色，
组件无需修改。

## 三、组件必须完整处理四态

推荐在渲染入口先处理状态，再解析 ready 数据：

组件根节点由 Designer 负责定位和设置尺寸。自定义元素可以设置盒模型、内边距和视觉样式，但不要把根节点强制改成 `width: 100%` 或 `height: 100%`，否则会覆盖设计器写入的画布几何，造成组件遮挡相邻区域。

```ts
if (model.dataState.status === 'loading') return renderState('正在加载数据…');
if (model.dataState.status === 'error') return renderState('数据加载失败');
if (model.dataState.status !== 'ready') return renderState('等待数据');

const items = readItems(model.dataState.value);
if (items.length === 0) return renderState('暂无可展示数据');
renderRanking(items);
```

错误信息只呈现用户可理解的状态，不显示 SQL、内部地址、Token 或后端异常正文。

通用 loading 展示可以直接复用 `@base-screen/material`（也由 `@base-screen/sdk/material` 转发）的
`createBaseScreenMaterialLoadingElement`，无需在每个宿主重复实现 spinner：

```ts
import { createBaseScreenMaterialLoadingElement } from '@base-screen/material';

if (model.dataState.status === 'loading') {
  content.replaceChildren(
    createBaseScreenMaterialLoadingElement(content.ownerDocument, { label: '数据加载中' }),
  );
  return;
}
```

`content` 是物料内部尺寸稳定的内容容器。工厂返回尚未挂载的展示节点，继承颜色与字体，内部样式隔离，
带有可访问状态文本并遵守减少动态效果设置；导入和创建均不注册自定义元素、不请求数据、不启动 JavaScript
定时器。物料仍拥有状态判断、节点挂载和移除，可选择自定义加载表现。此工具不会覆盖物料根节点的画布几何。

## 四、用户在设计器中的最短路径

1. 从「最佳实践」分组拖入「数据集排行卡」。
2. 在右侧「数据」面板选择「宿主数据集」。
3. 选择一个至少包含一个文本/日期字段和一个数值字段的数据集。
4. Designer 自动完成首轮 `dimension` / `measures` 映射；核对绑定摘要。
5. 点击「测试数据」查看“数据响应结果”和“组件消费结果”。
6. 点击「应用数据集」，再到「属性 / 样式」调整标题、单位、显示条数和颜色。

若自动映射不是业务想要的字段，只修改字段映射，不要改组件源码或数据集查询。这样同一组件能复用于不同
数据集，同一数据集也能服务多个组件。

## 五、交付检查

- Manifest、默认值、静态样例和默认 binding 能通过解析。
- host-resource 只保存资源身份、参数意图和字段映射。
- adapter 对缺少角色、类型不兼容和空行失败关闭。
- 组件不访问网络、宿主 DOM、存储或全局状态。
- loading / empty / error / ready 均有稳定布局。
- 交互事件只发送有界 JSON payload。
- `pnpm verify:browser` 覆盖真实数据集查询、字段投影、渲染四态和 Custom Element 注册。

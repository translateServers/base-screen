# 配置左侧物料库状态

> 返回[宿主使用指南](../usage.md)。


宿主从线上加载并校验可信物料包后，仍然以不可变 `catalog` 配置 Designer。若需要在左侧物料库展示加载、离线、
部分失败、草稿或更新状态，可以同时传入只读状态投影：

```ts
import { BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT } from '@base-screen/sdk';

designer.configure({
  catalog,
  materialLibraryState: {
    status: 'partial',
    failedCount: 2,
    draftTypes: ['xj.kpi-card'],
    unavailableTypes: ['xj.legacy-chart'],
  },
});

designer.addEventListener(BASE_SCREEN_MATERIAL_LIBRARY_ACTION_EVENT, (event) => {
  const { action } = (event as CustomEvent<{ action: 'retry' | 'reload' | 'details' }>).detail;
  hostMaterialLoader.handle(action);
});
```

状态支持 `loading`、`ready`、`offline`、`partial`、`error` 和 `update-available`。未配置宿主分组投影时，
面板使用 Manifest 已有的 `category` 生成分类筛选；草稿和不可用标记不进入 Manifest 或 ScreenDocument。不可用
物料仍可被解释和定位，但不能点击或拖拽创建。

更新状态时可以直接设置 `designer.materialLibraryState`，只会重绘左侧状态投影，不会重建 Renderer。真正更换
物料集合时仍须由宿主处理未保存内容，随后执行 `unload()` 并用新的不可变 catalog 重新配置。Base Screen 不会因
重试或重新加载按钮自行联网。

## 宿主控制多级物料分组

当宿主需要按业务、租户或权限上下文组织同一份 catalog 时，可在 `configure()` 中传入
`materialLibraryGrouping`，或在 catalog 已配置后更新同名 property：

```ts
import type { BaseScreenMaterialLibraryGrouping } from '@base-screen/sdk';

const materialLibraryGrouping = {
  groups: [
    {
      id: 'foundation',
      label: '基础',
      materialTypes: ['base.text', 'base.image'],
    },
    {
      id: 'data',
      label: '数据',
      children: [
        {
          id: 'data.charts',
          label: '图表',
          materialTypes: ['base.chart', 'base.table'],
        },
      ],
    },
  ],
} satisfies BaseScreenMaterialLibraryGrouping;

designer.configure({ catalog, materialLibraryGrouping });

// catalog 不变时，宿主可按自己的目录状态重新投影分组。
designer.materialLibraryGrouping = materialLibraryGrouping;
```

节点只允许 `id`、`label`、`materialTypes` 与 `children`；顺序由宿主数组决定。传入投影时，当前 catalog 中每个
`libraryVisible !== false` 的物料 type 都必须恰好出现一次，隐藏或不存在的 type 会使配置或更新被拒绝。Designer
采用 DataV 式分栏：搜索和全部/收藏/最近固定在顶部，一级分类常驻左列，子分类在右邻列原位钻取，卡片显示在其右侧。
选择父组会聚合其自身及后代物料；选择末级分类仍保留同级入口，可通过子分类列的「全部」或返回上级继续浏览。
计数表示分组内的 canonical 物料类型数，不随搜索、收藏或同类型条目数量改变；完整名称与路径可通过提示和可访问性标签读取。

分类区域采用 44px 图标栏 + 76px 子分类栏，条目行高 32px，两列独立纵向滚动并预留滚动条轨道。
一级分类只显示装饰性 SVG 图标，复用现有分类图标规则（优先名称，再参考后代物料类型，未知类型回退通用分类图标），不新增宿主字段。
完整名称、路径和类型数量通过原生 `title` 与可访问性描述提供；子分类直接从「全部」开始，无重复标题；
只有进入深层分支才显示带父级名称的整行返回按钮。数量徽标仅在浮层的宽子分类列中显示。
物料内容区小于 264px 时，分类自动折叠为
当前分类按钮（显示末级名称，完整路径保留在提示中），卡片保留全宽；按钮打开不挤压网格的有界浮层，
分支可继续钻取，选择末级或子分类列的「全部」后关闭。
Escape、关闭按钮和外部点击均可关闭浮层；Escape 或提交选择后焦点回到路径按钮。方向键上下和 Home/End 移动分类焦点，
Enter/Space 选择，右方向键进入分支，左方向键返回上级或一级分类焦点，Tab 正常离开。
切换分支时仅重置子分类滚动，切换筛选分类时物料结果从顶部显示；无匹配结果时可用「显示全部物料」清除分类、
搜索和收藏/最近筛选并返回搜索框，收藏记录与文档内容保持不变。
面板收起、切换工作台模式或移除实例会清理浮层；左面板仍支持 200–480px 宽度。
用户的路径选择只保留在当前实例内，不持久化；宿主更新分组时保留仍有效的选择，删除当前组则回到全部。

将 `designer.materialLibraryGrouping` 设为 `undefined` 会恢复既有 Manifest `category` 分类 UI。分组不会进入
Manifest、catalog、ScreenDocument、历史、导出物、Renderer 或 Viewer，也不会触发联网或宿主存储。

## 宿主扩展左侧分组

宿主需要把资产、模板或 AI 工具等业务面板纳入左侧 `rail-tabs` 导航时，可配置最多 6 个严格的
`leftPanelGroups`。描述包含 `id`、`label`、可选内建 `icon` 与可选 `workbenchModes`；真实内容仍由宿主框架
管理，并通过该分组专属命名 slot 投影到 Designer：

```ts
import {
  BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT,
  baseScreenDesignerLeftPanelSlotName,
  type BaseScreenDesignerLeftPanelGroupChangeEventDetail,
} from '@base-screen/sdk';

const assetPanel = document.createElement('acme-asset-panel');
assetPanel.slot = baseScreenDesignerLeftPanelSlotName('assets');
designer.append(assetPanel);

designer.configure({
  catalog,
  leftPanelGroups: [
    {
      id: 'assets',
      label: '资产',
      icon: 'image',
      workbenchModes: ['canvas', 'blueprint'],
    },
  ],
});

designer.addEventListener(BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT, (event) => {
  const { groupId } = (event as CustomEvent<BaseScreenDesignerLeftPanelGroupChangeEventDetail>)
    .detail;
  assetPanel.toggleAttribute('data-active', groupId === 'assets');
});

// 在当前工作台模式中选择该分组；无需查询 Shadow DOM，不支持当前模式时返回 false。
designer.selectLeftPanelGroup('assets');
```

省略 `workbenchModes` 时保持兼容行为，只显示在 Canvas；也可以显式设置 `['blueprint']` 或
`['canvas', 'blueprint']`。Canvas 与 Blueprint 分别记住当前 Tab，同一分组跨模式只使用一份 slot/tabpanel，模式
切换不会重新挂载宿主 light DOM 子树。运行时可更新 `designer.leftPanelGroups`；非法 id、保留 id
（`materials`/`layers`/`variables`）、重复项、未知字段、非法图标、空/重复/未知模式或超过 6 项的数组会失败关闭并
保留旧投影。删除当前宿主分组时，Canvas 自动回到「物料」，Blueprint 自动回到「组件」。可用图标与 slot 前缀
由 SDK 的 `BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS`、`BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX` 导出，
优先使用 `baseScreenDesignerLeftPanelSlotName(id)` 生成 slot 名。

配置对象不接受 HTML、DOM Node、component 或 render function；这些内容是宿主可信 light DOM，只能经公开
方法、端口和事件修改 Designer。Base Screen 不读取其业务状态，不负责请求/权限/持久化，也不会把内容、当前
分组或选择状态写入 Manifest、catalog、ScreenDocument、历史、Renderer 或 Viewer。slot 内部点击、输入、
快捷键和手势不会进入 Designer 的私有 data-* 事件路由，仍会正常冒泡给宿主。不要依赖
`.rail-tabs`、`.rail-view`、Shadow DOM selector 或私有 `--designer-*` Token。

`leftPanelGroups` 只是宿主业务 UI 的受限安放与导航能力，不表示 Base Screen 提供资产或资源。资源目录、搜索、
上传、存储、权限、缩略图及其业务状态必须由宿主实现；不要据此在 Engine 中增加资源 Store 或管理工作流。

## 宿主资源插入、拖放与替换

宿主资源面板只能提交 canonical 资源身份；签名 URL、token、header、请求对象和完整组件命令均不得进入载荷：

```ts
import {
  writeBaseScreenHostResourceDragData,
  type BaseScreenHostResourceAuthoringIntent,
} from '@base-screen/sdk';

const intent: BaseScreenHostResourceAuthoringIntent = {
  materialType: 'base.image',
  dataSource: {
    type: 'host-resource',
    resourceType: 'xj_asset',
    resourceId: 'asset-12',
    params: {},
    binding: null,
  },
  name: '首页封面',
};

// 双击或“添加”：在当前可见画布中心创建并选中；未挂载视窗时回退画布中心。
const inserted = designer.insertHostResource(intent);

// 替换：要求目标存在、type 完全相同且 Manifest 支持 host-resource；只更新 dataSource。
const replaced = designer.replaceHostResource('base-image-7', intent);

resourceCard.addEventListener('dragstart', (event) => {
  if (event.dataTransfer !== null) writeBaseScreenHostResourceDragData(event.dataTransfer, intent);
});
```

intent 仅允许 `materialType`、`dataSource` 与可选 `name`，最大 8 KiB；方法和 drop 均重新校验当前实例
catalog、Manifest capability、runtime resource contribution 与 canonical dataSource。插入使用 Manifest 的
默认尺寸、props 与 style，生成 ID/zIndex 并夹紧到画布；替换保留名称、几何、样式和显示属性。两者各自只提交
一次 Core transaction。宿主应把市场/订阅过滤后的 catalog 配置给 Designer；不在该 catalog 中的资源对应
物料不能插入、拖入或替换。

## 物料封面

物料作者或宿主可在 Material Manifest 中声明可选 `cover` 字段，为物料库卡片提供真实封面图（替代默认的
确定性分类图标/色相占位）：

```ts
const manifest = {
  type: 'acme.kpi-card',
  tagName: 'acme-kpi-card',
  // ...
  cover: '/assets/materials/acme-kpi-card.png', // 或 https://cdn.example.com/x.png
};
```

`cover` 必须是 1..2048 字符的 URL 字符串，不含空白、控制字符（含 C1）与反斜杠；仅允许 `http(s)://`、
协议相对 `//`、根相对 `/`、点相对 `./`/`../` 开头，且开头后必须紧跟有效字符（裸 `/`、裸 `//`、
`https:///x`、`http://?x` 等边界形式拒绝）；其他 scheme（`data:`、`javascript:`、`blob:`、`file:` 等）与
裸相对路径（如 `a.png`）同样拒绝，非法值会使 manifest 解析失败（失败关闭）。封面只用于 Designer 物料库卡片
展示：缩略图区几何恒定，加载完成淡入、加载失败自动回退确定性占位图标，Base Screen 不重试、不代理、不缓存；
封面不进入 ScreenDocument、历史、导出物、Renderer 或 Viewer。未声明 `cover` 的物料与既有行为完全一致。

封面加载完成后，Engine 会按「图片自然尺寸 vs 缩略图容器」做一次自适应适配（[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)）：
放大倍数超过 1.5×（小图）或宽高比偏差超过 0.35（异形图）时自动切换为 `contain` 完整显示、不放大不裁切，
其余照片类封面保持 `cover` 铺满裁切；封面加载成功后占位层的彩色渐变/网格底色收为中性表面，透明素材不再
透底。该行为是纯展示启发式，宿主无需任何改造；需要统一裁切出图的宿主应在自己的资产链路上生成缩略图。

## 物料库渲染可扩展性

物料库卡片网格项默认启用 `content-visibility: auto` + `contain-intrinsic-size: auto 140px`
（[ADR-0078](../decisions/ADR-0078-material-library-presentation.md)）：屏外卡片跳过渲染，
滚动条高度稳定（`auto` 关键字记住真实渲染尺寸），500~2000 张物料的首帧渲染下降约 40~57%（实测）。
搜索输入经 120ms 防抖合并渲染。该优化是纯渐进增强：不支持 `content-visibility` 的浏览器
（Safari < 18、Firefox < 125）静默退回全量渲染，功能与行为不变；宿主无需任何改造，也不应依赖
卡片是否被跳过渲染（目录、DOM 结构、可访问性与拖拽语义均不变）。

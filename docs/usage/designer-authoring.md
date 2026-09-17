# Designer 内建作者能力与宿主能力接入

> 返回[宿主使用指南](../usage.md)。

## Designer 内建作者能力（画布与物料）

以下能力由 Designer 内建，直接文档模式与项目模式同样生效；它们都只经公开配置或公开方法提交 canonical 事务，不改变宿主边界。

### 官方文本自适应宽度

选中官方文本组件，在属性面板勾选「自适应宽度」。组件按内容的最长一行撑宽，保留空格与手动
换行，不自动折行；字号、字重、字间距及动态数据变化会即时更新宽度，高度与位置保持不变。
超出画布时沿用原有裁剪规则；空文本宽度为最小尺寸 1，最大宽度为 1000000。

配置保存在 `props.autoWidth`，默认 `false`，旧文档缺失该属性时仍使用固定宽度。例如：

```ts
designer.executeCommand({
  type: 'update-components',
  componentIds: [text.id],
  patch: { props: { ...text.props, autoWidth: true } },
});
```

`size.width` 仍保存固定宽度及无法测量时的备用值；属性面板和选择框显示实际宽度。运行时测量
不改变文档、脏状态或历史，保存、导出、复制和 Viewer 均保留配置并在当前环境重新排版。

在属性面板、`W` 快捷输入或横向拖拽中实际调宽，会同时关闭自适应；多选与编组缩放同样适用。
只改高度、移动或旋转保持自适应，关闭开关则固定为当前显示宽度。双击静态文本时编辑层也会
随内容撑宽；Enter 提交、Shift+Enter 换行、Esc 取消，提交仍只有一条历史。

该选项仅适用于 `base.text`，不提供自适应高度、容器填充或自定义物料尺寸协议。架构边界见
[ADR-0085](../decisions/ADR-0085-text-and-image-material-authoring.md)。

### 官方图片倍图尺寸

单选官方图片组件 `base.image` 后，几何属性区会显示无状态的 `1x`、`2x`、`3x`、`4x`
按钮。图片加载完成后，点击按钮会把当前自然尺寸一次性换算为固定宽高：
`width = naturalWidth / 倍率`、`height = naturalHeight / 倍率`。`1x` 使用原图自然尺寸，
`2x`、`3x`、`4x` 分别除以对应倍率；结果按统一几何规则保留两位小数，并限制在
`1..1000000`。

每次实际变化只提交一个 `update-components` 事务，且只修改 `size`；相同尺寸不会新增历史。
倍率不会写入文档，也没有 `autoSize` 或 `pixelRatio` 字段。换图、重新加载或数据刷新不会继续
调整宽高，后续拖拽与宽高输入仍按普通固定尺寸工作。结果允许超出画布，Viewer、预览与导出只
消费已经写入的固定宽高。

图片尚未加载、自然尺寸无效或组件已锁定时不会修改文档，并会产生诊断；多选和非官方图片
物料不显示这组按钮。图片资产的上传、转码和多规格管理仍由宿主负责。

### 画布调色板

画布背景支持单色、线性渐变和径向渐变（ADR-0077）。`canvas.background` 是严格的 JSON-safe 判别对象；未声明时，既有 `backgroundColor` 继续表示单色。结构化调色板颜色仅接受十六进制色值或 `transparent`，渐变有 2..8 个位置严格递增的色标。Designer 的「画布」面板提供三种模式，宿主可使用同一事务语义设置或清除：

```ts
const result = designer.setCanvasBackground({
  type: 'linear-gradient',
  angle: 135,
  stops: [
    { color: '#0f172a', position: 0 },
    { color: '#2563eb', position: 100 },
  ],
});

// 删除结构化调色板并回退到 canvas.backgroundColor。
designer.setCanvasBackground(null);
```

径向渐变使用 `{ type: 'radial-gradient', position: { x, y }, stops }`，其中中心位置为 0..100 的百分比。若同时设置背景图片，图片位于调色板渐变之上，二者均在基础背景色之上；Base Screen 不接受任意 CSS 字符串、不会发起图片网络请求。

### 物料颜色字段的三段式调色板

属性面板与 Manifest Editor Descriptor 中所有 `control: 'color'` 字段共享同一个三段式调色板（ADR-0077），已全面替换原生单色 input：单色、线性渐变、径向渐变三种模式无条件可用。渐变模式支持添加/删除 2..8 个色标、编辑每个色标的颜色与位置，并设置线性角度或径向中心。控件采用紧凑行内排布：单色的颜色与透明度同行，色标的颜色与位置同行，色标透明度与增删按钮同行。每个颜色控件的无边框 hex 输入支持 `#RGB`、`#RGBA`、`#RRGGBB` 与 `#RRGGBBAA`（也保留 `transparent` token）；失焦/提交时同步 swatch、透明度和色标，未完成或非法输入不会写入文档，输入本身不显示焦点 outline。单色切到渐变仍按既有色系派生；从渐变切回单色时，当前选中色标的颜色（含透明度）成为单色值，`transparent` 色标保持原单色。字段值仍是普通字符串：单色为色值，渐变保存为规范化 CSS 渐变字符串，物料渲染与既有文档无需改动。切换模式不会丢失各模式的编辑草稿；撤销/重做或替换文档会按文档值重新解析。

渐变字符串是否真正生效取决于物料渲染端的消费方式：写 CSS `background` 类属性的字段（如 `backgroundColor`、`fill`）天然生效；官方文本物料（`base.text`）的 `color` 字段经 `background-clip: text` 渲染渐变文字（文字透明、渐变按字形显示）；官方矩形物料（`base.rectangle`）的 `borderColor` 通过组件内遮罩层渲染渐变边框，支持既有 `borderWidth` 与 `borderRadius`，且不改变组件外部尺寸。原生 `border-color`、SVG 图表与图表库 option 内部色等未做专门适配的属性仍不接受 CSS 渐变字符串，这类字段请使用单色。

### 画布背景图片

宿主可以给画布设置/清除背景图片（ADR-0077）。图片 URL 进入 canonical 文档的
`canvas.backgroundImage`（可选）与 `canvas.backgroundImageFit`（`cover`/`contain`，缺省按
`cover` 渲染），随文档持久化，Designer 画布与 Viewer 同一渲染路径一致呈现。Designer 右侧属性
面板的「画布」区也提供背景图 URL 输入与适配方式下拉（清空输入即清除背景，与 API 语义一致；
ADR-0077）：

```ts
// 设置背景图（可选指定适配方式；未传 fit 保留既有 fit，无则按 cover）
const set = designer.setCanvasBackgroundImage(
  'https://cdn.example.com/screens/bg.png',
  'contain',
);
if (!set.ok) {
  showDiagnostics(set.diagnostics); // 非法 URL/fit 失败关闭、零副作用
  return;
}

// 清除背景图（同时清除 fit）
designer.setCanvasBackgroundImage(null);
```

宿主也可以直接在加载的文档中携带背景字段（`replaceDocument`/`importDocument`/项目加载走同一
失败关闭校验）：

```ts
const document = {
  canvas: {
    width: 1920,
    height: 1080,
    backgroundColor: '#000000',
    backgroundImage: '/assets/screen-bg.png',
    backgroundImageFit: 'cover',
  },
  components: [],
  variables: [],
  blueprint: { rules: [] },
};
```

校验边界：`backgroundImage` 必须是非空、1..2048 码点的有界 URL——`http(s)://`、协议相对
`//`、根相对 `/` 或点相对 `./`、`../` 开头；拒绝 `data:`/`javascript:`/`blob:`/`file:` 等
scheme、裸相对路径、含空白/控制字符/反斜杠的值。Base Screen 只把校验后的 URL 写入 CSS
`url()`（转义），不 fetch、不预取、不重试、不代理；图片加载失败只影响画布背景呈现，图片
资产的上传、存储与鉴权归宿主（ADR-0027）。

### 宿主可视化选择背景图片

属性面板背景图片输入框旁的「选择图片」按钮是宿主通道（ADR-0077）：**按钮默认隐藏**，宿主在
`configure()` 中声明 `canvasBackgroundImageButton: true` 后渲染；点击后 Designer 派发 composed 事件
`base-screen-canvas-background-image-request`，宿主监听后打开自己的图片选择弹出框（资产目录/缩略图/
搜索/上传归宿主），确认后把选中的 URL 注入回画布：

```ts
import {
  BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
  type BaseScreenCanvasBackgroundImageRequestEventDetail,
} from '@base-screen/engine';

const configured = designer.configure({ catalog, canvasBackgroundImageButton: true });

designer.addEventListener(
  BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT,
  async (event) => {
    const { request } = (event as CustomEvent<BaseScreenCanvasBackgroundImageRequestEventDetail>)
      .detail;
    // 打开宿主自己的图片选择弹出框（可视化选择），例如 assetPicker.open(request.current)。
    const picked = await hostAssetPicker.pick({ current: request.current });
    if (picked === null) return; // 用户取消：不提交
    // 会话守护提交（requestId 匹配且未过期；null 清除背景并清 fit）
    const result = designer.commitCanvasBackgroundImage(
      request.requestId,
      picked.url,
      picked.fit,
    );
    if (!result.ok) showDiagnostics(result.diagnostics);
  },
);
```

宿主也可不依赖按钮，直接调用 `designer.requestCanvasBackgroundImage()` 发起请求（有文档返回
`true` 并派发事件，无文档返回 `false`）；提交也可以改用无会话语义的
`setCanvasBackgroundImage(url, fit)`。请求事件 detail 只含 JSON-safe 值（requestId、
instanceId、documentRevision 与当前背景值）；宿主弹出框、资产目录与上传全部归宿主，Base
Screen 不内嵌选择器。

## 统一接入 Designer 宿主能力

Designer 可以通过一个 `ScreenDesignerHostAdapter` 接入宿主能力。每个 capability 必须与同名
端口严格匹配：`true` 时必须提供端口，`false` 时不得提供端口。

```ts
import type { ScreenDesignerHostAdapter } from '@base-screen/contracts';

const designerHostAdapter: ScreenDesignerHostAdapter = {
  capabilities: {
    projectCatalog: false,
    projectPreview: false,
    projectSnapshots: false,
    resources: true,
    datasets: true,
    variableCatalog: true,
    variables: true,
    actions: false,
  },
  resources: resourcePort,
  datasets: datasetPort,
  variableCatalog: variableCatalogPort,
  variables: variablePort,
};

const configured = designer.configure({
  catalog,
  designerHostAdapter,
  runtimeContributions,
  projectAdapter,
});
```

可选端口及其宿主职责：

| capability / 端口 | 用途 | 宿主仍负责 |
| --- | --- | --- |
| `projectCatalog` | 有界的项目列表、创建、克隆、删除、导入和导出调用 | 项目中心 UI、权限、分页和业务流程 |
| `projectPreview` | 加载指定 revision 的预览文档 | 预览路由、发布状态和访问控制 |
| `projectSnapshots` | 列出、创建、恢复和删除快照 | 快照存储、保留策略和审计 |
| `resources` | 根据稳定资源标识解析数据 | 查询、凭证、缓存和结果裁剪 |
| `datasets` | 提供数据集目录、字段与参数定义，并按需执行数据集查询 | 数据目录、搜索、权限与查询实现 |
| `variableCatalog` | 为 Designer 提供可选宿主变量摘要与预览声明 | 变量发现、权限、敏感性和真实来源 |
| `variables` | 解析文档中的宿主变量 | 全局状态、租户上下文和敏感值 |
| `actions` | 声明 JSON-safe host action 端口 | 业务动作、授权、幂等和审计 |

也可以在 `configure()` 中分别传入 `resourcePort`、`datasetPort` 等独立端口。不要同时
使用两种方式表达同一能力；统一 adapter 更适合能力较多的宿主。Designer 设计画布本身不执行
Blueprint host action，示例因此使用 `actions: false`；Viewer 和发布态按[物料事件、宿主事件和宿主动作](./events-and-actions.md)设置
`blueprintHostActionPort`。

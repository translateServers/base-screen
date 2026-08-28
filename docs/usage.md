# Base Screen 宿主使用指南

本文面向把 Base Screen 嵌入现有 Web 应用的宿主开发者，说明宿主如何注册运行时、提供
Screen Document、接入项目存储与数据服务、接收事件，以及托管高级编辑器和自定义物料。
本文不介绍 Base Screen 仓库本身的开发流程。

当前接入状态：同一 pnpm workspace 内可以直接接入；独立仓库必须先由发布方提供组织 registry
中的完整同批次包集，或等价的完整离线制品集。仅有本仓库地址或单个 SDK tarball，还不足以完成
独立仓库安装。

Base Screen 提供两个 Custom Element：

- `base-screen-viewer`：渲染只读大屏，适合预览页和发布页。
- `base-screen-designer`：提供当前文档内的画布、选区、检查器、事务、历史和项目会话。

它们通过公开属性、方法、端口和 Custom Event 与宿主交互，不要求宿主更换 React、Vue 或
其他应用框架。

## 1. 先明确宿主边界

| Base Screen 负责 | 宿主负责 |
| --- | --- |
| Screen Document 的严格契约、解析、序列化和诊断 | 项目存储、目录、业务元数据、revision 和并发控制 |
| 当前实例内的渲染、编辑事务、撤销和重做 | 认证、授权、租户、路由、业务 Store 和审计 |
| Material ABI、物料目录和安全的数据结果投影 | 数据查询、聚合、缓存、轮询、ETL 和敏感参数 |
| 有界请求的取消、deadline 和迟到结果保护 | 资产上传、存储、转码、发布、部署、截图和长任务 |
| JSON-safe intent、port、method 和 event | 高级 Blueprint、代码和领域配置编辑器 |

Screen Document 只保存可移植的 canonical 数据。URL、SQL、token、请求头、数据库连接、宿主
服务对象、编辑器 session 和部署配置都不得写入文档。

## 2. 选择接入模式

宿主通常使用以下三种模式之一：

| 场景 | 元素 | 文档来源 | 保存方式 |
| --- | --- | --- | --- |
| 发布或只读预览 | Viewer | 宿主加载后赋给 `document` | 不适用 |
| 临时编辑或由宿主完全控制保存 | Designer | 宿主赋给 `document` | 监听 `base-screen-change` |
| 有项目 revision 的编辑页 | Designer | `projectAdapter.load()` | `projectAdapter.save()` |

Designer 的直接文档模式和项目模式是两种独立用法。项目模式绑定 `projectAdapter` 并调用
`load(projectId)`；不要再直接给 `document` 赋值。

## 3. 安装和注册

### 3.1 先确认依赖来源

Base Screen 当前十二个包均为 `private: true`、`0.0.0`，没有公共 npm 发布版本。因此：

- 与 Base Screen 位于同一 pnpm workspace 的宿主现在可以使用 `workspace:^`。
- 独立仓库只有在发布方提供了组织内部 registry 中的同批次完整包集后，才能按包名安装。
- 不要把单个 `@base-screen/sdk` 的原始 `pnpm pack` tarball 当成可独立交付物。它仍引用其他
  `@base-screen/*` 包，单独安装会尝试从 registry 解析这些依赖。
- 不要复制 `dist`、从 `packages/*/src` 导入，或混用不同提交、不同批次的包产物。

同一 workspace 中，宿主 `package.json` 至少声明其直接导入的包：

```json
{
  "dependencies": {
    "@base-screen/contracts": "workspace:^",
    "@base-screen/material": "workspace:^",
    "@base-screen/plugin-core": "workspace:^",
    "@base-screen/sdk": "workspace:^"
  }
}
```

使用内部 registry 时，按发布方给出的 release manifest 锁定每个包的精确版本，并保证
`@base-screen` scope 已指向组织 registry：

```text
pnpm add --save-exact @base-screen/contracts@<contracts-version> \
  @base-screen/material@<material-version> \
  @base-screen/plugin-core@<plugin-core-version> \
  @base-screen/sdk@<sdk-version>
```

发布方如果交付离线制品，必须同时提供上述包及其全部内部依赖，并保证 tarball manifest 中的依赖
可在离线制品集中解析。当前仓库的 `pnpm verify:tarball` 会在临时仓库外消费者中验证完整依赖链，
但不会生成可长期分发的离线安装包。

宿主常用包职责如下：

```text
@base-screen/sdk          Viewer、Designer 和组合入口
@base-screen/contracts    文档、宿主端口和诊断类型
@base-screen/plugin-core  物料目录和运行时 contribution 契约
@base-screen/material     官方基础物料
```

按需增加：

```text
@base-screen/plugin-manager  插件激活和 capability 授权
@base-screen/plugin-sdk      宿主托管物料包
@base-screen/react           React 物料桥接
@base-screen/vue             Vue 物料桥接
```

### 3.2 注册 Custom Element

生产接入优先使用显式 `define*()` API：它能缩小注册范围，并允许宿主记录结构化诊断。最小 Viewer
示例见第 4～6 节及 `examples/host-quickstart`。

无需处理注册诊断时，也可以在浏览器启动入口使用副作用子路径一次性注册 Viewer、Designer 和
全部官方物料：

```ts
import '@base-screen/sdk/auto-register';
import '@base-screen/material/auto-register';
```

只使用 Viewer 时，可以缩小注册范围：

```ts
import '@base-screen/sdk/viewer/auto-register';
import '@base-screen/material/auto-register';
```

这些副作用入口已在 package manifest 中精确列入 `sideEffects`，并由仓库外 Vite 生产构建验证，
不会被正常 tree-shaking 删除。应保持它们为顶层 import；默认包入口仍无注册副作用。SSR/SSG
项目只能在浏览器客户端入口导入这些子路径，不能让服务端模块执行 Custom Element 注册。

### 3.3 可运行的最小宿主

[`examples/host-quickstart`](../examples/host-quickstart/README.md) 是最小 Vanilla/Vite Viewer
宿主，只导入公开包入口。`pnpm verify:tarball` 会把它复制到仓库外临时项目，安装真实 tarball，
执行 TypeScript 检查、Vite 生产构建并用 Chromium 验证最终渲染。复制该示例前，先按 3.1 节
接通宿主自己的依赖来源。

### 3.4 为宿主生成项目级 Skill

宿主若希望让 Codex 按自己的物料、数据集和设计规范创建大屏或物料，只需先在
`package.json` 提供 `export:base-screen-skill-context` 脚本。该脚本负责复用宿主现有认证和目录
接口，将脱敏的单一规范快照写入 `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE` 指向的临时文件。

然后在 Base Screen 仓库执行一次：

```text
node skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <宿主仓库路径>
```

这一个命令是幂等的：它会安装或安全更新 `.base-screen/tooling` 下的宿主工具包（不参与 Codex
Skill 发现）、生成缺失配置、注册统一的 `base-screen:skills` 包脚本，并同步大屏设计与物料创建
两个宿主 Skill。以后宿主目录变化，只需在宿主仓库执行：

```text
pnpm base-screen:skills
```

CI 使用 `pnpm base-screen:skills verify`（只依赖已提交的 `.base-screen/host-snapshot.json`，
不联网、不需要 Token）。按需可用 `pnpm base-screen:skills check-remote` 检查线上目录是否变化
（只报告、不写文件），用 `pnpm base-screen:skills doctor` 自检。快照单文件契约和安全边界见
`skills/manage-base-screen-host-skills/references/snapshot-contract.md`。

宿主侧手册见 `docs/host-skill-manuals/`：快速接入、日常同步、配置参考、故障排查与
XJDataHub 落地方向。

宿主需要 AI 实时访问在线物料时，可按
[`在线物料 MCP 接入指南`](./host-skill-manuals/06-online-material-mcp.md) 接入。Base Screen 提供
stdio 参考服务和契约；生产 Streamable HTTP、OAuth、租户、审计及实际物料包加载均由宿主负责。

## 4. 创建物料目录

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

官方物料还包括椭圆、图片、容器、图表、ECharts 和表格。图表、ECharts、表格使用宿主表格
数据时，目录项还要分别携带包中导出的 `*_TABULAR_DATA_ADAPTER`。`examples/browser-harness`
包含完整官方目录。

## 5. 加载和校验文档

从 API、数据库、文件或 URL 得到的值都视为不可信输入，进入 Viewer/Designer 前使用
`parseScreenDocument()`：

```ts
import { parseScreenDocument } from '@base-screen/contracts';

const response = await fetch('/api/screens/sales');
const parsed = parseScreenDocument(await response.json());
if (!parsed.ok) {
  showDiagnostics(parsed.diagnostics);
  throw new Error('Screen Document 无效');
}

const screenDocument = parsed.value;
```

解析器会拒绝未知字段和无效结构。宿主不要自行剥离未知字段、补默认值、转换类型或回退到
猜测的文档形态。

宿主自行构造文档时也建议在开发和导入边界执行同一解析器。最小文档包含 `canvas`、
`components`、`variables` 和 `blueprint`：

```ts
const parsed = parseScreenDocument({
  canvas: { width: 1920, height: 1080, backgroundColor: '#111827' },
  components: [],
  variables: [],
  blueprint: { rules: [] },
});
if (!parsed.ok) throw new Error('Screen Document 无效');
const emptyDocument = parsed.value;
```

## 6. 嵌入 Viewer

Viewer 按 Screen Document 的 `canvas.width` / `canvas.height` 渲染像素画布，不会自动缩放到宿主
容器。宿主必须明确选择原始像素、`contain` 或 `cover` 策略。

原始像素模式适合有滚动条的编辑预览或宿主本身已保证相同尺寸：

```html
<div class="screen-stage">
  <base-screen-viewer></base-screen-viewer>
</div>
```

```css
.screen-stage,
base-screen-viewer {
  display: block;
  min-height: 0;
}

.screen-stage {
  width: 100%;
  height: 100%;
  overflow: auto;
}

base-screen-viewer {
  width: 1920px;
  height: 1080px;
}
```

推荐使用 `configure()` 一次性提交运行时依赖，再单独设置文档：

```ts
import type { ScreenDiagnostic } from '@base-screen/contracts';
import { type BaseScreenViewerElement, defineBaseScreenViewer } from '@base-screen/sdk/viewer';

const viewerDefinition = defineBaseScreenViewer();
if (!viewerDefinition.ok) throw new Error('Viewer 注册失败');

const viewer = document.querySelector<BaseScreenViewerElement>('base-screen-viewer');
if (viewer === null) throw new Error('缺少 base-screen-viewer');

viewer.addEventListener('base-screen-diagnostic', (event) => {
  const detail = (event as CustomEvent<{ diagnostics: readonly ScreenDiagnostic[] }>).detail;
  reportBaseScreenDiagnostics(detail.diagnostics);
});

const configured = viewer.configure({
  catalog,
  instanceId: 'sales-published-viewer',
  mode: 'viewer',
  resourceTimeoutMs: 15_000,
});
if (!configured.ok) {
  showDiagnostics(configured.diagnostics);
  throw new Error('Viewer 配置失败');
}

viewer.document = screenDocument;
```

`configure()` 会在创建 Renderer 前原子校验整个配置。不要依赖多个 setter 的先后顺序完成
初始化。运行中可以重新设置 `document`；`catalog`、资源端口、变量端口、contribution 和
timeout 等运行时依赖需要先 `unload()`，再重新 `configure()`。诊断监听应在配置和文档赋值前
注册，避免漏掉初始化阶段的错误。

### 6.1 `contain` / `cover` 自适应

发布页需要等比自适应时，在 Viewer 外增加固定画布层，由宿主缩放该层。下面的实现同步完成首次
计算，后续只更新 `transform`，不会改变文档坐标或向 Screen Document 写入视口状态：

```html
<div class="screen-viewport">
  <div class="screen-canvas">
    <base-screen-viewer></base-screen-viewer>
  </div>
</div>
```

```css
.screen-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  contain: layout paint;
}

.screen-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  transform-origin: center;
}

.screen-canvas > base-screen-viewer {
  display: block;
  width: 100%;
  height: 100%;
}
```

```ts
function observeScreenFit(
  viewport: HTMLElement,
  canvas: HTMLElement,
  size: { width: number; height: number },
  mode: 'contain' | 'cover' = 'contain',
): () => void {
  if (size.width <= 0 || size.height <= 0) throw new RangeError('画布尺寸必须大于 0');

  const update = () => {
    const scaleX = viewport.clientWidth / size.width;
    const scaleY = viewport.clientHeight / size.height;
    const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };

  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  update();
  const observer = new ResizeObserver(update);
  observer.observe(viewport);
  return () => observer.disconnect();
}

const viewport = document.querySelector<HTMLElement>('.screen-viewport');
const canvas = document.querySelector<HTMLElement>('.screen-canvas');
if (viewport === null || canvas === null) throw new Error('缺少 Viewer 自适应容器');

const stopFit = observeScreenFit(viewport, canvas, screenDocument.canvas, 'contain');
// 路由离开或销毁页面时调用 stopFit()。
```

`contain` 完整展示并可能留边；`cover` 填满容器并可能裁切。尺寸变化、全屏和横竖屏调度属于
宿主。避免给 `base-screen-viewer` 自身设置百分比尺寸后期待它自动改变画布坐标系。

数据变化时可刷新全部资源或单个组件：

```ts
viewer.refreshData();
viewer.refreshData('sales-chart');
viewer.refreshData({
  componentId: 'sales-chart',
  trigger: 'polling',
  traceId: crypto.randomUUID(),
});
```

轮询调度属于宿主。Base Screen 只执行本次有界刷新，不创建后台轮询器。

## 7. 嵌入 Designer

```html
<base-screen-designer></base-screen-designer>
```

### 7.1 直接文档模式

直接文档模式适合新建草稿、临时编辑，或保存按钮完全位于宿主外壳中的场景：

```ts
import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/sdk';

const designer = document.querySelector<BaseScreenDesignerElement>('base-screen-designer');
if (designer === null) throw new Error('缺少 base-screen-designer');

const configured = designer.configure({
  catalog,
  toolMaterialTypes: {
    text: 'base.text',
    rectangle: 'base.rectangle',
  },
});
if (!configured.ok) {
  showDiagnostics(configured.diagnostics);
  throw new Error('Designer 配置失败');
}

designer.document = screenDocument;

designer.addEventListener('base-screen-change', (event) => {
  const nextDocument = (event as CustomEvent<{ document: ScreenDocument | undefined }>).detail
    .document;
  if (nextDocument !== undefined) hostDraftStore.set(nextDocument);
});
```

`base-screen-change` 表示 canonical 文档发生了修改，不等同于服务端已经保存。宿主应按自己的
节流、离开页面确认和错误处理策略保存。`toolMaterialTypes` 中的类型必须存在于目录；启用编组
时再设置 `groupMaterialType`，对应 manifest 的 `designCapabilities.children` 必须为 `true`。

### 7.2 项目模式

有服务端项目和 revision 时，宿主实现 `ScreenProjectAdapter`：

```ts
import {
  parseScreenProjectEnvelope,
  type ScreenProjectAdapter,
} from '@base-screen/contracts';

const projectAdapter: ScreenProjectAdapter = {
  capabilities: { publish: false },

  async load({ projectId, signal }) {
    const raw = await hostProjectApi.load({ projectId, signal });
    return parseScreenProjectEnvelope(raw);
  },

  async save({ projectId, revision, document, signal }) {
    const raw = await hostProjectApi.save({
      projectId,
      expectedRevision: revision,
      document,
      signal,
    });
    return parseScreenProjectEnvelope(raw);
  },
};
```

然后在初始化时绑定 adapter，并通过项目 ID 加载：

```ts
const configured = designer.configure({
  catalog,
  projectAdapter,
  toolMaterialTypes: {
    text: 'base.text',
    rectangle: 'base.rectangle',
  },
});
if (!configured.ok) throw new Error('Designer 配置失败');

const loaded = await designer.load('sales-screen');
if (!loaded.ok) showDiagnostics(loaded.diagnostics);
```

Designer 内建保存操作和 `await designer.save()` 都会调用 adapter。保存成功必须返回新的
`ScreenProjectEnvelope` 和 revision。服务端发现 revision 过期时返回 `PROJECT_CONFLICT`，宿主
不能静默覆盖远端文档；应让用户继续编辑或明确执行 `reloadRemote(true)`。

如果宿主支持发布，将 `capabilities.publish` 设为 `true`，实现 `publish()`，并让发布请求同样
校验 `projectId + revision`。实际构建、部署和公开 URL 仍由宿主处理。

项目模式常用事件：

| 事件 | `detail` | 宿主用途 |
| --- | --- | --- |
| `base-screen-ready` | `{ projectId, revision }` | 项目加载完成 |
| `base-screen-dirty-change` | `{ dirty, revision }` | 离开页面确认、外部保存状态 |
| `base-screen-project-conflict` | 无 | 展示并发冲突处理入口 |
| `base-screen-diagnostic` | `{ diagnostics }` | 日志、提示和可观测性 |

#### 宿主预览接管

项目模式下，设计器内建预览默认禁用（发布路由、预览页与访问控制归宿主，见 ADR-0027）。宿主
可在 `configure()` 中传入 `previewHandler` 接管预览按钮：

```ts
const configured = designer.configure({
  catalog,
  projectAdapter,
  previewHandler: (document) => {
    // 返回 true 表示宿主已接管：把当前编辑文档（含未保存修改）交给宿主预览流程。
    sessionStorage.setItem('draft', JSON.stringify(document));
    window.open('/preview?draft=1');
    return true;
  },
});
```

处理器收到当前编辑中的 canonical `ScreenDocument`。返回 `true` 视为成功且不再打开引擎内置
预览浮层；返回 `false` 或抛异常时回退到引擎内置预览。未配置 `previewHandler` 的项目模式
保持既有失败语义；直接文档模式的内置浮层不受影响。预览路由、鉴权、草稿存储与窗口打开全部
由宿主实现，Base Screen 不新增网络、存储或窗口管理职责。

#### 画布调色板

画布背景支持单色、线性渐变和径向渐变（ADR-0048）。`canvas.background` 是严格的 JSON-safe 判别对象；未声明时，既有 `backgroundColor` 继续表示单色。结构化调色板颜色仅接受十六进制色值或 `transparent`，渐变有 2..8 个位置严格递增的色标。Designer 的「画布」面板提供三种模式，宿主可使用同一事务语义设置或清除：

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

#### 物料颜色字段的三段式调色板

属性面板与 Manifest Editor Descriptor 中所有 `control: 'color'` 字段共享同一个三段式调色板（ADR-0050/0051），已全面替换原生单色 input：单色、线性渐变、径向渐变三种模式无条件可用。渐变模式支持添加/删除 2..8 个色标、编辑每个色标的颜色与位置，并设置线性角度或径向中心。控件采用紧凑行内排布：单色的颜色与透明度同行，色标的颜色与位置同行，色标透明度与增删按钮同行。每个颜色控件的无边框 hex 输入支持 `#RGB`、`#RGBA`、`#RRGGBB` 与 `#RRGGBBAA`（也保留 `transparent` token）；失焦/提交时同步 swatch、透明度和色标，未完成或非法输入不会写入文档，输入本身不显示焦点 outline。单色切到渐变仍按既有色系派生；从渐变切回单色时，当前选中色标的颜色（含透明度）成为单色值，`transparent` 色标保持原单色。字段值仍是普通字符串：单色为色值，渐变保存为规范化 CSS 渐变字符串，物料渲染与既有文档无需改动。切换模式不会丢失各模式的编辑草稿；撤销/重做或替换文档会按文档值重新解析。

渐变字符串是否真正生效取决于物料渲染端的消费方式：写 CSS `background` 类属性的字段（如 `backgroundColor`、`fill`）天然生效；官方文本物料（`base.text`）的 `color` 字段经 `background-clip: text` 渲染渐变文字（文字透明、渐变按字形显示）；`border-color`、SVG 图表与 ECharts option 内部色等不接受 CSS 渐变字符串的属性不会渲染渐变，这类字段请使用单色。

#### 画布背景图片

宿主可以给画布设置/清除背景图片（ADR-0043）。图片 URL 进入 canonical 文档的
`canvas.backgroundImage`（可选）与 `canvas.backgroundImageFit`（`cover`/`contain`，缺省按
`cover` 渲染），随文档持久化，Designer 画布与 Viewer 同一渲染路径一致呈现。Designer 右侧属性
面板的「画布」区也提供背景图 URL 输入与适配方式下拉（清空输入即清除背景，与 API 语义一致；
ADR-0045）：

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

#### 宿主可视化选择背景图片

属性面板背景图片输入框旁的「选择图片」按钮是宿主通道（ADR-0046/0049）：**按钮默认隐藏**，宿主在
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

### 7.3 配置 Designer 主题

`base-screen-designer` 提供 CSS Custom Properties，用于让 Designer 的顶栏、工具栏、面板、
菜单、对话框、控件和自有滚动条与宿主的视觉语义保持一致。主题只作用于 Designer chrome：
Designer 画布中的 Material 与 Viewer 中的同一 Material 都继续使用 document-driven appearance，
不会被这些 Token 重绘。

缺失 `theme` 或未知值使用内建 dark fallback；设置 `theme="light"` 使用 light fallback。宿主可在
元素、任意祖先或 author stylesheet 中设置 Token：

```html
<main class="host-shell">
  <base-screen-designer theme="light"></base-screen-designer>
</main>
```

```css
.host-shell {
  --base-screen-designer-surface-workspace: var(--host-surface-canvas);
  --base-screen-designer-surface-panel: var(--host-surface-panel);
  --base-screen-designer-surface-control: var(--host-surface-control);
  --base-screen-designer-text-primary: var(--host-text-primary);
  --base-screen-designer-text-secondary: var(--host-text-secondary);
  --base-screen-designer-border-default: var(--host-border-default);
  --base-screen-designer-focus-ring: var(--host-focus-ring);
  --base-screen-designer-accent: var(--host-accent);
  --base-screen-designer-accent-surface: var(--host-accent-subtle);
  --base-screen-designer-shadow-overlay: var(--host-shadow-overlay);
  --base-screen-designer-motion: 140ms ease-out;
  --base-screen-designer-scrollbar-thumb: var(--host-scrollbar-thumb);
  --base-screen-designer-scrollbar-track: var(--host-scrollbar-track);
}
```

需要在运行时切换主题时，使用标准 CSS API；不需要 Base Screen 的 JavaScript theme setter：

```ts
const designer = document.querySelector<HTMLElement>('base-screen-designer');
if (designer === null) throw new Error('缺少 base-screen-designer');

designer.setAttribute('theme', 'light');
designer.style.setProperty('--base-screen-designer-accent', '#1d4ed8');
designer.style.removeProperty('--base-screen-designer-accent');
```

同一 Token 的优先级为：元素 inline style、宿主 author stylesheet、当前 `theme` fallback、dark
fallback。删除覆盖会恢复下一层有效值。两个 Designer 可设置不同的 `theme` 和 Token，状态互不影响。

正式公开的 Token 家族如下。每个名称均以 `--base-screen-designer-` 为前缀：

| 家族 | 后缀 |
| --- | --- |
| Surface | `surface-workspace`、`surface-panel`、`surface-raised`、`surface-control`、`surface-control-hover`、`surface-overlay`、`surface-canvas`、`surface-scrim`、`canvas-grid-line` |
| Text | `text-primary`、`text-secondary`、`text-muted`、`text-disabled` |
| Border | `border-subtle`、`border-default`、`border-strong`、`focus-ring` |
| Semantic | `accent`、`accent-surface`、`success`、`success-surface`、`warning`、`warning-surface`、`danger`、`danger-surface` |
| Elevation | `shadow-overlay`、`shadow-canvas`、`shadow-float` |
| Motion | `motion`、`motion-emphasis` |
| Scrollbar | `scrollbar-thumb`、`scrollbar-thumb-hover`、`scrollbar-track`、`scrollbar-corner` |

Surface、Text、Border、Semantic 和 Scrollbar 接受标准 CSS 颜色值；Elevation 接受 `box-shadow` 值；
Motion 接受 transition duration/timing-function 序列。Scrollbar Token 只影响 Designer 明确拥有的
滚动区域，不会影响 `body`、宿主元素、Viewer 或 Material。

不要依赖或修改私有 `--designer-*` Token、Shadow DOM selector、class、`::part`、内部布局、面板尺寸、
grid、breakpoint、z-index 或图标几何。不要通过 `cssText` 或注入 Shadow DOM stylesheet 重写工作台。

## 8. 统一接入 Designer 宿主能力

Designer 可以通过一个 `ScreenDesignerHostAdapter` 接入宿主能力。每个 capability 必须与同名
端口严格匹配：`true` 时必须提供端口，`false` 时不得提供端口。

```ts
import type { ScreenDesignerHostAdapter } from '@base-screen/contracts';

const designerHostAdapter: ScreenDesignerHostAdapter = {
  capabilities: {
    projectCatalog: false,
    projectPreview: false,
    projectSnapshots: false,
    assets: false,
    resources: true,
    datasetCatalog: true,
    variables: true,
    actions: false,
  },
  resources: resourcePort,
  datasetCatalog: datasetCatalogPort,
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
| `assets` | 查询资产摘要和删除前检查 | 上传、转码、缩略图、存储和删除 |
| `resources` | 根据稳定资源标识解析数据 | 查询、凭证、缓存和结果裁剪 |
| `datasetCatalog` | 为 Designer 提供数据集名称、字段和参数元数据 | 数据目录、搜索和权限 |
| `variables` | 解析文档中的宿主变量 | 全局状态、租户上下文和敏感值 |
| `actions` | 声明 JSON-safe host action 端口 | 业务动作、授权、幂等和审计 |

也可以在 `configure()` 中分别传入 `resourcePort`、`datasetCatalogPort` 等独立端口。不要同时
使用两种方式表达同一能力；统一 adapter 更适合能力较多的宿主。Designer 设计画布本身不执行
Blueprint host action，示例因此使用 `actions: false`；Viewer 和发布态按第 10 节设置
`blueprintHostActionPort`。

## 9. 接入宿主数据

宿主数据由三部分组成：

- `datasetCatalogPort`：Designer 发现数据集并读取字段、参数编辑元数据。
- `resourcePort`：Viewer/Designer 按稳定 `resourceType + resourceId` 查询数据。
- `variablePort`：把文档中的宿主变量 ID 解析为当前运行值。

### 9.1 数据集目录

```ts
import type { ScreenHostDatasetCatalogPort } from '@base-screen/contracts';

const datasetCatalogPort: ScreenHostDatasetCatalogPort = {
  async list({ query, cursor, limit, signal }) {
    return hostDatasetService.list({ query, cursor, limit, signal });
  },

  async describe({ resourceType, resourceId, signal }) {
    return hostDatasetService.describe({ resourceType, resourceId, signal });
  },
};
```

`list()` 返回 `ScreenDatasetPage`，`describe()` 返回 `ScreenDatasetDescriptor`。描述只暴露安全的
名称、字段和参数编辑元数据，不携带连接信息。参数的权威结构和约束来自对应 resource type 的
`configSchema`。

### 9.2 资源解析

```ts
import type { ScreenHostResourcePort } from '@base-screen/contracts';

const resourcePort: ScreenHostResourcePort = {
  async resolve(
    { componentId, resourceType, resourceId, params },
    { signal, context },
  ) {
    return hostDatasetService.resolve({
      componentId,
      resourceType,
      resourceId,
      params,
      signal,
      context,
    });
  },
};
```

`params` 已经把 literal 和 variable 参数求值成普通 JSON。字段绑定不会发送给查询端口，而是由
Base Screen 在安全结果投影阶段处理。表格数据应符合 `ScreenTabularDataset`；对后端返回值可
使用 `parseScreenTabularDataset()` 再进入端口结果。

宿主实现必须：

- 只接受已授权的 `resourceType`、`resourceId` 和参数。
- 响应 `signal.aborted`，把信号继续传给底层请求或主动停止工作。
- 返回 `ScreenParseResult`，不抛出包含 token、SQL、内部 URL 或原始服务端消息的错误。
- 对返回值执行容量限制和字段裁剪；Base Screen 不是无限数据传输通道。
- 将 `context` 仅用于本次追踪、审计或模式判断，不把它写回 Screen Document。

### 9.3 宿主变量

```ts
import type { ScreenHostVariablePort } from '@base-screen/contracts';

const variablePort: ScreenHostVariablePort = {
  async resolve({ variableId, signal }) {
    return hostVariableService.resolve({ variableId, signal });
  },
};
```

文档只保存类似 `{ type: 'host', name: 'region', variableId: 'current-region' }` 的引用。实际租户、
用户和路由状态留在宿主。缺少变量端口、解析失败或结果不是 JSON-safe 值时，资源不会带着
猜测值继续查询。

### 9.4 Resource type 和 capability

提供 `runtimeContributions` 后，Base Screen 会按 resource type 的 `configSchema` 校验参数，并
按授权 capability 编译 Blueprint。权威索引通常由宿主已有的插件激活结果提供：

```ts
viewer.configure({
  catalog,
  resourcePort,
  variablePort,
  runtimeContributions: pluginManagerSnapshot.contributions,
});
```

使用 `@base-screen/plugin-manager` 时应采用 `activate()` 成功返回的 snapshot；插件未激活、
resource type 未贡献或 capability 未授权时保持失败关闭。

## 10. 物料事件、宿主事件和宿主动作

Viewer 把物料交互冒泡为 `base-screen-material-event`：

```ts
viewer.addEventListener('base-screen-material-event', (event) => {
  const detail = (
    event as CustomEvent<{
      componentId: string;
      name: string;
      payload: unknown;
    }>
  ).detail;

  hostTelemetry.track('screen_material_event', detail);
});
```

Designer 默认关闭画布内组件原生事件。打开底部状态栏「事件」开关
（`data-status-toggle="native-events"`）后，设计态画布切到交互模式：组件原生事件
（如文本 `valueClick`、图表 `seriesClick`、表格行点击）以同样的 `base-screen-material-event`
CustomEvent 从 designer 元素转发给宿主，`detail` 与 Viewer 完全同形
（`{ componentId, type, name, payload }`）；原生 CSS/悬停交互也随开关一起生效：echarts 数据点的
pointer 光标与悬停放大、React/Vue 桥接渲染的原生控件（button 等）的 hover/active/focus 样式，
开关关闭时全部静默（桥接控件以 pointer-events 门控，不影响设计器选择/拖拽）：

```ts
designer.addEventListener('base-screen-material-event', (event) => {
  const detail = (event as CustomEvent<{ componentId: string; name: string }>).detail;
  hostDebugPanel.log(detail.componentId, detail.name);
});
```

关闭开关后行为与现状一致（点击与悬停均静默、事件零外泄）；开关只影响当前实例的交互模式，
不进文档、不持久化。切换在渲染器内原地生效，组件 DOM 与数据集请求不会重建。

Blueprint 的 `emit-host-event` 通过 `blueprintRuntimePort` 交给宿主事件总线：

```ts
const configured = viewer.configure({
  catalog,
  runtimeContributions,
  blueprintRuntimePort: {
    emit(event) {
      hostEventBus.publish(event.name, event.payload);
    },
  },
  blueprintHostActionPort: {
    async execute(action) {
      await authorizedHostActions.execute(action.name, action.payload);
    },
  },
});
```

未提供 `blueprintRuntimePort` 时，宿主事件会以 `base-screen-blueprint-event` Custom Event 发出。
`host-action` 没有端口时会失败并产生诊断，不会静默执行任意函数。宿主动作端口需要自行处理
授权、幂等、审计和业务错误脱敏。

### 条件样式：文档规则与宿主端口

数据驱动的预警样式有两条互补通道（合并顺序固定：基础 `style` → 命中的文档 `styleRules` →
端口覆盖，同键后写覆盖先写；effective style 只存在于运行时，不回写文档、不产生历史）。

**通道一：文档 `styleRules`**（ADR-0058）适合随屏幕版本化的轻量视觉映射。宿主把判定结果
投影进数据（如 `{ value: 85, level: 'warn' }`），文档只保留纯视觉规则：

```json
{
  "styleRules": [
    { "id": "warn", "when": { "path": ["level"], "operator": "eq", "value": "warn" },
      "style": { "color": "#ff4d4f", "fontWeight": "700" } }
  ]
}
```

**通道二：`conditionalStylePort`**（ADR-0059）适合判定与视觉映射都归宿主告警体系维护的场景：
阈值调整零文档变更、多租户同屏不同视觉策略。`resolve` 必须是同步纯函数（相同输入返回相同
结果；异步数据走 `resourcePort`/`refreshData` 产生新 `dataState` 后自然重求值）：

```ts
const configured = viewer.configure({
  catalog,
  conditionalStylePort: {
    resolve({ componentId, dataState }) {
      if (componentId !== 'kpi-1' || dataState.status !== 'ready') return undefined;
      const level = alarmRegistry.levelFor(componentId, dataState.value);
      return level === 'warn' ? { color: '#ff4d4f', fontWeight: '700' } : undefined;
    },
  },
});
```

端口对每个组件的每次求值都会收到完整 `dataState`（含 `idle`/`loading`/`error`），可自行决定
降灰等状态样式。端口返回的覆盖必须满足物料 `styleSchema`：非法覆盖与 `resolve` 抛异常都会被
fail-closed 隔离——忽略本次覆盖、保留基础+规则样式并上报一条诊断，渲染不中断。Designer 支持
同一配置（`configure` 或初始化前的守卫 setter），设计态画布与 Viewer 走同一渲染路径预览告警
效果；未配置端口的实例行为与现状完全一致。

## 11. 配置左侧物料库状态

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

### 11.1 宿主控制多级物料分组

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
提供全部入口、路径面包屑、当前层级子组与缩略图网格；用户的路径选择只保留在当前实例内，不持久化。

将 `designer.materialLibraryGrouping` 设为 `undefined` 会恢复既有 Manifest `category` 分类 UI。分组不会进入
Manifest、catalog、ScreenDocument、历史、导出物、Renderer 或 Viewer，也不会触发联网或宿主存储。

### 11.2 宿主扩展左侧分组

宿主需要把资产、模板或 AI 工具等业务面板纳入左侧 `rail-tabs` 导航时，可配置最多 6 个严格的
`leftPanelGroups`。描述只包含 `id`、`label` 与可选内建 `icon`；真实内容仍由宿主框架管理，并通过该分组专属
命名 slot 投影到 Designer：

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
  leftPanelGroups: [{ id: 'assets', label: '资产', icon: 'image' }],
});

designer.addEventListener(BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_CHANGE_EVENT, (event) => {
  const { groupId } = (event as CustomEvent<BaseScreenDesignerLeftPanelGroupChangeEventDetail>)
    .detail;
  assetPanel.toggleAttribute('data-active', groupId === 'assets');
});

// 无需查询 Shadow DOM；不存在或尚未挂载时返回 false。
designer.selectLeftPanelGroup('assets');
```

运行时可更新 `designer.leftPanelGroups`；非法 id、保留 id（`materials`/`layers`/`variables`）、重复项、未知字段、
非法图标或超过 6 项的数组会失败关闭并保留旧投影。删除当前宿主分组会自动回到「物料」。可用图标与 slot 前缀
由 SDK 的 `BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS`、`BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX`
导出，优先使用 `baseScreenDesignerLeftPanelSlotName(id)` 生成 slot 名。

配置对象不接受 HTML、DOM Node、component 或 render function；这些内容是宿主可信 light DOM，只能经公开
方法、端口和事件修改 Designer。Base Screen 不读取其业务状态，不负责请求/权限/持久化，也不会把内容、当前
分组或选择状态写入 Manifest、catalog、ScreenDocument、历史、Renderer 或 Viewer。slot 内部点击、输入、
快捷键和手势不会进入 Designer 的私有 data-* 事件路由，仍会正常冒泡给宿主。不要依赖
`.rail-tabs`、`.rail-view`、Shadow DOM selector 或私有 `--designer-*` Token。

`leftPanelGroups` 只是宿主业务 UI 的受限安放与导航能力，不表示 Base Screen 提供资产或资源。资源目录、搜索、
上传、存储、权限、缩略图及其业务状态必须由宿主实现；不要据此在 Engine 中增加资源 Store 或管理工作流。

### 11.3 物料封面

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

封面加载完成后，Engine 会按「图片自然尺寸 vs 缩略图容器」做一次自适应适配（[ADR-0041](../docs/decisions/ADR-0041-material-cover-adaptive-fit.md)）：
放大倍数超过 1.5×（小图）或宽高比偏差超过 0.35（异形图）时自动切换为 `contain` 完整显示、不放大不裁切，
其余照片类封面保持 `cover` 铺满裁切；封面加载成功后占位层的彩色渐变/网格底色收为中性表面，透明素材不再
透底。该行为是纯展示启发式，宿主无需任何改造；需要统一裁切出图的宿主应在自己的资产链路上生成缩略图。

### 11.4 物料库渲染可扩展性

物料库卡片网格项默认启用 `content-visibility: auto` + `contain-intrinsic-size: auto 140px`
（[ADR-0042](../docs/decisions/ADR-0042-material-library-render-scalability.md)）：屏外卡片跳过渲染，
滚动条高度稳定（`auto` 关键字记住真实渲染尺寸），500~2000 张物料的首帧渲染下降约 40~57%（实测）。
搜索输入经 120ms 防抖合并渲染。该优化是纯渐进增强：不支持 `content-visibility` 的浏览器
（Safari < 18、Firefox < 125）静默退回全量渲染，功能与行为不变；宿主无需任何改造，也不应依赖
卡片是否被跳过渲染（目录、DOM 结构、可访问性与拖拽语义均不变）。

## 12. 接入宿主高级编辑器

交互编排、代码、完整 ECharts 配置和领域编辑器由宿主渲染在 Designer Shadow DOM 之外。Base Screen
不提供流程画布、规则列表编辑器、节点检查器、搜索、布局或试运行 UI，也不引入这些界面的图形库和编辑器
依赖。Designer 内建界面只有顶栏整屏入口，以及右侧当前组件的只读事件/规则摘要与宿主定位入口。

Designer 通过 `base-screen-authoring-request` 发起 JSON-safe 请求，宿主完成编辑后调用专用提交方法。

```ts
import {
  SCREEN_AUTHORING_REQUEST_EVENT,
  type ScreenAuthoringRequestEventDetail,
} from '@base-screen/sdk';

designer.addEventListener(SCREEN_AUTHORING_REQUEST_EVENT, (event) => {
  const { request } = (event as CustomEvent<ScreenAuthoringRequestEventDetail>).detail;
  hostAuthoringEditor.open(request);
});
```

宿主可以从自己的按钮或路由发起编辑请求。无参数的 Blueprint 请求面向当前 Designer 中的整份文档，
不要求先选择组件；传入 `initialComponentId` 只提示宿主初始定位，不限制读取、编辑或提交范围：

```ts
designer.requestBlueprintEdit();
designer.requestBlueprintEdit({ initialComponentId: 'chart-1' });
designer.requestComponentTextEdit('props');
designer.requestComponentTextEdit('style');
designer.requestComponentTextEdit('data');
```

Blueprint 请求的 `context` 是一份与 canonical 状态深度分离的整屏作者上下文：

- `document`：完整 `ScreenDocument` 快照；
- `initialComponentId`：可为空的宿主定位提示；
- `materialEvents`：按文档实际使用的物料类型去重后的事件名称、文案、payload schema、payload 容量、
  required capability 与可用状态；
- `capabilities` 和 `limits`：当前 Blueprint 能力投影与提交容量限制。

宿主应从 `request.context.document.blueprint` 创建草稿。提交时必须原样带回请求身份和预期 revision，
并返回完整 Blueprint；提交协议不携带组件身份：

```ts
if (request.kind !== 'blueprint') return;

const editedBlueprint = await hostBlueprintEditor.open({
  document: request.context.document,
  initialComponentId: request.context.initialComponentId,
  materialEvents: request.context.materialEvents,
  capabilities: request.context.capabilities,
  limits: request.context.limits,
});

const result = designer.commitBlueprintEdit({
  requestId: request.requestId,
  expectedRevision: request.documentRevision,
  blueprint: editedBlueprint,
});

if (!result.ok) showDiagnostics(result.diagnostics);
```

用户取消或关闭宿主编辑器时，应释放对应请求，避免留下无效会话：

```ts
designer.cancelAuthoringEdit(request.requestId);
```

Blueprint 提交会校验 request ID、Designer 实例、打开时的 document generation、外部 revision、
完整 canonical 文档、compile/capability、JSON 深度和容量。请求打开后发生任何文档修改，完整 Blueprint
覆盖都会失败关闭；合法提交只执行一次 `replace-blueprint`，因此只形成一条历史并可一次撤销。

组件文本编辑协议保持不变，继续使用 `commitComponentTextEdit()` 并校验 component identity 与目标 schema。
陈旧或无效候选不会修改文档和历史。宿主不要绕过这些入口操作 Designer 的 Shadow DOM 或内部 Store；宿主
选择的编排 UI 技术栈及重型依赖也不应加入 Base Screen workspace 或 bundle。

## 13. React、Vue 和自定义物料

React/Vue 应用可以把现有组件包装成 Base Screen 物料。Screen Document 仍只引用稳定的
material `type`，不保存框架组件名。`@base-screen/react` 要求 `react`、`react-dom` `^19.1.0`；
`@base-screen/vue` 要求 `vue` `^3.5.0`。框架依赖是 peer dependency，必须由宿主安装且全页只使用
兼容版本。

先提供一个冲突安全、可重复调用的注册函数：

```ts
import type { BaseScreenMaterialCatalogEntry } from '@base-screen/plugin-core';

function defineMaterialEntry(entry: BaseScreenMaterialCatalogEntry): void {
  const existing = customElements.get(entry.manifest.tagName);
  if (existing === undefined) {
    customElements.define(entry.manifest.tagName, entry.constructor);
    return;
  }
  if (existing !== entry.constructor) {
    throw new Error(`物料标签冲突：${entry.manifest.tagName}`);
  }
}
```

React：

```ts
import { createReactMaterialDefinition } from '@base-screen/react';

const reactEntry = createReactMaterialDefinition({
  manifest,
  component: HostKpiCard,
  eventProps: { valueClick: 'onValueClick' },
});
if (!reactEntry.ok) {
  showDiagnostics(reactEntry.diagnostics);
  throw new Error('React 物料创建失败');
}
defineMaterialEntry(reactEntry.value);
```

Vue：

```ts
import { createVueMaterialDefinition } from '@base-screen/vue';

const vueEntry = createVueMaterialDefinition({
  manifest,
  component: HostKpiCard,
  eventProps: { valueClick: 'onValueClick' },
});
if (!vueEntry.ok) {
  showDiagnostics(vueEntry.diagnostics);
  throw new Error('Vue 物料创建失败');
}
defineMaterialEntry(vueEntry.value);
```

成功值是 `BaseScreenMaterialCatalogEntry`，可与官方物料 entry 一起传给
`createBaseScreenMaterialCatalog()`。`type` 和 `tagName` 必须稳定且唯一；不要每次组件渲染时创建
新的 bridge constructor。桥接组件根元素应使用 `width: 100%; height: 100%` 填满物料几何区域，
并在宿主卸载时清理自身订阅和定时器。仓库外 React/Vue tarball 消费者会验证类型增强、生产构建、
事件、模型更新、断开重连和最终卸载。

## 14. 宿主托管外部物料包

物料包不是普通的自定义物料集合，它有独立的注册契约。业务团队独立分发物料模块时，宿主负责
下载、完整性校验、信任审核和加载；Base Screen 不 fetch、不 dynamic import、不发现远程代码。
代码进入页面后，用 `createMaterialPackage()` 先完整校验再注册：

```ts
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createMaterialPackage } from '@base-screen/plugin-sdk';

const packageResult = createMaterialPackage({
  id: 'acme.kpi',
  materials: [
    { manifest: acmeKpiManifest, element: AcmeKpiElement },
    { manifest: acmeTrendManifest, element: AcmeTrendElement },
  ],
});
if (!packageResult.ok) throw new Error('外部物料包无效');

const defined = packageResult.value.define();
if (!defined.ok) throw new Error('外部物料注册冲突');

const hostedCatalog = createBaseScreenMaterialCatalog(defined.value);
```

契约要点：

- `id` 必须是合法 ASCII identifier（1..128 个 code unit，`[A-Za-z0-9._:-]`，首字符为字母或
  数字）。它只用于宿主侧诊断和配置，不进入 Screen Document、manifest 或运行时状态。
- `materials` 为数组且最多 512 项；每一项都会复用 `createMaterialDefinition` 完成 manifest
  解析、静态 manifest 一致性校验和数据集适配器校验，并拒绝包内重复 `type` / `tagName`。
- 创建期 fail closed 返回 `ScreenParseResult`，不抛异常、不访问浏览器全局；诊断代码为
  `PLUGIN_CORE_MANIFEST_*` / `PLUGIN_CORE_IDENTITY_*`，路径定位到 `['id']`、`['materials']`
  或 `['materials', index, ...]`。
- `define()` 注册前对全部 tagName 做冲突预检：任一冲突（同 tagName 绑定不同 constructor）
  整体失败且不产生部分注册副作用；同 tagName 同 constructor 幂等。成功后返回
  `BaseScreenMaterialCatalogEntry[]`，宿主用它一次性构建不可变 catalog。
- 文档只持久化物料 `type`。模块 URL、包名、版本和完整性信息是宿主分发配置，不得写入
  Screen Document 或 Material Manifest。
- 更换物料包版本 = 宿主重新加载新模块并重建 catalog；先 `unload()` 或销毁旧实例，再以新
  catalog 配置新实例。已初始化的实例不能原地替换 catalog。

不可信代码需要由宿主使用独立隔离方案；Shadow DOM、manifest 校验和 catalog 不是安全沙箱，
普通 Material ABI 不提供恶意代码隔离。

### 13.1 外部物料包的标准出口

可发布的外部物料包建议采用与官方物料一致的标准出口，便于宿主按同一路径接入：

```text
<package>                 根入口：manifest + constructor + define()，导入无副作用
<package>/auto-register   可选副作用入口：导入即注册该包声明的全部物料
```

```ts
// <package>/auto-register.ts —— 宿主选择“导入即注册”时使用
import { autoRegisterHostedMaterialPackage } from './index.js';
const registered = autoRegisterHostedMaterialPackage();
if (!registered.ok) {
  throw new Error(registered.diagnostics.map((item) => item.code).join(','));
}
```

宿主动态加载应使用代码中固定的 loader allowlist。宿主业务配置只能选择 allowlist key，不能把
Screen Document 中的字符串直接传给 `import()`：

```ts
import type { BaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import type { BaseScreenMaterialPackage } from '@base-screen/plugin-sdk';

type HostedMaterialModule = {
  readonly hostedMaterialPackage: BaseScreenMaterialPackage;
};

const approvedMaterialLoaders: Readonly<
  Record<string, () => Promise<HostedMaterialModule>>
> = {
  'acme.kpi': () => import('@acme/base-screen-kpi-materials'),
};

export async function loadApprovedMaterialCatalog(
  materialPackageId: string,
): Promise<BaseScreenMaterialCatalog> {
  const loader = approvedMaterialLoaders[materialPackageId];
  if (loader === undefined) throw new Error('物料包未获宿主批准');

  const loaded = await loader();
  const defined = loaded.hostedMaterialPackage.define();
  if (!defined.ok) {
    throw new Error(defined.diagnostics.map((item) => item.code).join(','));
  }
  return createBaseScreenMaterialCatalog(defined.value);
}
```

若宿主确实需要 URL 运行时加载，URL allowlist、CSP、完整性校验、鉴权、缓存和 bundler 配置都由宿主
实现；Base Screen 不提供通用网络加载器。

## 15. 生命周期和清理

- 一个页面可以创建多个 Viewer/Designer；每个实例单独配置 catalog、端口和文档。
- 运行时依赖发生变化时，先调用 `unload()`，再调用新的 `configure()`，最后设置或加载文档。
- 移除实例会取消实例内工作；宿主自己的轮询、订阅、编辑器 session 和请求也要自行清理。
- Plugin Manager 不再使用时调用 `dispose()`，不要继续使用旧 snapshot。
- 不要访问 Shadow DOM、内部 controller、`@base-screen/*/src`、仓库 fixture 或 harness 内部状态。
- 端口只能返回 JSON-safe 数据和公开契约对象，不能把函数、DOM、Promise、凭据或服务实例写入文档。

## 16. 交付前检查

- 文档进入运行时前通过 `parseScreenDocument()`，项目响应通过
  `parseScreenProjectEnvelope()`。
- 依赖来自发布方批准的同一批次完整包集，锁文件中没有源码路径、workspace 泄漏或混合批次。
- catalog 覆盖全部 material type，Custom Element 已注册，表格物料带正确 adapter。
- Viewer/Designer 使用 `configure()` 原子初始化；Viewer 已明确选择原始像素、`contain` 或 `cover`
  策略，宿主容器具有稳定尺寸。
- SSR/SSG 不在服务端执行 `/auto-register`，宿主生产构建已验证所需 Custom Element 仍被注册。
- 所有宿主端口处理 abort、权限、容量限制、诊断脱敏和 revision 冲突。
- 监听 `base-screen-diagnostic`，并为资源失败、超时、无 capability 和缺失物料建立监控。
- Screen Document 中没有 URL、SQL、token、header、连接信息、宿主服务对象和业务私有状态。
- 切换项目、租户、物料包或运行时能力时执行 `unload()`，不会复用旧端口或旧 snapshot。

## 17. 常见问题

- **页面没有内容**：确认元素和物料已注册、catalog 包含文档中的 `type`，并检查诊断事件。
- **独立项目安装 SDK 后提示其他 `@base-screen/*` 包 404**：当前拿到的是不完整制品。改用同一
  workspace，或让发布方提供可解析全部内部依赖的同批次完整包集；不要只安装一个原始 SDK tarball。
- **Viewer/Designer 尺寸为 0**：给宿主容器和 Custom Element 设置明确的宽高及 `min-height: 0`。
- **Viewer 内容被裁切或没有随窗口变化**：Viewer 不自动适配容器；按 6.1 节选择 `contain` 或
  `cover`，并由宿主在销毁时断开 `ResizeObserver`。
- **更换 catalog 或端口不生效**：调用 `unload()`，重新 `configure()`，再设置或加载文档。
- **宿主数据没有查询**：检查 resource type contribution、参数 schema、变量端口和 material 的
  `dataCapabilities`。
- **事件没有触发**：检查 material manifest 的事件声明、Blueprint capability 和对应宿主端口。
- **保存冲突**：保留本地文档，展示 `PROJECT_CONFLICT`，由用户决定继续编辑或显式重载远端。
- **高级编辑提交被拒绝**：检查 request ID、expected revision、component ID、schema 和容量限制，
  不要复用旧请求。

仓库中的可运行宿主示例：

- `examples/host-quickstart`：只导入公开包入口的最小 Viewer；会被复制到仓库外并以 tarball 验证。
- `examples/playground`：Vue 宿主、Viewer/Designer、数据集和变量切换。
- `examples/browser-harness`：项目 adapter、完整官方物料、宿主作者桥和外部物料包。
- `examples/runtime-harness`：宿主资源、Blueprint 端口和远程插件隔离验证。

后三个是本仓库的开发/验收 harness，会直接引用 workspace 源码，不应当作独立项目的安装模板。

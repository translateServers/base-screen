# 嵌入 Designer

> 返回[宿主使用指南](../usage.md)。

## 嵌入 Designer

```html
<base-screen-designer></base-screen-designer>
```

### 直接文档模式

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

### 项目模式

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

#### 宿主返回请求

需要从 Designer 返回宿主业务页面时，在 `configure()` 中声明 `backButton: true`。Base Screen 在
顶栏渲染返回按钮，并在点击时派发可穿透 Shadow DOM 的 composed 事件；目标路由、未保存确认和
鉴权继续由宿主处理：

```ts
import { BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT } from '@base-screen/sdk';

designer.configure({ catalog, projectAdapter, backButton: true });
designer.addEventListener(BASE_SCREEN_DESIGNER_BACK_REQUEST_EVENT, () => {
  // 宿主在这里执行未保存确认，再返回自己的业务路由。
  router.push('/screens');
});
```

按钮默认隐藏。事件会冒泡且 `composed: true`，`detail` 固定为 `{ source: 'topbar' }`。宿主不应
访问 Designer Shadow DOM，也不需要在设计器外重复渲染返回按钮。

### 程序化插入组件实例

需要由宿主代码（自动化测试、AI 生成大屏、模板实例化）往文档里加组件时，用
`designer.insertComponent(intent)`。它按物料 manifest 的默认值构造节点，因此宿主不必自己把
`defaultSize` / `defaultProps` / `defaultStyle` / 数据源再展开一遍：

```ts
const inserted = designer.insertComponent({
  materialType: 'acme.stock-card',
  // name 与 position 都可省略：省略 position 时放在当前可见画布中心。
  name: '仓库 A',
  position: { x: 120, y: 80 },
});
if (!inserted.ok) showDiagnostics(inserted.diagnostics);
```

语义边界：

- 只按 manifest 默认值建节点，**不接受自定义 props/style**；需要改值时插入后再发
  `update-components`（发 `props` 时请展开既有 props，见下一条注意）。
- 位置保证整体落在画布内；超出右/下边界时贴边而不是溢出。
- 一次事务提交，因此可撤销；成功后新组件成为唯一选中项。
- 物料必须已在该实例的 catalog 中且未设 `libraryVisible: false`，否则失败关闭。

> **`update-components` 的 `patch` 按顶层键整体替换。** 想只改 `props.stock` 时必须把完整
> `props` 拼出来（如 `patch: { props: { ...component.props, stock: 9 } }`）；只发
> `{ props: { stock: 9 } }` 会丢掉 schema 里同样必填的其他字段，提交时被
> `propsSchema` 拒绝。

### 组合插入：`insertComponentFragment`

`insertComponent` 一次只建一个节点，而原子物料约定下的一张卡片是**多个**节点。要成套插入这种组合，
用 `designer.insertComponentFragment(intent)`：一次调用、一个事务（撤销一次回退整片）、成功后整片选中。

```ts
const inserted = designer.insertComponentFragment({
  anchor: { x: 64, y: 140 }, // 组合包围盒的左上角；省略时取可见画布中心
  shell: { key: 'card', materialType: 'base.container', size: { width: 260, height: 120 } },
  nodes: [
    // offset 相对 anchor，不是画布绝对坐标；parent 省略即挂到 shell
    { key: 'title', materialType: 'base.text', offset: { x: 20, y: 12 }, style: { fontSize: 14 } },
    { key: 'rule', materialType: 'base.rule', offset: { x: 20, y: 40 } },
  ],
});
if (!inserted.ok) showDiagnostics(inserted.diagnostics);
```

- **预设的存储归宿主**：基座不持有预设注册表，也不设「区块/模板」一等实体（[ADR-0087](../decisions/ADR-0087-composite-component-fragment-insertion.md)）。
  宿主保存分片 JSON，入库前可用 `parseBaseScreenComponentFragmentInsertionIntent` 跑同一个失败关闭解析器。
- **整片只平移**：包围盒左上角对齐 `anchor` 后贴进画布，不逐节点裁剪（那会把组合拉开变形）；分片大于画布时失败关闭而不是缩放。
- **`props`/`style` 是增量**：与 manifest 默认值顶层浅合并后过 schema，不必自己展开必填字段。仅本入口如此——
  `insertComponent` 与 `update-components` 仍是整体替换语义（见上面那条警告）。
- **shell 按 `designCapabilities.children === true` 校验**，所以 `libraryVisible: false` 的 `base.container`
  可作外壳；普通 `nodes` 仍要求物料库可见。`parent` 只接受 shell 键或更早声明的节点键（声明顺序排除环），
  键仅用于分片内引用、不持久化，文档 id 与 zIndex 由基座分配。
  **但组壳几何由引擎持有**：宿主配置 `groupMaterialType` 后，任何一次事务都会把 shell 吸附到其子孙的
  包围盒并集（auto-width 文本的实测宽度变化不产生事务，靠这次顺带同步）。要一张有内缩留白的卡片，
  把底座作为平级 `base.rectangle` 节点，不要当 shell。
- 有界：节点 ≤ 64、intent 序列化 ≤ 64 KiB，超限 `AUTHORING_LIMIT_EXCEEDED`。

### 组件名的可编辑位置

Designer 的**属性面板不提供组件 `name` 字段**——它只呈现几何属性与物料 manifest 声明
的 `propertyPanel` / `stylePanel` 字段。canonical 组件名有两处修改途径：

- 图层列表双击条目重命名（面向用户）；
- 宿主发 `update-components` 且 `patch: { name }`（面向前述自动化场景）。

把这条当成能力边界而非缺陷；需求评审时若要求"在属性面板改组件名"，应改用上述两处之一。

### 配置 Designer 主题

`base-screen-designer` 提供 CSS Custom Properties，用于让 Designer 的顶栏、工具栏、面板、
菜单、对话框、控件和自有滚动条与宿主的视觉语义保持一致。主题只作用于 Designer chrome：
Designer 画布中的 Material 与 Viewer 中的同一 Material 都继续使用 document-driven appearance，
不会被这些 Token 重绘。

缺失 `theme` 或未知值使用内建浅色 fallback；设置 `theme="dark"` 使用黑夜 fallback，
`theme="light"` 显式钉回浅色。宿主可在元素、任意祖先或 author stylesheet 中设置 Token：

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

同一 Token 的优先级为：元素 inline style、宿主 author stylesheet、当前主题 fallback——缺省与
`theme="light"` 走浅色值，`theme="dark"` 走黑夜覆盖值。删除覆盖会恢复下一层有效值。两个 Designer
可设置不同的 `theme` 和 Token，状态互不影响。

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

## 生命周期和清理

- 一个页面可以创建多个 Viewer/Designer；每个实例单独配置 catalog、端口和文档。
- 运行时依赖发生变化时，先调用 `unload()`，再调用新的 `configure()`，最后设置或加载文档。
- 移除实例会取消实例内工作；宿主自己的轮询、订阅、编辑器 session 和请求也要自行清理。
- Plugin Manager 不再使用时调用 `dispose()`，不要继续使用旧 snapshot。
- 不要访问 Shadow DOM、内部 controller、`@base-screen/*/src`、仓库 fixture 或 harness 内部状态。
- 端口只能返回 JSON-safe 数据和公开契约对象，不能把函数、DOM、Promise、凭据或服务实例写入文档。

# ADR-0062：宿主受限扩展 Designer 左侧分组

> 状态：已接受
> 日期：2026-08-28
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)、
> [ADR-0032](./ADR-0032-designer-left-panel-refactor.md)、
> [ADR-0063](./ADR-0063-designer-blueprint-workbench-shell.md)

## 背景

Designer 左侧 `rail-tabs` 只有物料、图层和变量三个 Engine 内建分组。宿主若需要资产、模板、AI 工具或其他
业务作者入口，只能把面板放在 Designer 外部，或依赖私有 Shadow DOM 增补 Tab。前者割裂工作台导航，后者没有
稳定契约，并违反宿主不得依赖 Engine 私有 DOM 的边界。

宿主内容的状态、权限、数据请求和框架生命周期仍应归宿主。Base Screen 只需要提供有界的导航与安放位置，不能
把宿主业务面板吸收到 Screen Document、Engine Store 或通用渲染回调中。

## 决策

1. Designer 增加可选 `leftPanelGroups` 展示投影。每个分组只允许稳定 `id`、显示 `label`、有限内建
   `icon` 与可选 `workbenchModes`。省略 `workbenchModes` 等价于 `['canvas']`，显式值只能是非空、无重复的
   `canvas | blueprint` 数组。输入必须是 JSON-safe 数组，拒绝未知字段、内建保留 id、重复 id、非法标签/图标、
   非法模式及超过 6 项的输入。解析成功的数组、节点和模式数组深度冻结。
2. 宿主分组通过 `configure()`、同名 getter/setter 与 `parseBaseScreenDesignerLeftPanelGroups()` 提供。setter
   更新只重建宿主 Tab/tabpanel，不重建 Renderer、catalog 或内建面板。无效更新失败关闭并保留旧投影；删除当前
   分组时，Canvas 原子回退到「物料」，Blueprint 原子回退到「组件」。两种模式分别保留自己的当前分组。
3. 每个分组对应一个标准命名 slot：`base-screen-designer-left-panel-${id}`。宿主把 React、Vue 或 Custom
   Element 管理的 light DOM 子树放入该 slot；配置对象不接受 HTML、SVG、DOM Node、component、render
   function、Promise 或服务对象。一个分组即使同时出现在 Canvas 和 Blueprint，也只创建一份 slot/tabpanel；
   模式切换只改变可见性和 `aria-labelledby`，不克隆或重新挂载宿主 light DOM 内容。Base Screen 不解释、
   克隆或持久化 slot 内容。
4. slot 是左侧面板专用的窄公开 surface，不是通用工作台注入入口。Engine 只拥有 Tab、tabpanel、标题、折叠、
   键盘导航、滚动容器和外层尺寸约束；宿主拥有内容生命周期、加载/错误/空态、权限、业务状态、网络与持久化。
   slot 内容只能通过公开方法、端口和事件修改 Designer，不得访问 Shadow DOM、内部 Store 或 `src` 路径；其
   DOM 事件绕过 Designer 内部 data-*、快捷键与手势路由，但继续向宿主正常冒泡。
5. `selectLeftPanelGroup(id)` 提供不依赖 Shadow DOM 的程序化选择，并在当前工作台模式中选择对应分组；
   `base-screen-designer-left-panel-group-change` 在宿主分组进入/离开时派发 JSON-safe
   `{ groupId: string | null }`。切回任一内建分组或切换到未选择宿主分组的模式时 `groupId` 为 `null`。
6. 宿主 Tab 复用既有 44px 导航命中区、内建 SVG 图标与 token 状态；长标签单行省略且完整 label 保留在
   tooltip/可访问名称中。方向键/Home/End 顺序与视觉顺序一致，折叠态仍可选择并展开；tabpanel 在隐藏、折叠或
   删除后不保留可聚焦内容。Canvas 与 Blueprint 都使用同一套 `rail-tabs` 视觉和键盘语义，但各自的内建 Tab
   仍由 Engine 决定。切换和热更新不得改变左栏、画布或右侧检查器几何。
7. 本决策仅针对宿主可信 shell 在已声明左侧分组中的 light DOM 安放，窄化取代 ADR-0028 对“组件面板注入”的
   全面拒绝；Manifest Editor Descriptor、物料属性控件与配置对象仍禁止注入 component/function/DOM，重型
   编辑提交仍走 detached 作者桥和专用提交入口。

## 非目标

- 为宿主内容提供业务控件 DSL、跨框架状态容器、权限、网络、缓存、持久化或错误恢复。
- 允许宿主重排、替换或隐藏 Canvas 的物料/图层/变量或 Blueprint 的组件/逻辑/变量内建分组。
- 把 slot 内容、当前分组或宿主业务状态写入 Manifest、catalog、ScreenDocument、历史或导出物。
- 公开 `rail-tabs`、`rail-view` 等 class、Engine 私有 CSS Token 或任意 Shadow DOM 查询契约。
- 允许任意宿主 SVG/HTML 作为 Tab 图标；Tab 只使用有限内建图标枚举。

## 结果

- 宿主可以在不触碰私有 Shadow DOM 的前提下，为 Canvas、Blueprint 或两者增加少量、可键盘访问的左侧业务
  分组，并让同一宿主内容跨模式保持实例与状态。
- Engine 保持轻量导航壳层，宿主内容与状态仍由宿主框架拥有，canonical 文档与 Renderer 零变化。
- 严格解析、运行时回退、公开 API、SDK 转发、样式和真实浏览器几何验证保护该边界。

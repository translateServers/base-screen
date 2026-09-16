# ADR-0079: Designer 工作台框架、顶栏与预览接管

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0032、ADR-0036、ADR-0037、ADR-0038、ADR-0039、ADR-0062（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0024](./ADR-0024-designer-public-style-tokens.md)、ADR-0028、ADR-0031、ADR-0040、ADR-0063、[usage.md](../usage.md)

## 背景

Designer 工作台壳层是宿主接入 Base Screen 时最直接接触的表面：左侧面板、底部状态栏、顶栏与预览入口。本组六份 ADR 分别修了这条主线上的一个环节——左侧面板信息架构、状态栏交互模式开关、面板折叠与宽度写回、宿主预览接管、顶栏项目名回写、宿主左侧分组投影。它们之间基本没有取代关系，只是同一份「工作台契约」上的并列条款；分散记录导致读者无法一次看到当前生效的完整边界，本 ADR 把它们收敛为一份现行表述。

收敛时必须区分两类内容，本 ADR 在每条决策上显式标注：**公共契约**指宿主可依赖的配置字段、公开方法与事件、slot 名，以及宿主可覆盖的 CSS 自定义属性；**内部实现**指 Engine 的控制器划分、私有 class、私有 Token、DOM 结构与渲染路径，宿主不得依赖。本主线不改变产品定位：工作台只承载当前实例内的导航与编辑编排，存储、预览路由、鉴权、窗口管理与业务状态仍归宿主（ADR-0027）。

## 决策

### 1. 左侧面板信息架构（公共契约：`data-*` 语义；布局属内部实现）

左侧面板改为「面板头（标题 + 数量 + 折叠）+ sticky 分段 Tab（物料 / 图层）+ 每 Tab 独立工具栏」。物料 Tab 顺序为：目录状态条 → 搜索（带清除按钮）→ 全部/收藏/最近分段 → 分类 chips → 2 列缩略图卡片网格 → 空态；图层 Tab 为：搜索 → 树。Tab 切换不改变面板与画布几何。既有全部 `data-*` 契约语义不变：`data-material-card`、`data-material-type`、`data-material-filter`、`data-material-category-filter`、`data-material-search`、`data-material-library-status`、`data-material-library-action`、`data-panel-tab`、`data-panel-collapse`、`data-layer-*`；宿主作者桥与宿主托管物料流程零破坏。

### 2. 物料卡片网格与缩略图（公共契约：Manifest `cover`；派生算法属内部实现）

物料卡片为 2 列等宽缩略图网格卡片（预览缩略图 + 名称 + type + 悬浮收藏星标）。未声明封面时缩略图由分类图标加分类确定性色相生成，深浅主题均可读；hover 仅用 `box-shadow`/`border`/`transform`，不改变几何。ADR-0032 原「Manifest 没有缩略图字段且不为此扩展」的结论已由 ADR-0040 部分取代（范围仅限可选 `cover` URL 字段）；确定性占位与加载失败回退仍是缺省行为，宿主不得依赖缩略图派生算法。

### 3. 折叠图标轨（公共契约：48px 与 `--left-panel-width`）

折叠为 48px 轨道时显示垂直图标 Tab（物料 / 图层，带 tooltip 与 aria-label），点击切换 Tab 并展开面板；复用同一 Tab DOM 与状态（CSS 隐藏标签文字），折叠/展开仅原子切换 `--left-panel-width`，不引起画布或右面板几何跳动。

### 4. 图层树增强与键盘可达性（公共契约：`data-layer-toggle`/`data-layer-move` 与键盘导航）

行缩进引导线用 `--layer-depth` CSS 变量加 repeating gradient，零逐级 DOM；隐藏/锁定/上移/下移改为图标按钮，在 hover/focus-within/选中时显示（opacity 过渡，无几何变化）；含子节点的行显示子项计数；既有 `data-layer-toggle`、`data-layer-move` 契约与树键盘导航不变。物料搜索支持清除按钮与 Escape 清空（清空后保持焦点）；卡片网格支持方向键 roving focus（Arrow/Home/End），Enter/Space 走原生按钮语义添加组件。

### 5. 面板宽度所有权与写回规则（内部实现，但宿主默认值被尊重）

面板宽度由 `DesignerWorkbenchController` 持有（`#leftPanelWidth`/`#rightPanelWidth`，未拖拽时为 `undefined`），`renderLayout()` 统一把有效宽度写回 `.designer` 元素上的内联 `--left-panel-width`/`--right-panel-width`：

- 折叠态：写入 `48px`（与 CSS 折叠变量一致）；
- 展开态且拖拽过：写回最近一次拖拽宽度；
- 展开态且从未拖拽：移除内联变量，保留宿主样式表默认宽度（ADR-0037 举 `--left-panel-width: 280px` 为例）。

宿主可覆盖的只是样式表默认值；状态持有、写回时机与控制器划分是 Engine 内部实现。面板宽度上下限与既有 `data-*` 契约不变。

### 6. 折叠轨 UI 与折叠态拖拽

折叠态拖拽分隔条视为「先展开再调整宽度」：以未钳制的目标宽度判定，往外拖到超过 `48 + 24px` 才展开并应用宽度；阈值内保持折叠且不写宽度。折叠轨 UI：折叠态关闭 rail/properties 的 `scrollbar-gutter` 占用，把完整宽度还给内容；面板标题与计数徽标折叠态 `display: none`；折叠按钮折叠态 `flex: none` 防压扁；左右面板折叠按钮箭头折叠态 `rotate(180deg)`；折叠/展开切换按钮 title/aria-label（「收起物料面板」↔「展开物料面板」、「收起属性面板」↔「展开属性面板」），文案入 `designer-ui-text.ts`。

### 7. 状态栏原生事件开关（公共契约：`data-status-toggle`；开关状态属实例）

底部状态栏以 `data-status-toggle="native-events"` 的 switch 按钮替换静态「事件」文本，复用 `.status-toggle`/`.status-toggle-dot` 样式，与吸附/参考线完全一致，文案沿用 `DESIGNER_UI_TEXT.nativeEvent`；默认关闭（`aria-checked="false"`），保持既有设计器行为不变。状态归 `DesignerWorkbenchController` 持有（与 snap/guides 同源模式），提供只读 `nativeEventsEnabled` 与 `toggleNativeEvents()`；点击经既有 surface router → `onClick` 路由，`renderStatusToggles()` 统一同步 `aria-checked`，切换经可选 `onNativeEventsChange` 回调通知组合根。该状态是实例内 UI 状态：不进入 ScreenDocument、不持久化、不新增宿主配置字段或回调；`unload` 或渲染器重建后保持（重建读取同一状态源）。

### 8. 渲染器实例级 `setInteractive` 与设计态事件转发（公共契约）

`@base-screen/renderer` 的 `BaseScreenRenderer` 新增 `setInteractive(enabled: boolean): ScreenParseResult<null>`：`interactive` 从构造选项的一次性快照变为实例内可切换状态。已 render 过文档时原地重渲染（复用已挂载物料元素、保留资源请求与数据状态，不重挂载、不重取数）；尚未 render 时只记录状态；已 dispose 时失败关闭并返回诊断；同值切换为 no-op。该方法 additive，`CreateBaseScreenRendererOptions.interactive` 仍是初始化值，Viewer 行为不变。

`BaseScreenDesignerElement.createRenderer()` 以工作台开关状态初始化 `interactive`，并把 `onMaterialEvent` 转发为 designer 元素上的 `base-screen-material-event` CustomEvent（`bubbles`/`composed`，detail 为 `{ componentId, type, name, payload }`，与 Viewer 同形）；开关关闭时物料事件被既有 `model.interactive` 门控静默，零事件外泄；`setInteractive` 失败经 `emitDiagnostics` 上报。物料原生 CSS/悬停交互与点击事件同受门控：官方物料在非交互时不注册 `cursor: pointer` 与 mouseenter/mouseleave 放大复位；React/Vue 桥接物料在非交互模式给元素打 `data-base-screen-interactive="false"`，并按 shadow root（或 light DOM document）幂等注入 `[data-base-screen-interactive="false"] * { pointer-events: none; }`，使桥接原生控件静默、指针事件落到物料元素自身，设计器选择/拖拽命中测试不受影响；门控不改变 `interactions.hover` 等 props 的既有渲染语义。

### 9. 宿主预览接管 `previewHandler`（公共契约）

`BaseScreenDesignerConfiguration` 新增可选 `previewHandler?: (document: ScreenDocument) => boolean`。`configure()` 按 RB3「validate before mutate」校验其为函数，非法值导致配置失败且零副作用；`BaseScreenDesignerElement` 暴露同名只读 getter。预览操作在「直接文档模式」或「已配置 `previewHandler`」时可用，可用条件从 `getDocument() !== undefined && getProject() === undefined` 放宽为 `getDocument() !== undefined && (getProject() === undefined || hasPreviewHandler())`。`togglePreview()` 在文档存在时优先调用 `previewHandler`（传入当前编辑文档）：返回 `true` 表示宿主已接管，视为成功且不再打开引擎内置预览；返回 `false` 或抛异常则回退到引擎内置预览浮层（`#previewController.toggle()`）；未配置 handler 的项目模式保持既有失败语义不变。`previewHandler` 是实例内只读回调：不进入 ScreenDocument、不持久化、不新增状态字段或网络职责；预览路由、鉴权、草稿存储与窗口打开全部归宿主。其余预览语义（直接文档模式内置浮层、`previewProject`、`ScreenProjectPreviewPort`）不变。

### 10. 顶栏项目名回写（内部实现，无公共契约变化）

`renderProjectStatus()` 同步把 `project?.name` 写入 `.designer-project-name`，无项目或名称为空时回退 `DESIGNER_UI_TEXT.unnamedProject`；文案沿用既有 `unnamedProject`，不新增 UI 文案、Token、`data-*` 契约或公共 API；更新只在既有 `renderControls()` → `renderProjectStatus()` 渲染路径内，不引入额外 DOM 重建、尺寸变化或异步依赖。

### 11. 宿主左侧分组 `leftPanelGroups` 与 `workbenchModes`（公共契约）

Designer 增加可选 `leftPanelGroups` 展示投影。每个分组只允许稳定 `id`、显示 `label`、有限内建 `icon` 与可选 `workbenchModes`。省略 `workbenchModes` 等价于 `['canvas']`；显式值只能是非空、无重复的 `canvas | blueprint` 数组。输入必须是 JSON-safe 数组，拒绝未知字段、内建保留 id（`materials`/`layers`/`variables`）、重复 id、非法标签/图标、非法模式及超过 6 项的输入；解析成功的数组、节点和模式数组深度冻结。可用图标与 slot 前缀由 SDK 的 `BASE_SCREEN_DESIGNER_LEFT_PANEL_GROUP_ICONS`、`BASE_SCREEN_DESIGNER_LEFT_PANEL_SLOT_PREFIX` 导出。宿主分组通过 `configure()`、同名 getter/setter 与 `parseBaseScreenDesignerLeftPanelGroups()` 提供；setter 更新只重建宿主 Tab/tabpanel，不重建 Renderer、catalog 或内建面板；无效更新失败关闭并保留旧投影；删除当前分组时 Canvas 原子回退到「物料」，Blueprint 原子回退到「组件」，两种模式分别保留自己的当前分组。

### 12. 分组 slot 协议与 light DOM 生命周期（公共契约：slot 名与事件；私有 class 不得依赖）

每个分组对应一个标准命名 slot：`base-screen-designer-left-panel-${id}`。宿主把 React、Vue 或 Custom Element 管理的 light DOM 子树放入该 slot；配置对象不接受 HTML、SVG、DOM Node、component、render function、Promise 或服务对象。一个分组即使同时出现在 Canvas 和 Blueprint，也只创建一份 slot/tabpanel；模式切换只改变可见性和 `aria-labelledby`，不克隆、不重新挂载宿主 light DOM 内容；Base Screen 不解释、克隆或持久化 slot 内容。Engine 只拥有 Tab、tabpanel、标题、折叠、键盘导航、滚动容器和外层尺寸约束；宿主拥有内容生命周期、加载/错误/空态、权限、业务状态、网络与持久化。slot 内容只能通过公开方法、端口和事件修改 Designer，不得访问 Shadow DOM、内部 Store 或 `src` 路径；其 DOM 事件绕过 Designer 内部 `data-*`、快捷键与手势路由，但继续向宿主正常冒泡。宿主 Tab 复用既有 44px 导航命中区、内建 SVG 图标与 token 状态；长标签单行省略且完整 label 保留在 tooltip/可访问名称中；方向键/Home/End 顺序与视觉顺序一致，折叠态仍可选择并展开；tabpanel 在隐藏、折叠或删除后不保留可聚焦内容。切换和热更新不得改变左栏、画布或右侧检查器几何。

### 13. 程序化选择与分组切换事件（公共契约）

`selectLeftPanelGroup(id)` 提供不依赖 Shadow DOM 的程序化选择，并在当前工作台模式中选择对应分组；`base-screen-designer-left-panel-group-change` 在宿主分组进入/离开时派发 JSON-safe `{ groupId: string | null }`（`BaseScreenDesignerLeftPanelGroupChangeEventDetail`）。切回任一内建分组或切换到未选择宿主分组的模式时 `groupId` 为 `null`。

### 14. 公共契约与内部实现的界线

公共契约 = 上述配置字段（`previewHandler`、`leftPanelGroups`）、SDK 转发的公开方法与事件常量、slot 名、`data-*` 契约、`--left-panel-width`/`--right-panel-width` 的宿主默认值、`setInteractive`。内部实现 = 控制器划分与私有字段、`rail-tabs`/`rail-view` 等 class、Engine 私有 CSS Token、缩略图派生算法、渲染路径与 `.designer-project-name` 名称。ADR-0062 的窄化仅针对宿主可信 shell 在已声明左侧分组中的 light DOM 安放，它取代 ADR-0028 对「组件面板注入」的全面拒绝；Manifest Editor Descriptor、物料属性控件与配置对象仍禁止注入 component/function/DOM，重型编辑提交仍走 detached 作者桥和专用提交入口。

## 后果

- 宿主获得一条连贯的工作台契约：可用声明式配置、公开事件与 slot 名完成导航扩展与预览接管，无需访问 Shadow DOM、内部 Store 或私有源码；Engine 保持轻量导航壳层，canonical 文档与 Renderer 零变化。
- 左侧面板达到可扫描、可键盘操作、折叠态可用的形态；折叠与拖拽在任何宽度状态下收敛到 48px 图标轨或恢复拖拽宽度，未拖拽时不覆盖宿主默认宽度；改动遵守无抖动规约（`scrollbar-gutter` 预留稳定轨道、hover 不改几何、原子切换宽度变量）。
- 设计态可在画布内原地验证组件原生事件，宿主在 designer 元素上监听 `base-screen-material-event`，与 Viewer 集成方式一致；切换不重建渲染管线，无闪烁、无重复取数。顶栏显示宿主加载的大屏名称，与状态栏、保存徽标一致；项目模式预览可由宿主接管，不再依赖 vendored engine minified bundle 的手工补丁，升级 engine 不丢能力。
- 公共边界变更均为 additive（新增配置字段与 renderer 方法）；其余为内部实现，宿主依赖会失去兼容性保障。验证由专项 Spec、聚焦单元测试与真实浏览器 harness 覆盖，并随 `pnpm verify:m0` 通过。存量越界用法（依赖私有补丁、私有 Shadow DOM、`rail-tabs` class）不再被容忍；本组 ADR 的上收正是为了把这些依赖改为公开契约。

以下事项在本主线中仍是**非目标或明确推迟**，实施时不得顺手扩张：

- 不重构右侧检查器与画布工作区；不做物料市场、远程分页目录、下载、审核与版本 UI（ADR-0031 边界不变）。
- 不新增依赖或 package：明确不引入 `@tanstack/virtual-core` 与 `@floating-ui/dom`（图层树以分页加「显示更多」覆盖大树滚动缺口，碰撞感知锚定 overlay 不适用于左侧面板）。
- 面板宽度、收藏与最近使用的持久化不属本主线（ADR-0027：真实存储归宿主）。实现中存在实例内作者偏好宽度记录（`base-screen.designer.left-panel-width`、`base-screen.designer.inspector-width`），它属内部实现细节，宿主不得依赖，也不构成公共持久化契约。
- 不放行视窗原生交互（滚轮平移/缩放、右键菜单、文本选择、拖放）：设计态编辑手势与默认行为策略不变。
- 不把原生事件开关状态或事件日志持久化、跨实例共享或暴露为宿主配置；不为设计态事件建立 Blueprint 触发链路（事件 Blueprint 仍在 Viewer 运行时生效）；不修改 Material Manifest、事件声明、Viewer、ScreenDocument、宿主状态 schema 或 SDK 导出。
- 不在 Engine 内实现宿主预览页、草稿存储、鉴权、路由或窗口管理；不把预览处理器状态持久化或跨实例共享。
- 不改变顶栏布局、保存状态徽标、状态栏或菜单行为；不新增项目重命名入口（宿主职责）。
- 不为宿主内容提供业务控件 DSL、跨框架状态容器、权限、网络、缓存、持久化或错误恢复；不允许宿主重排、替换或隐藏 Canvas 的物料/图层/变量或 Blueprint 的组件/逻辑/变量内建分组。
- 不把 slot 内容、当前分组或宿主业务状态写入 Manifest、catalog、ScreenDocument、历史或导出物；不公开 `rail-tabs`、`rail-view` 等 class、Engine 私有 CSS Token 或任意 Shadow DOM 查询契约；不允许任意宿主 SVG/HTML 作为 Tab 图标（Tab 只使用有限内建图标枚举）。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0032 | 决策 1–4：左侧面板信息架构、2 列缩略图卡片网格、48px 折叠图标轨、图层树图标操作与缩进引导、键盘可达性；既有 `data-*` 契约与 ScreenDocument/Manifest/catalog/SDK 零变化 | 全部吸收；其决策 2 的「Manifest 不扩展缩略图字段」结论另由 ADR-0040 部分取代（本 ADR 决策 2 已按现行状态表述） |
| ADR-0036 | 决策 7–8：`data-status-toggle="native-events"` 开关与实例内状态、renderer `setInteractive` 原地重渲染、`base-screen-material-event` 转发、物料原生交互同受 `model.interactive` 门控 | 全部吸收，未被取代 |
| ADR-0037 | 决策 5–6：宽度归控制器并统一写回（折叠 `48px`/拖拽宽度/未拖拽移除内联变量）、折叠态拖拽自动展开（阈值 `48 + 24px`）、折叠轨 UI 与 tooltip 语义 | 全部吸收；其「面板宽度持久化」为非目标，与现行实例内偏好记录的关系已在后果中说明 |
| ADR-0038 | 决策 9：`previewHandler` 配置、可用性放宽、`togglePreview` 接管与回退语义、宿主保留预览路由与草稿存储 | 全部吸收，未被取代 |
| ADR-0039 | 决策 10：`renderProjectStatus()` 回写 `.designer-project-name` 与 `unnamedProject` 回退 | 全部吸收，未被取代 |
| ADR-0062 | 决策 11–13：`leftPanelGroups` 严格解析与 `workbenchModes` 默认值、命名 slot 与跨模式复用、light DOM 生命周期归属、`selectLeftPanelGroup` 与分组切换事件 | 全部吸收；其对 ADR-0028「组件面板注入」的窄化由本 ADR 决策 14 继续承载 |

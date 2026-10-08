# Designer 能力

> 返回[当前能力基线](./README.md)。


- **画布交互**：单/多选移动、选区吸附、坐标换算与瞬态预览；选中同级图层后，`]` 向上移动一位、`[` 向下移动一位，
  `Ctrl+]` / `Ctrl+[` 仍分别用于置顶/置底；`Alt+]` / `Alt+[` 按完整图层树向上/向下切换单选，跳过有效隐藏组件，
  到达边界后停止。依据：[Designer Canvas Precision](../specs/archive/designer-canvas-precision/spec.md)。
- **锁定组件不是选择目标**（2026-10-04 行为修复）：点击有效锁定的组件等同点击画布空白——清空当前单选/
  多选，不再保留对锁定组件的选择；从其上按下仍可发起框选手势。渲染层不对锁定物料做 `pointer-events`
  处理，铺满画布的锁定背景（大屏常见的「别让我挪到背景」做法）因此必须能取消选中，否则永远退不出选中态。
  由 `pnpm --filter @base-screen/engine test` 的空白点击与框选用例钉住。
- **组件坐标快捷输入**（2026-08-28 增量）：单选未锁定组件后按 `X`，在选区左上角外侧以不随画布缩放的
  非模态双输入浮层一次编辑 canonical X/Y（px）；仅 `Enter` 保存，`Esc` 或离开浮层直接丢弃草稿。
  提交复用单条事务，普通组件同时更新两个坐标，组组件沿既有组平移语义移动可变子树，撤销一次恢复两个坐标。
  多选、无选中、有效锁定、文本输入、IME、AltGr、按键重复与活动手势均不触发；Screen Document、SDK、
  Custom Element 与宿主事件契约不变。
- **组件尺寸快捷输入**（2026-08-31 增量）：单选未锁定组件后按 `W`，在同一位置以不随画布缩放的
  非模态双输入浮层一次编辑 canonical W/H（px）；`Enter`、`Esc`、失焦和无效目标的行为与坐标输入一致。
  普通组件以单条事务同步更新宽高，组组件从左上锚点缩放可变子树，撤销一次恢复全部尺寸与位置。
- **画布内容裁剪**（2026-08-28 增量）：设计态 Renderer 输出由独立内容层按 canonical 画布边界裁剪，
  超出画布的组件视觉与命中区域不显示；选区、变换手柄和参考线保留在外层作者覆盖层，贴边组件仍可编辑。
  Renderer 的 preview/viewer 展示模式以同一 canonical 画布为可见与命中边界，Designer 直接预览和独立 Viewer 行为一致；
  ScreenDocument、Renderer 公共 API 与宿主边界不变。
- **事件系统**：浏览器默认键盘/鼠标行为管控、统一命令通道、手势抑制与零宿主影响守卫。依据：[Designer Event System](../specs/archive/designer-event-system/spec.md)、
  [ADR-0006](../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)。
- **主题 Token**：宿主可配置的 Designer chrome Token、dark/light 与自有滚动条边界。依据：[Designer Theme Tokens](../specs/archive/designer-theme-tokens/spec.md)、
  [ADR-0024](../decisions/ADR-0024-designer-public-style-tokens.md)。
- **作者扩展（轻量基座）**：JSON-safe 声明式 Manifest Editor Descriptor、组件文本宿主作者桥、结构化事件声明与内建面板 primitives；
  代码/完整领域配置编辑器及其依赖归宿主。依据：[Designer Authoring Extension](../specs/archive/designer-authoring-extension/spec.md)、
  [ADR-0081](../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md)。
- **Canvas/Blueprint 一体化工作台**：固定全局工具栏在 Canvas 与 Blueprint 间切换；Blueprint 直接编辑当前
  `ScreenDocument`，复用 Core compile/trace/replace、DesignerSession 历史、脏状态、预览、保存和发布门禁。
  Base Screen 拥有左右语义面板、搜索、图投影和严格 generation/revision/idempotency slot 协议；宿主中央 slot
  只拥有 Vue Flow/Dagre 等图形渲染、布局与手势。`blueprint.layout` 持久化位置/视口，模式/选择/trace 属 session。
  依据：[Designer Blueprint Workbench](../specs/archive/designer-blueprint-workbench/spec.md)、
  [ADR-0081](../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md)。
- **左侧面板信息架构与交互**（封版后增量，已纳入基线）：缩略图网格组件库、按 Tab 隔离的工具栏、折叠图标轨、
  图层树引导线与图标操作、搜索清除与网格键盘可达性；既有 data-* 契约与宿主边界不变，零新依赖。
  依据：[Designer Left Panel](../specs/archive/designer-left-panel/spec.md)、[ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **宿主左侧分组扩展**（2026-08-28 增量）：Designer 接受最多 6 个严格 JSON-safe 的 `leftPanelGroups`，
  以有限内建图标生成可折叠、可键盘导航的 Tab；对应内容通过专属公开命名 slot 留在宿主 light DOM，
  `selectLeftPanelGroup` 与 composed change event 不要求访问 Shadow DOM。热更新删除当前组回退「物料」，
  宿主内容、状态、权限和请求不进入 Engine Store、ScreenDocument 或 Renderer。依据：
  [ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **参考线显示入口**（2026-08-31 增量）：标尺左上角眼睛按钮替代底部状态栏「参考线」开关，
  图标与视图菜单、`Ctrl+;` 共享显示状态；隐藏保留已有参考线，按钮支持键盘操作且固定为 20 × 20px。
- **视窗原生事件开关**（封版后增量，已纳入基线）：状态栏「事件」与「吸附」同形态的 switch 控制设计态画布交互
  模式（默认关闭）；开启后组件原生事件经 `base-screen-material-event` 转发给宿主（与 Viewer 同形），renderer
  以实例级 `setInteractive` 原地重渲染，不重挂载、不重取数。依据：
  [Designer Viewport Native Events](../specs/archive/designer-viewport-native-events/spec.md)、
  [ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **面板折叠修复**（封版后缺陷修复增量，已纳入基线）：左右面板折叠/拖宽往返收敛（折叠 48px 图标轨、展开恢复
  拖拽宽度、未拖拽保留宿主默认宽度）、折叠态拖拽分隔条自动展开、折叠轨箭头旋转与按钮防压扁、收起/展开
  tooltip 语义切换。依据：[Designer Panel Collapse Fixes](../specs/archive/designer-panel-collapse-fixes/spec.md)、
  [ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **宿主预览处理器**（封版后增量，已纳入基线）：`previewHandler` 配置接管项目模式预览，预览操作可用性放宽、
  `togglePreview` 接管与回退；上收宿主手工补丁，预览路由/鉴权/草稿存储仍归宿主。依据：
  [Designer Host Preview Handler](../specs/archive/designer-host-preview/spec.md)、
  [ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **宿主返回入口**（2026-09-01 增量）：`backButton` 配置让 Base Screen 在 Designer 顶栏渲染返回按钮，
  点击后派发 composed `base-screen-designer-back-request` 事件；业务路由、未保存确认和鉴权仍归宿主，
  宿主无需访问 Shadow DOM 或重复渲染返回按钮。
- **保存不重置编辑会话**（2026-10-08 行为修复）：`save()` 成功且适配器返回的内容与提交快照一致时，
  基座只把干净基线钉在当前文档引用上，不替换文档，因此选区、聚焦组件与撤销历史全部保留。此前这一路径
  走 `replaceDocument`，会整份重渲染物料、清空 `selectedComponentIds`/`focusedComponentId` 并重建历史，
  使自动保存打断正在编辑或正在输入的作者状态。服务端把文档归一化成不同内容时仍然采纳服务端文档（此时按
  替换语义重置会话），保存飞行期间的再次编辑仍然算脏并由消费方再排一次保存。依据：
  `packages/engine/tests/common/session/designer-session.test.ts` 与 `project-controller.test.ts`。
- **大屏缩略图归宿主**（2026-09-05 边界修复）：Designer 不提供截取、上传或保存大屏缩略图的内建入口；
  截图、上传、来源并发保护、存储和业务列表展示均归宿主。此前画布属性面板中无实现、无能力门禁的
  “截取封面 / 上传”占位入口及不可写的 `thumbnailUrl` 呈现字段已删除。Material Manifest 的 `cover`
  仍是物料库展示契约，由宿主提供 URL，语义不变。依据：[ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)。
- **顶栏项目标题修复**（封版后缺陷修复增量，已纳入基线）：`renderProjectStatus` 回写加载项目名称，公共契约
  零变化。依据：[Designer Topbar Project Title](../specs/archive/designer-topbar-project-title/spec.md)、
  [ADR-0079](../decisions/ADR-0079-designer-workbench-shell-and-chrome.md)。
- **画布宿主背景图片**（封版后增量，已纳入基线）：`ScreenCanvas` 可选 `backgroundImage` URL 与
  `backgroundImageFit`（cover/contain，缺省 cover）进入 canonical 文档并随文档持久化；失败关闭校验
  （ADR-0078 URL 规则同形）、`update-canvas` null 删除语义、Renderer/Designer 同路径渲染；宿主经
  `setCanvasBackgroundImage` 公开 API 设置/清除，属性面板「画布」区提供背景图 URL 输入、适配方式
  下拉（清空=删除并清 fit）与「选择图片」宿主按钮（默认隐藏，`canvasBackgroundImageButton` 配置后
  渲染；派发 `base-screen-canvas-background-image-request`，宿主自开弹出框可视化选择后经
  `commitCanvasBackgroundImage` 注入），入口语义一致；零 fetch/代理，资产归宿主。依据：
  [Canvas Background Image](../specs/archive/canvas-background-image/spec.md)、
  [ADR-0077](../decisions/ADR-0077-canvas-background-and-color-authoring.md)。

- **画布调色板**（封版后增量，已纳入基线）：`ScreenCanvas.background` 以严格 JSON-safe 对象表达单色、线性渐变或径向渐变；未声明时保留既有 `backgroundColor` 单色语义。Renderer 以基础色、渐变、背景图片的层序一致渲染；Designer 画布区提供三模式和受限色标编辑，宿主可经 `setCanvasBackground` 提交。依据：[Canvas Background Palette](../specs/archive/canvas-background-palette/spec.md)、[ADR-0077](../decisions/ADR-0077-canvas-background-and-color-authoring.md)。
- **统一三段式颜色调色板**（封版后增量，已纳入基线）：自定义三段式调色板全面替换原生 color input——属性面板与 Manifest Editor Descriptor 的全部 `color` 字段无条件支持单色/线性渐变/径向渐变，渐变模式支持 2..8 个色标的增删与位置编辑，单色与色标均带「透明度」滑杆（透明通道写入色值 `#rrggbbaa`，不透明保持 6 位，值仍为字符串），按字段缓存三种模式草稿；内部字段行内紧凑排布（单色 = 颜色 + 透明度一行、色标 = 颜色 + 位置一行、色标透明度与增删按钮同行、渐变参数行内，渐变模式约 290px -> 约 200px、单色约 107px -> 约 73px），模式间状态双向共享（渐变 -> 单色把选中色标完整色值含 alpha 同步为单色，transparent/非法跳过；单色 -> 渐变维持 ADR-0077 派生），颜色控件使用无边框 hex 输入（支持 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA`，提交时同步 swatch/alpha，无效草稿不写文档且无焦点 outline），颜色控件/数字输入/透明度滑杆带 aria-label；字段值仍为字符串（色值或规范化 CSS 渐变），Material/Manifest/ScreenDocument 契约零变化；渐变渲染消费由物料渲染端负责，官方文本物料以 `background-clip: text` 支持渐变文字；画布背景保持结构化契约。依据：[Unified Color Palette](../specs/archive/unified-color-palette/spec.md)、[ADR-0077](../decisions/ADR-0077-canvas-background-and-color-authoring.md)。
- **画布内文本直接编辑**（封版后增量，已纳入基线）：双击可编辑文本组件进入 contenteditable overlay 编辑会话——仅官方文本物料且 dataSource 为 static 字符串（fail-closed，host-resource 数据归宿主）；Enter 提交 / Shift+Enter 换行 / Esc 取消 / 失焦提交，提交复用 `update-components` patch dataSource（恰一条历史）；overlay 视觉复制物料样式（WYSIWYG），经既有 `isEditableTarget` 通道放行 IME 与原生编辑键，不侵入物料/Renderer DOM；公共契约零变化。依据：[Designer Canvas Text Editing](../specs/archive/designer-canvas-text-editing/spec.md)、[ADR-0052](../decisions/ADR-0052-designer-canvas-text-editing.md)。
- **多选批量属性编辑**（封版后增量，已纳入基线）：多选检查器新增批量几何（宽/高/旋转）与样式交集编辑——样式字段取所有选中组件 stylePanel 交集（空交集只显几何），控件复用既有渲染与统一三段式调色板；值显示焦点组件、编辑应用到全部选中，一条事务 N 条命令（跳过锁定、逐组件 schema 校验）恰一条历史；`data-multi-property` 独立分派、单选通道零改动；公共契约零变化。依据：[Designer Multi Selection Editing](../specs/archive/designer-multi-selection-editing/spec.md)、[ADR-0053](../decisions/ADR-0053-designer-multi-selection-editing.md)。
- **DataV 全局变量**（2026-09-03 增量，已纳入基线）：canonical 变量以稳定 `id` 寻址，来源固定为 `static | data-source | url-query`，并保存名称、描述、初始值、宿主 `sourceId`、过滤器 `processorId`、受控模式与数据源自动更新频次。变量面板按 DataV 字段提供创建、完整配置、响应预览、重命名、复制、删除、使用次数和加入 Blueprint；重命名只改展示名，所有组件数据参数、组件变量数据源、Blueprint 表达式、触发器和动作继续引用稳定 ID。变量作为 Blueprint 一等节点，提供 `data-updated | request-state` 事件、导入变量和请求组件数据动作；文档推导的依赖边锁定，作者规则边可删除。Viewer/Designer 暴露 `getVariable(id).value/.set/.onChange` 和 `refreshVariables`，受控动态变量不使用初始值，解析变化会触发监听与变量事件。实际 URL、API/SQL、凭证、过滤代码和轮询调度仍归宿主，Base Screen 只保存严格配置并发出有界请求。旧 `static | host`、`value` 和按名称引用通过一次性失败关闭脚本迁移，不保留兼容分支。依据：[DataV Global Variables](../specs/archive/datav-global-variables/spec.md)、[ADR-0083](../decisions/ADR-0083-variable-system.md)（含其吸收的早期 DataV 启发方案 ADR-0067）。
- **官方物料视觉能力**（封版后增量，已纳入基线）：形状物料（矩形/椭圆）新增圆角 `borderRadius`（0..512）与阴影 `shadowColor`/`shadowBlur`/`shadowOffsetX`/`shadowOffsetY`（阴影默认关闭，椭圆固定 50% 圆角且面板不暴露 borderRadius）；`fill` 渐变字符串渲染为 background-image（普通色值保持 background-color），容器 `backgroundColor` 同规则；矩形 `borderColor` 支持线性/径向渐变，通过组件内遮罩层绘制在 canonical 边界以内并继承 `borderRadius`，纯色边框保持原生 border 路径；`shadowColor` 渐变时跳过阴影（box-shadow 不接受 `<image>`）；Manifest 能力扩展、旧文档零迁移，公共契约零变化。依据：[Official Material Visual Capabilities](../specs/archive/official-material-visual-capabilities/spec.md)、[ADR-0077](../decisions/ADR-0077-canvas-background-and-color-authoring.md)。
- **图片物料 URL 校验与失败回退**（封版后增量，已纳入基线）：图片物料静态数据源复用 `isBoundedScreenImageUrl` fail-closed 校验（与画布背景/封面同规则，拒绝 data:/javascript:/blob:/file:/裸相对/控制字符）——非法 URL 不创建 img、显示「图片地址无效」占位；`img` 加载失败移除失效图片并显示「图片加载失败」占位，渲染重建不残留；公共契约零变化。依据：[Image Material URL Validation](../specs/archive/image-material-url-validation/spec.md)、[ADR-0085](../decisions/ADR-0085-text-and-image-material-authoring.md)。
- **官方图片一次性倍图尺寸**（2026-09-01 增量）：单选 `base.image` 时，Designer 几何区提供无状态 `1x`/`2x`/`3x`/`4x` 操作，按当前物料宿主投影的图片自然宽高除以倍率，并以一条 `update-components` 事务写入两位小数、`1..1000000` 范围内的固定 `size`；相同尺寸不新增历史，锁定或自然尺寸不可用时失败关闭并诊断。自然尺寸元数据在换源、加载中、URL 无效与失败时立即清除，过期 load/error 不能恢复旧值；倍率不持久化、换图不跟随、结果不受画布范围裁决，Viewer 与导出仍只消费 canonical 固定宽高。Image Manifest、Material ABI、ScreenDocument 与公开方法均不变。
- **调色板切换模式继承单色色系**（封版后增量，已纳入基线）：三段式调色板从单色切换到线性/径向渐变时，若色标为未定制的内置默认（黑→白），按单色色系派生——起点 = 单色、终点 = 同色系提亮（向白混合 45%，纯白等无区分度时向黑加深 35% 回退），渐变首帧即与单色同色系；已定制的渐变色标在模式往返中原样保留、线性 ↔ 径向互切保留色标与几何；派生仅发生在交互切换路径（文档解析路径不受影响），字段值格式与序列化契约不变、一条历史可 undo，公共契约零变化。依据：[Color Palette Gradient From Solid](../specs/archive/color-palette-gradient-from-solid/spec.md)、[ADR-0077](../decisions/ADR-0077-canvas-background-and-color-authoring.md)。
- **组件条件样式规则**（封版后增量，已纳入基线）：`ScreenComponentNode` 可选 `styleRules`（≤8 条，严格 JSON-safe、fail-closed 解析）以组件自身 `dataState.value` 为唯一条件源（有界路径 + 与 Blueprint 同集的 8 个操作符，类型不匹配/非 ready 视为不命中），命中规则按数组顺序逐键合并出 effective style；Renderer 在模型应用前求值并逐规则过物料 `styleSchema`（非法规则样式与非法 style 同路径 fail-closed），数据刷新自动重评估且不发新请求，effective style 只存在于运行时、不回写文档/历史；Core `update-components` patch 整体替换（空数组清除，锁定组件既有拦截）；Designer 不再提供内建规则编辑区，既有文档规则仍正常解析与渲染，宿主可经文档或既有公开事务通道配置。依据：[Component Conditional Style Rules](../specs/archive/component-conditional-style-rules/spec.md)、[ADR-0080](../decisions/ADR-0080-conditional-style-authoring-ownership.md)。
- **宿主条件样式端口**（封版后增量，已纳入基线）：判定与视觉映射都归宿主的告警视觉通道——Viewer/Designer `configure` 可选 `conditionalStylePort`（同步纯函数 `(componentId, dataState) => style overrides | undefined`，并提供与 `resourcePort` 同形的守卫 setter 与只读 getter）；Renderer 在同一 effective style 求值点按 base → 文档 `styleRules` → 端口覆盖的固定顺序合并，端口收到完整 `dataState`（含 idle/loading/error）可自行决定降灰等状态样式；端口覆盖过物料 `styleSchema`（非法覆盖与抛异常均忽略覆盖、保留 base+规则结果并上报诊断，不中断渲染）；effective style 仍只在运行时、不回写文档；无端口实例与现状逐字节一致，文档/Blueprint 契约零变化；设计态画布经同一 Renderer 路径预览宿主告警样式。依据：[Conditional Style Port](../specs/archive/conditional-style-port/spec.md)、[ADR-0080](../decisions/ADR-0080-conditional-style-authoring-ownership.md)。

- **组合分片插入**（2026-10-04 增量，已纳入基线）：`<base-screen-designer>` 公开方法 `insertComponentFragment(intent)` 一次插入一组带相对偏移的原子节点，提交为**单个可撤销事务**并在成功后整片选中。分片以 `anchor` 为包围盒左上角、整片只平移入画布（不逐节点裁剪；整体大于画布时失败关闭），`props`/`style` 与 manifest 默认值顶层浅合并后过 schema，shell 按 `designCapabilities.children === true` 校验（`libraryVisible: false` 的容器可作外壳，普通节点仍要求库可见），`parent` 只接受 shell 键或更早声明的节点键，id 与 zIndex 在分片内本地去重，节点 ≤ 64、intent JSON ≤ 64 KiB。**预设的存储与检索归宿主**：基座不持有预设注册表，也不设「区块/模板」一等实体，另导出 `parseBaseScreenComponentFragmentInsertionIntent` 供宿主入库前校验。诊断码复用既有 `AUTHORING_*`，canonical 文档契约与黄金 schema 不变。依据：[ADR-0087](../decisions/ADR-0087-composite-component-fragment-insertion.md)。

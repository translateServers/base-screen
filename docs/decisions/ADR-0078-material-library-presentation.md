# ADR-0078: 物料库呈现与宿主状态投影

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0021、ADR-0031、ADR-0033、ADR-0034、ADR-0035、ADR-0040、ADR-0041、ADR-0042、ADR-0060（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)、[ADR-0024](./ADR-0024-designer-public-style-tokens.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、ADR-0032

## 背景

Designer 左侧物料库是宿主可信物料目录的展示面：哪些物料可见、目录处于什么加载状态、如何按业务层级分组、
卡片如何呈现，都由宿主投影与 Engine 展示职责共同决定。这条主线的九份既有 ADR 存在真实的演化与反转：状态条
位置由左侧面板移到工作区错误控制台（ADR-0035 部分取代 ADR-0031）；Manifest 从「没有缩略图字段且不为此扩展」
转为新增 `cover`（ADR-0040 部分取代 ADR-0032 与 ADR-0034「不得新增图片请求」），随后由 ADR-0041 细化封面适配。
本 ADR 收敛为一份现行表述，被吸收记录保留历史正文、不再作为现行依据。

边界始终一致：宿主拥有目录内容、分组定义、权限、持久化、资产与重试策略；Engine 只按 Manifest 声明与
JSON-safe 投影做展示与交互，不感知物料类型特例，不触碰 Designer 私有 Shadow DOM，不加载或改写 catalog。

## 决策

### 1. 物料可见性由 Manifest 声明

`BaseScreenMaterialManifest` 增加可选 `libraryVisible: boolean`，缺省即「在物料库可见」（默认 `true`）。Plugin
Core 在字段存在时严格校验：必须是 boolean，否则 manifest 解析失败并报 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`；
字段不转必填，既有 manifest 解析不变。Designer 物料库（卡片、搜索/筛选、点击添加、拖拽入画布）只展示
`libraryVisible !== false` 的条目；catalog、plugin-manager、Renderer、Viewer、图层面板、检查器与分组命令不受
影响——隐藏物料仍注册、可渲染、可编辑，并可作为分组壳。官方容器 `base.container` 声明 `libraryVisible: false`；
Engine 不得为容器做类型特例。

### 2. 宿主状态投影与动作事件边界

Engine 提供可选、JSON-safe、只读的 `BaseScreenMaterialLibraryState` 展示投影：仅描述当前实例看到的目录，不加载
物料、不改变 catalog，也不进入文档、历史或导出物。`status` 固定为
`loading | ready | offline | partial | error | update-available`，可声明 `draftTypes`、`unavailableTypes` 与
`failedCount`；输入拒绝未知字段、重复 type、越界数量与非法值。分类筛选用 Manifest 现有 `category`；草稿与
不可用标记只来自宿主投影，不扩展 Manifest。不可用物料保留在列表用于解释目录状态，但不可点击或拖拽创建。
面板动作只发出 composed Custom Event `base-screen-material-library-action`，detail 为 `{ action }`，`action`
取值 `retry | reload | details`，选择器为 `data-material-library-status` / `data-material-library-action`；
鉴权、联网、未保存内容处理、unload/reconfigure 与外部问题界面归宿主。catalog 继续实例级不可变：宿主换新集合
必须先 `unload()` 再以新 catalog `configure()`，状态 setter 只更新展示投影；未提供投影的宿主保持精简面板。

### 3. 错误控制台入口与状态 surface 位置

目录状态不再渲染为左侧物料库顶部状态条，改由底部状态栏带错误计数的控制台按钮承载：点击打开可访问的错误
控制台弹窗，内含当前可操作的物料目录状态与有界的失败记录，不参与左侧面板或画布的文档流。保留
`BaseScreenMaterialLibraryState`、`data-material-library-status`、`data-material-library-action` 契约，但把状态
surface 从 `[data-materials]` 移至控制台弹窗：`partial` 与 `error` 以错误级别记录，`offline` 与
`update-available` 作为当前可操作状态显示，`loading` 与 `ready` 不产生新记录。`retry`、`reload`、`details`
继续发出原有 composed Custom Event 与原有 data-* 选择器；草稿/不可用卡片标记仍留在左侧网格，不可用物料仍
不可点击或拖拽。控制台支持关闭、清空实例内错误记录与焦点返回状态栏入口，复用现有 Designer Token、语义色、
焦点样式与 reduced-motion/forced-colors 保护；显示、隐藏或状态切换不得改变左侧面板、搜索、导航、网格或画布
几何。不新增公共配置、状态字段、宿主回调、网络请求、持久化、超时逻辑或外部 UI 依赖，记录只在当前 Designer
实例内有界。

### 4. 宿主控制的多级分组投影

Engine 提供可选、JSON-safe、只读的 `BaseScreenMaterialLibraryGrouping` 投影，通过 `configure()` 与同名 property
提供，与 `BaseScreenMaterialLibraryState` 分离：前者描述目录树，后者描述加载、草稿与不可用状态。宿主提供有序
树，每个节点只含稳定 `id`、显示 `label`、可选 `materialTypes` 与可选 `children`；数组顺序即宿主指定的组与物料
顺序，组可嵌套到有界深度，物料 type 在整棵树中只能出现一次。输入严格失败关闭：拒绝未知字段、非 JSON-safe
值、非法或重复组 id、空标签、非法或重复 type、空节点，以及超过组数、物料数或深度上限的树。配置与 property
更新还必须针对当前不可变 catalog 校验：每个 `libraryVisible !== false` 的物料恰好被引用一次，隐藏物料或
catalog 中不存在的 type 不能进入分组树。配置分组时，物料库提供「全部」入口、当前路径面包屑与当前层级子组
按钮；选择任意组时卡片网格显示该节点及其全部后代的物料，支持超过两级的目录，搜索、收藏与最近使用继续与
当前组范围取交集。未配置分组时，既有基于 Manifest `category` 的 chips、搜索与排序语义保持不变。分组只影响
当前实例的物料库 DOM，不进入 Manifest、catalog、ScreenDocument、历史、导出物、Renderer 或 Viewer；分组更新
不重建 Renderer，真实 catalog 更换仍走 `unload()` + 重新配置。分组树定义、权限过滤、可见性策略、用户级目录
状态与持久化均归宿主；Base Screen 不提供组的增删改、拖拽整理、网络请求、存储、通用图标注入或宿主 Shadow DOM
访问入口，当前选中路径仅是实例内瞬态 UI 状态。

### 5. 物料库视觉层级

物料库采用紧凑的 data-dense / drill-down 层级：路径作为固定高度的上下文轨道，当前层级子组作为单行标签-计数
控制，筛选作为单一选中态的分段控件；强调色只用于当前路径、当前筛选、键盘焦点和明确的语义状态，不再作为
每个静态元素的外框。卡片采用安静的中性表面、固定预览区与清晰的名称/type 文本层级；分类图标继续由既有
确定性规则生成，缩略图不再依赖高饱和分类色相或装饰性渐变；悬浮、收藏、草稿与不可用状态必须在不改变卡片
几何的前提下保持可辨识。样式仅消费既有 `--designer-*` Token 及 `color-mix()` 派生值，不得新增外部字体、固定
全局调色板、新依赖或宿主私有 DOM 入口，默认主题 Token 与公共主题 API 不变；除封面（决策 6、7）外不得新增
图片请求。既有分组、筛选、搜索、状态、卡片、收藏和键盘导航 data-* 契约及 ARIA 状态保持不变；视觉状态提供
`:focus-visible` 反馈，`prefers-reduced-motion` 下移除新增过渡，hover/focus/active 不得改变布局尺寸、滚动轨道
或网格位置。

### 6. Manifest 封面字段与失败关闭校验

Material Manifest 新增可选 `cover: string`，语义为「宿主或物料作者提供的封面图 URL」，仅用于 Designer 物料库
卡片缩略图展示，不参与 catalog 身份、数据绑定、事件、历史、导出或渲染。校验失败关闭：`cover` 缺省即未声明
（与 `libraryVisible` 同形）；存在时必须满足——非空字符串、长度 1..2048（码点）、无控制字符（C0/DEL/C1：
`\u0000-\u001f`、`\u007f`、`\u0080-\u009f`）、无空白、无原始反斜杠；且必须匹配以下形式之一（只做前缀与首字符
分类）：`http(s)://` 或 `//` 开头且紧随至少一个非空白、非 `/`、非 `?`、非 `#`、非反斜杠的 authority 首字符
（如 `https://x/y.png`、`//cdn/x.png`）；`/` 或 `./`、`../` 开头且紧随至少一个非空白、非 `/`、非反斜杠的路径
首字符（如 `/assets/x.png`、`./x.png`、`../x.png`）。拒绝 `data:`、`javascript:`、`blob:`、`file:` 等其他
scheme、裸相对路径与上述边界外值；非法值使 manifest 解析失败（沿用 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`），
不剥离、不默认、不静默修复。卡片在固定 16:10 缩略图区渲染 `<img>`：
`object-fit: cover`、`loading="lazy"`、`decoding="async"`、`draggable="false"`、`alt=""` 装饰性（可访问名称仍
由 `aria-label` 提供）；确定性分类图标与色相保持为占位层，图片加载完成后以 opacity 过渡显现，加载失败时移除
图片、恢复占位图标，任何情况下缩略图区几何不变。Base Screen 只把校验后的宿主 URL 写入 `img.src`（属性赋值，
非 innerHTML），不 fetch、不预取、不重试、不代理、不进入缓存策略；加载失败只影响该卡片回退。封面是纯展示
投影：不进入 ScreenDocument、历史、导出物、Renderer 或 Viewer，不改变 catalog 不可变性、`libraryVisible`
语义、宿主分组投影或既有 data-* 契约。不新增依赖与 package，contracts 的 ScreenDocument schema 不变。

### 7. 封面自适应适配启发式

封面 `<img>` 加载完成后，按「容器尺寸 vs 图片自然尺寸」做一次性决策：放大倍数
`upscale = max(容器宽/自然宽, 容器高/自然高)` 大于 `1.5` 时改 `contain`（完整显示、不放大、居中），避免小图
模糊铺满；宽高比偏差 `aspectMismatch = |自然宽高比 - 容器宽高比| / 容器宽高比` 大于 `0.35` 时改 `contain`
（不裁切），避免横幅/方形图只剩局部；两者都不超阈值时保持 `cover`。决策通过缩略图容器上的
`data-material-cover-fit="contain"` 标记加 CSS 后代选择器生效（`object-fit: contain`），不写内联样式；`cover`
是缺省值，不写标记。决策只在 load 时发生一次，无后续几何变化。封面加载成功后（无论 cover/contain），缩略图
占位层（彩色渐变 + 网格 + 图标）整体收起：底色切换为中性深色（浅色主题对应中性浅色），网格与图标隐藏/淡出，
透明图不再透出彩色占位背景。阈值与行为是展示启发式，不进任何契约；`cover` 字段校验、manifest 语义、catalog
身份与宿主边界与决策 6 一致，官方物料与既有探针（320×200 封面，宽高比与容器一致）行为不变。加载失败仍按
决策 6 移除图片、恢复占位层；自适应不引入新的网络行为（不预取、不重试、不代理、不二次请求），不改变
`materialLibraryState`、宿主动作或卡片可用性。

### 8. 渲染可扩展性：content-visibility 与搜索防抖

物料卡片网格项（`.material-card-wrap`）声明 `content-visibility: auto` 与 `contain-intrinsic-size: auto 140px`
（约等于卡片真实高度）：屏外卡片跳过 layout/paint，`auto` 记住最近一次真实渲染尺寸，滚动条高度估算稳定；
不引入 JS 窗口化、不分页、不改变 DOM 结构。搜索输入（`onInput`）对 `renderMaterials` 做 120ms 防抖
（`MATERIAL_SEARCH_DEBOUNCE_MS = 120`）：连续输入只触发一次渲染，窗口内再次输入重置计时器；清空（clear 按钮 /
Escape）取消未决计时器并同步渲染，搜索状态 `#materialSearch` 在计时器触发时统一更新以避免中间态。只优化渲染
路径：不改变 catalog、物料身份、`materialLibraryState`、宿主动作、卡片 DOM 结构、可访问性（aria/焦点/键盘导航）
与拖拽行为，`hidden` 过滤语义不变。纯渐进增强：不支持 `content-visibility` 的浏览器（Safari < 18、Firefox <
125）静默退回全量渲染，无需 polyfill 或 `@supports` 分支。无抖动规约继续适用：`contain-intrinsic-size: auto`
只在元素首次渲染前提供估算尺寸，渲染后以真实尺寸为准，`.rail` 的 `scrollbar-gutter: stable` 已预留滚动条轨道。

### 9. 条目投影与 canonical 物料类型解耦

Designer 增加可选、JSON-safe 的 `materialLibraryItems` 投影（`BaseScreenMaterialLibraryItem`）。每项包含稳定
`id`、一个 canonical `materialType`，以及可选 `name`、`category`、`keywords`、`cover`、`defaultSize`、
`defaultProps`、`defaultStyle`、`defaultData` 与 `defaultDataSource` 覆盖。多个条目可指向同一 `materialType`：
点击或拖拽后写入 Screen Document 的仍是 catalog 中的 canonical type，条目覆盖只决定新实例的名称、尺寸、props、
style 和初始数据源。覆盖与 Manifest 默认 props/style 浅合并，再复用完整 Manifest 校验失败关闭；
`defaultDataSource` 复用 Screen Document 数据源契约校验，并且必须被物料的 `dataCapabilities` 接受。条目不得
引用缺失或隐藏 type，并必须至少覆盖每个可见 catalog type 一次。未配置时自动投影为「一种可见物料一个同名
条目」，现有 catalog、分组、状态和拖拽 MIME 保持兼容；分组仍按 `materialTypes` 工作，同类型的多个条目在该
类型位置按宿主输入顺序展开。条目只属于当前 Designer 实例，不进入 Material Manifest、catalog、Renderer、
Viewer、Screen Document 或持久化；资源查询、权限、签名 URL 和市场策略继续归宿主。

## 后果

- 宿主可用同一份可信 catalog 投影不同可见性、加载状态、多级目录与条目集合，物料 ABI、canonical 文档与
  catalog 不可变性保持稳定、既有宿主零迁移，物料库升级为「真实封面加文字」且自动回退确定性缩略图。
- 目录状态切换不再使左栏网格纵向跳动，失败追踪与恢复集中在底部状态栏可达的错误控制台；条目投影让
  「catalog 如何运行」与「面板里可选择什么」解耦，业务资源身份进入实例 `host-resource.resourceId`，不再伪造 type。
- 非目标/明确推迟（宿主职责）：物料市场、分页远程目录、下载、鉴权、签名、版本选择、审核发布；URL、包版本、
  租户、凭证、摘要、宿主错误对象不进状态投影；分组字段不进 Material Manifest、插件包或 ScreenDocument，Engine
  不实现租户、权限、目录数据库、收藏/最近使用持久化，不接受任意 HTML/SVG/组件/函数/Promise/URL/宿主服务对象
  作为分组元数据，不以分组投影绕过 `libraryVisible`，不访问 Designer 私有 Shadow DOM。
- 非目标/推迟（封面与渲染）：封面不进 ScreenDocument/Renderer/Viewer/导出物/历史，不接受任意 HTML/SVG/组件/
  函数/Promise/宿主服务对象作为封面，不支持 data URI 与超大图片；Engine 不做上传、转码、服务端缩略图、代理、
  缓存、重试（归宿主）与内容感知裁切，也不做虚拟滚动/窗口化、分页，不为不支持 CV 的浏览器提供降级分支。
- 非目标/推迟（错误处理）：物料加载失败不转浏览器全局 toast、宿主 dialog、后台队列或网络重试，不建立跨实例/
  跨会话/持久化日志，不记录宿主错误对象、URL、凭证和租户信息，不隐藏草稿/不可用物料或把卡片级状态移出网格。
- 验证由专项 Spec、真实浏览器 harness、API 检查与 tarball 门禁保护（含 catalog 一致性、Renderer 隔离与无分组兼容路径）。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0021 | `libraryVisible` 可选字段与失败关闭校验；物料库只列 `libraryVisible !== false`；官方 `base.container` 声明 `false`；不做类型特例 | 全部生效 |
| ADR-0031 | `BaseScreenMaterialLibraryState` 状态投影、`base-screen-material-library-action` 动作事件、catalog 实例不可变与 unload/reconfigure 边界 | 决策 3 的状态条位置被 ADR-0035 取代，其余生效 |
| ADR-0033 | `BaseScreenMaterialLibraryGrouping` 多级分组投影、严格失败关闭与「每个可见物料恰好引用一次」一致性校验、宿主持有目录职责 | 全部生效 |
| ADR-0034 | 紧凑 data-dense/drill-down 层级、Token 约束、无抖动与可访问 data-* 契约 | 决策 3 的「不得新增图片请求」被 ADR-0040 部分取代（仅限卡片封面），其余生效 |
| ADR-0035 | 底部状态栏错误控制台入口、状态 surface 从 `[data-materials]` 迁移、动作事件与卡片可用性语义保留 | 全部生效；部分取代 ADR-0031 的状态条位置 |
| ADR-0040 | Manifest 可选 `cover` 字段与失败关闭 URL 校验、卡片封面渲染与回退、不预取/不重试/不代理 | 决策 3 的 `object-fit: cover` 呈现被 ADR-0041 细化，其余生效；部分取代 ADR-0032 与 ADR-0034 的相关结论 |
| ADR-0041 | 封面自适应启发式（放大 > 1.5× 或宽高比偏差 > 0.35 改 `contain`）、`data-material-cover-fit` 标记与占位层收起 | 全部生效；细化 ADR-0040 决策 3 |
| ADR-0042 | `.material-card-wrap` 的 `content-visibility: auto` / `contain-intrinsic-size: auto 140px`、搜索 120ms 防抖与渐进增强降级边界 | 全部生效 |
| ADR-0060 | `materialLibraryItems` 条目投影与 canonical `materialType` 解耦、浅合并与 `dataCapabilities` 校验、未配置时自动投影 | 全部生效 |

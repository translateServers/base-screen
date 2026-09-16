# ADR-0077: 画布背景与颜色表达的现行契约

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0043、ADR-0045、ADR-0046、ADR-0048、ADR-0049、ADR-0050、ADR-0051、ADR-0055、ADR-0057（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0002](./ADR-0002-canonical-screen-document.md)、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、ADR-0028、ADR-0040、ADR-0041

## 背景

`ScreenCanvas` 最初只有 `width`、`height`、`backgroundColor`：画布背景只能是单色。大屏设计同时需要两类更强的背景表达能力——整屏背景图（模板底图、场景氛围图、品牌背景）与结构化渐变（线性、径向）。前者涉及图片资产的上传、存储、鉴权，按 ADR-0027 归宿主；后者不能把任意 CSS 字符串写进 canonical document，否则会损失结构化校验、编辑器可预期性与失败关闭边界。

本主线分四步演化，期间出现过真实的收敛与反转：

1. 先建立画布背景图字段与基础 API（ADR-0043），并把面板编辑列为非目标；
2. 面板编辑（ADR-0045）与宿主选择按钮（ADR-0046）补齐交互，随后 ADR-0049 把按钮由「始终渲染」改为默认隐藏；
3. 画布结构化调色板（ADR-0048）与统一三段式颜色控件（ADR-0050）把渐变能力同时带给画布与物料颜色字段，ADR-0051 取消了 ADR-0050 的字段级门控，ADR-0057 补上单色到渐变的色系派生；
4. ADR-0055 把渐变在物料端（形状、容器）的实际渲染责任补齐。

本 ADR 只收敛一份现行表述，被吸收记录的正文保留历史证据。

## 决策

### 1. 画布背景图的 canonical 字段与校验

`ScreenCanvas` 有两个可选字段：`backgroundImage?: string`（宿主提供的背景图 URL）与 `backgroundImageFit?: ScreenCanvasBackgroundImageFit`（取值 `'cover' | 'contain'`）。缺省即未声明；`backgroundImageFit` 未声明时渲染按 `cover` 处理。两者进入 canonical document 契约、历史与序列化，Designer 画布与 Viewer 共用同一渲染路径，随文档持久化。

校验失败关闭（沿用 ADR-0040 的 URL 规则同形复用）：`backgroundImage` 存在时必须为非空字符串、1..2048 码点、无控制字符（C0/DEL/C1）、无空白、无原始反斜杠，且匹配 `http(s)://`、`//`（协议相对）、`/`（根相对）、`./`、`../`（点相对）前缀加首字符分类形式；拒绝 `data:`、`javascript:`、`blob:`、`file:` 等其他 scheme、裸相对路径与边界形式。非法值使文档解析失败（`DOCUMENT_FIELD_INVALID`，路径 `canvas.backgroundImage`），不剥离、不默认、不静默修复；未知字段拒绝语义不变。

### 2. `update-canvas` 的 null 删除语义

`update-canvas` 命令的 canvas patch 支持新字段；patch 中值为 `null` 表示删除该字段（canvas 全部字段均不可空，`null` 无歧义），删除后文档等同未声明，历史、脏标记与变更事件与既有编辑一致。该语义同时适用于背景图两字段与结构化的 `background` 字段。

### 3. Renderer 的背景渲染与图层顺序

Renderer 在 root 元素渲染背景：存在 `backgroundImage` 时设置 `background-image: url("<校验后 URL>")`（CSS 值转义，禁止 innerHTML 或任意注入）、`background-size` 按 fit（缺省 `cover`）、`background-position: center`、`background-repeat: no-repeat`；不存在时清除这些样式。背景图叠加在 `backgroundColor` 之上，`backgroundColor` 语义不变。Designer 画布是 renderer 的 root，自动同显。

结构化调色板同样由 Renderer 确定性投影为 CSS：单色设置 `background-color`；线性渐变设置 `linear-gradient(<angle>deg, ...)`；径向渐变设置 `radial-gradient(circle at <x>% <y>%, ...)`。三者同时存在时层级固定为「背景图最上层 → 调色板渐变 → 基础背景色」；清除任一层不得残留 CSS 长列表属性。

### 4. 宿主的画布背景 API 与会话边界

- `setCanvasBackgroundImage(backgroundImage: string | null, fit?: ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>`：实现为 session 事务（`update-canvas`），校验失败关闭、失败零副作用；`null` 清除背景并同时清除 fit；成功走既有 dirty/history/`base-screen-change` 通道。
- `setCanvasBackground(background: ScreenCanvasBackground | null)`：经既有 session 事务、历史、脏标记与 `base-screen-change` 通道提交。
- 宿主也可直接在加载的文档中携带 `canvas.backgroundImage` 与 `canvas.background`（替换文档时同样失败关闭）。
- Base Screen 只把校验后的 URL 写入 CSS `url()`，不 fetch、不预取、不重试、不代理、不进入缓存策略；图片加载失败只影响画布背景呈现（浏览器原生行为），不改变文档、目录状态或任何状态机。上述 API 均不处理资源上传、图片选择、网络请求或 CSS 任意值注入。

### 5. 画布属性面板的背景图编辑

Designer 右侧属性面板「画布」区与 `backgroundColor` 同一 section 提供两个控件：

- `backgroundImage`：文本输入框，值为当前 `canvas.backgroundImage`（无则空）。非空输入提交 `update-canvas` patch（URL 校验失败关闭，诊断走既有面板错误通道与 `aria-invalid`）；清空输入提交删除语义（`backgroundImage: null` 且 `backgroundImageFit: null`，与 `setCanvasBackgroundImage(null)` 一致）。
- `backgroundImageFit`：下拉（`cover`/`contain`），值为当前 `canvas.backgroundImageFit`（未声明显示 `cover`）；无背景图时禁用；变更提交 `backgroundImageFit` patch。

控件只消费既有 Designer 控件样式（`designer-control designer-input`/`designer-select`）与集中 UI 文案（`designer-ui-text.ts`），不改变主题 Token、无抖动。面板入口与宿主 API、文档入口语义完全一致：同一 canonical 校验、同一 null 删除语义、同一 dirty/history/`base-screen-change` 通道，非法值零副作用。

### 6. 宿主选择按钮与条件渲染

面板「画布」区背景图片输入框旁提供宿主选择按钮（`designer-control designer-button`，`data-canvas-background-image-action`，文案走 `designer-ui-text.ts`）。按钮**默认不渲染**：`BaseScreenDesignerConfiguration` 新增可选 `canvasBackgroundImageButton?: boolean`（validate before mutate：存在时必须为布尔，非法值使配置失败且零副作用），默认 `false`，仅当配置为 `true` 时渲染；`BaseScreenDesignerElement` 暴露同名只读 getter。

按钮点击派发 composed 宿主事件 `base-screen-canvas-background-image-request`（常量 `BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT`，从 `@base-screen/engine` 导出），detail 形如 `{ request: BaseScreenCanvasBackgroundImageRequest }`，request 含 `requestId`、`instanceId`、`documentRevision` 与 `current: { backgroundImage, backgroundImageFit }`。未接入的宿主按钮不可见、点击无其他副作用。

配套的两个公开方法与提交语义：

- `requestCanvasBackgroundImage(): boolean`：有文档时登记宿主会话并派发上述事件（返回 true），无文档返回 false；宿主可在面板按钮之外直接调用。
- `commitCanvasBackgroundImage(requestId: string, backgroundImage: string | null, fit?: ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>`：守卫为 pending 会话 kind 匹配且未过期（unload 或文档替换使会话失效，复用 authoring 会话失效语义）；提交经 `update-canvas` 事务（`null` 清除背景并同时清除 fit，失败关闭零副作用，与 `setCanvasBackgroundImage` 同语义）；成功即消费会话。

宿主提交路径二选一：经 `commitCanvasBackgroundImage`（带会话守护，推荐，与 ADR-0028 同构），或直接调用 `setCanvasBackgroundImage`（无会话语义）。按钮事件只承载请求、不承载结果。`requestId` 生成复用 `createScreenAuthoringRequestId`；事件 detail 只含 JSON-safe 值。

按钮与输入框的垂直对齐为纯样式修正：行容器 `.designer-canvas-background-row` 承接字段间距（`margin-bottom` 移到行上），行内 `.designer-field` 的 `margin-bottom` 归零，按钮与输入框在同一行高内垂直居中；不改变几何与主题 Token，无抖动。

### 7. 画布结构化调色板

`ScreenCanvas` 新增可选 `background?: ScreenCanvasBackground`，为严格 JSON-safe 判别联合：

- `{ type: 'solid', color: string }`
- `{ type: 'linear-gradient', angle: number, stops: readonly ScreenCanvasColorStop[] }`
- `{ type: 'radial-gradient', position: { x: number, y: number }, stops: readonly ScreenCanvasColorStop[] }`

`ScreenCanvasColorStop` 为 `{ color: string, position: number }`。渐变必须有 2 至 8 个 stop，位置为闭区间 `0..100` 的有限数且按升序排列；颜色为非空的 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA` 或 `transparent`，最大 128 码点。线性角度为 `0..360` 的有限数；径向中心 `x`、`y` 均为 `0..100` 的有限数。`update-canvas` patch 接受 `background?: ScreenCanvasBackground | null`，`null` 删除该可选字段、回退为既有 `backgroundColor` 单色语义；未知键、空对象、判别字段不匹配、越界或未排序 stop 均失败关闭。

`background` 未声明的既有文档仍将 `backgroundColor` 解释为单色。新写入的单色模式同时写 `background` 与 `backgroundColor`，使只读 `backgroundColor` 的宿主仍有正确基础色；渐变模式保留 `backgroundColor` 作为无渐变浏览器与背景图加载失败时的基础底色。Designer 画布属性面板提供固定尺寸的三段模式控件以及与所选模式对应的输入（单色色板、线性角度与可编辑 stops、径向中心与可编辑 stops），切换模式保留每种模式的本地草稿，只有有效的值才经 `update-canvas` 提交。

### 8. 统一三段式颜色调色板控件

Engine 内部共享控件 `designer-color-palette-dom.ts` 全面替换普通物料面板（props/stylePanel）与 Manifest Editor Descriptor 中所有 `control: 'color'` 字段的原生 `<input type="color">`。三种模式**无条件可用**，不存在字段名门控，也不存在 manifest 能力声明机制。控件组成：

- 顶部三段模式选择（radio group）：单色、线性渐变、径向渐变；
- 单色模式：单个颜色 input；
- 渐变模式：渐变预览条、2..8 个可编辑色标行（颜色 + 0..100 整数位置 + 删除按钮）、添加色标按钮（插入最大间隙中点）、线性角度或径向中心 X/Y 输入；所有色标共享同一条渐变滑轨，每个色标有独立手柄，并与数字输入双向同步。

值表示保持 Material 契约：字段仍存储字符串。单色存色值；渐变存规范化 CSS 字符串 `linear-gradient(<angle>deg, <color> <position>%, ...)` 或 `radial-gradient(circle at <x>% <y>%, ...)`。色标颜色仅接受 `#RGB`/`#RRGGBB`/`#RRGGBBAA` 或 `transparent`，位置为严格递增整数，2..8 个。控件按字段（组件 id + prop/style/descriptor id）在模块级缓存三种模式各自的草稿；面板重渲染时若文档值仍等于缓存当前模式的序列化结果则复用缓存，否则（撤销、重做、替换文档）从文档重新解析；切换模式不丢失其他模式的配置。每次编辑经既有 change 通道提交（单色、渐变参数、色标改动直接产生新值经 `update-components` 或 descriptor 事务提交并失败关闭；添加/删除色标由控件内部变更 DOM 后派发 change 事件走同一通道），非法值（乱序色标、越界位置、非法颜色）拒绝提交并走既有 invalid draft 通道。

画布背景不迁移到该控件的 CSS 字符串表示：`ScreenCanvas.background` 保持结构化契约与专用渲染路径（见决策 7）。

### 9. 单色切换渐变的色系派生

从单色模式切换到渐变模式（线性/径向）时，若当前色标为未定制的内置默认（恰好 2 个色标：`#000000` 0% / `#ffffff` 100%），SHALL 按单色色系派生色标——起点 = 单色，终点 = 同一色系提亮（向白混合 45%）；提亮与起点无区分度时（起点接近纯白）改为向黑加深 35%。派生保证渐变首帧与单色同色系；透明或不可解析单色不派生（保持默认色标）。已定制的渐变色标（非默认）在模式往返切换中 SHALL 原样保留，作者以「曾经修改过色标」作为色系跟随的退出条件。派生只发生在交互切换路径（`designer-color-palette-dom` 的 mode change handler）；文档值本身就是渐变的解析路径不受影响；线性与径向互切保留色标与几何参数。

### 10. 渐变渲染的物料端归属

渐变值的渲染消费由物料渲染端负责：字段值仍是字符串（色值或规范化 CSS 渐变字符串），物料的渲染实现决定如何把渐变字符串应用到元素。官方文本物料 `base.text` 渲染端支持渐变文字：检测 `linear-gradient(`/`radial-gradient(` 前缀，设置 `color: transparent` + `background-image` + `background-clip: text`（含 `-webkit-` 前缀）；单色照旧写 `color`；切换回单色时清除三件套避免残留裁剪。

形状物料（矩形/椭圆）渲染端 SHALL 在 `fill` 为规范化 CSS 渐变字符串时渲染为 `background-image`（背景色清除），普通色值保持 `background-color`；容器物料渲染端 SHALL 同样消费 `backgroundColor` 的渐变字符串（渲染为 `background-image`）。其余官方物料按渲染端能力自然取舍：SVG 图表、ECharts option 内部色与 `border-color` 等属性不接受 CSS 渐变字符串，即使字段开放渐变也不会产生预期效果，作者可在后续增量中按需适配。

### 11. 形状物料的视觉字段

矩形/椭圆 Material Manifest SHALL 提供样式字段：`borderRadius`（number，0..512，默认 0）、`shadowColor`（string，默认空 = 无阴影）、`shadowBlur`（number，0..100）、`shadowOffsetX`/`shadowOffsetY`（number，-100..100）。渲染端 SHALL 应用 `border-radius` 与 `box-shadow: <offsetX>px <offsetY>px <blur>px <color>`（`shadowColor` 为空或 `shadowBlur` 为 0 时不输出阴影）。椭圆保持固定 50% 圆角，面板不暴露 borderRadius（形状由 type 决定）。

`shadowColor` 使用统一调色板时若输出渐变字符串，渲染端 SHALL 跳过阴影（CSS `box-shadow` 不接受 `<image>`）；这是已记录的限制，不静默透传。

以上均为 Material Manifest 自身能力扩展（字段经既有 schema 驱动通道自动进入属性面板）；ScreenDocument、Engine、Renderer、SDK 公共契约零变化，旧文档零迁移（新字段全部可选、缺失按默认值渲染）。本主线的公共边界变更全部为 additive：文档字段、宿主方法与事件、面板控件与样式、物料 manifest 字段。

## 后果

- 画布可持久化、可校验地使用背景图、单色、线性渐变与径向渐变，并在 Designer、预览与 Viewer 中一致展示；未声明这些字段的既有文档与宿主零改造，行为与现状完全一致。
- 图片 URL 受失败关闭校验保护，CSS 赋值处转义，不引入网络、代理或协议注入面；背景图与结构化渐变的分层渲染确定性可预期。
- 三条设置入口（宿主 API、文档、属性面板）语义完全一致；宿主获得稳定的「按钮 → 宿主弹出框 → 可视化选择 → 注入」通道，带 requestId 守护的提交防过期与串会话，未接入宿主零影响（按钮不可见、连接口都无副作用）。
- 所有 `color` 字段共享同一三段式调色板，背景类与形状/容器字段的渐变真实生效，`base.text` 渐变文字开箱即用；单色到渐变的切换首帧即同色系，自定义色标不受扰动。
- 值仍是普通字符串，旧文档、宿主与物料渲染器零改造；失败关闭与无抖动约束保持。上述成果由专项 Spec 增量、聚焦测试、物料渲染测试与真实 browser harness 断言验收。

仍属非目标或明确推迟：

- 面板内嵌图片选择器、资产浏览、缩略图网格、搜索、上传、预览缩略图、代理或缓存；图片上传、转码、缩略图、失败重试（ADR-0027：归宿主）。
- 支持 data URI、任意 HTML/SVG/组件/函数/Promise 或宿主服务对象作为背景；把任意 CSS `background` 字符串、SVG、函数、DOM 节点或宿主服务写入文档。
- 多层任意渐变、渐变预设色板或推荐色板、HSL 色相算法强制、派生比例可配置化。
- 拖拽式色标条、取色器、色板预设、透明度滑杆、HSV/HSL 面板等进阶控件能力。
- 为不支持 `<image>` 的 CSS 属性（`color`、`border-color`、SVG fill、ECharts option）在物料渲染端批量适配渐变；`box-shadow` 渐变、阴影多段叠加、边框样式扩展。
- 文本物料的阴影与背景；图表/表格/ECharts 的渐变消费（数据物料背景渐变按需另立增量）。
- 改变 `backgroundColor` 语义、`update-canvas` 其他字段语义、组件契约或 Material Manifest / Editor Descriptor 的 `color` 控件契约；为 `color`/`border-color` 等不接受渐变的属性写入渐变。
- 宿主弹出框与 Designer 的坐标或生命周期联动。
- 新增依赖、package 或传输配置。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0043 | `backgroundImage`/`backgroundImageFit` 字段与 `cover` 默认、URL 失败关闭校验、renderer root 渲染与图层、`setCanvasBackgroundImage`、宿主资产边界 | 主体生效；非目标 1（面板编辑）由 ADR-0045 取代 |
| ADR-0045 | 面板「画布」区 `backgroundImage` 文本框与 `backgroundImageFit` 下拉、清空即删除、与 API/文档同语义 | 全部生效 |
| ADR-0046 | 宿主选择按钮、请求事件与 detail、`requestCanvasBackgroundImage`、`commitCanvasBackgroundImage` 会话守护、双提交路径 | 主体生效；决策 1「按钮始终渲染」由 ADR-0049 取代 |
| ADR-0049 | `canvasBackgroundImageButton?: boolean` 默认 `false`、按钮默认不渲染与同名 getter、`.designer-canvas-background-row` 对齐修正 | 全部生效 |
| ADR-0048 | `ScreenCanvasBackground` 判别联合、`ScreenCanvasColorStop` 约束、`backgroundColor` 双写、`update-canvas` 的 `background` null 删除、CSS 投影、`setCanvasBackground`、面板三段控件与按模式草稿 | 全部生效 |
| ADR-0050 | `designer-color-palette-dom.ts` 控件结构、字段值字符串表示与规范化渐变格式、按字段草稿缓存、change 通道提交、画布背景不迁移 | 主体生效；决策 2 字段级门控由 ADR-0051 取代 |
| ADR-0051 | 三段式控件全面替换原生 color input、三种模式无条件可用、渐变渲染归物料端、`base.text` 的 `background-clip: text` | 全部生效（取代 ADR-0050 决策 2） |
| ADR-0055 | 形状 `borderRadius`/`shadow*` 字段与 `box-shadow` 输出、椭圆固定 50%、形状 fill 与容器 backgroundColor 渐变按 `background-image` 渲染、`shadowColor` 渐变跳过、manifest-only 契约边界 | 全部生效（补齐 ADR-0051 的渲染责任） |
| ADR-0057 | 单色到渐变的色标派生（默认两色标、提亮 45%、近纯白改深 35%）、自定义色标原样保留、派生限于交互切换路径 | 全部生效 |

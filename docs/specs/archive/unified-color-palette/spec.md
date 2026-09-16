# Unified Color Palette Control Spec

> 归档：2026-08-30（已完成）
> 状态：已归档（历史验收记录；2026-08-16；2026-08-17 增量补充：颜色透明度滑杆 `透明度`；
> 2026-08-18 增量补充：紧凑布局与模式间状态共享，见第 6 节）
> 依据：ADR-0050、
> ADR-0051（全面替换 color input，取消字段级门控）

## 1. 目标

用自定义三段式调色板控件**全面替换** Designer 属性面板与 Manifest Editor Descriptor 中所有 `control: 'color'` 的原生 `<input type="color">`：单色、线性渐变、径向渐变三种模式对所有颜色字段无条件可用，支持多色标编辑；值保持普通字符串，Material 与文档契约零变化；渐变渲染消费由物料渲染端负责（官方文本物料支持 `background-clip: text` 渐变文字）。

## 2. Requirements

### R1：共享控件结构与三段模式

- `designer-color-palette-dom.ts`：顶部 radio group 三段模式（单色/线性渐变/径向渐变，全部可用），单色输入，渐变预览条，2..8 个色标行（颜色、整数位置 0..100、删除按钮，最少 2 个时禁用），共享一条渐变位置滑轨和每个色标的独立手柄，添加按钮（最多 8 个时禁用，插入最大间隙中点），线性角度（0..360）与径向中心 X/Y（0..100）。滑轨手柄按相邻色标动态限制范围，和数字位置输入双向同步。
- 普通面板的 props/stylePanel 与 Descriptor 的 `control: 'color'` 字段全部使用该控件，不再渲染原生 color input。

### R2：模式全量开放

- 三种模式对所有颜色字段无条件可用，无字段名门控、无 manifest 能力声明。
- 渐变值的渲染消费由物料渲染端决定：CSS `background` 类属性天然支持渐变；文字色等属性需要物料实现 `background-clip: text` 技巧。

### R3：值表示与失败关闭

- 单色值 = 色值字符串；渐变值 = 规范化 CSS 渐变字符串（色标严格递增、整数位置、颜色限 `#RGB/#RRGGBB/#RRGGBBAA` 或 `transparent`）。
- 解析非法字符串回退单色；DOM 读取发现乱序/越界/非法值时拒绝提交（invalid draft 通道），不写入文档。

### R4：草稿保留与外部漂移失效

- 模块级缓存按 `组件id:prop|style|descriptor:字段` 保存三模式草稿；重渲染时仅当文档值等于缓存当前模式序列化结果才复用，撤销/重做/替换文档自然失效。

### R5：编辑提交通道与渲染端消费

- 单色/参数/色标输入走既有 change 通道与 schema 校验提交；位置滑块拖动期间同步数字输入并更新调色板预览，松开后由既有 change 通道提交一次；添加/删除色标由控件更新 DOM 并派发 change，经同一事务提交。
- 控件样式只消费既有 Designer Token，模式切换不改变字段几何（display 切换），无抖动；键盘可达（radio/input/button 原生焦点）。
- 官方文本物料（`base.text`）渲染端消费渐变字符串：`linear-gradient(`/`radial-gradient(` 前缀 → `color: transparent` + `background-image` + `background-clip: text`（含 `-webkit-` 前缀）；单色照旧写 `color`；切回单色清除三件套。

### R6：画布背景不迁移

- `ScreenCanvas.background` 保持 ADR-0048 结构化契约与专用编辑器，不并入本控件。

## 3. 非目标

- 在渐变预览条上直接拖拽色标、取色器、预设、透明度、HSV/HSL 进阶面板；本 Spec 的位置滑块属于附加的独立编辑控件。（2026-08-17 增量：单色与色标增加「透明度」alpha 滑杆，见第 5 节；取色器/预设/HSV/HSL 仍不在范围。）
- 为不支持 `<image>` 的 CSS 属性（`border-color`、SVG fill、ECharts option）批量适配渐变渲染。
- 改变 Material/Manifest/ScreenDocument 公共契约。
- 新增依赖或 package。

## 4. 完成定义

- `tasks.md`/`checklist.md` 全勾选；测试矩阵反映当前用例。
- palette 单元测试（解析/序列化/色标增删/草稿/读值）、面板渲染测试、文本物料渐变渲染测试与 `pnpm verify:fast` 通过；baseline、usage、ADR/Spec 索引已登记。

## 5. 增量补充（2026-08-17）：颜色透明度滑杆

产品反馈驱动的轻量增量（属性面板颜色缺少透明度选择），不新增 ADR/Spec：

- 调色板每个颜色控件（单色 `solid` 与色标 `stop`）新增「透明度」滑杆（range 0..100%）。
- 值表示零变化：原生 color input 仍只承载 RGB（`#rrggbb`），透明通道以 2 位 hex 存于
  `dataset.colorPaletteAlpha`，完整色值由 `composedColorValue` 组装为 `#rrggbbaa`
  （不透明不带后缀）；序列化/解析/草稿缓存/画布与文档契约全部不变（R3 本就允许
  `#RRGGBBAA`）。单色/色标编辑、渐变预览、切换模式与派生单色色系（透明度保留）均生效。
  单色字段与单色透明度行共用 `.designer-color-palette-solid-field` 组容器，渐变模式下
  整组随既有模式隐藏规则一起隐藏（透明度滑杆不脱离单色字段单独露出），色标透明度始终可用。
- 验收：palette 单元测试新增 alpha 用例（渲染拆分、滑杆合成、色标透明度、透明 token
  保留、alpha 往返）、面板渲染计数更新，文本/形状物料颜色字段实测透明度生效；
  engine lint/typecheck/test 与 `pnpm verify:m0` 通过（2026-08-17）。

## 6. 增量补充（2026-08-18）：紧凑布局与模式间状态共享

用户反馈驱动的轻量增量（调色板纵向占用过大、渐变编辑后切回单色看到旧值），
不新增 ADR/Spec（公共契约零变化，纯 Engine 内部控件布局与交互行为）：

- **紧凑布局（行内字段）**：颜色控件由原生 swatch + 无边框 hex 输入组成；单色模式
  一行（颜色控件 + 透明度滑杆，仍共用 `.designer-color-palette-solid-field` 隐藏锚点）；
  色标编辑一行（颜色 + 行内「位置」）；色标透明度与增删按钮合并一行
  （`.designer-color-palette-stop-footer`）；
  渐变参数（角度/中心 X/Y）行内一行；移除色标编辑器卡片框。288px 右栏下渐变模式
  约 290px -> 约 200px、单色约 107px -> 约 73px。布局只消费既有 Designer Token，
  模式切换仍为 display 切换，hover 不改几何（R5 无抖动约束不变）。
- **模式间状态共享（双向）**：渐变 -> 单色切换把选中色标完整色值（含 alpha）同步
  为单色，选中索引越界回夹，`transparent`/非法色值跳过（保持原单色）；单色 ->
  渐变维持 ADR-0057 派生语义；线性 <-> 径向互切不变。同步只发生在交互切换路径，
  经既有 change 通道提交一次（恰一条历史、可 undo）；文档解析路径与 R4 草稿缓存
  不受影响。
- **可访问性与手动 hex**：颜色控件不再渲染可见「颜色」文字标签（hex 输入自明），
  改以 `aria-label` 提供语义；输入支持 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`
  与既有 `transparent` token，失焦/提交时同步 swatch、透明度和色标句柄并规范化为
  既有 CSS 色值；无效/未完成草稿标为 invalid 且不提交。hex 输入本身无边框、透明背景、
  无焦点 outline；「位置/透明度/角度/中心 X/Y」保留可见行内标签，数字输入与透明度
  滑杆补 `aria-label`；键盘输入能力不变。
- 验收：palette 单元测试新增反向共享（选中色标同步、alpha 保留、transparent
  跳过、索引回夹）、紧凑结构、aria-label 与手动 hex（alpha 同步/无效草稿）用例；
  browser harness 断言渐变编辑选中色标后切回单色的端到端共享、单色行同行几何、手动
  hex 同步及无边框/无焦点 outline；engine lint/typecheck/test 与 `pnpm verify:fast`
  通过（2026-08-18）。

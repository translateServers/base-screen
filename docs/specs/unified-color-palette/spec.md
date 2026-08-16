# Unified Color Palette Control Spec

> 状态：生效中（2026-08-16）
> 依据：[ADR-0050](../../decisions/ADR-0050-unified-color-palette-control.md)、
> [ADR-0051](../../decisions/ADR-0051-unified-color-palette-replaces-color-input.md)（全面替换 color input，取消字段级门控）

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

- 在渐变预览条上直接拖拽色标、取色器、预设、透明度、HSV/HSL 进阶面板；本 Spec 的位置滑块属于附加的独立编辑控件。
- 为不支持 `<image>` 的 CSS 属性（`border-color`、SVG fill、ECharts option）批量适配渐变渲染。
- 改变 Material/Manifest/ScreenDocument 公共契约。
- 新增依赖或 package。

## 4. 完成定义

- `tasks.md`/`checklist.md` 全勾选；测试矩阵反映当前用例。
- palette 单元测试（解析/序列化/色标增删/草稿/读值）、面板渲染测试、文本物料渐变渲染测试与 `pnpm verify:fast` 通过；baseline、usage、ADR/Spec 索引已登记。

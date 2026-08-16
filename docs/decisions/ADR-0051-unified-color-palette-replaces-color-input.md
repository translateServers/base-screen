# ADR-0051：三段式调色板全面替换 color 控件

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0050](./ADR-0050-unified-color-palette-control.md)（部分取代其决策 2 的字段级门控）

## 1. 背景

ADR-0050 引入统一三段式调色板控件时，对渐变模式施加了字段级门控：只有字段名匹配 `background|fill` 的字段开放渐变，其余字段（文字色等）渐变段禁用。实践反馈表明用户期望所有物料的颜色字段都能直接使用单色、线性渐变、径向渐变三种模式；门控的字段名启发式也无法覆盖宿主物料的多样化字段语义。

## 2. 决策

1. 三段式调色板控件全面替换所有 `control: 'color'` 的原生 `<input type="color">`（普通属性面板、stylePanel、Manifest Editor Descriptor 全部字段），三种模式无条件可用，取消字段名门控与 manifest 能力声明机制。
2. 渐变值的渲染消费由物料渲染端负责：字段值仍是字符串（色值或规范化 CSS 渐变字符串），物料的渲染实现决定如何把渐变字符串应用到元素（CSS `background` 类属性天然支持；文字类属性需要 `background-clip: text` 技巧）。
3. 官方文本物料（`base.text`）渲染端支持渐变文字：检测 `linear-gradient(`/`radial-gradient(` 前缀，设置 `color: transparent` + `background-image` + `background-clip: text`（含 `-webkit-` 前缀）；单色照旧写 `color`；切换回单色时清除三件套避免残留裁剪。
4. 其余官方物料按渲染端能力自然取舍：背景/填充类字段（fill、backgroundColor 等）写 CSS background 天然生效；SVG 图表、ECharts option 内部色与 `border-color` 等属性不接受 CSS 渐变字符串，即使字段开放渐变也不会产生预期效果——物料作者可在后续增量中按需适配（如表格文字色复用 background-clip 技巧）。
5. 控件仍保留：多色标（2..8）增删与位置编辑（所有色标共享同一条渐变滑轨，每个色标有独立手柄，并与数字输入双向同步）、线性角度、径向中心、按字段缓存三种模式草稿、失败关闭校验（乱序/越界/非法值拒绝提交）、既有 Token 样式与无抖动约束。

## 3. 非目标

- 为不支持 `<image>` 的 CSS 属性（`color`、`border-color`、SVG fill、ECharts option）在物料渲染端批量适配渐变。
- 改变 Material/Manifest/ScreenDocument 公共契约（无新增字段）。
- 新增依赖或 package。

## 4. 结果

- 所有物料的颜色字段统一为三段式调色板，模式选择不再受字段名限制。
- `base.text` 渐变文字（含大屏标题渐变字）开箱即用；其他字段由物料渲染端按其 CSS 消费方式决定效果。

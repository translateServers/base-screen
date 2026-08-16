# ADR-0055：官方物料视觉能力增量

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0050](./ADR-0050-unified-color-palette-control.md)、
> [ADR-0051](./ADR-0051-unified-color-palette-replaces-color-input.md)

## 1. 背景

官方物料是"开箱即用的大屏设计器"能力基线。功能自检（2026-08-16）确认两个定位内缺口：

1. 形状物料（矩形/椭圆）的样式能力只有 fill/border/opacity——**无圆角、无阴影**，
   大屏素材的基础视觉语言缺失；
2. ADR-0051 声明"渐变渲染消费由物料渲染端负责，官方文本物料以 background-clip: text
   支持渐变文字"，但**非文本物料**（矩形/椭圆/容器等）的 color 字段接受统一调色板输出
   的规范化 CSS 渐变字符串后，渲染端赋给 `backgroundColor` 等被 CSS 静默丢弃——"面板
   设置了没效果"。

## 2. 决策

1. **形状视觉字段**：矩形/椭圆 Material Manifest SHALL 新增样式字段：
   - `borderRadius`（number，0..512，默认 0）；
   - `shadowColor`（string，默认空 = 无阴影）、`shadowBlur`（number，0..100）、
     `shadowOffsetX`/`shadowOffsetY`（number，-100..100）。
   渲染端 SHALL 应用 `border-radius` 与 `box-shadow: <offsetX>px <offsetY>px <blur>px <color>`
   （`shadowColor` 为空或 `shadowBlur` 为 0 时不输出阴影）。椭圆保持固定 50% 圆角，
   面板不暴露 borderRadius（形状由 type 决定）。

2. **形状渐变填充**：矩形/椭圆渲染端 SHALL 在 `fill` 为规范化 CSS 渐变字符串时渲染为
   `background-image`（背景色清除），普通色值保持 `background-color`——补齐 ADR-0051
   渐变渲染责任到形状物料。

3. **容器渐变背景**：容器物料渲染端 SHALL 同样消费 `backgroundColor` 的渐变字符串
   （渲染为 background-image）。

4. **阴影渐变限制**：`shadowColor` 使用统一调色板（color 控件）时若输出渐变字符串，
   渲染端 SHALL 跳过阴影（CSS `box-shadow` 不接受 `<image>`）；此为已知限制，记录于
   Spec 非目标，不静默透传。

5. **契约边界**：以上均为 Material Manifest 自身能力扩展（styleSchema/stylePanel 字段
   经既有 schema 驱动通道自动进入属性面板）；ScreenDocument、Engine、Renderer、SDK
   公共契约零变化。旧文档零迁移（新字段全部可选、缺失按默认值渲染）。

## 3. 非目标

- 文本物料的阴影/背景（后续增量）。
- 图表/表格/ECharts 的渐变消费（数据物料背景渐变按需另立增量）。
- box-shadow 渐变、阴影多段叠加、边框样式扩展。

## 4. 结果

- 形状物料补齐圆角与阴影，渐变填充在所有消费 color 字段的官方物料（文本/形状/容器）
  上真实生效；属性面板经既有通道自动呈现新字段。
- 公共契约零变化；验收由物料渲染测试与真实 browser harness 断言覆盖。

# Official Material Visual Capabilities Spec

> 归档：2026-08-30（已完成）
> 状态：生效中
> 日期：2026-08-16
> 依据：[ADR-0055](../../../decisions/ADR-0055-official-material-visual-capabilities.md)

## 1. 目标

补齐官方形状物料的视觉能力（圆角、阴影）与渐变填充消费（形状/容器），使统一调色板
的渐变输出在官方物料中真实生效。公共契约零变化。

## 2. Requirements

### R1：形状视觉字段

矩形/椭圆 Manifest SHALL 新增样式字段：`borderRadius`（number，0..512，默认 0）、
`shadowColor`（string，默认空）、`shadowBlur`（number，0..100，默认 0）、
`shadowOffsetX`/`shadowOffsetY`（number，-100..100，默认 0）。styleSchema/stylePanel
同步声明，经既有 schema 驱动通道进入属性面板；旧文档缺失字段按默认值渲染。

### R2：形状渲染

矩形 SHALL 应用 `border-radius` 与 `box-shadow`（`shadowColor` 非空且 `shadowBlur` > 0
时）；椭圆保持固定 50% 圆角且面板不暴露 borderRadius。`fill` 为规范化 CSS 渐变字符串
（`linear-gradient(`/`radial-gradient(` 前缀）时渲染为 `background-image`（背景色清除），
普通色值保持 `background-color`。

### R3：容器渐变背景

容器物料渲染端 SHALL 消费 `backgroundColor` 的渐变字符串（渲染为 background-image），
普通色值保持 background-color。

### R4：阴影渐变限制

`shadowColor` 为渐变字符串时 SHALL 跳过阴影输出（box-shadow 不接受 `<image>`），
不静默透传非法值。

### R5：质量与验证

- 聚焦单元测试 SHALL 覆盖：manifest 字段声明、矩形圆角/阴影渲染、椭圆固定圆角与
  borderRadius 隐藏、渐变 fill 渲染路径（渐变/色值/空）、容器渐变、阴影渐变跳过。
- 真实 browser harness SHALL 验证：形状面板出现圆角/阴影字段、设置后画布样式生效、
  渐变 fill 渲染为 background-image。
- 交付前 SHALL 通过格式化、聚焦检查与 `pnpm verify:m0`。

## 3. 非目标

- 文本物料阴影/背景；图表/表格/ECharts 渐变消费；多段阴影、边框样式扩展。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵反映当前 case。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR/Spec 索引与能力基线反映当前状态。

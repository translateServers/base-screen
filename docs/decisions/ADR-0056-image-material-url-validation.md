# ADR-0056：图片物料 URL 校验与失败回退

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0040](./ADR-0040-material-manifest-cover.md)、
> [ADR-0043](./ADR-0043-canvas-background-image.md)

## 1. 背景

官方图片物料的静态数据源直接作为 `img.src` 赋值（`image.ts`），无任何有界 URL 校验：
`javascript:`/`data:`/畸形 URL 均放行，加载失败显示浏览器 broken-image 图标。同一产品内
画布背景（ADR-0040 URL 规则）与 Manifest 封面（ADR-0041）均为 fail-closed 有界校验，
图片物料作为官方素材的校验纪律不一致。功能自检（2026-08-16）将其列为定位导向功能
缺口 #6。

## 2. 决策

1. **有界 URL 校验**：图片物料渲染端 SHALL 对静态字符串数据源复用
   `isBoundedScreenImageUrl`（contracts 导出，与画布背景/封面同规则：http(s)://、
   协议相对、根相对、点相对，拒绝 data:/javascript:/blob:/file:/裸相对/控制字符）。
   非法 URL SHALL 不设置 `img.src`，显示「图片地址无效」占位（fail-closed，杜绝注入面）。

2. **加载失败回退**：`img` 的 `error` 事件 SHALL 移除失效图片并显示「图片加载失败」
   占位；重复渲染 SHALL 不残留旧图片。

3. **占位呈现**：占位文案沿用物料现有状态文案风格（同「图片加载中/图片不可用」），
   不引入图片资源或新依赖。

4. **契约边界**：Material Manifest、ScreenDocument、Engine、Renderer、SDK 公共契约
   零变化；仅图片物料渲染端行为修正。宿主资源（host-resource）数据源保持既有语义
   （数据归宿主，渲染端只对最终字符串做同一校验）。

## 3. 非目标

- 图片代理、加载重试、图片格式校验、EXIF 处理。
- 修改 URL 校验规则（与画布背景/封面同源，不另设规则）。

## 4. 结果

- 图片物料对非法 URL fail-closed（不注入、不渲染 broken-image），加载失败有明确占位
  回退；校验纪律与画布背景/封面一致。
- 公共契约零变化；验收由物料渲染测试与真实 browser harness 断言覆盖。

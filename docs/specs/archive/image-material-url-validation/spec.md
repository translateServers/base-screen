# Image Material URL Validation Spec

> 归档：2026-08-30（已完成）
> 状态：生效中
> 日期：2026-08-16
> 依据：[ADR-0056](../../../decisions/ADR-0056-image-material-url-validation.md)

## 1. 目标

图片物料对静态数据源的 URL fail-closed 校验（与画布背景/封面同规则）与加载失败占位
回退，消除注入面与 broken-image 体验。公共契约零变化。

## 2. Requirements

### R1：有界 URL 校验

图片物料渲染端 SHALL 对静态字符串数据源复用 `isBoundedScreenImageUrl`（contracts 导出）：
合法 URL（http(s)://、协议相对、根相对、点相对）才设置 `img.src`；非法（data:/
javascript:/blob:/file:/裸相对/控制字符/超限）SHALL 显示「图片地址无效」占位，不创建 img。

### R2：加载失败回退

`img` `error` 事件 SHALL 移除失效图片并显示「图片加载失败」占位；渲染重建不残留旧图片。

### R3：状态文案

占位文案沿用物料既有文案风格（加载中/不可用/未设置），不引入图片资源或新依赖；
`host-resource` 数据源对最终字符串执行同一校验。

### R4：质量与验证

- 聚焦单元测试 SHALL 覆盖：合法 URL 渲染 img、非法 URL 占位（data:/javascript:/裸相对/
  控制字符）、error 事件回退、渲染重建不残留。
- 真实 browser harness SHALL 验证：非法 URL 显示占位且无 img；加载失败回退。
- 交付前 SHALL 通过格式化、聚焦检查与 `pnpm verify:m0`。

## 3. 非目标

- 图片代理/重试/格式校验；URL 校验规则变更（与背景/封面同源）。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵反映当前 case。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR/Spec 索引与能力基线反映当前状态。

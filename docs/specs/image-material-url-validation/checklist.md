# Image Material URL Validation Checklist

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 行为（R1-R3）

- [x] 静态字符串数据源经 `isBoundedScreenImageUrl` 校验：合法才设置 img.src；
      非法显示「图片地址无效」占位且不创建 img。
- [x] img error 事件移除失效图片并显示「图片加载失败」占位；渲染重建不残留旧图片。
- [x] host-resource 数据源对最终字符串执行同一校验；占位沿用既有文案风格。

## 质量（R4）

- [x] 聚焦单测覆盖合法/非法 URL 矩阵（data:/javascript:/裸相对/控制字符）、error 回退、
      重建不残留。
- [x] 真实 browser harness 断言非法 URL 占位与加载失败回退。
- [x] `pnpm verify:m0` 通过，ADR/Spec 索引与能力基线已同步。

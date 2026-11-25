---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/engine': patch
'base-screen': minor
---

生成产物的版面硬校验（ADR-0112 S1）：

- contracts 新增 4 个诊断码 `LAYOUT_FONT_TOO_SMALL`、`LAYOUT_OUT_OF_BOUNDS`、`LAYOUT_OVERLAP`、`LAYOUT_CONTRAST_LOW`。
- core 新增纯函数 `auditScreenLayout(document, options)`：字号下限、越界（含弹框从画布）、同级部分重叠（完整包住视为有意叠放）、能静态确定背景时的对比度；可按组件子集审计，严重级别默认 `error`。
- `computeMinimumLegibleFontPx` 从 engine 下沉到 core，新增 `resolveScreenFontFloorPx`（无目标屏参数时 1920 宽 16px 等比换算）；engine 改为从 core 导入。
- 渲染探针的字号检查默认开启，与静态审计同一口径。

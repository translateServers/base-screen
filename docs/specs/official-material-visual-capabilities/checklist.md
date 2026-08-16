# Official Material Visual Capabilities Checklist

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 行为（R1-R4）

- [x] 矩形/椭圆 manifest 声明 borderRadius/shadowColor/shadowBlur/shadowOffsetX/Y，
      stylePanel 同步；旧文档缺失字段按默认渲染。
- [x] 矩形应用圆角与阴影（shadowColor 非空且 shadowBlur > 0）；椭圆固定 50% 圆角且
      面板不暴露 borderRadius。
- [x] fill 渐变字符串渲染为 background-image、色值保持 background-color；容器
      backgroundColor 渐变同规则。
- [x] shadowColor 渐变字符串时跳过阴影，不静默透传。

## 质量（R5）

- [x] 聚焦单测覆盖 manifest 字段/圆角阴影/渐变路径/容器渐变/阴影渐变跳过。
- [x] 真实 browser harness 断言面板字段与画布样式生效。
- [x] `pnpm verify:m0` 通过，ADR/Spec 索引与能力基线已同步。

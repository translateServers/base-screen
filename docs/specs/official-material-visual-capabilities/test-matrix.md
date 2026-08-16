# Official Material Visual Capabilities Test Matrix

> 状态：进行中

| 需求 | 聚焦单元测试（material） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 视觉字段 | manifest.styleSchema/stylePanel 声明断言；默认值 | 形状面板出现圆角/阴影字段 |
| R2 形状渲染 | 矩形 borderRadius/boxShadow 输出；椭圆固定 50% 且 borderRadius 不在面板；fill 渐变→background-image、色值→background-color | 设置圆角/阴影后画布样式生效；渐变 fill 渲染为 background-image |
| R3 容器渐变 | 容器 backgroundColor 渐变→background-image | 容器渐变背景渲染 |
| R4 阴影渐变限制 | shadowColor 渐变时无 box-shadow | — |
| R5 质量 | 全部聚焦测试通过 | `pnpm verify:browser` 断言通过 |

# Official Material Visual Capabilities Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0055 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R5）。
- [x] Task 2：共享渐变判定（base-material.ts 导出 `isGradientColorValue`，text.ts 复用）
      与形状 manifest 扩展（borderRadius/shadow 字段，R1）。
- [x] Task 3：形状/容器渲染：圆角、阴影、渐变 fill/background 消费、椭圆固定圆角与
      borderRadius 隐藏、阴影渐变跳过（R2-R4）。
- [x] Task 4：聚焦单元测试：manifest 字段、圆角/阴影渲染、渐变路径、容器渐变、
      阴影渐变跳过（R5）。
- [x] Task 5：真实 browser harness 断言（面板字段/画布样式生效/渐变渲染）（R5）。
- [x] Task 6：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R5）。

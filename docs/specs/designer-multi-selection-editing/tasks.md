# Designer Multi Selection Editing Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0053 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R5）。
- [x] Task 2：common 层实现批量事务构建：样式交集计算、`createMultiStyleTransaction` 与
      `createMultiGeometryTransaction`（锁定跳过、逐组件 schema 校验）（R1-R4）。
- [x] Task 3：browser 层实现批量检查器：`appendMultiSelectionControls` 扩展（几何区 +
      样式交集区）、批量控件渲染（复用 createControl / createDesignerColorPalette）、
      `createMultiSelectionTransaction` 分派与 `onPropertyChange` 分支、UI 文案（R1-R4）。
- [x] Task 4：聚焦单元测试：交集（同类型/混合/空）、锁定跳过、事务形状、焦点值显示、
      批量颜色（含渐变）提交、undo/redo 往返（R5）。
- [x] Task 5：真实 browser harness 多选批量断言（改宽度/字号/颜色生效于全部选中且恰一条
      撤销记录）（R5）。
- [x] Task 6：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R5）。

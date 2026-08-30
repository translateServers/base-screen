# Designer Variable Management Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0054 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R5）。
- [x] Task 2：common 层实现变量操作：引用收集、重名/引用校验、
      `replace-variables` 命令构建（`common/operations/designer-variable-operations.ts`，
      R2-R4）。
- [x] Task 3：browser 层实现变量面板：workspace 第三 Tab + rail-view、列表/行/新建/编辑
      DOM（`dom/designer-variables-dom.ts`）、控制器（`controllers/designer-variables-controller.ts`）、
      tab 切换接线、UI 文案与图标（R1-R4）。
- [x] Task 4：聚焦单元测试：引用收集（参数/蓝图动作/蓝图表达式）、删除/重命名被引用
      变量拒绝、重名拒绝、命令形状、undo/redo 往返（R5）。
- [x] Task 5：真实 browser harness 变量管理断言（Tab 渲染/新建/编辑/删除一条撤销/host
      只读/绑定下拉联动）（R5）。
- [x] Task 6：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R5）。

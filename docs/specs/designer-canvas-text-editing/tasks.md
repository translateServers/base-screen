# Designer Canvas Text Editing Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0052 与 Spec 四件套，登记 ADR/Spec 索引与能力基线（R1-R5）。
- [x] Task 2：common 层实现 `isTextEditable` 与文本编辑命令构建
      （`common/operations/designer-text-edit-operations.ts`，R1、R3）。
- [x] Task 3：browser 层实现编辑会话：overlay DOM（`dom/designer-text-edit-dom.ts`）、
      会话控制器（`controllers/designer-text-edit-controller.ts`）、双击分支与指针抑制
      （`designer-gesture-controller.ts`）、UI 文案（`designer-ui-text.ts`）（R1-R4）。
- [x] Task 4：聚焦单元测试：判定矩阵、命令构建、会话状态机、历史恰一条、undo/redo 往返、
      IME 放行、overlay 样式复制（R5）。
- [x] Task 5：真实 browser harness 双击编辑断言（进入编辑/Enter 提交/Esc 取消）（R5）。
- [x] Task 6：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R5）。
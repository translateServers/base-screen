# Designer Canvas Text Editing Checklist

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 行为（R1-R4）

- [x] 双击可编辑文本组件进入编辑会话；双击不可编辑组件（host-resource/非文本/无数据）不进入。
- [x] 进入编辑时全选文本，overlay 视觉与物料一致（字号/颜色/行高/对齐/字距/渐变）。
- [x] 编辑期间物料本体隐藏（缺陷修复，2026-08-16）：透明 overlay 下旧文本不透出，
      新旧文本不重叠；提交/取消后恢复可见。
- [x] Enter 提交、Shift+Enter 换行、Escape 取消（零副作用）、失焦提交。
- [x] 提交后画布文本更新，恰产生一条历史记录；undo/redo 往返正确。
- [x] 编辑会话期间画布拖拽/选择/变换被抑制；「事件」开关不干扰编辑层。
- [x] IME 组合输入与原生 Ctrl+Z/C/V 在编辑层内正常工作，不触发设计器命令。

## 质量（R5）

- [x] common 层判定与命令构建有聚焦单测（static 字符串/static 非字符串/host-resource/null/
      非文本类型矩阵）。
- [x] 会话状态机有聚焦单测（进入/提交/取消/失焦/历史恰一条）。
- [x] 真实 browser harness 断言双击进入编辑、Enter 提交后画布文本更新、Esc 取消零变化。
- [x] `pnpm verify:m0` 通过，ADR/Spec 索引与能力基线已同步。
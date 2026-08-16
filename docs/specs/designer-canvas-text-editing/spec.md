# Designer Canvas Text Editing Spec

> 状态：生效中
> 日期：2026-08-16
> 依据：[ADR-0052](../../decisions/ADR-0052-designer-canvas-text-editing.md)

## 1. 目标

补齐画布类工具的作者体验基线：画布内双击文本组件直接编辑文本，Enter 提交、Esc 取消，
全部走既有命令/历史通道。公共契约零变化。

## 2. Requirements

### R1：编辑入口与可编辑判定

Designer SHALL 在画布内双击命中组件时，先走既有组编辑分支；未进入组编辑且组件可编辑时，
SHALL 进入文本编辑会话。组件可编辑当且仅当：类型为官方文本物料（`base.text`）且
`dataSource.type === 'static'` 且值为字符串（fail-closed）。`host-resource`/`null`/其他类型/
非官方物料 SHALL NOT 进入编辑。判定逻辑位于 engine common 层（`isTextEditable`），可单测。

### R2：编辑层（overlay）

Designer SHALL 在画布内创建 contenteditable overlay 覆盖物料元素 rect，视觉复制物料样式
（fontSize/color/lineHeight/textAlign/verticalAlign/letterSpacing/渐变 backgroundImage），
编辑内容 SHALL 以 WYSIWYG 呈现。overlay 为 canvas 子节点，随缩放/平移自动跟随；SHALL NOT
侵入物料元素或 Renderer 内部 DOM。编辑会话期间画布拖拽/选择/变换被抑制；视窗原生事件开关
（ADR-0036）对编辑层不产生作用。

### R3：交互语义

- 进入编辑时全选文本；再次点击可定位光标。
- Enter 提交编辑；Shift+Enter 插入换行（多行文本按既有 pre-wrap 渲染）。
- Escape 取消，零副作用、不产生历史记录。
- 失焦提交。
- 提交 SHALL 复用既有 `update-components` 命令（patch `dataSource`，值为字符串），恰产生
  一条历史记录；undo/redo 与事务回滚沿用既有语义。

### R4：键盘与 IME

overlay 为 contenteditable，经既有 `isEditableTarget` 通道放行：IME 组合、删除键、原生
Ctrl+Z/C/V 不路由设计器命令；事件策略零改动。

### R5：质量与验证

- 聚焦单元测试 SHALL 覆盖：可编辑判定矩阵（static 字符串/static 非字符串/host-resource/null/
  非文本类型）、命令构建、编辑会话状态机（进入/提交/取消/失焦）、历史记录恰好一条、
  undo/redo 往返、IME 放行（isEditableTarget）、overlay 样式复制。
- 真实 browser harness SHALL 验证双击进入编辑、输入并 Enter 提交后画布文本更新、Esc 取消
  零变化。
- 交付前 SHALL 通过格式化、相关 engine 聚焦检查与 `pnpm verify:m0`。

## 3. 非目标

- 富文本、行内样式；自动扩宽组件尺寸。
- 非文本物料（props 内文本字段）的画布内编辑。
- `host-resource` 数据源文本编辑（数据归宿主）。
- 修改文本物料渲染、数据 Tab 编辑路径、宿主作者桥或任何公共契约。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵反映当前 case。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR/Spec 索引与能力基线反映当前状态。

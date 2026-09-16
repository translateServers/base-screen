# ADR-0052：Designer 画布内文本直接编辑

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0079](./ADR-0079-designer-workbench-shell-and-chrome.md)

## 1. 背景

ADR-0027 明确定位 Base Screen 是轻量、可嵌入、跨框架的大屏设计器基座，并强调"轻量"约束的是
职责、依赖和运行时所有权，**不降低本地作者体验的正确性要求**——高质量的文档编辑与画布交互是
基座自己的核心资产。

当前画布内双击文本组件没有任何编辑行为（`gesture-controller.onDoubleClick` 只处理"进入组编辑"
分支与参考线删除兜底）；修改文本的唯一路径是：选中组件 → 数据 Tab → 静态数据 → 在 JSON
文本域中编辑字符串。这是宿主用户修改一个标题的最常见场景，却需要三次点击进入 JSON 编辑器。
画布类工具"双击直接改文字"的作者体验基线在基座中缺失。

功能自检（2026-08-16）将"画布内文本直接编辑缺失"列为定位导向功能缺口 #1。

## 2. 决策

1. **编辑入口**：画布内双击命中可编辑文本组件时，SHALL 进入文本编辑会话。现有双击链路
   （`designer-surface-router` → `gesture-controller.onDoubleClick`）在组编辑分支之后新增
   文本编辑分支；组编辑语义不变。

2. **可编辑判定**（fail-closed）：组件 SHALL 仅在同时满足以下条件时可编辑：
   - 组件类型为官方文本物料（`base.text`），且
   - `dataSource.type === 'static'` 且值为字符串。
   `host-resource` 数据驱动文本、`null`、其他类型与非官方物料 SHALL NOT 进入编辑（数据归宿主，
   边界见 ADR-0027）。判定逻辑位于 common 层（`isTextEditable`），可单测。

3. **编辑层形态**：Designer SHALL 在画布内创建自有的 contenteditable overlay，覆盖物料元素
   rect，视觉复制物料样式（fontSize/color/lineHeight/textAlign/verticalAlign/letterSpacing/
   渐变 backgroundImage），保证 WYSIWYG。overlay 是 canvas 子节点，随画布缩放/平移自动跟随。
   Designer SHALL NOT 侵入物料元素或 Renderer 内部 DOM——物料重渲染（数据刷新等）不打断编辑
   会话。

4. **交互语义**：
   - 进入编辑时全选文本（再次点击可定位光标）；
   - Enter 提交编辑，Shift+Enter 插入换行；
   - Escape 取消，零副作用、不产生历史记录；
   - 失焦提交；
   - 编辑会话期间画布拖拽/选择/变换被抑制（overlay 独占指针）。

5. **提交通道**：提交 SHALL 复用既有 `update-components` 命令（patch `dataSource`，值仍为
   字符串），经既有事务通道执行——恰产生一条历史记录，undo/redo 与事务回滚免费获得。
   Core/Contracts 零改动。

6. **键盘与 IME**：overlay 为 contenteditable，经既有 `isEditableTarget` 判定进入事件策略的
   "可编辑目标"分支——IME 组合、删除键、原生 Ctrl+Z/C/V 自动放行、不路由命令；事件系统零改动
   （该通道为系统既有设计，见 `designer-event-policy.ts`）。

7. **公共契约**：ScreenDocument、Material Manifest、Renderer、Viewer、SDK 导出与既有
   data-* 契约 SHALL 零变化。UI 文案（如有）走既有 `designer-ui-text.ts`。

## 3. 非目标

- 富文本、行内样式编辑；自动扩宽组件尺寸（保持组件尺寸，whiteSpace: pre-wrap 换行）。
- 非文本物料（props 内文本字段）的画布内编辑。
- `host-resource` 数据源文本的编辑（数据归宿主）。
- 改变文本物料渲染、数据 Tab 编辑路径或宿主作者桥。

## 4. 结果

- 双击文本组件即改、Enter 提交、Esc 取消，全部走既有命令/历史通道；作者体验补上画布类工具
  基线操作，公共契约零变化。
- 验收由聚焦单元测试（common 判定与命令构建、browser 会话状态机）与真实 browser harness
  双击编辑断言覆盖。

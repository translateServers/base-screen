# Designer Canvas Text Editing Test Matrix

> 状态：已完成（归档前验收已闭环）

| 需求 | 聚焦单元测试（engine） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 入口与判定 | ✅ `isTextEditable` 判定矩阵：static 字符串 ✓ / static 非字符串 ✗ / host-resource ✗ / null ✗ / 非 base.text ✗；双击分派顺序（组编辑优先、文本编辑次之，gesture 用例） | ✅ 双击文本组件进入编辑；双击 ECharts/宿主数据集文本不进入 |
| R2 编辑层 | ✅ overlay 创建/销毁、样式复制路径、定位跟随（controller 用例） | ✅ 编辑中缩放/平移后 overlay 仍对齐物料 |
| R3 交互语义 | ✅ 会话状态机：enter 全选 / commit 命令形状（patch dataSource 字符串）/ cancel 零副作用 / blur 提交；历史恰一条；undo/redo 往返 | ✅ 输入并 Enter 提交后画布文本更新且撤销恢复旧文本；Esc 取消零变化 |
| R4 键盘与 IME | ✅ `isEditableTarget(contenteditable)` 通道复用（事件策略既有行为） | ✅ 中文 IME 输入正常；编辑层内 Ctrl+Z 只做编辑器内撤销 |
| R5 质量 | ✅ 全部聚焦测试通过（15 用例：判定/命令/会话） | ✅ `pnpm verify:browser` 双击编辑断言通过（含 Enter 提交/撤销恢复/Esc 取消） |

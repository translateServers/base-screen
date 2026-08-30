# Designer Variable Management Test Matrix

> 状态：已完成（归档前验收已闭环）

| 需求 | 聚焦单元测试（engine） | 浏览器 harness 验证 |
| --- | --- | --- |
| R1 入口与列表 | 面板渲染（Tab/行/徽标/空态） | 变量 Tab 渲染 harness 既有变量（host-resource 参数引用的变量） |
| R2 静态变量管理 | 新建/重命名/编辑/删除命令形状；非法 JSON/重名拒绝；恰一条历史；undo/redo | 新建静态变量并用于绑定下拉后生效；删除为一条撤销记录 |
| R3 host 只读 | host 变量无变更入口 | host 变量行只读展示 variableId |
| R4 引用保护 | 引用收集矩阵（组件参数/蓝图 set-variable/蓝图表达式）；删除/重命名被引用变量拒绝 | 删除被数据绑定引用的变量被拒绝并提示 |
| R5 质量 | 全部聚焦测试通过 | `pnpm verify:browser` 变量管理断言通过 |

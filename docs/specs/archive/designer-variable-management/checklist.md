# Designer Variable Management Checklist

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 行为（R1-R4）

- [x] 左侧面板「变量」Tab 与「物料」「图层」并列；列表展示名称/类型徽标/static 值摘要/
      host variableId；空列表显示空态。
- [x] 静态变量可新建/重命名/编辑值/删除；非法 JSON、非法名称、重名被拒绝且不产生事务。
- [x] 变更恰产生一条历史记录；undo/redo 往返正确。
- [x] host 变量只读（无新建/编辑/删除入口）。
- [x] 删除/重命名被引用变量（数据绑定参数/蓝图 set-variable/蓝图表达式）被拒绝并诊断。

## 质量（R5）

- [x] common 层有聚焦单测：引用收集矩阵、重名/引用拒绝、命令形状。
- [x] 真实 browser harness 断言 Tab 渲染、新建/编辑/删除一条撤销、host 只读、绑定下拉联动。
- [x] `pnpm verify:m0` 通过，ADR/Spec 索引与能力基线已同步。

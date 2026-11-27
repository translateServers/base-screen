---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 意图层能生成行为：联动与阈值状态（ADR-0115）。

- IR：块与指标卡可带 `key`（联动引用的句柄）；根上的 `interactions` 不再是预留键，支持两种模板——`filter`（来源事件的值写进目标块数据集的查询参数）与 `show`（来源事件显示 / 隐藏 / 切换目标块）；绑了数据集字段的指标卡可带 `states`（阈值规则，`suggested` 标记模型补的阈值）。变量与蓝图由编译器推出，模型不写。
- 编译：`compileScreenIntent` 编出静态变量、目标实例参数改为引用变量、蓝图节点与连线、组件状态（按结果第一行判定，命中时文字色换成语义色位）；`show` 模式的目标初始隐藏。新增 `capabilities` 入参：给了已授权的蓝图能力表时，缺能力的联动不编译并记 `AGENT_INTERACTION_CAPABILITY_MISSING`。编译结果新增 `behaviors` 摘要。
- 采纳前模拟（静态）：用画像样本里该字段出现过的取值判断「点了之后参数会不会变」，不会变或取值不合法记 `AGENT_INTERACTION_NO_EFFECT` 进修复回环；来源 / 目标 / 事件 / 字段不成立的诊断同样进修复（`BEHAVIOR_REPAIRABLE`）。目标数据集的必填参数没有默认值时，从来源样本的第一个合法取值起步（`INTENT_FILTER_INITIAL_FROM_SOURCE`）。
- 数据上下文：数据集引用新增 `values`（样本里各字段出现过的取值，只留在宿主里）；`validateIntentData` 对参数引用静态变量的实例按变量初值验证。
- 多轮：`editIntent` 支持 `link` / `unlink` 操作与指标卡的 `states` 修改；删除块时连带去掉以它为来源的联动。联动变化只换智能体生成的那部分变量（`agent-var-*`）与连线（`agent:*` 节点、`agent-edge-*` 连线），用户自己连的不动；命令按「变量扩成并集 → 数据源 → 组件 → 变量收拢 → 蓝图」排序。基线新增可选的 `variables` / `blueprint`。`describeSession` 带出句柄与当前联动。
- 官方物料的编辑器描述符补上事件负载声明（`payloadSchema`）：表格与滚动表 `rowClick`、表格 `cellClick`、图表 `pointClick`、页签 `tabChange`、翻牌器与水位图 `valueClick`。

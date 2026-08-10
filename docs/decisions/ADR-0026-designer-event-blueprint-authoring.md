# ADR-0026：Designer 事件 Blueprint 表单作者闭环（图形路径延后）

> 状态：已接受
> 日期：2026-08-10
> 关联：[ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md)
> 规格：[Designer Event Blueprint](../specs/designer-event-blueprint/spec.md)
> 计划：[实施计划](../plans/designer-event-blueprint/implementation-plan.md)
> 评估：[候选评估报告](../plans/designer-event-blueprint/dependency-evaluation.md)

## 1. 背景

Designer Full Product 的 Task 5 需要把现有 Blueprint 表单与按钮式图形投影收敛为完整作者闭环。2026-08-10
完成的仓库外候选评估（同一私有 GraphAdapter、同一 fixture、同一 Chromium case，证据见评估报告）结论：

- X6 栈（`@antv/x6@2.19.2` + selection/minimap 插件）17/17 case 通过，但实际消费者 gzip 增量约 135.4 KiB，
  超出 ADR-0019 流程的 40 KiB 默认预算约 3.4 倍；且 3.x 插件线发布损坏、v2 MiniMap click-to-locate 为死代码。
- Rete（`rete@2.0.6` + area/connection）在 Base Screen 自有 DOM/SVG renderer 下技术上可行（纠正 spike 17/17
  case、gzip 增量约 19.1 KiB），但 `rete@2.0.6` 声明 postinstall 违反硬门禁，且相对零依赖原生方案无新增能力。
- 原生 DOM/SVG 与原生加 Dagre 布局通过全部已测硬门禁，但完整图形交互内核自研周期最长。

用户决策（2026-08-10）：**图形路径整体延后**。本期不实现图形界面，也不向宿主转嫁图形契约；现有按钮式投影
移除，键盘表单为唯一作者路径。

## 2. 决策

1. **Canonical shape 不变。** Blueprint 继续只有 `material-event` trigger、至多一个紧随 trigger 的 condition 和
   有序 `set-variable`、`emit-host-event`、`host-action` actions。不增加 delay、comment、layout、兼容字段、
   执行脚本或新的 action 入口；`host-action.actionId` 保持只读。
2. **Core 提供只读 trace。** `@base-screen/core` 新增 `traceScreenBlueprintEvent(plan, state, event)`，与
   `dispatchScreenBlueprintEvent` 共用同一无宿主求值内核。Trace 只返回 detached JSON 与诊断，不接受或调用宿主
   端口；现有 dispatch 输出与 trace 内嵌的 dispatch 输出逐字段等价。
3. **图形路径整体延后。** 本期不实现图形 UI、GraphAdapter、MiniMap、框选、缩放/平移或连接语义；不引入任何
   图库；现有按钮式投影移除，表单为唯一作者视图。ADR-0018 的图形 session 边界（位置/路由/视口/选区/MiniMap/
   搜索只属于 Engine session）对未来仍有效。若未来恢复图形需求，须重新执行 ADR-0019 评估并以新 ADR 批准；
   2026-08-10 spike 证据作为参考归档。
4. **表单作者闭环为本期范围。** 实例级 draft；“应用”校验后通过一次 `replace-blueprint` command 提交并只产生
   一个 history entry；“取消”、节点/视图切换、关闭均遵循未保存保护。模板固定为“空事件规则”“转发事件”和
   能力可用时的“写入变量”。`host-action` 只读 `actionId`，仅支持 payload 编辑、删除与在原规则内重排。诊断
   fail closed；搜索高亮定位不删除条目；模拟结果只保存在实例内存，不调用端口、不写 history、不进入日志或遥测。
5. **依赖预算。** 本期新增外部生产依赖为零，不修改 `scripts/check-boundaries.mjs` 白名单；结构化 JSON 编辑槽位
   维持现状（未引入）。

## 3. 排除方案

- 本期引入 X6 并放宽体积预算：拒绝（图形已延后，预算修订无收益）。
- 向宿主暴露图形作者桥接契约：拒绝（新增公共 API 与维护面，与“Engine 不新增公共导出”冲突；宿主可在未来
  图形恢复时自行决定实现方式）。
- Rete 自有 renderer：拒绝（postinstall 硬门禁 + 相对原生无增益，详见评估报告）。

## 4. 后果与回退

- Core、Contracts、JSON Schema、序列化和既有 runtime dispatch 语义保持单一事实来源；Core trace 是新增的只读
  公共能力。
- 图形路径延后不影响 canonical 契约；未来恢复时 document 无需迁移。
- 若未来需要图形，以 2026-08-10 评估报告为基线重新执行 ADR-0019 评估；移除路径为删除私有 adapter 与依赖
  delta，document 不迁移。

## 5. 确认记录

2026-08-10 用户明确选择“A：图形整体延后”，即表单闭环 + Core trace 为本期范围，零新增依赖；本 ADR 自即日
接受，专项 Spec 同步生效。

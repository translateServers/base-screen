# Designer 事件 Blueprint 任务

> 状态：实施中（图形路径延后）
> 依据：[spec.md](./spec.md)、[ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 计划：[implementation-plan.md](../../plans/designer-event-blueprint/implementation-plan.md)

- [x] Task 1：完成候选评估并归档（R8、R9）。
  - [x] 使用同一私有 Graph Adapter、同一 fixture 和同一浏览器 case 比较 X6、Rete、原生 DOM/SVG 与 Dagre；证据见 [候选评估报告](../../plans/designer-event-blueprint/dependency-evaluation.md)。
  - [x] 记录评估当天的精确版本、许可证、安装脚本、传递依赖、漏洞、维护状态、消费者 minified+gzip 增量、启动/交互性能、Shadow DOM、双实例与清理证据。
  - [x] 逐项判定 ADR-0019 硬门禁并给出失败项与移除路径：X6 因 gzip 预算超限拒绝；Rete 自有 DOM/SVG renderer 技术可行但因 postinstall 硬门禁与无实质收益拒绝；Dagre 仅布局可选。
  - [x] 2026-08-10 用户决策：图形整体延后，本期零依赖，表单闭环 + Core trace（ADR-0026 已接受）。

- [ ] Task 2：实现 Core trace 与等价求值内核（R7、R9）。
  - [ ] 新增只读 trace 公共类型与 `traceScreenBlueprintEvent`，不改变 Contracts、schema、序列化或 dispatch 输入输出。
  - [ ] 让 dispatch 与 trace 共用同一纯内核，记录逐规则 condition 状态、逐动作 index/output/detached JSON，并提供规则/动作定位诊断。
  - [ ] 覆盖真假条件、多规则顺序、规则原子变量、三类动作、错误路径、JSON detached/budget 和零宿主调用。

- [ ] Task 3：收敛纯 authoring operations（R7、R9）。
  - [ ] 补齐 host-action 的 payload 编辑、删除与原规则内重排；`actionId` 只读且无新增入口；capability 推导/prune 正确。
  - [ ] 三个固定模板（空事件规则/转发事件/写入变量）只生成 canonical rule。
  - [ ] 结构变化统一走 compile-then-`replace-blueprint` 的单 history entry；失败时保持 document/history 不变。

- [ ] Task 4：完成表单、draft、诊断、搜索与模拟产品闭环（R7、R9）。
  - [ ] 表单完整编辑 trigger、condition、三类 action 与递归 value expression；应用/取消与未保存 draft 保护完整。
  - [ ] 问题面板定位、能力撤销、组件/事件失效、无效 payload、host-action 限制与中文可访问反馈。
  - [ ] 搜索高亮与定位、模拟预算与逐规则 trace、内存日志隔离。

- [ ] Task 5：完成质量门与 Full Product 回链（R7、R8、R9）。
  - [ ] 完成 unit、DOM、完整 pointer/keyboard Chromium、视觉与可访问性、容量、双实例和清理矩阵。
  - [ ] 完成 Engine/Core focused lint、typecheck、test、build，browser、API、boundary、license、consumer bundle、tarball 与 `pnpm verify:m0`。
  - [ ] 以当前自动化证据更新本 Spec 三件套、Full Product Task 5、R7/R9 矩阵和依赖记录，再勾选所有适用项。

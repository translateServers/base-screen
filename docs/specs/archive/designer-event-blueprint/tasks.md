# Designer 事件 Blueprint 任务

> 状态：实施中（宿主作者桥范围，图形路径归宿主）
> 依据：[spec.md](./spec.md)、[ADR-0026](../../../decisions/ADR-0026-designer-event-blueprint-authoring.md)、[ADR-0028](../../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 计划：[implementation-plan.md](../../../plans/archive/designer-event-blueprint/implementation-plan.md)
> 作者扩展：[Designer Authoring Extension](../designer-authoring-extension/spec.md)（负责宿主桥、提交入口与 harness 的实现与验收）

- [x] Task 1：完成候选评估并归档（R8、R9）。
  - [x] 使用同一私有 Graph Adapter、同一 fixture 和同一浏览器 case 比较 X6、Rete、原生 DOM/SVG 与 Dagre；证据见 [候选评估报告](../../../plans/archive/designer-event-blueprint/dependency-evaluation.md)。
  - [x] 记录评估当天的精确版本、许可证、安装脚本、传递依赖、漏洞、维护状态、消费者 minified+gzip 增量、启动/交互性能、Shadow DOM、双实例与清理证据。
  - [x] 逐项判定 ADR-0019 硬门禁并给出失败项与移除路径：X6 因 gzip 预算超限拒绝；Rete 自有 DOM/SVG renderer 技术可行但因 postinstall 硬门禁与无实质收益拒绝；Dagre 仅布局可选。
  - [x] 2026-08-10 用户决策：图形整体延后，本期零依赖，表单闭环 + Core trace（ADR-0026 已接受）；2026-08-10 ADR-0028 将 Engine 内部表单作者 UI 范围移交宿主作者桥。

- [x] Task 2：实现 Core trace 与等价求值内核（R7、R9）。
  - [x] 新增只读 trace 公共类型与 `traceScreenBlueprintEvent`，不改变 Contracts、schema、序列化或 dispatch 输入输出。
  - [x] 让 dispatch 与 trace 共用同一纯内核，记录逐规则 condition 状态、逐动作 index/output/detached JSON，并提供规则/动作定位诊断。
  - [x] 覆盖真假条件、多规则顺序、规则原子变量、三类动作、错误路径、JSON detached/budget 和零宿主调用。

- [x] Task 3：收敛内部事件面板为摘要、能力状态与宿主请求入口（R7、R9）。
  - [x] 移除 Engine 内部表单/图形作者工作流（draft、模板、搜索、模拟、host-action 表单），事件面板只呈现逐事件规则计数、能力状态与 JSON-safe 宿主作者请求入口。
  - [x] 作者请求携带 requestId、expected revision、component identity 与 blueprint 快照；组件切换、取消、关闭、reload、document replacement 与 dispose 后的过期提交 fail closed。
  - [x] 宿主只提交 canonical Blueprint；结构变化统一走 compile-then-`replace-blueprint` 的单 history entry；失败时保持 document/history 不变。

- [x] Task 4：完成宿主作者桥质量门与轻量基座范围回链（R7、R8、R9）。
  - [x] 完成 unit、DOM、完整 pointer/keyboard Chromium、视觉与可访问性、容量、双实例和清理矩阵（宿主桥部分见作者扩展 Spec 矩阵）。
  - [x] 完成 Engine/Core focused lint、typecheck、test、build，browser、API、boundary、license、consumer bundle、tarball 与 `pnpm verify:m0`。
  - [x] 以当前自动化证据更新本 Spec 三件套、R7/R9 矩阵和依赖记录，再勾选所有适用项。

# 范围说明

- 本 Spec 只负责 canonical Blueprint、Core 三件套、事件面板摘要/能力状态/请求入口与提交守护；宿主表单/图形
  Blueprint 编辑器的实现与验收由 [Designer Authoring Extension](../designer-authoring-extension/spec.md) 承载。
- 图形路径（GraphAdapter、MiniMap、框选、缩放/平移、连接语义）不进入 Base Screen 验收范围。

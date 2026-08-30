# Designer Blueprint Workbench Tasks

> 状态：实施与验证完成

- [x] Task 1：接受 ADR-0063，建立跨仓库 Spec 与边界/回滚说明（R1-R9）。
- [x] Task 2：实现常驻顶部栏、模式 API、页签/搜索/主题/快照与响应式局部栏（R1、R2）。
- [x] Task 3：实现 Base-owned Blueprint library/inspector、纯图投影和共享 Core 历史（R3、R4）。
- [x] Task 4：实现冻结状态、严格 command parser、generation/revision guard 与幂等（R5、R6）。
- [x] Task 5：实现 slot 生命周期、fallback、选择/视口连续性与激活重测量请求（R6、R7）。
- [x] Task 6：移除 Blueprint detached authoring，更新 Contracts/Engine/SDK/API 消费（R8）。
- [x] Task 7：迁移 XJ 为纯 Vue Flow slot consumer，并同步 vendor tarball（R4、R7、R9）。
- [x] Task 8：完成两仓完整门禁与 Playwright 双视口/无障碍验收（R1-R9）。
- [x] Task 9：修复文档载入前 `ready` 握手误判，补齐左右面板页签、空态、诊断和运行轨迹 UI 闭环。
- [x] Task 10：按 DataV 节点库/属性区骨架重构两侧 UI；组件只进入左侧节点库，点击加号或拖拽后才写入 `blueprint.layout` 并出现在中央画布。
- [x] Task 11：将 ADR-0062 宿主 `rail-tabs` 扩展为 Canvas/Blueprint 模式感知投影，跨模式复用同一 slot，并完成 Base/XJ 回归验证。
- [x] Task 12：移除逻辑/变量节点的规则上下文门禁，使所有节点可直接添加；实现未连接节点投影、通用端口连线、原子规则转换与跨仓库回归。

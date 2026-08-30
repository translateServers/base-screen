# Designer Blueprint Workbench Spec

> 归档：2026-08-30（已完成）
> 状态：实施与验证完成
> 日期：2026-08-29
> 依据：[ADR-0063](../../../decisions/ADR-0063-designer-blueprint-workbench-shell.md)
> 联合消费者：XJ Data Hub `.agent/specs/base-screen-blueprint-workbench-integration/`

## 1. 目标

将顶部栏改为 Canvas/Blueprint 共用的常驻工作台壳层，并把 Blueprint 从 detached 草稿作者路径改为当前
`ScreenDocument` 的共享编辑态。Base Screen 承担语义编辑和状态机，宿主中央 slot 只承担图形渲染与手势。

## 2. Requirements

### R1：常驻全局工具栏

Designer SHALL 使用固定 48px 全局栏承载品牌、项目与保存状态、模式页签、模式感知搜索、面板、问题、主题、
快照、更多、预览、保存和发布。Canvas 与 Blueprint SHALL 各有相同高度局部栏，模式切换不得改变工作区几何。

### R2：公开模式 API

Engine 与 SDK SHALL 导出 `BaseScreenDesignerWorkbenchMode`、`workbenchMode`、`setWorkbenchMode` 和可选
`initialWorkbenchMode`；变化事件 SHALL 包含 previous/mode 与 `user | api | fallback` reason。页签 SHALL
支持键盘、`aria-selected`、可见焦点和至少 32px 点击区域。

### R3：共享文档、历史与项目状态

连接、删除、条件/动作修改和 layout SHALL 经 Core 命令直接写入当前文档。一次完成操作 SHALL 只形成一个
`DesignerSession` 历史项；预览读取当前内存文档，保存清除脏状态，发布继续受已保存门禁约束。不得存在
Blueprint apply/cancel/draft history。组件、条件、动作和变量动作 SHALL 均可在没有规则选择时直接添加；未连接
逻辑节点 SHALL 作为受控 `blueprint.layout.nodes` 成员进入共享历史，端口连接成功时再原子转换为规则节点。

### R4：工作台壳层边界

Base Screen SHALL 渲染 Blueprint 节点库、声明式检查器、诊断和 trace，并拥有语义图投影、规则构造、能力归一化
和 canonical mutation。宿主 slot SHALL 只渲染图形、局部手势、MiniMap、缩放、Dagre 布局和模拟触发入口。
Base Screen SHALL NOT 增加 Vue Flow、Dagre、网络、持久化或后台任务依赖。

### R5：严格 slot 协议

固定 slot SHALL 为 `base-screen-designer-blueprint-canvas`。状态事件 SHALL 提供冻结、JSON-safe、有界的
generation、document revision、active、图投影、选择、诊断、trace、view request 和最近命令结果。命令 SHALL
为严格区分联合，覆盖 ready、select、通用 node/handle connect、delete、无规则上下文 insert、layout、viewport、
undo、redo 和 simulation。

### R6：失败关闭与幂等

解析 SHALL 拒绝未知字段、越界坐标/zoom/payload、stale generation/revision 和重复 command id，且失败零副作用、
重新下发权威状态。slot 缺失 SHALL 禁用页签；活动 slot 移除 SHALL 原子回退 Canvas 并产生诊断。

### R7：挂载、选择与视口连续性

Canvas 与 Blueprint 中央宿主 SHALL 保持挂载，以 active 暂停非活动交互；恢复 Blueprint 时 SHALL 触发重新测量。
模式切换 SHALL 保留两边选择和视口。拖动/缩放/自动布局 SHALL 只在手势结束时提交，不得逐帧写文档。

### R8：移除旧 Blueprint authoring

Contracts SHALL 移除 `ScreenAuthoringRequest` 的 Blueprint 分支、edit/commit options 与 pending 协议；Engine SHALL
移除 request/commit 方法与 generation 管理；SDK/API 报告 SHALL 同步。组件文本 authoring request 保持不变。

### R9：交付和回滚

Base Screen 与 XJ 消费者 SHALL 在同一交付窗口升级或回滚。不得修改 ScreenDocument schema golden、数据库或
存量文档；现有 `blueprint.layout` 继续作为唯一持久化布局结构。

### R10：模式感知的宿主 rail-tabs

ADR-0062 `leftPanelGroups` SHALL 以可选 `workbenchModes` 声明 Canvas、Blueprint 或双模式可见性；省略 SHALL
保持 Canvas-only 兼容行为。Blueprint 宿主 Tab SHALL 与组件/逻辑/变量内建 Tab 共用视觉、焦点和方向键语义。
Canvas 与 Blueprint SHALL 分别保留选中 Tab；同一分组跨模式 SHALL 只存在一份命名 slot/tabpanel，切换模式
不得重新挂载宿主 light DOM。动态删除 SHALL 在当前模式回退内建首项并发出权威 group-change。

## 3. 非目标

- Blueprint 语义节点分组、过滤器、模板、复制粘贴、多选和新增 Blueprint 语义。
- Base Screen 内引入图形框架、宿主路由、鉴权、存储、发布基础设施或业务服务对象。
- 修改 canonical Blueprint 或为旧 detached API 增加兼容版本。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的适用项完成，公共 API、文档和 XJ vendor 同步。
- 聚焦测试、XJ build、Playwright 双视口验收和 `pnpm verify:m0` 通过。
- 两仓 diff 只包含本规格范围，且原子升级/回滚说明可执行。

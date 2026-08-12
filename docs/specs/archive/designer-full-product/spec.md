# Designer Full Product 规格

> 状态：已归档（未完成范围被 ADR-0027 取代）
> 最近更新：2026-08-10
> 定位：完整大屏设计器产品范围的历史实施快照，不再授权新实现
> 前置：[Designer Product Completion](../designer-product-completion/spec.md)、[Designer Engine](../designer-engine/spec.md)、[ADR-0017](../../../decisions/ADR-0017-designer-product-host-boundaries.md)、[ADR-0018](../../../decisions/ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](../../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0023](../../../decisions/ADR-0023-host-dataset-resource-integration.md)、[ADR-0026](../../../decisions/ADR-0026-designer-event-blueprint-authoring.md)
> 后继：[ADR-0027：轻量设计器基座与宿主重型处理边界](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0028：宿主作者桥与 Material Editor Descriptor](../../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 研究来源：[Nebula Designer Core](../../../provenance/nebula-designer-core.md)

本目录按 2026-08-10 的任务勾选状态归档。未完成项不得继续实施；仍符合轻量基座边界的独立 Spec 继续以各自
三件套为唯一实施和验收依据。

## 宿主归属范围说明（2026-08-10，ADR-0028）

- **ECharts（及其它复杂图表）的完整 option 编辑器、代码编辑器（Monaco/CodeMirror 类）、Blueprint 图形编辑器
  与领域专用配置编辑器均属宿主集成能力**，由宿主通过公开作者桥（Custom Element method/event + `@base-screen/*`
  exports）实现，只提交 canonical candidate；Base Screen 默认 bundle 不包含这些编辑器及其依赖。
- 官方 ECharts 物料的受限语义面板试点（标题/图例/网格/坐标轴/series/字段绑定/颜色/基础交互）由
  [Designer Authoring Extension](../designer-authoring-extension/spec.md) 授权实施。
- 本目录中关于 Engine 内部表单/图形 Blueprint 作者工作流的未完成项不再授权实施。

## 1. 目标

完成完整的大屏作者产品能力：高效画布编辑、可扩展物料、完整图层和属性工作流、图形 Blueprint、宿主资源和资产、
项目目录、预览、发布、快照与恢复。该目标覆盖研究清单的正向用户能力，但不复制来源实现、框架、业务模型、
私有字段、已知缺陷或未接线死代码。

## 2. 不变边界

- Canonical document、严格解析、Core transaction/history、Material ABI 与固定十二包边界保持唯一事实来源。
- Engine 保持 framework-neutral、实例级、私有 Shadow DOM；不引入 React、Vue、Router、全局 Store 或 UI framework。
- URL、header、token、cookie、SQL、脚本、任意 fetch 配置和业务凭证不得进入 canonical document、日志、fixture 或
  Engine UI。资源和外部动作只保存由宿主目录授权的 opaque intent。
- 宿主拥有认证、路由、数据库、文件存储、真实资源执行、公开预览 URL 和部署；Base Screen 不复制其实现。
- Blueprint 的节点位置、边路由、视口、选区、折叠、MiniMap 与搜索状态只属于编辑器 session（Engine 内部实现
  时归 Engine session；ADR-0028 起归宿主编辑器 session），不进入 document、history、export 或 host payload。
- 来源清单中的 bug、不一致和死代码必须作为负向回归，不构成兼容目标。

## 3. Requirements

### R1：可信基线

实现 SHALL 修复已发现的正确性和证据缺口：Blueprint 可编辑控件的 disabled 语义、host-resource identity、
Layers browser workflow 调用与现有测试矩阵声明。修复 SHALL 有独立回归且不得扩大公共契约。

### R2：宿主解耦项目产品

Base Screen SHALL 通过 capability-gated adapter 支持项目目录的搜索、筛选、创建、克隆、删除、导入、导出、
草稿预览、已发布预览、保存、发布、冲突、重试、快照和恢复。缺失 capability SHALL fail closed，且基础
document authoring 继续可用。

### R3：完整作者效率

Designer SHALL 提供统一快捷键元数据、菜单、右键操作、通知、工作台模式、可调整面板、收藏和最近物料、
可访问的 Layers 键盘树，以及同一 operation/history 语义。

### R4：画布与图层深度

Designer SHALL 支持完整的工具、修饰键、可见网格、标尺、参考线、中心和边缘吸附、等距反馈、middle-button/Space
平移、选择适应缩放、树搜索、键盘排序/reparent 和可测的大集合性能。所有 transient state SHALL 实例隔离。

### R5：物料、检查器和资产

Material catalog SHALL 扩展到完整的基础大屏物料集，并以 Manifest 声明 props/style/data/events/actions。
检查器 SHALL 提供安全的结构化字段和按需 JSON 编辑；图片 SHALL 可编辑替代文本。资产选择、替换和删除保护
SHALL 使用宿主资产引用，不持久化传输细节。

### R6：变量、资源和数据

Designer SHALL 支持 static 与 host-backed 变量、授权资源目录、参数绑定、预览、刷新、取消、去重、超时和迟到
结果保护。Designer 同时支持宿主数据集目录、字段映射和统一行列数据预览；查询仅发生在初载、依赖变量变化和手动刷新，不支持轮询、分页、运行时排序或筛选。数据集、API、导航和请求类工作流 SHALL 映射为宿主资源或授权动作 intent，不引入可执行网络配置。

### R7：Blueprint 表单作者闭环

Blueprint SHALL 提供完整键盘表单路径：trigger、condition、action 与递归 value expression 编辑，以及配置、
模板、编译诊断、问题面板和受限模拟日志，并支持 Core 只读 trace（[Designer Event Blueprint](../designer-event-blueprint/spec.md)）。
图形路径按 [ADR-0026](../../../decisions/ADR-0026-designer-event-blueprint-authoring.md) 整体延后，表单为唯一作者
路径。未来恢复图形路径时须重新执行 [ADR-0019](../../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)
依赖评估；图形路径 SHALL 投影 canonical rule/condition/action，不能创建私有执行模型。

### R8：依赖准入

结构化 JSON 编辑槽位维持现状；图形 Blueprint 槽位随 R7 图形路径延后，本期不引入任何 specialized dependency。
未来图形路径恢复时，最多使用一个经过 spike 验证的 specialized dependency；依赖 SHALL 位于私有 adapter 后，
不泄漏类型，不成为 canonical state，并通过 bundle、license、安全、Shadow DOM、双实例、keyboard、cleanup 与
移除验证。

### R9：产品级质量

所有能力 SHALL 提供 Requirement 到 unit/DOM/browser/package/tarball case 的双向映射，覆盖 desktop、窄屏提示、
双实例、forced-colors、reduced-motion、键盘、pointer cancellation、资源竞态、项目竞态和发布产物。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的全部适用项均已完成。
- R1-R9 与当前自动化证据双向映射。
- 所有公共边界变更先有已接受 ADR 与上游 Spec。
- 受影响包质量门、browser、API、boundary、tarball 和 `pnpm verify:m0` 均通过。

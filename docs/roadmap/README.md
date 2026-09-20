# Base Screen 后续路线图

> 状态：方向候选，不授权实现
> 最近更新：2026-09-17（挂入蓝图语义扩展 C 档四项及其触发条件）

本路线图列出下一阶段的候选方向与触发条件。**它不授权任何实现**：每一项启动前都必须先有已接受的 ADR
与生效中的 Spec，并登记到 [Spec 索引](../specs/README.md) 的“生效中”区域。

## 当前维护状态

- 当前生效中 Spec 以 [Spec 索引](../specs/README.md) 为准。已完成或被取代的 62 个 Spec 见
  [归档索引](../specs/archive/README.md)。
- 已交付能力和维护期行为以[当前能力基线](../baseline/README.md)为准。
- P15–P20 工程质量工作见 [Designer 持续质量治理计划](../plans/continuous-quality-governance/plan.md)；该计划
  只治理现有边界，不授权公共契约或产品范围扩展。
- 数据绑定与“数据包”仍处于[待评审调研](../plans/数据绑定与数据包调研.md)，尚未形成实现决策。

## 候选方向

| 方向 | 说明 | 前置/触发条件 | 相关材料 |
| --- | --- | --- | --- |
| ~~外围插件承载（P0–P6）~~（已交付，2026-09-12） | 六个阶段全部完成并归档：[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md)、[ADR-0074](../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)、[ADR-0075](../decisions/ADR-0075-peripheral-plugin-compatibility-policy.md) | 已完成 | [设计评审](../plans/archive/plugin-architecture-evolution/design-review.md) |
| 画布背景宿主资源 | 背景图片改为 static/host-resource 判别 source，并复用宿主资源 Tab | 用户计划明确独立第二阶段；需单独公共契约 Spec，数据库转换与部署另行授权 | [ADR-0064](../decisions/ADR-0064-host-resource-authoring-intent.md) |
| 宿主侧项目/数据/发布能力 | 项目持久化、数据查询/聚合、资产存储、发布部署与长任务，按轻量基座边界归宿主实现 | 宿主侧立项，有明确业务容量 | [ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) |
| Blueprint 扩展节点 | 一体化工作台已由 Base Screen 提供语义壳层、宿主提供中央图形；未来只在 canonical 需求成立时评估分组、过滤、模板或新控制流 | 先扩展 canonical Spec；不得由宿主 metadata 或私有 Store 旁路实现 | [Designer Blueprint Workbench](../specs/archive/designer-blueprint-workbench/spec.md)、[ADR-0081](../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md) |
| 蓝图语义扩展（调研 C 档四项） | 中间数据节点（串行处理/工具方法）、逻辑组合（子图封装复用）、作者可编辑的触发器节点形态、复杂条件（AND/OR 嵌套）。四项共性：都触碰 canonical 契约，因此不是插件词汇表问题而是契约演进 | **2 个以上宿主提出真实需求**；当前计时器、脚本过滤器、推送数据均已有宿主组合路径（[接入宿主数据](../usage/host-data.md)），中间数据可用"变量 + `processorId`"接力近似，故不预建 | [DataV 能力插件承载差距调研（归档）](../plans/archive/datav-capability-plugin-coverage/research.md) |
| 条件候选依赖试点 | `@floating-ui/dom`（碰撞感知 anchored overlay）、`@tanstack/virtual-core`（大图层树滚动缺口） | 对应需求成为生效中 Requirement 且出现可复现性能/正确性缺口（2026-08-16 评估：宿主贴组件锚定弹窗需求定案不做修改，触发条件未满足） | [依赖评估](../plans/archive/designer-dependency-introduction/dependency-evaluation.md) |
| 复杂数据绑定（数据包） | 组件绑定复杂数据是否引入“数据包”概念，尚未决策 | 先完成评审并形成结论 | [数据绑定调研](../plans/数据绑定与数据包调研.md) |
| 变量自动更新调度 | canonical 已保存 `autoUpdate.intervalSeconds` 并把配置传给宿主；轮询、订阅、权限与缓存仍由宿主执行 | 仅在多个宿主需要统一调度协议时重新评估；不在 Engine 内建计时器 | [ADR-0083](../decisions/ADR-0083-variable-system.md)、[DataV 调研](../plans/archive/datav-global-variables/research.md) |
| 在线物料 MCP 扩展 | 在线物料查询/校验 MCP 的生产服务与运行包归宿主 | 宿主立项在线服务 | [ADR-0030](../decisions/ADR-0030-host-material-mcp-access.md)、[Host Material MCP Access](../specs/archive/host-material-mcp-access/spec.md) |
| 历史主线补完 | Designer Full Product 中被轻量基座取代的完整产品范围（项目/资产/发布/多用户） | 仅在宿主边界外出现明确需求时按新增量 Spec 重启 | [Designer Full Product](../specs/archive/designer-full-product/spec.md) |

## 约束提醒

- 新增功能若能通过既有宿主边界完成，不得新增 Base Screen 内部工作流、package 或传输配置（见
  [ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)）。
- 范围扩展必须先更新 ADR 与生效中的 Spec；探索阶段禁止引入版本化命名（`V1/V2`、`apiVersion` 等）。
- 计划完成后必须与证据同批归档；当前行为不得继续引用已完成计划或归档 Spec 作为实施授权。

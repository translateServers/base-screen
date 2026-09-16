# 已归档计划与评审

> 状态：只读历史记录
> 最近更新：2026-09-12

本目录保留已完成或被后继 Spec/ADR 取代的实施计划、设计评审和技术调研，用于追溯当时的执行路径与研究结论。
归档文档不替代已接受的 ADR 或生效中的 Spec；不得作为新实现的授权依据。

## 目录

| 文档 | 状态 | 关联范围 | 归档日期 |
| --- | --- | --- | --- |
| [插件系统架构演进设计评审](./plugin-architecture-evolution/design-review.md) | P0–P6 已交付（归档时补记后续处置） | [外围插件分区 Spec](../../specs/archive/peripheral-plugin-partition/spec.md)、[ADR-0074](../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)、[ADR-0075](../../decisions/ADR-0075-peripheral-plugin-compatibility-policy.md) | 2026-09-12 |
| [DataV 全局变量调研](./datav-global-variables/research.md) | 2026-09-03 已复核 | ADR-0068、[DataV Global Variables Spec](../../specs/archive/datav-global-variables/spec.md) | 2026-09-01 |
| [DataV 高保真右侧检查器与代码治理](./datav-inspired-designer-uiux/plan.md) | P0–P14 已完成 | Designer UI/UX、目录与运行时拆分、文件规模基线清零；后继为 [Designer 持续质量治理](../continuous-quality-governance/plan.md) | 2026-08-30 |
| [Runtime And Ecosystem Hardening](./runtime-ecosystem-hardening/implementation-plan.md) | 历史实施计划 | [已归档 Spec](../../specs/archive/runtime-ecosystem-hardening/spec.md) | 2026-08-12 |
| [Designer 依赖引入](./designer-dependency-introduction/implementation-plan.md) | 已评审、决策落地 | Moveable 源码 vendor、不引入 npm 依赖；条件候选见 [路线图](../../roadmap/README.md) | 2026-08-12 |
| [Designer 依赖候选评估](./designer-dependency-introduction/dependency-evaluation.md) | 已评审（2026-08-06 决策落地） | [ADR-0020](../../decisions/ADR-0020-designer-canvas-interaction-pilot.md) | 2026-08-12 |
| [Moveable 逻辑层移植验证](./designer-moveable-pilot/pilot-plan.md) | 完成 | [Designer Canvas Precision Spec](../../specs/archive/designer-canvas-precision/spec.md) | 2026-08-12 |
| [Designer 事件系统设计评审](./designer-event-system/design-review.md) | 已评审 | [Designer Event System Spec](../../specs/archive/designer-event-system/spec.md) | 2026-08-12 |
| [Designer 外部样式 Token](./designer-theme-tokens/implementation-plan.md) | 已实现 | [Designer Theme Tokens Spec](../../specs/archive/designer-theme-tokens/spec.md)、[ADR-0024](../../decisions/ADR-0024-designer-public-style-tokens.md) | 2026-08-12 |
| [Designer 编组与右侧面板整改](./designer-group-inspector/implementation-plan.md) | 已实现 | [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) | 2026-08-12 |
| [Data Runtime Hardening](./data-runtime-hardening/implementation-plan.md) | 已实现 | [Data Runtime Hardening Spec](../../specs/archive/data-runtime-hardening/spec.md)、ADR-0025 | 2026-08-12 |
| [Designer Event Blueprint](./designer-event-blueprint/implementation-plan.md) | 已决策（图形延后） | [Designer Event Blueprint Spec](../../specs/archive/designer-event-blueprint/spec.md)、ADR-0026 | 2026-08-12 |
| [Designer Event Blueprint 依赖评估](./designer-event-blueprint/dependency-evaluation.md) | 已评审 | [Designer Event Blueprint Spec](../../specs/archive/designer-event-blueprint/spec.md) | 2026-08-12 |
| [轻量 Designer 作者扩展](./designer-authoring-extension/implementation-plan.md) | 已实现 | [Designer Authoring Extension Spec](../../specs/archive/designer-authoring-extension/spec.md)、ADR-0028；随附[作者面板 fixture 与缺口矩阵](./designer-authoring-extension/panel-fixture-gap-matrix.md)（Task 2）与 [Primitive 提升评估记录](./designer-authoring-extension/primitive-promotion.md)（Task 8） | 2026-08-12 |
| [宿主草稿物料流程](./host-draft-material-workflow/implementation-plan.md) | 已实现 | [Host Draft Material Workflow Spec](../../specs/archive/host-draft-material-workflow/spec.md) | 2026-08-12 |
| [宿主托管物料包](./host-material-package/implementation-plan.md) | 已实现 | [Host Material Package Spec](../../specs/archive/host-material-package/spec.md)、[ADR-0029](../../decisions/ADR-0029-host-managed-material-package-distribution.md)；[概论评估](./host-material-package/assessment.md) | 2026-08-12 |
| [数据模块设计原则深度研究](./data-module-design-research.md) | 已完成调研 | Data Runtime 数据设计输入 | 2026-08-12 |

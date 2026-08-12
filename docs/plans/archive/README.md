# 已归档计划与评审

> 状态：只读历史记录
> 最近更新：2026-08-12

本目录保留已完成或被后继 Spec/ADR 取代的实施计划、设计评审和技术调研，用于追溯当时的执行路径与研究结论。
归档文档不替代已接受的 ADR 或生效中的 Spec；不得作为新实现的授权依据。

## 目录

| 文档 | 状态 | 关联范围 | 归档日期 |
| --- | --- | --- | --- |
| [Runtime And Ecosystem Hardening](./runtime-ecosystem-hardening/implementation-plan.md) | 历史实施计划 | [已归档 Spec](../../specs/archive/runtime-ecosystem-hardening/spec.md) | 2026-08-12 |
| [Designer 依赖引入](./designer-dependency-introduction/implementation-plan.md) | 已评审、决策落地 | Moveable 源码 vendor、不引入 npm 依赖；条件候选见 [路线图](../../roadmap/README.md) | 2026-08-12 |
| [Designer 依赖候选评估](./designer-dependency-introduction/dependency-evaluation.md) | 已评审（2026-08-06 决策落地） | [ADR-0020](../../decisions/ADR-0020-designer-canvas-interaction-pilot.md) | 2026-08-12 |
| [Moveable 逻辑层移植验证](./designer-moveable-pilot/pilot-plan.md) | 完成 | [Designer Canvas Precision Spec](../../specs/archive/designer-canvas-precision/spec.md) | 2026-08-12 |
| [Designer 事件系统设计评审](./designer-event-system/design-review.md) | 已评审 | [Designer Event System Spec](../../specs/archive/designer-event-system/spec.md) | 2026-08-12 |
| [Designer 外部样式 Token](./designer-theme-tokens/implementation-plan.md) | 已实现 | [Designer Theme Tokens Spec](../../specs/archive/designer-theme-tokens/spec.md)、[ADR-0024](../../decisions/ADR-0024-designer-public-style-tokens.md) | 2026-08-12 |
| [Designer 编组与右侧面板整改](./designer-group-inspector/implementation-plan.md) | 已实现 | [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) | 2026-08-12 |
| [Data Runtime Hardening](./data-runtime-hardening/implementation-plan.md) | 已实现 | [Data Runtime Hardening Spec](../../specs/archive/data-runtime-hardening/spec.md)、[ADR-0025](../../decisions/ADR-0025-data-runtime-hardening.md) | 2026-08-12 |
| [Designer Event Blueprint](./designer-event-blueprint/implementation-plan.md) | 已决策（图形延后） | [Designer Event Blueprint Spec](../../specs/archive/designer-event-blueprint/spec.md)、[ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md) | 2026-08-12 |
| [Designer Event Blueprint 依赖评估](./designer-event-blueprint/dependency-evaluation.md) | 已评审 | [Designer Event Blueprint Spec](../../specs/archive/designer-event-blueprint/spec.md) | 2026-08-12 |
| [轻量 Designer 作者扩展](./designer-authoring-extension/implementation-plan.md) | 已实现 | [Designer Authoring Extension Spec](../../specs/archive/designer-authoring-extension/spec.md)、[ADR-0028](../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md) | 2026-08-12 |
| [宿主托管物料包](./host-material-package/implementation-plan.md) | 已实现 | [Host Material Package Spec](../../specs/archive/host-material-package/spec.md)、[ADR-0029](../../decisions/ADR-0029-host-managed-material-package-distribution.md)；[概论评估](./host-material-package/assessment.md) | 2026-08-12 |
| [数据模块设计原则深度研究](./研究报告.md) | 已完成调研 | Data Runtime 数据设计输入 | 2026-08-12 |

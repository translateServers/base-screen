# Base Screen 计划与评审

> 状态：维护期（阶段封版）
> 阶段封版：2026-08-12
> 最近更新：2026-09-16（新增 DataV 能力插件承载与核心/插件职责划分两份待评审调研）

本目录保留实施计划、设计评审和技术调研。计划说明执行路径或研究结论，不替代已接受的 ADR 或生效中的 Spec。
2026-08-12 阶段封版：已完成的历史实施计划、评估和评审全部归档至 [archive/](./archive/README.md)。

## 已评审通过

当前无生效中的已评审文档。插件系统架构演进设计评审的 P0–P6 已全部交付，
已于 2026-09-12 与[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md) 同批归档至
[archive/plugin-architecture-evolution/](./archive/plugin-architecture-evolution/design-review.md)。

## 待评审

| 文档 | 状态 | 关联范围 |
| --- | --- | --- |
| [数据绑定与“数据包”调研](./数据绑定与数据包调研.md) | 调研草稿，待评审 | 组件绑定复杂数据是否引入“数据包”概念；未决，见 [后续路线图](../roadmap/README.md) |
| [DataV 能力插件承载差距调研](./DataV-能力插件承载差距调研.md) | 调研草稿，待评审 | DataV 功能域对照插件词汇表（8 类贡献）的四档差距；含计时器、用户脚本、推送数据三个组合路径案例与 C 档触发条件建议 |
| [核心与插件职责划分评审](./核心与插件职责划分评审.md) | 评审草稿，待评审 | 前篇姊妹篇：核心必备六判据（C1~C6）+ 可插件化信号，12 包逐包评审与灰色地带逐项归类；候选下沉仅 Nebula Importer 一项 |

## 持续治理

| 文档 | 状态 | 关联范围 |
| --- | --- | --- |
| [Designer 持续质量治理](./continuous-quality-governance/plan.md) | P15–P20 规划中 | 子层依赖、无抖动、可访问性、性能预算、样式 Token 与测试目标线 |

## 已归档

全部历史计划与评审见 [docs/plans/archive/](./archive/README.md)，包括：

- DataV 高保真右侧检查器与代码治理 P0–P14 完成成果
- 基础与运行时：Runtime And Ecosystem Hardening、Data Runtime Hardening
- Designer 增量：Designer 依赖引入、Moveable 逻辑层移植验证、事件系统设计评审、外部样式 Token、
  编组与右侧面板整改、事件 Blueprint
- 宿主物料：宿主托管物料包（含评估）
- 调研：数据模块设计原则深度研究
- 调研：DataV 全局变量能力与 Base Screen 宿主边界映射

实现和验收时，请以 [功能与工程规格](../specs/README.md) 的生效中条目为准。
活动计划必须登记在本页，完成后与其证据同批移入归档。

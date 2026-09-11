# Base Screen 文档

本目录按文档职责组织。集成和仓库开发从这里开始；当前处于阶段成果维护期，能力现状以当前能力基线为准，
重要边界以已接受的 ADR 为准，实施状态以 Spec 与 Plan 索引为准。

## 阅读入口

| 目标 | 文档 |
| --- | --- |
| 在应用中嵌入 Viewer、Designer、物料和宿主能力 | [集成指南](./usage.md) |
| 创建可直接绑定数据集的自定义组件 | [数据集驱动自定义组件最佳实践](./custom-dataset-material-best-practice.md) |
| 当前能力现状与维护基线 | [当前能力基线](./baseline/README.md) |
| 下一阶段方向与候选主题 | [后续路线图](./roadmap/README.md) |
| 查看已接受、已取代和评审中的架构决策 | [架构决策记录](./decisions/README.md) |
| 实施或验收功能 | [功能与工程规格](./specs/README.md) |
| 查看实施计划、评审和技术调研 | [计划与评审](./plans/README.md) |
| 追溯外部参考、许可和 no-copy 边界 | [来源记录](./provenance/README.md) |
| 排查 M0 验证失败 | [验证故障排查](./troubleshooting/verify-m0-troubleshooting.md) |
| 改完功能后查看专项案例 | [专项案例怎么看](./guides/feature-cases.md) |

## 文档层级

跨仓接入与同步使用 [工作流规范](../.agents/skills/base-screen-integration-workflow/references/workflow.md)。
能力索引提供上游当前入口，宿主消费映射和产物来源单独核验；普通修复不机械创建 ADR/Spec。

- **ADR**：影响公共契约、依赖、安全或兼容性的已审议决策。
- **Baseline**：当前能力基线，维护期行为依据；变更按影响范围选择任务记录、ADR 或 Spec。
- **Roadmap**：下一阶段方向与候选主题；不授权实现，启动时新建 ADR/Spec。
- **Spec**：跨多个独立交付阶段、需要迁移或回滚方案，或用户明确要求时建立的需求与验收记录；适用时须生效后实施，完成后
  必须同批归档。
- **Plan**：实施顺序、设计评审或调研过程；计划本身不替代 Spec 或 ADR。
- **Provenance**：外部参考的来源、授权和归属记录。

2026-09-01 文档治理后，当前没有生效中的 Spec；共 60 个已完成或已取代 Spec 归档于
`docs/specs/archive/`。`docs/plans/` 只保留待评审调研和持续治理计划，已完成计划归档于
`docs/plans/archive/`。归档材料只用于历史追溯，不能作为新实现或验收的依据。具体规则见
[Spec 索引](./specs/README.md)、[Spec 归档](./specs/archive/README.md)和[计划索引](./plans/README.md)。

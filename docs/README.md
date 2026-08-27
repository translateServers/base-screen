# Base Screen 文档

本目录按文档职责组织。集成和仓库开发从这里开始；当前处于阶段成果维护期，能力现状以当前能力基线为准，
重要边界以已接受的 ADR 为准。

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

## 文档层级

- **ADR**：影响公共契约、依赖、安全或兼容性的已审议决策。
- **Baseline**：当前能力基线，维护期行为依据；新功能必须先写增量 Spec。
- **Roadmap**：下一阶段方向与候选主题；不授权实现，启动时新建 ADR/Spec。
- **Spec**：可直接实施和验收的需求、任务、检查项与测试映射；只有生效中的 Spec 可以授权新实现。
- **Plan**：实施顺序、设计评审或调研过程；计划本身不替代 Spec 或 ADR。
- **Provenance**：外部参考的来源、授权和归属记录。

自 2026-08-12 阶段封版起，`docs/specs/` 与 `docs/plans/` 不再保留活动条目：全部历史 Spec 归档于
`docs/specs/archive/`，全部历史计划归档于 `docs/plans/archive/`，只用于历史追溯，不能作为新实现或验收的依据。
具体规则见 [Spec 索引](./specs/README.md) 和 [归档说明](./specs/archive/README.md)。

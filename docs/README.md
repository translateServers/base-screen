# Base Screen 文档

本目录按文档职责组织。集成和仓库开发从这里开始；功能实现以生效中的 Spec 为准，重要边界以已接受的 ADR 为准。

## 阅读入口

| 目标 | 文档 |
| --- | --- |
| 在应用中嵌入 Viewer、Designer、物料和宿主能力 | [集成指南](./usage.md) |
| 了解包职责、演进方向和开发顺序 | [架构文档](./architecture/README.md) |
| 查看已接受、已取代和评审中的架构决策 | [架构决策记录](./decisions/README.md) |
| 实施或验收功能 | [功能与工程规格](./specs/README.md) |
| 查看实施计划、评审和技术调研 | [计划与评审](./plans/README.md) |
| 追溯外部参考、许可和 no-copy 边界 | [来源记录](./provenance/README.md) |
| 排查 M0 验证失败 | [验证故障排查](./troubleshooting/verify-m0-troubleshooting.md) |

## 文档层级

- **Architecture**：长期边界、包职责和开发顺序，不承载逐项任务进度。
- **ADR**：影响公共契约、依赖、安全或兼容性的已审议决策。
- **Spec**：可直接实施和验收的需求、任务、检查项与测试映射；只有生效中的 Spec 可以授权新实现。
- **Plan**：实施顺序、设计评审或调研过程；计划本身不替代 Spec 或 ADR。
- **Provenance**：外部参考的来源、授权和归属记录。

归档 Spec 只用于历史追溯，不能作为新实现或验收的依据。具体规则见 [Spec 索引](./specs/README.md) 和 [归档说明](./specs/archive/README.md)。

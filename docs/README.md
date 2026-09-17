# Base Screen 文档

本目录按文档职责组织。集成和仓库开发从这里开始；当前处于阶段成果维护期，能力现状以当前能力基线为准，
重要边界以已接受的 ADR 为准，实施状态以 Spec 与 Plan 索引为准。

## 阅读入口

| 目标 | 文档 |
| --- | --- |
| 在应用中嵌入 Viewer、Designer、物料和宿主能力 | [集成指南](./usage.md) |
| 创建可直接绑定数据集的自定义组件 | [数据集驱动自定义组件最佳实践](./custom-dataset-material-best-practice.md) |
| 为物料定制加载中/空态等状态 UI | [公共加载容器](./material-loading.md) |
| 为宿主配置大屏设计与物料创建 Skill | [宿主 Skill 快速接入](./host-skill-manuals/01-quick-start.md) |
| 当前能力现状与维护基线 | [当前能力基线](./baseline/README.md) |
| 跨包必须统一理解的领域词汇 | [领域词汇](../CONTEXT.md) |
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

2026-09-01 文档治理后，`docs/specs/` 只保留生效中的 Spec（当前条目以 [Spec 索引](./specs/README.md) 为准），
已完成或已取代的 Spec 全部归档于 `docs/specs/archive/`。`docs/plans/` 只保留待评审调研、已评审通过的设计评审
和持续治理计划，已完成计划归档于 `docs/plans/archive/`。归档材料只用于历史追溯，不能作为新实现或
验收的依据。归档条目数量以各自索引表为准，正文不复述可推导的总量。具体规则见 [Spec 索引](./specs/README.md)、
[Spec 归档](./specs/archive/README.md)和[计划索引](./plans/README.md)。

## 体量与单一来源

文档不会自己变小，因此增长约束必须在写入那一刻生效，而不是攒到某次大扫除。以下规则由 `pnpm check:docs` 强制。

- **单篇体量预算按角色分档**：ADR 200 行、活动 Spec 与 Plan 800 行、其余叙述类 300 行。Spec 与 Plan 的档位
  明显更宽，因为它们是单一连贯的需求与验收叙事，拆到多个文件会损害可追溯性；这一档只防失控，不追求短。
  归档正文、`.changeset/` 与生成的 `*.api.md` 不参与预算。
- **豁免是棘轮，不是逃生口**：超预算的正确处理是拆分或删减。`scripts/check-docs.mjs` 的
  `SIZE_BUDGET_EXCEPTIONS` 登记值只能下调、不得新增条目，并被根级测试钉死，放宽必须同时改断言。
- **入口文档保留原路径**：体量大的入口（[集成指南](./usage.md)、[能力基线](./baseline/README.md)）退化为导航，
  正文按职责分篇。这样既有入链与机器引用不因拆分失效，每篇又各自受预算约束。
- **派生事实只有一个权威落点**：固定包清单在 `scripts/check-packages.mjs`，依赖白名单在
  `scripts/check-boundaries.mjs`，工具版本在 manifest 与 lockfile，归档条目在各自索引表。文档引用而不复制；
  散文不复述可推导的数量或清单，避免两份没有门禁比对的副本。带日期的历史批次事实属冻结记录，可以保留。
- **机器可读索引同样受约束**：`.base-screen/integration-capabilities.json` 的 `references` 必须可解析。
  删除或改名文档时同批更新它——`pnpm integration` 只在 peer 仓库存在时才校验这些路径，本仓门禁是唯一
  常态化拦截点。
- **裸 ADR 编号也是引用**：链接校验只覆盖 Markdown 链接，因此 2026-09-16 移除 48 份碎片 ADR 后，散文里
  把已吸收编号当现行权威引用的地方无人拦截。现行依据类文档（本目录下的 usage、baseline、guides、
  troubleshooting、provenance、roadmap、host-skill-manuals，以及根 `README.md`、`AGENTS.md`、`CONTEXT.md`）
  只能引用仍然存在的 ADR，被吸收的编号改指承载现行表述的主线 ADR；映射由门禁从
  [ADR 索引](./decisions/README.md) 的归并记录自动推导，不需手工维护。[ADR 索引](./decisions/README.md) 自身的
  归并映射、[计划](./plans/README.md)与 [Spec](./specs/README.md) 的历史分析与需求记录按撰写时编号行文，整体豁免。

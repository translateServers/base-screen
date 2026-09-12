# Base Screen 功能与工程规格

> 状态：独立数据集消费重构实施中
> 阶段封版：2026-08-12
> 最近更新：2026-09-12
> 最近归档：2026-09-12（外围插件分区）

## 当前状态

- **独立数据集消费重构生效中。** 已交付能力以[当前能力基线](../baseline/README.md)为准。
- **共 62 个 Spec 已归档。** 2026-08-12 阶段封版归档 32 个历史 Spec，后续增量均已完成并归档；
  详见 [archive/](./archive/README.md)。
- **按影响范围建立记录。** 长期架构、职责或兼容策略变化需要 ADR；跨多个独立交付阶段、需要迁移
  或回滚方案，或用户明确要求时建立 Spec，并在本页“生效中”登记。普通修复使用任务记录；
  不得重新打开归档任务授权新实现。

## 使用规则

- Spec 引用适用的已接受 ADR，提供 Requirements、任务、验收场景和完成定义；不为凑齐形式新增 ADR。
- Spec 状态为“生效中”后才允许进入对应实现；实现不得静默偏离 Spec。
- 任务与清单全部完成，或 Spec 被后继 ADR/Spec 取代时，必须在同一交付批次移入归档并更新索引。
- 归档 Spec 只保存当时的需求、实现与验证证据；当前行为由能力基线和已接受 ADR 共同说明。
- 改变公共边界时先更新 ADR；仅修复归档链接、补充归档说明或 provenance 时可以修改历史文档。

## 生效中

| Spec | 状态 | 范围 |
| --- | --- | --- |
| [独立数据集消费](./independent-dataset-consumption/spec.md) | 生效中 | 统一数据集端口、参数、文档形态和宿主切换 |

## 最近归档批次

2026-09-12：[外围插件分区](./archive/peripheral-plugin-partition/spec.md) 确立顶层 `plugins/` 外围插件区与
按区依赖白名单，落地六类贡献点的 Engine 承载接线，并收敛插件运行时的失败影响范围（每插件原子）、
惰性激活（`activation: 'lazy'` 与 `ensureActive`）与能力判定表驱动；兼容策略见
[ADR-0075](../decisions/ADR-0075-peripheral-plugin-compatibility-policy.md)。

2026-09-03：[DataV Global Variables](./archive/datav-global-variables/spec.md) 完成 DataV 三类来源、
完整配置字段、稳定 ID 引用、Blueprint 变量节点、运行时变量句柄与一次性迁移。

2026-09-01：[DataV-Inspired Global Variables](./archive/datav-inspired-global-variables/spec.md)
已由 ADR-0068 和 DataV Global Variables Spec 取代。

2026-08-31：[Host Resource Authoring](./archive/host-resource-authoring/spec.md) 完成严格资源 intent、
插入/替换、原生拖放和旧素材端口移除；完整门禁及宿主浏览器闭环通过。

2026-08-30 归档的 26 个增量 Spec 覆盖：

- Designer 工作台、左侧面板、检查器、变量、画布交互与宿主预览；
- 物料库投影、分组、反馈、封面与渲染规模；
- 画布背景、颜色控件、文本排版、条件样式与宿主样式端口；
- 已被一体化工作台取代的 detached Blueprint 宿主桥，以及其后继 Designer Blueprint Workbench。

完整目录、归档日期和后继依据见[归档索引](./archive/README.md)，当前实现能力见
[能力基线](../baseline/README.md)，实施计划与调研见[计划与评审](../plans/README.md)。

# ADR-0075: 外围插件兼容性策略

> 状态：已接受
> 日期：2026-09-12
> 决策依据：设计评审 D2 三个方向，用户于 2026-09-12 批准启动兼容性设计阶段，按评审"外围插件数量少"的现状选择不引入版本标记的方案
> 范围：外围插件与基座契约的兼容管理方式；不包含执行隔离、沙箱与插件间组合
> 关联：[ADR-0084](./ADR-0084-plugin-contribution-vocabulary-and-trust.md)、[ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0074](./ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)

## 背景

外围插件是独立交付物，而基座契约持续演进。设计评审（Q8/G5）指出：若兼容无管理手段，
基座演进会静默破坏已发布的插件。但探索阶段治理规则明令禁止版本标记字段与版本化命名
（[ADR-0084](./ADR-0084-plugin-contribution-vocabulary-and-trust.md) 亦有意移除版本语义），评审 D2 据此给出三个方向：
维持现状（锁步交付）、收紧绑定（稳定子集 + 规范快照）、引入版本化设计（需新 ADR 并退出探索阶段）。

## 决策

采用**锁步批次交付 + 以 api 基线治理的稳定子集**，不引入任何版本标记：

1. **锁步批次交付（D2 选项一）**。外围插件与核心包在同一发布批次内交付与升级
   （`pnpm verify:tarball` 的同批次 tarball 集即是交付单元）。插件与基座的版本漂移在
   交付期被结构性排除，不做运行期版本协商。外围插件数量少时，该升级成本可接受；
   数量增长后如需独立节奏，再按 D2 选项三重新立项。
2. **稳定子集 = plugin-core 与 plugin-sdk 的公共导出面（D2 选项二的治理形态）**。
   插件作者可依赖的契约面恰好是这两个包的公共导出。该面由 api-extractor 基线
   （`packages/*/etc/*.api.md`）、强制 Changeset 与 `pnpm check:api`/`check:api-changesets`
   门禁共同治理：任何漂移都必须经过评审并留下变更记录，不存在静默破坏。
3. **运行期可感知**。契约不匹配一律失败关闭并给出可读诊断：未知能力
   （`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`/`PLUGIN_CORE_CONTRIBUTION_UNKNOWN`）、
   未知贡献字段或种类（清单精确字段与 kind 校验拒绝）、端口工厂缺失
   （`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`）、未知贡献命令
   （`PLUGIN_CORE_COMMAND_UNAUTHORIZED`）。配合失败爆炸半径收敛
   （[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md)），不兼容插件的失败
   可观察、可隔离，不拖垮其他插件与核心目录。

## 后果

- 插件作者升级基座批次时必须同步验证插件（升级成本随插件数线性，当前可接受）。
- 清单保持无版本语义（ADR-0014 继续完全生效），探索阶段命名规则不变。
- 兼容性治理依托既有门禁（api 基线 + Changesets + 边界检查），不新增工具；
  将来退出探索阶段引入版本化设计时，以本 ADR 为基线另立新决策。

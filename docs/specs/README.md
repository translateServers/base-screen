# Base Screen 功能与工程规格

> 状态：维护期（阶段封版）
> 阶段封版：2026-08-12
> 最近更新：2026-08-12
> 定位：Base Screen 当前处于阶段成果维护期，没有正在实施的活动 Spec

## 当前状态

- **没有正在实施的活动 Spec。** 截至 2026-08-12，所有历史 Spec 的 Tasks 与 Checklist 均已勾选完成，
  其“需求 → 实现 → 测试 → 验收”生命周期已闭环，全部归档至 [archive/](./archive/README.md) 作为历史验收材料。
- **当前处于阶段成果维护期。** 现有能力基线见 [当前能力基线](../baseline/README.md)，下一阶段方向见
  [后续路线图](../roadmap/README.md)。
- **新功能必须重新建立 ADR/Spec。** 维护期内的任何新需求都不得重新打开归档任务；启动实施前先写
  已接受的 ADR 与生效中的 Spec，并登记到本页“生效中”区域。

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、验收场景和完成定义。
- 实现不得静默偏离 Spec；需要改变公共边界时先更新 ADR。
- Spec 状态为“生效中”后才允许进入对应实现。
- 完成后保留 Spec 作为行为依据，不把实施细节反写为新的隐式契约。
- 已归档 Spec 只用于追溯历史决策和进度；新实现不得以其中的未完成项替代现行三件套。

## 生效中

当前为空。新 Spec 在通过评审后登记于此。

## 已归档

全部历史 Spec 已按阶段封版归档至 [docs/specs/archive/](./archive/README.md)，目录表见归档索引，
共 33 份（截至 2026-08-12）：

- 基础能力：M0 工程基线、Contracts Foundation、Renderer And Viewer、Host Resource And Blueprint、
  Nebula Importer、Remote Plugin Sandbox
- Designer 增量：Canvas Precision、Event System、Theme Tokens、Event Blueprint、Authoring Extension
- 契约与数据：Material Library Visibility、Official Data Material Contracts、Host Dataset Integration、
  Data Runtime Hardening
- 宿主作者工具：Host Screen/Material Skill Generation、Host Skill Adoption、Host Material MCP Access、
  Host Draft Material Workflow
- 历史主线：Core Domain、Plugin Core Contract、Plugin Manager Runtime、Runtime And Ecosystem Hardening、
  Designer Engine、Designer Product Completion、Designer Workbench Control Styles、Directory Structure Rules、
  Designer Full Product、Designer Authoring And Project Lifecycle

相关计划与评审见 [计划与评审](../plans/README.md)，当前架构见 [架构文档](../architecture/README.md)。

# Base Screen 功能与工程规格

> 状态：维护期（无生效中 Spec）
> 阶段封版：2026-08-12
> 最近更新：2026-08-31
> 最近归档：2026-08-31（Host Resource Authoring）

## 当前状态

- **当前无生效中 Spec。** 已交付能力以[当前能力基线](../baseline/README.md)为准。
- **共 59 个 Spec 已归档。** 2026-08-12 阶段封版归档 32 个历史 Spec，2026-08-30 归档 26 个增量，
  2026-08-31 归档 Host Resource Authoring；详见 [archive/](./archive/README.md)。
- **新功能必须重新建立 ADR/Spec。** 启动实现前先接受 ADR、建立生效中的增量 Spec，并在本页“生效中”
  区域登记；不得重新打开归档任务授权新实现。

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、任务、验收场景和完成定义。
- Spec 状态为“生效中”后才允许进入对应实现；实现不得静默偏离 Spec。
- 任务与清单全部完成，或 Spec 被后继 ADR/Spec 取代时，必须在同一交付批次移入归档并更新索引。
- 归档 Spec 只保存当时的需求、实现与验证证据；当前行为由能力基线和已接受 ADR 共同说明。
- 改变公共边界时先更新 ADR；仅修复归档链接、补充归档说明或 provenance 时可以修改历史文档。

## 生效中

当前无生效中 Spec。

## 最近归档批次

2026-08-31：[Host Resource Authoring](./archive/host-resource-authoring/spec.md) 完成严格资源 intent、
插入/替换、原生拖放和旧素材端口移除；完整门禁及宿主浏览器闭环通过。

2026-08-30 归档的 26 个增量 Spec 覆盖：

- Designer 工作台、左侧面板、检查器、变量、画布交互与宿主预览；
- 物料库投影、分组、反馈、封面与渲染规模；
- 画布背景、颜色控件、文本排版、条件样式与宿主样式端口；
- 已被一体化工作台取代的 detached Blueprint 宿主桥，以及其后继 Designer Blueprint Workbench。

完整目录、归档日期和后继依据见[归档索引](./archive/README.md)，当前实现能力见
[能力基线](../baseline/README.md)，实施计划与调研见[计划与评审](../plans/README.md)。

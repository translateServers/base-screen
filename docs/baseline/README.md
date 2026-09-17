# Base Screen 当前能力基线

> 状态：生效（维护期行为依据）
> 最近更新：2026-09-14（插件运行期贡献：blueprintAction 与 dataProcessor）

本基线描述 Base Screen 在 2026-08-12 阶段封版时已交付并验收的能力现状，以及封版后已生效的增量。它是维护期的行为依据：
变更依据当前用户需求与适用的已接受决策实施。长期架构、职责或兼容策略变化需要 ADR；
跨多个独立交付阶段、需要迁移或回滚方案，或用户明确要求时建立 Spec。归档 Spec 仅作历史证据。

- 范围边界、宿主职责与安全约束以已接受的 [ADR](../decisions/README.md) 为准（尤其 ADR-0027/0028/0029/0030）。
- **ADR 引用约定（2026-09-16 起）**：2026-09-16 把 48 份碎片 ADR 按主线合并为 9 份「主线现行决策」ADR，被吸收记录已
  从仓库移除。本页条目的依据引用已统一指向承载其现行表述的主线 ADR；被移除记录的原编号与逐条贡献登记在各主线 ADR 的
  「归并范围」表中（映射见 [ADR 索引](../decisions/README.md)）。
- 每个能力条目的验收材料与任务进度追溯见对应 [归档 Spec](../specs/archive/README.md)。
- 集成方式见 [集成指南](../usage.md)。

## 工程基线与仓库

- **Monorepo 工程基线**：pnpm/Turbo、12 个固定 package、`@base-screen/*` 公共导出、边界/子层/UI 文案门禁、
  lint/typecheck/test/build/tarball 验收（`pnpm verify:m0`）。依据：[M0 工程基线](../specs/archive/m0-engineering-baseline/spec.md)、
  [Directory Structure Rules](../specs/archive/directory-structure-rules/spec.md)、[Boundary Hygiene](../specs/archive/boundary-hygiene/spec.md)。
- **依赖纪律**：仅 `contracts` 允许外部 `zod`；React/Vue 仅为各自桥接包 peer 依赖；Moveable 逻辑层源码 vendor，
  不引入 npm 交互依赖。依据：[Designer 依赖候选评估](../plans/archive/designer-dependency-introduction/dependency-evaluation.md)、
  [ADR-0020](../decisions/ADR-0020-designer-canvas-interaction-pilot.md)。
- **代码与验证治理**（2026-09-03）：Designer controller/DOM、Engine 发布入口、Renderer、Plugin Core、
  Document 校验和 tarball 编排已按职责拆分；browser harness 已模块化。当前不设机械行数上限，
  以功能行为完整、职责内聚和可独立测试/演进作为模块拆分标准。P0–P14 证据见[归档治理计划](../plans/archive/datav-inspired-designer-uiux/plan.md)，
  后续质量门禁见[持续质量治理计划](../plans/continuous-quality-governance/plan.md)。

## Canonical 文档与解析

- **Canonical Screen Document**：严格契约、fail-closed 解析、诊断、序列化与 JSON Schema 黄金产物。
  依据：[Contracts Foundation](../specs/archive/contracts-foundation/spec.md)、[Core Domain](../specs/archive/core-domain/spec.md)、
  [ADR-0002](../decisions/ADR-0002-canonical-screen-document.md)。

## Renderer 与 Viewer

- **纯展示职责**：Viewer 只消费 canonical 文档并渲染物料 DOM，不含编辑/设计逻辑；Viewer Shadow DOM 与事件边界隔离。
  依据：[Renderer And Viewer](../specs/archive/renderer-viewer/spec.md)、[ADR-0005](../decisions/ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)。

## 能力分篇

下列三个增长最快的能力域各自成篇，其余域留在本页。

| 能力域 | 分篇 |
| --- | --- |
| 画布交互、事件系统、主题 Token、作者扩展、一体化工作台与左侧面板 | [Designer 能力](./designer.md) |
| 物料契约与 ABI、官方物料范围、静态数据、物料库呈现与排版 | [物料体系](./materials.md) |
| 插件沙箱、生命周期与权限、贡献命令、面板与自定义控件、运行期贡献 | [安全与插件运行时](./plugin-runtime.md) |

## 宿主边界与数据运行时

- **宿主资源作者协议**（2026-08-31 增量）：宿主资源面板通过 `leftPanelGroups` 的 Canvas-only 命名
  slot 提交严格 JSON-safe、8 KiB 有界 intent；Designer 提供公开插入、同类型 dataSource-only 替换和
  原生拖放，校验当前 catalog 可见性、Manifest capability 与资源贡献；单次 Core transaction、可见
  画布中心/吸附落点、undo/redo 和状态变化事件保持统一。旧素材目录端口、能力位、listAssets 和内置
  素材控制器已删除；目录、权限、分页、缩略图、签名和删除保护均归宿主。依据：
  [ADR-0064](../decisions/ADR-0064-host-resource-authoring-intent.md)、
  [验收记录](../specs/archive/host-resource-authoring/spec.md)。
- **轻量基座定位**：项目、数据、资产、发布、长任务等真实处理归宿主，Base Screen 通过 JSON-safe intent/port/method/event
  请求宿主能力。依据：[ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
  [ADR-0017](../decisions/ADR-0017-designer-product-host-boundaries.md)。
- **Host Resource 与 Blueprint 运行时**：opaque 资源意图、deadline 与受限运行时。依据：
  [Host Resource And Blueprint](../specs/archive/host-resource-blueprint/spec.md)、[ADR-0010](../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md)。
- **宿主数据集集成与数据运行时**：数据集目录、参数绑定、字段映射、预览、Viewer 取数闭环；请求身份与共享、
  元数据/错误协议、初始化/参数/变量/执行上下文。依据：[Host Dataset Integration](../specs/archive/host-dataset-integration/spec.md)、
  [Data Runtime Hardening](../specs/archive/data-runtime-hardening/spec.md)、[ADR-0082](../decisions/ADR-0082-dataset-consumption-contract.md)。

## 宿主作者工具（Skill）

- **宿主大屏/物料 Skill**：从宿主安全快照生成专属设计/物料创建 Skill，统一命令与 `.base-screen/tooling` 宿主工具包。
  依据：[Host Screen Skill Generation](../specs/archive/host-screen-skill-generation/spec.md)、
  [Host Material Skill Generation](../specs/archive/host-material-skill-generation/spec.md)、
  [Host Skill Adoption](../specs/archive/host-skill-adoption/spec.md)。

## 历史迁移

- **Nebula Importer**：离线 legacy export 转换、审计报告与 provenance。
  依据：[Nebula Importer](../specs/archive/nebula-importer/spec.md)、[ADR-0011](../decisions/ADR-0011-nebula-importer-auditable-migration.md)、
  [来源记录](../provenance/README.md)。

## 维护规则

- 修改现有能力、修复缺陷或补充验证，按影响范围选择精简任务或 Spec；改变长期职责或兼容策略时更新 ADR。
- 新需求不得重新打开归档 Spec；历史验收材料只用于追溯。

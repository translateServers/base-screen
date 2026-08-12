# Base Screen 当前能力基线

> 状态：生效（维护期行为依据）
> 最近更新：2026-08-12（阶段封版）

本基线描述 Base Screen 在 2026-08-12 阶段封版时已交付并验收的能力现状。它是维护期的行为依据：
**维护期内的任何修改都必须新建增量 Spec（并先有已接受的 ADR）**，不得以本基线或归档 Spec 直接授权实现。

- 范围边界、宿主职责与安全约束以已接受的 [ADR](../decisions/README.md) 为准（尤其 ADR-0027/0028/0029/0030）。
- 每个能力条目的验收材料与任务进度追溯见对应 [归档 Spec](../specs/archive/README.md)。
- 集成方式见 [集成指南](../usage.md)。

## 工程基线与仓库

- **Monorepo 工程基线**：pnpm/Turbo、12 个固定 package、`@base-screen/*` 公共导出、边界/子层/UI 文案门禁、
  lint/typecheck/test/build/tarball 验收（`pnpm verify:m0`）。依据：[M0 工程基线](../specs/archive/m0-engineering-baseline/spec.md)、
  [Directory Structure Rules](../specs/archive/directory-structure-rules/spec.md)、[Boundary Hygiene](../specs/archive/boundary-hygiene/spec.md)。
- **依赖纪律**：仅 `contracts` 允许外部 `zod`；React/Vue 仅为各自桥接包 peer 依赖；Moveable 逻辑层源码 vendor，
  不引入 npm 交互依赖。依据：[Designer 依赖候选评估](../plans/archive/designer-dependency-introduction/dependency-evaluation.md)、
  [ADR-0020](../decisions/ADR-0020-designer-canvas-interaction-pilot.md)。

## Canonical 文档与解析

- **Canonical Screen Document**：严格契约、fail-closed 解析、诊断、序列化与 JSON Schema 黄金产物。
  依据：[Contracts Foundation](../specs/archive/contracts-foundation/spec.md)、[Core Domain](../specs/archive/core-domain/spec.md)、
  [ADR-0002](../decisions/ADR-0002-canonical-screen-document.md)。

## Renderer 与 Viewer

- **纯展示职责**：Viewer 只消费 canonical 文档并渲染物料 DOM，不含编辑/设计逻辑；Viewer Shadow DOM 与事件边界隔离。
  依据：[Renderer And Viewer](../specs/archive/renderer-viewer/spec.md)、[ADR-0005](../decisions/ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)。

## Designer 能力

- **画布交互**：单/多选移动、选区吸附、坐标换算与瞬态预览。依据：[Designer Canvas Precision](../specs/archive/designer-canvas-precision/spec.md)。
- **事件系统**：浏览器默认键盘/鼠标行为管控、统一命令通道、手势抑制与零宿主影响守卫。依据：[Designer Event System](../specs/archive/designer-event-system/spec.md)、
  [ADR-0006](../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)。
- **主题 Token**：宿主可配置的 Designer chrome Token、dark/light 与自有滚动条边界。依据：[Designer Theme Tokens](../specs/archive/designer-theme-tokens/spec.md)、
  [ADR-0024](../decisions/ADR-0024-designer-public-style-tokens.md)。
- **作者扩展（轻量基座）**：JSON-safe 声明式 Manifest Editor Descriptor、宿主作者桥、结构化事件声明与内建面板 primitives；
  Blueprint 图形/代码/完整领域配置编辑器归宿主。依据：[Designer Authoring Extension](../specs/archive/designer-authoring-extension/spec.md)、
  [ADR-0028](../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)。
- **事件 Blueprint**：canonical Blueprint、Core compile/trace/replace/history/诊断、事件面板摘要/能力状态/宿主请求入口。
  依据：[Designer Event Blueprint](../specs/archive/designer-event-blueprint/spec.md)、[ADR-0026](../decisions/ADR-0026-designer-event-blueprint-authoring.md)。

## 物料体系

- **物料契约与 ABI**：manifest 类型、校验、只读 catalog 与同 realm Web Component ABI。
  依据：[Plugin Core Contract](../specs/archive/plugin-core-contract/spec.md)、[ADR-0003](../decisions/ADR-0003-web-component-material-abi-and-registration.md)。
- **官方数据物料契约**：图表与表格的最小数据语义契约。依据：[Official Data Material Contracts](../specs/archive/data-material-contracts/spec.md)、
  [ADR-0022](../decisions/ADR-0022-official-data-material-contracts.md)。
- **物料库可见性**：Manifest 可选 `libraryVisible` 与 Designer 物料库过滤，容器移出物料库。
  依据：[Material Library Visibility](../specs/archive/material-library-visibility/spec.md)、[ADR-0021](../decisions/ADR-0021-material-library-visibility.md)。
- **宿主托管物料包**：宿主负责加载与信任，plugin-sdk `createMaterialPackage` 注册辅助；远程代码加载不进 Base Screen。
  依据：[Host Material Package](../specs/archive/host-material-package/spec.md)、[ADR-0029](../decisions/ADR-0029-host-managed-material-package-distribution.md)。
- **草稿物料流程**：设计期显式草稿交接、目录叠加与正式发布预检。依据：[Host Draft Material Workflow](../specs/archive/host-draft-material-workflow/spec.md)。
- **在线物料 MCP**：规范快照 + 在线物料查询/校验 MCP 契约与 stdio 参考服务。依据：[Host Material MCP Access](../specs/archive/host-material-mcp-access/spec.md)、
  [ADR-0030](../decisions/ADR-0030-host-material-mcp-access.md)。

## 宿主边界与数据运行时

- **轻量基座定位**：项目、数据、资产、发布、长任务等真实处理归宿主，Base Screen 通过 JSON-safe intent/port/method/event
  请求宿主能力。依据：[ADR-0027](../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
  [ADR-0017](../decisions/ADR-0017-designer-product-host-boundaries.md)。
- **Host Resource 与 Blueprint 运行时**：opaque 资源意图、deadline 与受限运行时。依据：
  [Host Resource And Blueprint](../specs/archive/host-resource-blueprint/spec.md)、[ADR-0010](../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md)。
- **宿主数据集集成与数据运行时**：数据集目录、参数绑定、字段映射、预览、Viewer 取数闭环；请求身份与共享、
  元数据/错误协议、初始化/参数/变量/执行上下文。依据：[Host Dataset Integration](../specs/archive/host-dataset-integration/spec.md)、
  [Data Runtime Hardening](../specs/archive/data-runtime-hardening/spec.md)、[ADR-0023](../decisions/ADR-0023-host-dataset-resource-integration.md)、
  [ADR-0025](../decisions/ADR-0025-data-runtime-hardening.md)。

## 宿主作者工具（Skill）

- **宿主大屏/物料 Skill**：从宿主安全快照生成专属设计/物料创建 Skill，统一命令与 `.base-screen/tooling` 宿主工具包。
  依据：[Host Screen Skill Generation](../specs/archive/host-screen-skill-generation/spec.md)、
  [Host Material Skill Generation](../specs/archive/host-material-skill-generation/spec.md)、
  [Host Skill Adoption](../specs/archive/host-skill-adoption/spec.md)。

## 安全与插件运行时

- **远程插件 Sandbox**：不可信 iframe 插件协议、来源校验、能力缩减与跨 origin transport。
  依据：[Remote Plugin Sandbox](../specs/archive/remote-plugin-sandbox/spec.md)、[ADR-0009](../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)。
- **插件生命周期与权限**：候选预检、依赖解析、能力授权与实例级 contribution authority。
  依据：[Plugin Manager Runtime](../specs/archive/plugin-manager-runtime/spec.md)、[ADR-0015](../decisions/ADR-0015-runtime-contribution-authority.md)。

## 历史迁移

- **Nebula Importer**：离线 legacy export 转换、审计报告与 provenance。
  依据：[Nebula Importer](../specs/archive/nebula-importer/spec.md)、[ADR-0011](../decisions/ADR-0011-nebula-importer-auditable-migration.md)、
  [来源记录](../provenance/README.md)。

## 维护规则

- 修改现有能力、修复缺陷或补充验证，视影响范围新建增量 Spec；涉及公共边界先更新 ADR。
- 新需求不得重新打开归档 Spec；历史验收材料只用于追溯。

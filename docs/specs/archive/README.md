# 已归档规格

> 状态：只读历史记录
> 最近更新：2026-08-12

本目录保留已完成或被后继 Spec/ADR 取代的规格、任务和验收快照，用于追溯当时的范围、决策和实施进度。

- 归档文档不得作为新实现的授权或验收依据。
- 原有任务勾选状态按归档时快照保留，不自动迁移到后继规格。
- 仍需实施时，后继规格必须在 `docs/specs/README.md` 的“生效中”区域登记；范围被取消时必须链接已接受 ADR。
- 修复失效链接、补充归档说明或 provenance 可以修改归档文件；不得继续推进其中的未完成任务。
- 2026-08-12 阶段封版：全部历史 Spec 归档，当前无生效中 Spec；新功能须新建 ADR/Spec（见 [索引](../README.md)）。

## 目录

| 归档规格 | 后继依据 | 归档日期 |
| --- | --- | --- |
| [Designer Authoring And Project Lifecycle](./designer-authoring-project-lifecycle/spec.md) | [Designer Engine](./designer-engine/spec.md) | 2026-08-04 |
| [Designer Engine](./designer-engine/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Core Domain](./core-domain/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Plugin Core Contract](./plugin-core-contract/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Plugin Manager Runtime](./plugin-manager-runtime/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Runtime And Ecosystem Hardening](./runtime-ecosystem-hardening/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Designer Product Completion](./designer-product-completion/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Designer Workbench Control Styles](./designer-workbench-control-styles/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Directory Structure Rules](./directory-structure-rules/spec.md) | 已完成（无后继） | 2026-08-05 |
| [Designer Full Product](./designer-full-product/spec.md) | [ADR-0027：轻量设计器基座与宿主重型处理边界](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) | 2026-08-10 |
| [M0 Engineering Baseline](./m0-engineering-baseline/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Contracts Foundation](./contracts-foundation/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Renderer And Viewer](./renderer-viewer/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Resource And Blueprint](./host-resource-blueprint/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Nebula Importer](./nebula-importer/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Remote Plugin Sandbox](./remote-plugin-sandbox/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Designer Canvas Precision](./designer-canvas-precision/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Designer Event System](./designer-event-system/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Boundary Hygiene](./boundary-hygiene/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Designer Theme Tokens](./designer-theme-tokens/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Material Library Visibility](./material-library-visibility/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Official Data Material Contracts](./data-material-contracts/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Dataset Integration](./host-dataset-integration/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Data Runtime Hardening](./data-runtime-hardening/spec.md) | 已完成（无后继）；覆盖 [ADR-0025](../../decisions/ADR-0025-data-runtime-hardening.md) | 2026-08-12 |
| [Designer Event Blueprint](./designer-event-blueprint/spec.md) | 已完成（无后继）；依据 [ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md) | 2026-08-12 |
| [Designer Authoring Extension](./designer-authoring-extension/spec.md) | 已完成（无后继）；依据 [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0028](../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md) | 2026-08-12 |
| [Host Screen Skill Generation](./host-screen-skill-generation/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Material Skill Generation](./host-material-skill-generation/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Skill Adoption](./host-skill-adoption/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Material Package](./host-material-package/spec.md) | 已完成（无后继）；依据 [ADR-0029](../../decisions/ADR-0029-host-managed-material-package-distribution.md) | 2026-08-12 |
| [Host Material MCP Access](./host-material-mcp-access/spec.md) | 已完成（无后继）；依据 [ADR-0030](../../decisions/ADR-0030-host-material-mcp-access.md) | 2026-08-12 |
| [Host Draft Material Workflow](./host-draft-material-workflow/spec.md) | 已完成（无后继） | 2026-08-12 |

> 注：2026-08-12 归档的 Spec 均为“需求 → 实现 → 测试 → 验收”闭环后封版；归档后不接受重新打开旧任务，
> 后续扩展一律以新的增量 Spec 承载。

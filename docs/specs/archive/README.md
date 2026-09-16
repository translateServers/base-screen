# 已归档规格

> 状态：只读历史记录
> 最近更新：2026-09-12
> 归档总数：62

本目录保留已完成或被后继 Spec/ADR 取代的规格、任务和验收快照，用于追溯当时的范围、决策和实施进度。

- 归档文档不得作为新实现的授权或验收依据。
- 原有任务勾选状态按归档时快照保留，不自动迁移到后继规格。
- 仍需实施时，后继规格必须在 `docs/specs/README.md` 的“生效中”区域登记；范围被取消时必须链接已接受 ADR。
- 修复失效链接、补充归档说明或 provenance 可以修改归档文件；不得继续推进其中的未完成任务。
- 2026-08-12 阶段封版时，全部历史 Spec 已归档；新功能须新建 ADR/Spec（见 [索引](../README.md)）。

## 目录

| 归档规格 | 后继依据 | 归档日期 |
| --- | --- | --- |
| [外围插件分区](./peripheral-plugin-partition/spec.md) | 已完成（2026-09-12，含后续阶段全部任务） | 2026-09-12 |
| [DataV Global Variables](./datav-global-variables/spec.md) | 已完成；ADR-0068 | 2026-09-03 |
| [DataV-Inspired Global Variables](./datav-inspired-global-variables/spec.md) | 由 ADR-0068 取代 | 2026-09-01 |
| [Host Resource Authoring](./host-resource-authoring/spec.md) | 已完成；[ADR-0064](../../decisions/ADR-0064-host-resource-authoring-intent.md) | 2026-08-31 |
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
| [Data Runtime Hardening](./data-runtime-hardening/spec.md) | 已完成（无后继）；覆盖 ADR-0025 | 2026-08-12 |
| [Designer Event Blueprint](./designer-event-blueprint/spec.md) | 已完成（无后继）；依据 ADR-0026 | 2026-08-12 |
| [Designer Authoring Extension](./designer-authoring-extension/spec.md) | 已完成（无后继）；依据 [ADR-0027](../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、ADR-0028 | 2026-08-12 |
| [Host Screen Skill Generation](./host-screen-skill-generation/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Material Skill Generation](./host-material-skill-generation/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Skill Adoption](./host-skill-adoption/spec.md) | 已完成（无后继） | 2026-08-12 |
| [Host Material Package](./host-material-package/spec.md) | 已完成（无后继）；依据 [ADR-0029](../../decisions/ADR-0029-host-managed-material-package-distribution.md) | 2026-08-12 |
| [Host Material MCP Access](./host-material-mcp-access/spec.md) | 已完成（无后继）；依据 [ADR-0030](../../decisions/ADR-0030-host-material-mcp-access.md) | 2026-08-12 |
| [Host Draft Material Workflow](./host-draft-material-workflow/spec.md) | 已完成（无后继） | 2026-08-12 |

> 注：2026-08-12 归档的 Spec 均为“需求 → 实现 → 测试 → 验收”闭环后封版；归档后不接受重新打开旧任务，
> 后续扩展一律以新的增量 Spec 承载。

## 2026-08-30 增量归档

| 归档规格 | 后继依据 | 归档日期 |
| --- | --- | --- |
| [Material Library Host State](./material-library-host-state/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Left Panel](./designer-left-panel/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Host Material Library Grouping](./host-material-library-grouping/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Material Library Visual Refinement](./designer-material-library-visual-refinement/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Material Library Error Console](./material-library-feedback-workspace-placement/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Viewport Native Events](./designer-viewport-native-events/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Panel Collapse Fixes](./designer-panel-collapse-fixes/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Host Preview Handler](./designer-host-preview/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Topbar Project Title](./designer-topbar-project-title/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Material Cover Thumbnail](./material-cover-thumbnail/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Material Cover Adaptive Fit](./material-cover-adaptive-fit/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Material Library Render Scalability](./material-library-render-scalability/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Canvas Background Image](./canvas-background-image/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Text Material Typography](./text-material-typography/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Canvas Background Palette](./canvas-background-palette/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Unified Color Palette](./unified-color-palette/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Canvas Text Editing](./designer-canvas-text-editing/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Multi Selection Editing](./designer-multi-selection-editing/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Designer Variable Management](./designer-variable-management/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Official Material Visual Capabilities](./official-material-visual-capabilities/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Image Material URL Validation](./image-material-url-validation/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Color Palette Gradient From Solid](./color-palette-gradient-from-solid/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Component Conditional Style Rules](./component-conditional-style-rules/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Conditional Style Port](./conditional-style-port/spec.md) | 已完成；行为见[能力基线](../../baseline/README.md) | 2026-08-30 |
| [Document Blueprint Host Bridge](./document-blueprint-host-bridge/spec.md) | 已被 [Designer Blueprint Workbench](./designer-blueprint-workbench/spec.md) 取代 | 2026-08-30 |
| [Designer Blueprint Workbench](./designer-blueprint-workbench/spec.md) | 已完成；依据 ADR-0063 | 2026-08-30 |

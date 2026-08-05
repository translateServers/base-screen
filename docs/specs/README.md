# Base Screen 功能与工程规格

> 状态：生效中
> 最近更新：2026-08-05
> 定位：索引可直接验收和实施的 Base Screen Spec

## 生效中

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [M0 工程基线](./m0-engineering-baseline/spec.md) | M0 | Monorepo、十二包骨架、工具链、边界门禁和私有 tarball 验收 |
| [Contracts Foundation](./contracts-foundation/spec.md) | P0 | Canonical Document、JSON boundary、parser、诊断、序列化和 JSON Schema |
| [Renderer And Viewer](./renderer-viewer/spec.md) | M2 | 目录消费、物料 DOM diff、Viewer Shadow DOM 与事件边界 |
| [Host Resource And Blueprint](./host-resource-blueprint/spec.md) | M5 | 当前 Document、opaque 资源意图和受限运行时 |
| [Nebula Importer](./nebula-importer/spec.md) | M7 | 离线 legacy export 转换、报告和 provenance |
| [Remote Plugin Sandbox](./remote-plugin-sandbox/spec.md) | M8 | 不可信 iframe 插件协议、来源校验和能力缩减 |

## 生效中（增量）

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [Designer Full Product](./designer-full-product/spec.md) | Designer 产品后继增量 | 完整作者、图形 Blueprint、宿主解耦资源/资产和项目产品能力 |
| [Designer Canvas Precision](./designer-canvas-precision/spec.md) | Designer 画布增量 | 以瞬态 `translate` 预览强化单/多选移动、选区吸附与坐标换算 |

## 已归档

| Spec | 归档日期 | 后继规格 | 说明 |
| --- | --- | --- | --- |
| [Designer Authoring And Project Lifecycle](./archive/designer-authoring-project-lifecycle/spec.md) | 2026-08-04 | [Designer Engine](./archive/designer-engine/spec.md) | 保留 Nebula parity 与旧项目生命周期任务进度，不再作为现行实施或验收依据 |
| [Designer Engine](./archive/designer-engine/spec.md) | 2026-08-05 | 已完成 | 三件套已全部勾选，作为历史行为依据保留 |
| [Core Domain](./archive/core-domain/spec.md) | 2026-08-05 | 已完成 | 文档状态、命令、事务、历史、组件树语义与几何算法已落地 |
| [Plugin Core Contract](./archive/plugin-core-contract/spec.md) | 2026-08-05 | 已完成 | 物料 ABI、插件协议、只读目录、标准事件与限权命令端口已落地 |
| [Plugin Manager Runtime](./archive/plugin-manager-runtime/spec.md) | 2026-08-05 | 已完成 | 候选预检、依赖解析、能力授权、生命周期与目录事务已落地 |
| [Runtime And Ecosystem Hardening](./archive/runtime-ecosystem-hardening/spec.md) | 2026-08-05 | 已完成 | Sandbox/Host Resource/Blueprint/plugin 生产级验收已完成 |
| [Designer Product Completion](./archive/designer-product-completion/spec.md) | 2026-08-05 | 已完成 | Designer 产品主线增量已落地 |
| [Designer Workbench Control Styles](./archive/designer-workbench-control-styles/spec.md) | 2026-08-05 | 已完成 | Engine token、控件、Shadow DOM 样式隔离与视觉验收已落地 |
| [Directory Structure Rules](./archive/directory-structure-rules/spec.md) | 2026-08-05 | 已完成 | 目录结构、engine 分层、测试外置与构建产物卫生已落地 |

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、验收场景和完成定义。
- 实现不得静默偏离 Spec；需要改变公共边界时先更新 ADR。
- Spec 状态为“生效中”后才允许进入对应实现。
- 完成后保留 Spec 作为行为依据，不把实施细节反写为新的隐式契约。
- 已归档 Spec 只用于追溯历史决策和进度；新实现不得以其中的未完成项替代现行三件套。

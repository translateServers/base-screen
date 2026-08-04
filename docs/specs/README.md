# Base Screen 功能与工程规格

> 状态：生效中
> 最近更新：2026-08-04
> 定位：索引可直接验收和实施的 Base Screen Spec

## 生效中

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [M0 工程基线](./m0-engineering-baseline/spec.md) | M0 | Monorepo、十二包骨架、工具链、边界门禁和私有 tarball 验收 |
| [Contracts Foundation](./contracts-foundation/spec.md) | P0 | Canonical Document、JSON boundary、parser、诊断、序列化和 JSON Schema |
| [Core Domain](./core-domain/spec.md) | P1 | 文档状态、命令、事务、历史、组件树语义和几何纯算法 |
| [Plugin Core Contract](./plugin-core-contract/spec.md) | P1 | 物料 ABI、插件协议、只读目录、标准事件与限权命令端口 |
| [Plugin Manager Runtime](./plugin-manager-runtime/spec.md) | P2 | 候选预检、依赖解析、能力授权、生命周期与实例级目录事务 |
| [Renderer And Viewer](./renderer-viewer/spec.md) | M2 | 目录消费、物料 DOM diff、Viewer Shadow DOM 与事件边界 |
| [Designer Engine](./designer-engine/spec.md) | M3 后续增量 | Engine 主导的中文工作台、统一操作、作者编辑闭环与项目生命周期 |
| [Host Resource And Blueprint](./host-resource-blueprint/spec.md) | M5 | 当前 Document、opaque 资源意图和受限运行时 |
| [Nebula Importer](./nebula-importer/spec.md) | M7 | 离线 legacy export 转换、报告和 provenance |
| [Remote Plugin Sandbox](./remote-plugin-sandbox/spec.md) | M8 | 不可信 iframe 插件协议、来源校验和能力缩减 |

## 生效中（增量）

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [Runtime And Ecosystem Hardening](./runtime-ecosystem-hardening/spec.md) | P6-P7/M7-M8 增量 | Sandbox/Host Resource/Blueprint/plugin contribution、tarball bridge consumer 与 importer 生产级验收 |

## 已归档

| Spec | 归档日期 | 后继规格 | 说明 |
| --- | --- | --- | --- |
| [Designer Authoring And Project Lifecycle](./archive/designer-authoring-project-lifecycle/spec.md) | 2026-08-04 | [Designer Engine](./designer-engine/spec.md) | 保留 Nebula parity 与旧项目生命周期任务进度，不再作为现行实施或验收依据 |

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、验收场景和完成定义。
- 实现不得静默偏离 Spec；需要改变公共边界时先更新 ADR。
- Spec 状态为“生效中”后才允许进入对应实现。
- 完成后保留 Spec 作为行为依据，不把实施细节反写为新的隐式契约。
- 已归档 Spec 只用于追溯历史决策和进度；新实现不得以其中的未完成项替代现行三件套。

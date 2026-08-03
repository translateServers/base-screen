# Base Screen 功能与工程规格

> 状态：生效中
> 最近更新：2026-08-03
> 定位：索引可直接验收和实施的 Base Screen Spec

## 生效中

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [M0 工程基线](./m0-engineering-baseline/spec.md) | M0 | Monorepo、十二包骨架、工具链、边界门禁和私有 tarball 验收 |

## 设计中

| Spec | 阶段 | 说明 |
| --- | --- | --- |
| [Contracts Foundation](./contracts-foundation/spec.md) | P0 | Canonical Document、JSON boundary、parser、诊断、序列化和 JSON Schema |

## 使用规则

- Spec 必须引用已接受 ADR，并提供 Requirements、验收场景和完成定义。
- 实现不得静默偏离 Spec；需要改变公共边界时先更新 ADR。
- Spec 状态为“生效中”后才允许进入对应实现。
- 完成后保留 Spec 作为行为依据，不把实施细节反写为新的隐式契约。

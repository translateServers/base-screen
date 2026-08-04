# Base Screen 架构决策记录

> 状态：生效中
> 最近更新：2026-08-03
> 定位：索引 Base Screen 的架构决策、状态及其影响范围

## 使用规则

- ADR 记录影响公共契约、依赖方向、安全边界、兼容策略或工程基线的重要决策。
- 状态流转为：设计中 -> 评审中 -> 已接受 -> 已取代或已废弃。
- 已接受 ADR 不修改历史结论；方向变化时新增 ADR，并在新旧文档中互相标注。
- 评审中 ADR 不能作为实施授权。进入代码实现前还需要 acceptance-oriented Spec。
- ADR 中的示例配置用于冻结语义；精确实现文件由对应 Spec 验收。

## 决策索引

| ADR | 状态 | 日期 | 主题 |
| --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-monorepo-toolchain-and-package-boundaries.md) | 已接受 | 2026-08-03 | Monorepo、工具链、私有阶段版本与十二包依赖边界 |

| [ADR-0002](./ADR-0002-canonical-screen-document-and-migrations.md) | 已接受 | 2026-08-03 | Canonical Screen Document 与迁移策略 |
| [ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md) | 已接受 | 2026-08-03 | Web Component 物料 ABI 与注册规则 |
| [ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md) | 已接受 | 2026-08-03 | 插件生命周期、贡献点和信任边界 |
| [ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md) | 已接受 | 2026-08-04 | Renderer DOM、样式、Shadow DOM 与产品元素归属 |
| [ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md) | 已接受 | 2026-08-04 | Designer Engine DOM、交互与历史策略 |
| [ADR-0007](./ADR-0007-document-v2-host-resource-and-blueprint-runtime.md) | 已接受 | 2026-08-04 | Document V2、Host Resource 与受限 Blueprint 运行时 |
| [ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md) | 已接受 | 2026-08-04 | 远程插件 iframe sandbox 与消息协议 |

## 计划决策

| ADR | 优先级 | 主题 |
| --- | --- | --- |
| ADR-0007 | M5 | Host Resource 安全与执行模型 |
| ADR-0008 | M7 | Nebula importer 与集成边界 |

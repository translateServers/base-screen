# Base Screen 架构决策记录

> 状态：生效中
> 最近更新：2026-08-10
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

| [ADR-0002](./ADR-0002-canonical-screen-document.md) | 已接受 | 2026-08-04 | Canonical Screen Document 契约 |
| [ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md) | 已接受 | 2026-08-03 | Web Component 物料 ABI 与注册规则 |
| [ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md) | 已接受 | 2026-08-03 | 插件生命周期、贡献点和信任边界 |
| [ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md) | 已接受 | 2026-08-04 | Renderer DOM、样式、Shadow DOM 与产品元素归属 |
| [ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md) | 已接受 | 2026-08-04 | Designer Engine DOM、交互与历史策略 |
| [ADR-0007](./ADR-0007-host-resource-and-blueprint-runtime.md) | 已取代 | 2026-08-04 | Host Resource 与受限 Blueprint 运行时 |
| [ADR-0008](./ADR-0008-remote-plugin-sandbox-protocol.md) | 已取代 | 2026-08-04 | 远程插件 iframe sandbox 与消息协议 |
| [ADR-0009](./ADR-0009-remote-plugin-sandbox-cross-origin-transport.md) | 已接受 | 2026-08-04 | 远程插件跨 origin iframe transport |
| [ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md) | 已接受 | 2026-08-04 | Host Resource deadline 与 Blueprint 运行时 |
| [ADR-0011](./ADR-0011-nebula-importer-auditable-migration.md) | 已接受 | 2026-08-04 | Nebula importer 可审计迁移 |
| [ADR-0012](./ADR-0012-designer-project-lifecycle.md) | 已接受 | 2026-08-04 | Designer 项目生命周期 |
| [ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md) | 已接受 | 2026-08-04 | Core canonical Blueprint mutation |
| [ADR-0014](./ADR-0014-plugin-manifest-identity-only.md) | 已接受 | 2026-08-04 | Plugin Manifest identity-only 依赖 |
| [ADR-0015](./ADR-0015-runtime-contribution-authority.md) | 已接受 | 2026-08-04 | 实例级 runtime contribution authority |
| [ADR-0016](./ADR-0016-material-appearance-authoring-contract.md) | 已接受 | 2026-08-05 | Material 声明式外观作者契约 |
| [ADR-0017](./ADR-0017-designer-product-host-boundaries.md) | 已接受 | 2026-08-05 | 完整 Designer 产品的宿主边界 |
| [ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md) | 已接受 | 2026-08-05 | 宿主意图、资产与图形 Blueprint |
| [ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md) | 已接受 | 2026-08-05 | Designer 专项编辑依赖准入 |
| [ADR-0020](./ADR-0020-designer-canvas-interaction-pilot.md) | 已采纳 | 2026-08-06 | Designer 画布交互逻辑层移植（Moveable/Gesto 源码 vendor） |
| [ADR-0021](./ADR-0021-material-library-visibility.md) | 已接受 | 2026-08-07 | Material Manifest 可见性与 Designer 物料库过滤 |
| [ADR-0022](./ADR-0022-official-data-material-contracts.md) | 已接受 | 2026-08-07 | 官方图表与表格数据语义契约 |
| [ADR-0023](./ADR-0023-host-dataset-resource-integration.md) | 已接受 | 2026-08-07 | 宿主数据集目录、绑定与运行时取数 |
| [ADR-0024](./ADR-0024-designer-public-style-tokens.md) | 已接受 | 2026-08-07 | Designer 宿主可配置主题 Token |
| [ADR-0025](./ADR-0025-data-runtime-hardening.md) | 已接受 | 2026-08-09 | Data Runtime Hardening：宿主数据集边界、请求身份与共享、元数据/错误协议、初始化/变量/上下文、一次性迁移（部分取代 ADR-0010/0023 的跨组件去重归属） |
| [ADR-0026](./ADR-0026-designer-event-blueprint-authoring.md) | 已接受 | 2026-08-10 | Designer 事件 Blueprint 表单作者闭环与 Core trace；图形路径整体延后、零新增依赖 |
| [ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md) | 已接受 | 2026-08-10 | 轻量设计器基座定位与宿主重型处理边界；部分取代 ADR-0017 的完整产品范围 |

## 计划决策

ADR-0025 已于 2026-08-09 接受，治理已接受、实施进行中；相关任务与验收见
[Data Runtime Hardening Spec](../specs/data-runtime-hardening/spec.md)，XJ 侧见
XJ Data Hub 仓库 `.agent/specs/data-runtime-hardening/spec.md`。

ADR-0026 已于 2026-08-10 接受：事件 Blueprint 以键盘表单为唯一作者路径并新增 Core trace；图形路径整体延后，
本期不引入图库。评估证据与实施计划见 [Designer Event Blueprint Spec](../specs/designer-event-blueprint/spec.md)
与 [候选评估报告](../plans/designer-event-blueprint/dependency-evaluation.md)。

ADR-0027 已于 2026-08-10 接受：Base Screen 定位为轻量、可嵌入的大屏设计器基座；项目、数据、资产、发布和
长任务的真实处理由宿主负责，Base Screen 只拥有本地作者内核、渲染内核与有界宿主端口。

相关背景、实施计划和规格入口见 [文档索引](../README.md)。

# ADR-0030：宿主在线物料 MCP 访问

> 状态：已接受
> 日期：2026-08-12
> 依据：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0029](./ADR-0029-host-managed-material-package-distribution.md)
> 规格：[Host Material MCP Access Spec](../specs/archive/host-material-mcp-access/spec.md)

## 决策

1. Base Screen 以 MCP Resources 与只读/校验 Tools 定义 AI 访问在线物料目录的标准入口；MCP 只服务 AI 创作和查询，不是物料运行时加载器。
2. Base Screen 提供基于规范快照的 stdio 参考服务、两个业务 Skill 的调用规则和远程 Streamable HTTP 接入要求；生产认证、租户隔离、审计、限流、部署与权威目录仍由宿主拥有。
3. 在线会话优先使用 MCP，失败时可回退到已提交快照并显式标记陈旧状态；CI 与 Skill 生成始终离线读取规范快照。
4. MCP 可提供 Manifest、Schema、说明和受控 UTF-8 创作模板，但不得提供可执行运行包，不得 fetch、dynamic import 或执行返回内容。实际物料包仍由宿主依 ADR-0029 审核、加载和注册。
5. 不改变 ScreenDocument、物料 ABI、Engine 或公共 npm API，不新增核心 package。官方 TypeScript MCP SDK 仅用于仓库参考服务与协议测试。

## 公共能力

- Resources：物料目录、创作上下文、单个物料和单个创作模板。
- Tools：搜索物料、读取物料、读取模板、校验物料配置、校验候选物料。
- 所有响应携带 `hostId`、`catalogDigest` 和 `data`；所有输入拒绝未知字段。
- 首期不提供写操作、发布操作或 MCP Prompts。

## 后果

- 规范快照可选增加 `materialTemplates`，旧快照保持有效。
- 宿主 MCP 与快照 exporter 必须读取同一个权威目录；摘要漂移只提示人工同步，不自动修改仓库。
- 未来增加草稿提交或发布能力前，必须另行更新 ADR/Spec 并定义授权、确认与审计策略。

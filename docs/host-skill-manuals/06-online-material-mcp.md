# 在线物料 MCP 接入指南

在线物料采用“Skill 管流程、MCP 管实时查询与校验、规范快照管离线兜底”。MCP 不是运行时物料加载器；AI 不通过它下载或执行物料包。

## 启动参考服务

先构建公开包，再从 Base Screen 仓库运行：

```text
pnpm build
pnpm dev:material-mcp -- --snapshot <宿主仓库>/.base-screen/host-snapshot.json
```

参考服务使用 stdio，不含认证，只用于本地接入和契约验证。AI 客户端配置 `node` 命令、参考服务绝对路径和 `--snapshot` 快照绝对路径；Base Screen 不自动修改客户端配置。

协议冒烟检查：

```text
pnpm verify:material-mcp -- --snapshot <快照路径>
```

成功表示客户端可以发现两个固定 Resource、两个 Resource Template 和五个 Tool，并完成目录读取与搜索。

## AI 可用能力

Resources 提供目录、物料创作上下文、单个 Manifest 和受控模板。Tools 提供 `search_materials`、`get_material`、`get_material_template`、`validate_material_config`、`validate_material_candidate`。

成功响应包含 `hostId`、`catalogDigest` 和 `data`。MCP 摘要与本地 Skill 的 `generation-manifest.json.catalogDigest` 不一致时，以本次在线数据做发现和早期校验，同时提示维护者运行正常同步；不得自动修改仓库。

## 在线优先与离线兜底

- MCP 可用且响应合法：Skill 优先使用实时物料元数据。
- 超时、鉴权失败、服务不可用、宿主不匹配或响应非法：Skill 使用本地 references/assets，并明确提示数据可能过期。
- 不论 MCP 是否可用，最终仍运行生成 Skill 的本地确定性校验。
- CI 只运行 `pnpm base-screen:skills verify`，不连接 MCP，也不需要凭据。

## 生产远程服务要求

宿主把相同契约实现为 Streamable HTTP，并负责：

- 在 HTTP 边界使用 OAuth 完成用户身份、租户和 Tool 权限校验；未授权请求返回标准 HTTP 401。
- 从与快照 exporter 相同的权威目录读取数据，按当前用户过滤结果。
- 设置请求 deadline、速率限制、响应大小限制和脱敏日志。
- 审计 Tool、用户、租户、结果状态和追踪 ID，但不记录模板内容或凭据。
- 把目录变化转成通知与审计事件，由维护者人工同步、审查并合并。

首期没有提交草稿或发布 Tool。增加写操作前必须另行定义确认、幂等、授权和回滚。

## 安全限制

- `materialTemplates` 只允许宿主批准的 UTF-8 文本脚手架，路径必须被 `materialAuthoring.allowedFiles` 覆盖。
- 禁止绝对/越界路径、凭据、远程 import、生命周期脚本、脚本标记和超限内容。
- AI 把模板当作不可信参考文本，只能写入允许目录，不能直接执行。
- 实际物料包的审核、下载、完整性校验、加载和注册仍由宿主负责。

## 常见故障

- 连接后立即退出：先构建 `@base-screen/plugin-core`，确认快照路径存在。
- Resource/Tool 返回 not found：检查稳定 `type` 或模板 ID，不要猜测身份。
- 模板被拒绝：检查路径 allowlist、容量、凭证/远程 import 和生命周期文件名。
- 摘要漂移：运行 `pnpm base-screen:skills check-remote`，审查后再运行默认同步。
- 鉴权失败：由生产宿主修复 OAuth、租户或 Tool 权限；本地 stdio 参考服务不处理认证。

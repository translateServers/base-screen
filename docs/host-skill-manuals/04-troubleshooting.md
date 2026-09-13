# 故障排查

本指南覆盖宿主 Skill 接入与日常维护中的常见故障。先在宿主仓库运行
`pnpm base-screen:skills doctor`，它会逐项报告并给出修复建议。

## 工具未安装或版本不一致

现象：`pnpm base-screen:skills` 报脚本不存在。

处理：从 Base Screen 仓库再次执行安装命令：

```text
node <kit>/skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <宿主仓库路径>
```

命令会判断是首次安装还是受管升级。若报"manually changed managed file"或"Refusing to
overwrite"，说明工具包或清单被手工修改过，先修复再重试，不要强行覆盖。

## 快照格式不合法

现象：`pnpm base-screen:skills` 报"unknown field"、"is not valid JSON"、"missing X"等。

处理：

1. 运行 `pnpm base-screen:skills doctor` 查看快照检查项的具体报错。
2. 对照《宿主 Skill 配置参考》检查导出脚本输出的顶层字段和类型。
3. 注意未知字段、凭据、连接信息、可执行内容、远程 URL、超限数据都会被严格拒绝。
4. 修复导出脚本后重跑；任一步失败不会改动已提交快照和 Skill。

## 在线接口不可用

现象：`pnpm base-screen:skills` 报"Snapshot exporter failed"或"timed out"。

处理：

- 检查宿主网络、认证和租户配置。
- 导出脚本失败时以非零退出；命令输出已做脱敏（`[redacted]`）。
- 超时上限 120 秒，可先确认脚本本身能在该时限内完成。
- 使用 `pnpm base-screen:skills check-remote` 只读探测，不影响任何文件。

## 权限或凭证失效

现象：`pnpm base-screen:skills doctor` 中 `credential:*` 检查项显示"not set or empty"。

处理：在本地环境或 CI secret 中设置 `host-skills.json` 的 `credentialEnvVars` 列出的变量。
工具包只检查变量是否存在，从不读取或存储其值。CI 的 `verify` 命令不需要任何凭据。

## 本地存在人工修改，无法安全覆盖

现象：刷新或升级报"Refusing to update unmarked Skill directory"或"Legacy Skill copies under
.agents/skills are not fully managed"。

处理：

- 生成 Skill（`design-*`、`create-*`）被人为修改时，工具拒绝覆盖。把改动合并到宿主自己的
  逻辑里，或删除/迁移该目录后重新生成，而不是绕过标记。
- 旧布局下的三个工具 Skill 目录被手工修改时，先修复或移走再重试迁移。
- 不要删除 `generation-manifest.json` 或 `host-skill-tooling.json`，它们是所有权标记。

## CI 验证失败

现象：`pnpm base-screen:skills verify` 报"Generated Skill drift"或"snapshot digest mismatch"。

处理：

- 说明磁盘上的生成结果与从已提交快照重建的结果不一致，或清单被手工改动。
- 如果是正常目录更新，先运行 `pnpm base-screen:skills` 再提交，让 CI 使用最新结果。
- `verify` 本身不写任何文件，失败不会破坏现状；把它当作可执行的差异信号。

## 如何使用 `doctor` 自检

```text
pnpm base-screen:skills doctor
```

它检查：Node 版本、配置、导出脚本、包管理器入口、凭据环境变量、工具包摘要、已提交快照、
两个生成 Skill，逐项输出 `ok: true/false` 与修复提示。接入遇到任何问题时先跑它。

## MCP 连接、鉴权或模板失败

- 本地参考服务连接失败：先构建公开包，再检查快照绝对路径；运行 `verify:material-mcp` 定位。
- 生产服务返回 401：由宿主检查 OAuth、用户、租户和 Tool 权限；Skill 回退本地并提示陈旧。
- MCP 响应缺少 `hostId`、`catalogDigest` 或 `data`：视为非法响应，不继续信任其内容。
- 模板校验失败：检查路径是否落在 `allowedFiles`、是否超限或包含凭据、远程 import、生命周期脚本。
- 摘要不一致不是破坏性错误：在线发现优先，但必须提示执行人工审查后的正常同步。

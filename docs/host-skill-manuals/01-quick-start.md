# 宿主 Skill 快速接入指南

本指南面向新宿主开发者。只阅读本指南，你就能完成安装、首次同步、验证和一次更新，不需要
理解 Base Screen 内部结构。

## 前置条件

- 宿主仓库根目录有 `package.json`，并且可以运行 Node 22+。
- 宿主已经有自己的认证与目录查询能力（或准备实现一个导出脚本）。
- 你能从 Base Screen 仓库执行一条命令（或把该命令复制到宿主仓库内）。

## 一条命令完成安装

在 Base Screen 仓库执行：

```text
node skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <宿主仓库路径>
```

这个命令是幂等的，会一次性完成：

1. 把宿主工具包安装到宿主仓库 `.base-screen/tooling/base-screen-host-skills/**`（不参与 Codex
   Skill 发现）。
2. 生成缺失的 `.base-screen/host-skills.json` 配置。
3. 在宿主 `package.json` 注册统一的 `base-screen:skills` 脚本。
4. 运行宿主导出脚本，校验并规范化快照，刷新两个业务 Skill：
   - `.agents/skills/design-<hostId>-screens`（大屏设计）
   - `.agents/skills/create-<hostId>-material`（物料创建）

首次执行前，宿主必须已经提供 `package.json` 中的 `export:base-screen-skill-context` 脚本（见
配置参考），否则命令会失败并提示。

## 如何生成两个业务 Skill

安装命令成功本身就完成了首次生成。以后宿主目录变化，在宿主仓库执行：

```text
pnpm base-screen:skills
```

它会拉取最新快照并原子刷新规范快照和两个业务 Skill。任一步失败时，已提交的快照和两个 Skill
保持原状。

## 如何验证接入成功

在宿主仓库执行：

```text
pnpm base-screen:skills verify
```

该命令只使用已提交的 `.base-screen/host-snapshot.json`，不联网、不需要 Token，适合放进 CI。
输出包含两个 Skill 名称和快照摘要，出现任何缺失、额外或修改文件都会失败。

也可以在宿主仓库执行 `pnpm base-screen:skills doctor`，它会逐项报告 Node、包管理器、配置、
导出脚本、凭据环境变量、工具包和快照状态。

## 最短接入示例

假设宿主仓库已有 `package.json`。新增一个导出脚本：

```json
{
  "scripts": {
    "export:base-screen-skill-context": "node scripts/export-snapshot.mjs"
  }
}
```

`scripts/export-snapshot.mjs` 把脱敏后的目录写入
`process.env.BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE`（一个临时文件路径），写成一个 JSON 对象
（结构见配置参考）。然后执行 Base Screen 仓库的安装命令，再执行 `pnpm base-screen:skills verify`
即可完成接入。

## 从旧方式迁移的方法

如果宿主仓库已经使用旧的多文件上下文导出（`BASE_SCREEN_HOST_SKILL_CONTEXT_DIR`）：

1. 把旧导出脚本改为单文件 JSON 快照（见配置参考）。
2. 再次执行 Base Screen 仓库的安装命令。旧布局（`.agents/skills` 下的三个受管 Skill 和旧的
   `host-skill-kit-manifest.json`）在文件摘要完全匹配管理清单时会自动迁移；手工修改过的目录
   会被拒绝并给出修复提示。

迁移完成后，旧的 `init`/`check`/`sync` 命令不再可用，统一使用 `pnpm base-screen:skills` 系列。

## 下一步

- 日常刷新与在线更新检查见《宿主 Skill 日常使用与同步指南》。
- 配置项与导出脚本契约见《宿主 Skill 配置参考》。
- 遇到问题时见《故障排查》。

# 宿主 Skill 日常使用与同步指南

本指南面向已经完成接入、进入日常维护的宿主开发者。

## 日常刷新命令

宿主线上物料或数据集目录发布变化后，在宿主仓库执行：

```text
pnpm base-screen:skills
```

流程为：导出临时快照 → 严格校验并规范化 → 提交
`.base-screen/host-snapshot.json` → 原子刷新两个业务 Skill。任一步失败时，已提交快照和两个
Skill 保持原状。

## 在线更新检查

只想查看线上目录是否变化、不想改动任何文件：

```text
pnpm base-screen:skills check-remote
```

它会联网导出临时快照并报告 `changed: true/false`，不写任何文件，也不刷新 Skill。适合在
人工确认前先看差异是否存在。

## 人工确认与合并流程

Base Screen 的建议工作流是"先检查、后合并"：

1. 维护者运行 `pnpm base-screen:skills check-remote` 确认线上目录有变化。
2. 审查导出脚本对应的线上变更（新增/下架物料、数据集参数变化等）。
3. 确认无误后运行 `pnpm base-screen:skills` 完成刷新并提交。
4. 把两个业务 Skill 的差异一起提交审查；线上数据集目录变化后，站内大屏设计与物料创作会
   消费同一份规范快照，但真实取数仍按当前用户权限实时查询，不能把共享快照视为授权目录。

## 离线环境验证

CI 或离线机器不需要 Token、不需要联网：

```text
pnpm base-screen:skills verify
```

它只读取已提交的 `.base-screen/host-snapshot.json`，在内存中重建两个 Skill 并与磁盘上的生成
结果逐文件比对，检测缺失、额外、修改文件以及快照摘要不匹配。

## 更新失败后的自动回滚

刷新是事务性的：

- 快照提交失败 → 旧快照保留，两个 Skill 不变。
- 任一 Skill 替换失败 → 快照回滚到旧内容，两个 Skill 都恢复原状。
- 导出脚本崩溃、超时、认证失败 → 什么都不改。

因此日常同步失败时不需要手动回滚，只需修复导出脚本或线上问题后重试。

## 如何查看当前快照、来源和更新时间

- 快照内容：`.base-screen/host-snapshot.json` 是提交的规范快照。
- 快照摘要：两个 Skill 的 `generation-manifest.json` 中的 `snapshotDigest` 与快照内容一致。
- 工具包来源：`.base-screen/host-skill-tooling.json` 记录 `sourceRevision` 和
  `sourceDigest`，指向生成工具包的 Base Screen 源码版本。
- 自检：`pnpm base-screen:skills doctor` 会逐项报告配置、凭据环境变量、工具包、快照和
  Skill 状态。

两个生成清单还记录 `catalogDigest`。在线 MCP 返回不同摘要时，表示本地目录已落后：先执行
`check-remote`，人工审查后再同步；MCP 不自动修改快照或 Skill。

注意：快照导出时不应写入时间戳、请求 ID 等瞬态字段，以保证重复导出结果稳定；快照本身不
记录"导出时间"，更新时间以宿主仓库的提交历史为准。

## 工具升级

Base Screen 发布新版本工具包后，再次执行安装命令即可受管升级：

```text
node skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <宿主仓库路径>
```

命令会自动判断是升级而不是覆盖，先校验工具包摘要，再整体替换；失败时恢复旧工具包和旧
清单，业务 Skill 不受影响。

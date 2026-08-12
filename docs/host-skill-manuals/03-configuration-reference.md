# 宿主 Skill 配置参考

本指南列出宿主侧所有配置项、导出脚本契约和环境变量。

## `.base-screen/host-skills.json` 配置项

```json
{
  "packageManager": "pnpm",
  "snapshotScript": "export:base-screen-skill-context",
  "credentialEnvVars": ["XJ_DATAHUB_TOKEN"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `packageManager` | 是 | `pnpm`、`npm` 或 `yarn`，用于以数组参数方式运行导出脚本 |
| `snapshotScript` | 是 | 宿主 `package.json` 中存在的包脚本名 |
| `credentialEnvVars` | 否 | 1 到 16 个安全环境变量名，`doctor` 会检查它们是否已设置；工具包从不写入或持久化其值 |

配置在首次安装时自动生成；一旦存在，只能直接编辑，不能用安装命令的覆盖参数修改。

## 快照生成脚本的输入输出

宿主包脚本接收环境变量：

```text
BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE=<临时文件绝对路径>
```

脚本必须把单一 JSON 对象写入该文件，顶层字段如下：

```json
{
  "host": { "hostId": "acme", "hostName": "Acme Operations", "locale": "zh-CN",
            "defaultCanvas": { "width": 1920, "height": 1080, "backgroundColor": "#07111f" } },
  "screenGuidelines": "大屏设计规则（纯文本，≤64 KiB）",
  "materialGuidelines": "物料创作规则（纯文本，≤64 KiB）",
  "materialAuthoring": {
    "framework": "native",
    "workspace": { "rootMarker": "package.json", "packageManager": "pnpm",
                   "verificationScripts": ["typecheck", "test"] },
    "roots": { "source": "src/materials", "tests": "tests/materials" },
    "registration": { "mode": "standalone", "file": "src/materials/register.ts",
                      "exportName": "registerAcmeMaterials", "policy": "propose" },
    "allowedFiles": ["src/materials/**", "tests/materials/**", "src/materials/register.ts"],
    "referenceSourcePaths": ["src/materials/text.ts"]
  },
  "components": [{ "id": "status-card", "name": "Status card", "framework": "native",
                   "sourcePath": "src/components/status-card.ts", "exportName": "StatusCard",
                   "role": "reference" }],
  "materials": [],
  "resourceTypes": [],
  "datasets": [],
  "datasetSamples": [],
  "materialProvenance": [],
  "materialTemplates": []
}
```

- 必填字段：`host`、`screenGuidelines`、`materialGuidelines`、`materialAuthoring`、
  `components`、`materials`、`resourceTypes`、`datasets`。
- 可选字段：`datasetSamples`（每项必须 `classification: "sanitized"`）、
  `materialProvenance`（`code` 或 `online`）、`materialTemplates`（受控 UTF-8 创作模板）。
- 导出脚本负责认证、租户/项目选择、线上查询、审批过滤、稳定排序与脱敏；失败时以非零退出码
  退出且不写部分快照。
- 禁止出现在快照中：凭据、连接信息、请求/时间戳 ID、私有记录、可执行内容、远程模块地址、
  未脱敏数据集样例。

快照上限：文件 12 MiB；样例合计 1 MiB、每样例 64 KiB 且不超过 50 行。

## 环境变量与凭证配置

- `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE`：导出脚本的输出路径（工具包设置）。
- `BASE_SCREEN_HOST_WORKSPACE_ROOT`：可选，指定宿主 workspace 根，供生成器解析宿主
  `node_modules` 中的 `@base-screen/*` 包。
- `credentialEnvVars` 中列出的变量：导出脚本所需的凭据，由宿主在本地或 CI secret 中提供；
  工具包只检查"是否已设置"，不读取、不存储其值。

## 两个业务 Skill 的目录和职责

| 目录 | Skill 名 | 职责 |
| --- | --- | --- |
| `.agents/skills/design-<hostId>-screens` | 大屏设计 | 新建/修订 Screen Document、物料与数据集选择、草稿物料 overlay、canonical/语义/布局/published-only 校验 |
| `.agents/skills/create-<hostId>-material` | 物料创建 | 新建/修订物料、`propose`/`apply` 注册策略、candidate 交接与失败回滚 |

这两个目录由快照生成，`generation-manifest.json` 记录 `snapshotDigest` 和物料相关字段的
`catalogDigest`。`.agents/skills` 下
不应出现工具 Skill；工具包在 `.base-screen/tooling/base-screen-host-skills/**`。

## 可选数据集样例、物料来源等扩展项

- `datasetSamples`：给大屏设计提供布局/取值范围的脱敏提示，不是授权目录。
- `materialProvenance`：区分 `code`（可修订）与 `online`（只读引用）物料。
- `materialTemplates`：最多 32 个模板；每模板最多 16 个文本文件、单文件 64 KiB、合计
  256 KiB。路径必须被 `allowedFiles` 覆盖，禁止越界、凭据、远程 import 和生命周期脚本。
- 草稿物料 catalog 与 request/candidate 交接文件位于正式快照之外，只在显式提供时校验。

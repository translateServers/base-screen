# 选择接入模式、安装和注册

> 返回[宿主使用指南](../usage.md)。

## 选择接入模式

宿主通常使用以下三种模式之一：

| 场景 | 元素 | 文档来源 | 保存方式 |
| --- | --- | --- | --- |
| 发布或只读预览 | Viewer | 宿主加载后赋给 `document` | 不适用 |
| 临时编辑或由宿主完全控制保存 | Designer | 宿主赋给 `document` | 监听 `base-screen-change` |
| 有项目 revision 的编辑页 | Designer | `projectAdapter.load()` | `projectAdapter.save()` |

Designer 的直接文档模式和项目模式是两种独立用法。项目模式绑定 `projectAdapter` 并调用
`load(projectId)`；不要再直接给 `document` 赋值。

## 安装和注册

### 先确认依赖来源

Base Screen 当前十二个包均为 `private: true`、`0.0.0`，没有公共 npm 发布版本。因此：

- 与 Base Screen 位于同一 pnpm workspace 的宿主现在可以使用 `workspace:^`。
- 独立仓库只有在发布方提供了组织内部 registry 中的同批次完整包集后，才能按包名安装。
- 不要把单个 `@base-screen/sdk` 的原始 `pnpm pack` tarball 当成可独立交付物。它仍引用其他
  `@base-screen/*` 包，单独安装会尝试从 registry 解析这些依赖。
- 不要复制 `dist`、从 `packages/*/src` 导入，或混用不同提交、不同批次的包产物。

同一 workspace 中，宿主 `package.json` 至少声明其直接导入的包：

```json
{
  "dependencies": {
    "@base-screen/contracts": "workspace:^",
    "@base-screen/material": "workspace:^",
    "@base-screen/plugin-core": "workspace:^",
    "@base-screen/sdk": "workspace:^"
  }
}
```

使用内部 registry 时，按发布方给出的 release manifest 锁定每个包的精确版本，并保证
`@base-screen` scope 已指向组织 registry：

```text
pnpm add --save-exact @base-screen/contracts@<contracts-version> \
  @base-screen/material@<material-version> \
  @base-screen/plugin-core@<plugin-core-version> \
  @base-screen/sdk@<sdk-version>
```

发布方如果交付离线制品，必须同时提供上述包及其全部内部依赖，并保证 tarball manifest 中的依赖
可在离线制品集中解析。当前仓库的 `pnpm verify:tarball` 会在临时仓库外消费者中验证完整依赖链，
但不会生成可长期分发的离线安装包。

宿主常用包职责如下：

```text
@base-screen/sdk          Viewer、Designer 和组合入口
@base-screen/contracts    文档、宿主端口和诊断类型
@base-screen/plugin-core  物料目录和运行时 contribution 契约
@base-screen/material     官方基础物料
```

按需增加：

```text
@base-screen/plugin-manager  插件激活和 capability 授权
@base-screen/plugin-sdk      宿主托管物料包
@base-screen/react           React 物料桥接
@base-screen/vue             Vue 物料桥接
```

### 注册 Custom Element

生产接入优先使用显式 `define*()` API：它能缩小注册范围，并允许宿主记录结构化诊断。最小 Viewer
示例见[创建物料目录](./material-catalog.md)、[加载文档与嵌入 Viewer](./viewer.md)和
[`examples/host-app-vanilla`](../../examples/host-app-vanilla/README.md)。

无需处理注册诊断时，也可以在浏览器启动入口使用副作用子路径一次性注册 Viewer、Designer 和
全部官方物料：

```ts
import '@base-screen/sdk/auto-register';
import '@base-screen/material/auto-register';
```

只使用 Viewer 时，可以缩小注册范围：

```ts
import '@base-screen/sdk/viewer/auto-register';
import '@base-screen/material/auto-register';
```

这些副作用入口已在 package manifest 中精确列入 `sideEffects`，并由仓库外 Vite 生产构建验证，
不会被正常 tree-shaking 删除。应保持它们为顶层 import；默认包入口仍无注册副作用。SSR/SSG
项目只能在浏览器客户端入口导入这些子路径，不能让服务端模块执行 Custom Element 注册。

### 可运行的宿主工程

[`examples/host-app-vanilla`](../../examples/host-app-vanilla/README.md) 是最小技术栈的完整宿主工程
（Vite + 原生 TypeScript，只导入公开包入口），与 React / Vue 两版功能对等。它联调共享后端
[`examples/host-api`](../../examples/host-api/README.md)，覆盖文档 CRUD、设计器与查看器嵌入、
宿主项目适配器和数据通道——比"只渲染一份文档"更接近真实接入。三端总览与运行命令见
[`examples/README.md`](../../examples/README.md)。复制示例前，先按上文「先确认依赖来源」一节
接通宿主自己的依赖来源。

### 为宿主生成项目级 Skill

宿主若希望让 Codex 按自己的物料、数据集和设计规范创建大屏或物料，只需先在
`package.json` 提供 `export:base-screen-skill-context` 脚本。该脚本负责复用宿主现有认证和目录
接口，将脱敏的单一规范快照写入 `BASE_SCREEN_HOST_SKILL_SNAPSHOT_FILE` 指向的临时文件。

**不需要克隆 Base Screen 仓库。** 发布方向宿主提供打包好的宿主 Skill 工具包
（发布方执行 `pnpm pack:host-skill-kit`，产出 `base-screen-host-skill-kit/` 目录与同名 `.tgz`），
宿主解包到任意位置后，从工具包目录执行一次：

```text
node <kit>/skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs --host <宿主仓库路径>
```

**前置条件：** 生成器用 Base Screen 公开包校验快照，因此宿主 workspace 需要装有**同批次**的
`@base-screen/contracts`、`@base-screen/core`、`@base-screen/plugin-core` 与
`@base-screen/plugin-sdk`；宿主创作 React / Vue 物料时再按需加 `@base-screen/react` 或
`@base-screen/vue`。即使只做原生物料也要有 `plugin-sdk`——生成的物料 Skill 会指引作者调用其中的
`createMaterialDefinition`。缺失时命令会明确提示安装，工具包自身不内嵌也不下载这些包。

这一个命令是幂等的：它会安装或安全更新 `.base-screen/tooling` 下的宿主工具包（不参与 Codex
Skill 发现）、生成缺失配置、注册统一的 `base-screen:skills` 包脚本，并同步大屏设计与物料创建
两个宿主 Skill。以后宿主目录变化，只需在宿主仓库执行：

```text
pnpm base-screen:skills
```

CI 使用 `pnpm base-screen:skills verify`（只依赖已提交的 `.base-screen/host-snapshot.json`，
不联网、不需要 Token）。按需可用 `pnpm base-screen:skills check-remote` 检查线上目录是否变化
（只报告、不写文件），用 `pnpm base-screen:skills doctor` 自检。快照单文件契约和安全边界见
`skills/manage-base-screen-host-skills/references/snapshot-contract.md`。

宿主侧手册见 `docs/host-skill-manuals/`：快速接入、日常同步、配置参考、故障排查与
XJDataHub 落地方向。

宿主需要 AI 实时访问在线物料时，可按
[`在线物料 MCP 接入指南`](../host-skill-manuals/06-online-material-mcp.md) 接入。Base Screen 提供
stdio 参考服务和契约；生产 Streamable HTTP、OAuth、租户、审计及实际物料包加载均由宿主负责。

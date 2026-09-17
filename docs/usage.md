# Base Screen 宿主使用指南

本文面向把 Base Screen 嵌入现有 Web 应用的宿主开发者，说明宿主如何注册运行时、提供
Screen Document、接入项目存储与数据服务、接收事件，以及托管高级编辑器和自定义物料。
本文不介绍 Base Screen 仓库本身的开发流程。

当前接入状态：同一 pnpm workspace 内可以直接接入；独立仓库必须先由发布方提供组织 registry
中的完整同批次包集，或等价的完整离线制品集。仅有本仓库地址或单个 SDK tarball，还不足以完成
独立仓库安装。

Base Screen 提供两个 Custom Element：

- `base-screen-viewer`：渲染只读大屏，适合预览页和发布页。
- `base-screen-designer`：提供当前文档内的画布、选区、检查器、事务、历史和项目会话。

它们通过公开属性、方法、端口和 Custom Event 与宿主交互，不要求宿主更换 React、Vue 或
其他应用框架。

## 分篇导航

| 目标 | 分篇 |
| --- | --- |
| 选择接入模式、安装依赖、注册 Custom Element、生成宿主 Skill | [安装与注册](./usage/getting-started.md) |
| 建立物料 catalog、manifest 字段参考与最小完整示例 | [创建物料目录](./usage/material-catalog.md) |
| 加载和校验 Screen Document、嵌入 Viewer 与自适应策略 | [加载文档与嵌入 Viewer](./usage/viewer.md) |
| 直接文档模式、项目模式、程序化插入、主题与生命周期清理 | [嵌入 Designer](./usage/designer-embedding.md) |
| 画布与物料的内建作者能力、统一接入 Designer 宿主能力 | [Designer 作者能力](./usage/designer-authoring.md) |
| 数据集目录、资源解析、宿主变量、resource type 与 capability | [接入宿主数据](./usage/host-data.md) |
| 插件装配、贡献命令与插件面板元素生命周期 | [插件装配与贡献命令](./usage/plugin-assembly.md) |
| 物料事件、宿主事件、宿主动作与条件样式 | [事件与宿主动作](./usage/events-and-actions.md) |
| 多级物料分组、宿主扩展左侧分组、资源插入拖放、封面与渲染可扩展性 | [配置左侧物料库状态](./usage/material-library-state.md) |
| Blueprint 工作台与宿主高级编辑器 | [Blueprint 工作台](./usage/blueprint.md) |
| React、Vue、自定义物料与宿主托管外部物料包 | [框架桥接与物料包](./usage/frameworks-and-packages.md) |

## 先明确宿主边界

| Base Screen 负责 | 宿主负责 |
| --- | --- |
| Screen Document 的严格契约、解析、序列化和诊断 | 项目存储、目录、业务元数据、revision 和并发控制 |
| 当前实例内的渲染、编辑事务、撤销和重做 | 认证、授权、租户、路由、业务 Store 和审计 |
| Material ABI、物料目录和安全的数据结果投影 | 数据查询、聚合、缓存、轮询、ETL 和敏感参数 |
| 有界请求的取消、deadline 和迟到结果保护 | 资产上传、存储、转码、发布、部署、截图和长任务 |
| JSON-safe intent、port、method 和 event | 高级 Blueprint、代码和领域配置编辑器 |

Screen Document 只保存可移植的 canonical 数据。URL、SQL、token、请求头、数据库连接、宿主
服务对象、编辑器 session 和部署配置都不得写入文档。

大屏缩略图同样属于宿主：Base Screen Designer 不提供截取、上传或保存缩略图的内建入口。
宿主可在保存成功后使用自己的只读渲染、截图、上传和来源校验链路。物料库的 Manifest `cover`
只是宿主提供的展示 URL，不代表 Base Screen 拥有封面上传或资产存储。

## 交付前检查

- 文档进入运行时前通过 `parseScreenDocument()`，项目响应通过
  `parseScreenProjectEnvelope()`。
- 依赖来自发布方批准的同一批次完整包集，锁文件中没有源码路径、workspace 泄漏或混合批次。
- catalog 覆盖全部 material type，Custom Element 已注册，表格物料带正确 adapter。
- Viewer/Designer 使用 `configure()` 原子初始化；Viewer 已明确选择原始像素、`contain` 或 `cover`
  策略，宿主容器具有稳定尺寸。
- SSR/SSG 不在服务端执行 `/auto-register`，宿主生产构建已验证所需 Custom Element 仍被注册。
- 所有宿主端口处理 abort、权限、容量限制、诊断脱敏和 revision 冲突。
- 监听 `base-screen-diagnostic`，并为资源失败、超时、无 capability 和缺失物料建立监控。
- Screen Document 中没有 URL、SQL、token、header、连接信息、宿主服务对象和业务私有状态。
- 切换项目、租户、物料包或运行时能力时执行 `unload()`，不会复用旧端口或旧 snapshot。

## 常见问题

- **页面没有内容**：确认元素和物料已注册、catalog 包含文档中的 `type`，并检查诊断事件。
- **独立项目安装 SDK 后提示其他 `@base-screen/*` 包 404**：当前拿到的是不完整制品。改用同一
  workspace，或让发布方提供可解析全部内部依赖的同批次完整包集；不要只安装一个原始 SDK tarball。
- **Viewer/Designer 尺寸为 0**：给宿主容器和 Custom Element 设置明确的宽高及 `min-height: 0`。
- **Viewer 内容被裁切或没有随窗口变化**：Viewer 不自动适配容器；按[加载文档与嵌入 Viewer](./usage/viewer.md)的
  「`contain` / `cover` 自适应」选择策略，并由宿主在销毁时断开 `ResizeObserver`。
- **更换 catalog 或端口不生效**：调用 `unload()`，重新 `configure()`，再设置或加载文档。
- **宿主数据没有查询**：检查 resource type contribution、参数 schema、变量端口和 material 的
  `dataCapabilities`。
- **事件没有触发**：检查 material manifest 的事件声明、Blueprint capability 和对应宿主端口。
- **保存冲突**：保留本地文档，展示 `PROJECT_CONFLICT`，由用户决定继续编辑或显式重载远端。
- **高级编辑提交被拒绝**：检查 request ID、expected revision、component ID、schema 和容量限制，
  不要复用旧请求。

仓库中的可运行宿主示例：

- `examples/browser-harness`：项目 adapter、完整官方物料、宿主作者桥和外部物料包；日常唯一 dev 入口（`pnpm dev:browser-harness`）。
- `examples/host-quickstart`：只导入公开包入口的最小 Viewer；会被复制到仓库外并以 tarball 验证。
- `examples/material-mcp-server`：面向上层工具链的物料模板 MCP provider。

`browser-harness` 是本仓库的开发/验收 harness，会直接引用 workspace 源码，不应当作独立项目的安装模板。
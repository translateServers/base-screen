<div align="center">
  <img src="./docs/assets/banner.svg" alt="Base Screen：轻量、可嵌入、跨框架的大屏设计器基座" width="100%">
</div>

# Base Screen

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522.20-339933?logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.18.0-F69220?logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)
![Code style](https://img.shields.io/badge/code_style-Biome-60A5FA)

> Lightweight, embeddable, cross-framework dashboard designer foundation for the web.

Base Screen 是一个轻量、可嵌入、跨框架的大屏设计器基座，为现有 Web 应用提供可视化编辑、只读渲染和
物料扩展能力。宿主可以只接入展示页，也可以嵌入完整的设计器工作台，同时保留自己的业务界面和技术栈。

项目以 **Screen Document** 作为统一文档，以 **Web Components** 作为浏览器集成边界，以 **物料目录**
描述可使用的可视组件。Designer 编辑和 Viewer 展示围绕同一份文档工作；项目、数据、资产、发布和长任务的
真实处理由宿主负责，Base Screen 提供当前实例内的编辑、渲染与有界宿主端口。

[快速体验](#快速体验) · [在你的应用中使用](#在你的应用中使用) · [集成指南](./docs/usage.md) ·
[文档索引](./docs/README.md)

## 产品预览

![Base Screen 设计器：物料库、画布与属性检查器](./docs/assets/designer-preview.png)

上图来自仓库自带的浏览器示例：左侧是官方物料库，中央画布混合了文本、按钮、数据列表与图表组件，
右侧是画布与页面属性检查器。

## 适用场景

- 在已有业务系统中嵌入大屏编辑页，复用宿主的账号、权限、路由、项目存储和发布流程。
- 根据同一份大屏文档提供编辑预览和只读展示，并通过宿主端口接入业务数据与变量。
- 建立自己的可视化物料库，将原生 Web Components、React 或 Vue 组件接入统一的设计与渲染流程。

Base Screen 的交付重点是可组合的前端基座。示例中的项目目录、资源列表和模拟数据用于说明接入方式，
生产环境中的业务规则与服务仍由宿主实现。

## 核心能力

- **统一文档与编辑历史**：严格的文档解析、诊断、序列化和 JSON Schema；编辑通过命令与事务提交，
  支持撤销、重做和当前项目会话的脏状态管理。
- **画布设计与属性编辑**：单选与多选、移动、缩放、旋转、编组、图层排序、吸附和参考线，
  配合属性检查器、批量样式编辑、调色板及静态文本的画布内直接编辑。
- **独立 Viewer**：消费文档与物料目录进行展示，不包含设计器编辑逻辑；宿主可单独使用
  `base-screen-viewer` 构建预览页或发布页。
- **官方物料与分类浏览**：提供文本、矩形、椭圆、图片、容器、图表、ECharts 和表格物料；
  物料库支持搜索、收藏、最近使用、宿主多级分组、条目封面和窄面板分类浮层。
- **数据与视觉联动**：支持静态数据、宿主资源与变量；声明数据绑定能力的物料可使用数据集参数、字段映射
  和预览。条件样式与 Blueprint 运行时用于表达组件状态变化和事件联动，实际数据处理由宿主完成。
- **Canvas / Blueprint 工作台**：画布与事件蓝图共用文档、事务和历史；Base Screen 提供工作台外壳、
  语义面板和图投影，中央图形渲染、布局算法及画布手势由宿主接入。
- **物料与宿主扩展**：通过 Manifest 声明属性、样式、事件和编辑控件，支持 React/Vue 物料桥接、
  插件能力授权、主题 Token、公开命名 slot，以及宿主资源插入、拖放和替换。

完整能力、约束与实现依据见[当前能力基线](./docs/baseline/README.md)。

## 快速体验

本仓库开发环境要求 Node.js `22.23.2`、pnpm `11.18.0`。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dev:browser-harness
```

打开终端输出的本地地址即可查看浏览器组合示例；专项案例导航页是 `/cases.html`，`?designer` 为
验收用全屏设计器（即上文截图）。示例自带演示文档与模拟宿主能力，浏览方式见
[专项案例怎么看](./docs/guides/feature-cases.md)。

## 在你的应用中使用

接入通常分为四步：注册元素与物料 → 组装物料目录 → 解析文档 → 配置并装载。最小 Viewer 工程：

```html
<body>
  <base-screen-viewer></base-screen-viewer>
</body>
```

```ts
import { parseScreenDocument } from '@base-screen/contracts';
import {
  defineBaseScreenRectangleMaterial,
  defineBaseScreenTextMaterial,
} from '@base-screen/material';
import { createBaseScreenMaterialCatalog } from '@base-screen/plugin-core';
import { defineBaseScreenViewer } from '@base-screen/sdk/viewer';

// 1. 注册 <base-screen-viewer> 与官方物料
const viewerDefinition = defineBaseScreenViewer();
const text = defineBaseScreenTextMaterial();
const rectangle = defineBaseScreenRectangleMaterial();
if (!viewerDefinition.ok || !text.ok || !rectangle.ok) {
  throw new Error('Base Screen Custom Element registration failed.');
}

// 2. 组装当前实例可用的物料目录
const catalog = createBaseScreenMaterialCatalog([text.value, rectangle.value]);

// 3. 解析文档；入参为 Screen Document JSON，解析是 fail-closed 的，请处理返回的诊断
const parsed = parseScreenDocument(screenDocumentJson);

// 4. 配置实例并装载文档（configure 同样返回结果对象，此处从简）
const viewer = document.querySelector('base-screen-viewer')!;
viewer.configure({ catalog, instanceId: 'my-viewer', mode: 'viewer' });
viewer.document = parsed.value;
```

按接入方式区分三种集成模式：

| 模式 | 公共元素 | 文档与保存方式 |
| --- | --- | --- |
| 只读展示 | `base-screen-viewer` | 宿主加载并校验文档后赋给 `document` |
| 宿主控制的编辑 | `base-screen-designer` | 宿主设置 `document`，监听 `base-screen-change` 保存草稿 |
| 项目会话编辑 | `base-screen-designer` | 配置 `projectAdapter`，通过 `load(projectId)`、`save()` 对接项目服务 |

直接文档模式与项目模式应分别使用；绑定项目适配器后，通过项目 API 加载，不再直接赋值 `document`。

**获取包**：`@base-screen/*` 是私有、仅 ESM 的包，不在公共 npm registry 发布。同一 pnpm workspace
可直接声明 workspace 依赖；独立仓库使用发布方提供的完整同批次包集（tarball），单个 SDK tarball
不是可独立安装的交付物。安装、初始化、数据接入与自定义物料的完整流程见
[集成指南](./docs/usage.md)；最小可运行 Viewer 工程见
[Host Quickstart](./examples/host-quickstart/README.md)。接入真实业务时，替换示例中的宿主适配器
和端口实现，并只使用包的公开导出。

## 核心模型

**文档**保存画布、组件、变量和事件蓝图等可序列化状态；**物料**是可放入画布的可视组件，Manifest 描述
它的能力，catalog 汇集当前实例可用的物料。**宿主**是嵌入 Base Screen 的应用，通过公开属性、方法、
端口和事件连接业务服务。

```mermaid
flowchart LR
  Host["宿主应用"] <-->|"公开 API、端口与事件"| Designer["Designer · 可视化编辑"]
  Host <-->|"配置、资源与事件"| Viewer["Viewer · 只读展示"]
  Designer -->|"命令与事务"| Document["Screen Document · 统一文档"]
  Document -->|"加载与渲染"| Viewer
  Catalog["物料目录 · 官方与自定义物料"] --> Designer
  Catalog --> Viewer
```

宿主不需要更换 React、Vue 或其他应用框架。跨框架物料通过桥接包接入，Viewer 与 Designer 的公共集成面
仍是 Custom Element；宿主扩展使用公开 API，不依赖设计器内部 Shadow DOM 或 Store。

## 与宿主的职责划分

| 领域 | Base Screen 负责 | 宿主负责 |
| --- | --- | --- |
| 文档与项目 | 严格契约、编辑事务、历史和当前项目会话 | 项目目录、存储、业务元数据及服务端并发控制 |
| 数据与变量 | 资源意图、结果校验与投影、请求取消、超时和迟到结果保护 | 查询、聚合、缓存、ETL、凭证与数据权限 |
| 物料与资产 | 物料 ABI、目录消费、卡片展示与资源插入协议 | 物料模块加载与信任、资产上传、存储和转码 |
| 预览与发布 | 本地预览、保存与发布请求、宿主预览接管入口 | 路由、鉴权、部署、公开 URL、截图、视频及批量导出 |
| 作者扩展 | 内建编辑控件、Blueprint 语义编辑、公开方法与 slot 协议 | 中央图形画布、代码编辑器和复杂领域配置编辑器 |

文档只保存可移植的数据，不承载访问凭证、数据库连接或宿主服务对象。需要后台队列、持久缓存、跨实例共享
或长期运行的任务，应通过宿主能力完成。边界依据见
[ADR-0027：轻量设计器基座与宿主处理](./docs/decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)。

## 示例

日常只需一个入口：`pnpm dev:browser-harness`。其余两个示例不提供 `dev` 命令。

| 示例 | 主要用途 | 运行或验证入口 |
| --- | --- | --- |
| [browser-harness](./examples/browser-harness) | Viewer、Designer、官方物料、项目适配器和插件管理器组合；导航页 `/cases.html` | `pnpm dev:browser-harness` |
| [host-quickstart](./examples/host-quickstart/README.md) | 仅使用公开 API 的最小 Vanilla / Vite Viewer 宿主 | 按示例说明接入；由 `pnpm verify:tarball` 验证 |
| [material-mcp-server](./examples/material-mcp-server) | 面向上层工具链的物料模板 MCP provider | `node examples/material-mcp-server/server.mjs`；由 `pnpm verify:material-mcp` 验证 |

## 包结构

仓库使用 pnpm / Turbo 管理 `packages/` 下的 12 个包，公共入口统一使用 `@base-screen/*`：

| 包 | 职责 |
| --- | --- |
| `contracts` | Screen Document、宿主契约、严格解析、诊断、序列化与 JSON Schema |
| `core` | 文档命令、事务、历史与 Blueprint 运行时 |
| `renderer` | 物料模型与 DOM 渲染，保持纯展示职责 |
| `engine` | Designer 会话、画布交互、检查器和工作台编排 |
| `material` | 官方物料实现、Manifest 和注册辅助 |
| `plugin-core` | 物料与插件契约、Manifest 校验和 catalog |
| `plugin-manager` | 插件预检、加载管理、生命周期和能力授权 |
| `plugin-sdk` | 面向插件与物料作者的定义、注册和物料包辅助 |
| `react` / `vue` | 将对应框架的组件桥接为物料 |
| `sdk` | Viewer、Designer、物料与插件的产品级组合入口 |
| `testing` | 基于公共 API 的 fixture 与一致性测试辅助，仅用于测试 |

跨包调用只使用声明的公共导出。物料契约由 `plugin-core` 拥有，`renderer` 不依赖具体官方物料，
`sdk` 负责组合而不实现各包的领域逻辑。仓库分层与依赖规则见 [AGENTS.md](./AGENTS.md)。

## 文档导航

| 想了解的内容 | 入口 |
| --- | --- |
| 在自己的应用中嵌入 Base Screen | [集成指南](./docs/usage.md) |
| 已交付能力与已知边界 | [当前能力基线](./docs/baseline/README.md) |
| 创建数据集驱动的自定义物料 | [自定义组件最佳实践](./docs/custom-dataset-material-best-practice.md) |
| 为宿主配置大屏设计与物料创建 Skill | [宿主 Skill 快速接入](./docs/host-skill-manuals/01-quick-start.md) |
| 架构取舍与职责划分 | [架构决策记录](./docs/decisions/README.md) |
| 后续方向与候选主题 | [路线图](./docs/roadmap/README.md) |
| 改完后查看专项案例 | [专项案例怎么看](./docs/guides/feature-cases.md) |
| 验证失败排查 | [开发门禁故障排查](./docs/troubleshooting/verify-m0-troubleshooting.md) |

规格、计划、归档与来源记录统一从[文档索引](./docs/README.md)进入。当前能力以 Baseline 和已接受的 ADR
为依据，路线图中的候选主题不代表已经实现。

## 参与贡献

欢迎 issue 与 PR。提交信息遵循 Conventional Commits；环境搭建、分层边界、检查门禁与文档治理规则
统一见 [AGENTS.md](./AGENTS.md)。

## 许可证

本项目采用 [MIT License](./LICENSE)。第三方来源、授权与使用边界见[来源记录](./docs/provenance/README.md)。

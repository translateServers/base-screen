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

[快速体验](#快速体验) · [在你的应用中使用](#在你的应用中使用) · [示例总览](./examples/README.md)

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
- **官方物料与分类浏览**：核心库提供文本、矩形、椭圆、图片、容器、图表和表格物料（ECharts 等重型
  图表能力由 `plugins/` 外围插件承载）；
  物料库支持搜索、收藏、最近使用、宿主多级分组、条目封面和窄面板分类浮层。
- **数据与视觉联动**：支持静态数据、宿主资源与变量；声明数据绑定能力的物料可使用数据集参数、字段映射
  和预览。条件样式与 Blueprint 运行时用于表达组件状态变化、事件联动与组件关联，实际数据处理由宿主完成。
- **Canvas / Blueprint 工作台**：画布与蓝图共用文档、事务和历史；蓝图以一等组件关系表达交互、数据、业务出口与语义关联；Base Screen 提供工作台外壳、
  语义面板和图投影，中央图形渲染、布局算法及画布手势由宿主接入。
- **物料与宿主扩展**：通过 Manifest 声明属性、样式、事件和编辑控件，支持 React/Vue 物料桥接、
  插件能力授权、主题 Token、公开命名 slot，以及宿主资源插入、拖放和替换。

## 快速体验

本仓库开发环境要求 Node.js `22`（精确 patch 以 CI 矩阵为准）、pnpm `11.18.0`。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dev:browser-harness  # 浏览器验证矩阵（tooling/verification/browser-harness）
```

打开终端输出的本地地址即可查看浏览器组合示例；专项案例导航页是 `/cases.html`，`?designer` 为
验收用全屏设计器。示例自带演示文档与模拟宿主能力。

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
不是可独立安装的交付物。可直接运行的宿主工程见[示例总览](./examples/README.md)，其中的配置、
数据接入与自定义物料代码即为接入参考。接入真实业务时，替换示例中的宿主适配器
和端口实现，并只使用包的公开导出。

## 核心模型

**文档**保存画布、组件、变量和蓝图关系等可序列化状态；**物料**是可放入画布的可视组件，Manifest 描述
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
或长期运行的任务，应通过宿主能力完成。边界依据见 ADR-0027（轻量设计器基座与宿主处理）。

## 示例

全栈示例是「一个共享后端 + 三个对等前端」：三个前端只经 `@base-screen/*` 公共入口接入，
经 HTTP 联调同一个后端，演示宿主侧要做的全部事情（文档 CRUD、设计器与查看器嵌入、
项目适配器与数据通道、宿主自有物料）。总览与对等矩阵见 [示例总览](./examples/README.md)。

```bash
pnpm dev:shared-backend     # 终端 1：共享后端 http://127.0.0.1:3000
pnpm dev:react-host         # 终端 2：任选一个前端（vanilla 5173 / react 5174 / vue 5175）
```

基座自身的特性矩阵与人眼验收入口仍是 `pnpm dev:browser-harness`。

| 示例 | 主要用途 | 运行或验证入口 |
| --- | --- | --- |
| [shared-backend](./examples/shared-backend) | 三端共用的全栈后端：NestJS + Prisma/SQLite，文档 CRUD、revision 乐观锁、演示指标接口 | `pnpm dev:shared-backend`；`pnpm --filter @base-screen-example/shared-backend test` |
| [vanilla-host](./examples/vanilla-host) | 原生 TypeScript 宿主前端：hash 路由、DOM 助手、模块 store | `pnpm dev:vanilla-host`；`pnpm verify:examples` |
| [react-host](./examples/react-host) | React 宿主前端：react-router、hooks、React 物料桥（样式自包含） | `pnpm dev:react-host`；`pnpm verify:examples` |
| [vue-host](./examples/vue-host) | Vue 宿主前端：vue-router、SFC 物料桥；同时是 tarball 外部消费者载体 | `pnpm dev:vue-host`；`pnpm verify:tarball` |
| [browser-harness](./tooling/verification/browser-harness) | 基座特性矩阵：Viewer、Designer、官方物料、项目适配器与插件管理器组合；导航页 `/cases.html` | `pnpm dev:browser-harness` |
| [material-mcp-server](./tooling/material-mcp-server) | 面向上层工具链的物料模板 MCP provider | `node tooling/material-mcp-server/server.mjs`；由 `pnpm verify:material-mcp` 验证 |

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

## 延伸阅读

| 想了解的内容 | 入口 |
| --- | --- |
| 环境搭建、分层边界与检查门禁 | [AGENTS.md](./AGENTS.md) |
| 领域词汇与唯一实现落点 | [CONTEXT.md](./CONTEXT.md) |
| 可直接运行的宿主工程 | [示例总览](./examples/README.md) |
| 基座特性矩阵与专项案例 | [browser-harness 导航页](tooling/verification/browser-harness/cases.html) |

## 参与贡献

欢迎 issue 与 PR。提交信息遵循 Conventional Commits；环境搭建、分层边界与检查门禁规则
统一见 [AGENTS.md](./AGENTS.md)。

## 许可证

本项目采用 [MIT License](./LICENSE)。

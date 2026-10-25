# Base Screen 仓库指南

## 跨仓协作入口

- 涉及 xjdatahub 接入、职责划分、包同步或联合验收时，先执行 pnpm integration status，再按能力执行 context；使用 [跨仓工作流 Skill](.agents/skills/base-screen-integration-workflow/SKILL.md)，不全量读取两个仓库的知识库。
- 同一任务可按已确定职责修改双方相关源码；同步采用任务记录和受管文件保护。上游当前源码与下游实际包分开核验，未同步能力不得视为已接入。
- 规范唯一维护在 Skill 的 references/workflow.md；提交、推送、部署和生产操作仍遵循用户授权。
- **仪表盘创建**：宿主需要生成或刷新其专属的大屏设计 Skill（`design-<hostId>-screens`，使其他模型能依据宿主已脱敏的物料、数据、样例与品牌目录产出可导入的 Screen Document）时，使用 [create-base-screen-host-skill](skills/create-base-screen-host-skill/SKILL.md)；生成的子 Skill 不连接宿主端口、不查询实时数据、不存储凭证，也不把 URL、SQL、header、token 或服务对象写入 Screen Document。
- **物料创建**：宿主需要生成或刷新其专属的物料创作 Skill（`create-<hostId>-material`，覆盖原生、React、Vue 物料的创作、公共 ABI 校验与显式注册）时，使用 [create-base-screen-host-material-skill](skills/create-base-screen-host-material-skill/SKILL.md)；生成的子 Skill 不发布、不提交、不激活生产代码、不安装依赖、不连接实时服务，注册策略缺省为 propose，且不把凭证、URL、SQL、token、DOM 引用、函数或框架实例写入 manifest、编辑器描述符、Screen Document 或宿主快照。
- **宿主接入与管理运维**：宿主首次接入、例行刷新快照与生成的 Skill、漂移诊断或 CI 验证时，使用 [manage-base-screen-host-skills](skills/manage-base-screen-host-skills/SKILL.md)；它自身不查询宿主 API、绝不修改物料注册文件，生成产物与托管工具链均落在宿主受管目录（`.agents/skills/`、`.base-screen/tooling/`），任一步失败时既有快照与 Skill 保持原状。

## 环境搭建与验证

- 使用 Node `22`（见 `.node-version`；该文件只固定 major，精确 patch 以 CI 矩阵为准）和 pnpm `11.18.0`（见 `packageManager`）。通过 `pnpm install --frozen-lockfile` 安装；`.npmrc` 有意强制要求严格 peer 依赖，并禁用了自动安装 peer 依赖。
- CI 会在 Node 22.23.2 和 24.18.1 上运行 `pnpm verify:m0`，随后运行 `pnpm check:api-changesets`，并以 `git diff --exit-code` 收尾，要求验证未改动任何受跟踪文件。它依次运行 `format:check`、`lint`、`typecheck`、`test`、`check:packages`、`check:api`、`check:engine-import` 和 `verify:tarball`；链中没有会写入文件的 `format` 步骤（格式修正先手动运行 `pnpm format`），也没有独立的 `build` 步骤——各包构建由 Turbo 任务依赖间接触发（`test` 依赖 `^build`，`lint`/`typecheck` 依赖 `^build`）。`pnpm verify:fast` 是同一套门禁减去 `verify:tarball`。
- 迭代过程中默认使用 `pnpm test:scope` 按需执行受影响测试：`pnpm test:scope --since <ref>` 自动完成变更采集、包依赖闭包、engine 文件级映射与执行；`--dry-run` 只输出计划 JSON，`--json` 供机器读取，计划与报告落盘 `.base-screen/local/scratch/test-scope/`。退出码约定：`0` 全部通过（含「无受影响测试」，计划仍落盘可审计）、`1` 存在测试失败、`2` 参数或环境错误、`3` 闭包计算异常。AI agent 默认按需执行，仅在合并前或门禁场景触发 `verify:fast` / `verify:m0` 全量。其他聚焦检查仍可用：`pnpm --filter @base-screen/contracts test`、`pnpm --filter <package> typecheck`。在交付会影响包、构建产物或公共契约的改动前，先运行 `pnpm verify:m0`。
- 测试治理工具链按需使用：`pnpm test:audit` 输出无用/重复/过期测试候选报告（落盘可追溯，不自动删除，清理走人工确认 PR 流程）；`pnpm test:tag` 输出标签打标建议（未打标测试默认 unit 且必跑）；`pnpm test:baseline` 采集效率与覆盖率指标基线。
- `pnpm lint` 先跑各包 lint（engine 包的 lint 还会执行 `check-designer-ui.mjs` 与 `check-designer-styles.mjs`），再运行边界与物料原子化检查（`check:boundaries`、`check:material-atomicity`）。`pnpm test` 会先通过 Turbo 运行各包测试，再运行根级 `tests/`。Turbo 的 `lint` 和 `typecheck` 会先构建依赖。
- `pnpm check:api` 需要构建好的 `dist/index.d.ts`。`pnpm verify:tarball` 会打包每个包，并把每个 tarball 安装到一个临时消费者工程中跑 publint/ATTW；ATTW 的 Node10/CJS 诊断属于预期噪音，除非命令本身失败。
- 手动验证的基座特性矩阵在 `tooling/verification/browser-harness`：`pnpm dev:browser-harness` 起 Vite dev server，`pnpm verify:browser` 是对应的 Playwright 验证脚本。改完功能后先打开它的 [`/cases.html`](tooling/verification/browser-harness/cases.html) 导航页（按改动面 / 关键词筛选专项案例），再进 `?designer&case=` 场景；不要为此引入 Storybook。只改样式时先看 [`/system.html`](tooling/verification/browser-harness/system.html) 设计系统清单（令牌 / 状态矩阵 / 组件一页铺开，浅深主题可切换）。默认 `/` 与 `?designer` 保持 Playwright 路径。
- 全栈示例是「一个共享后端 + 三个对等前端」：`examples/shared-backend`（NestJS + Prisma/SQLite，`pnpm dev:shared-backend` 起在 3000），以及 `examples/{vanilla,react,vue}-host`（`pnpm dev:*-host`，分别占 5173/5174/5175，经 Vite proxy 联调同一后端）。它们演示宿主侧接入——文档 CRUD、`<base-screen-designer>` / `<base-screen-viewer>` 嵌入、宿主 project adapter 与数据通道、宿主自有物料，以及外围插件物料与成品大屏种子的消费（`plugin-board-materials` / `plugin-echarts` 经宿主自有 manager 合并进 catalog，三个前端对等）；总览见 `examples/README.md`。示例只声明 `dev`/`build`/`typecheck`（shared-backend 另有 `test`，进 CI），构建与浏览器级验证不进 `verify:m0`：`pnpm verify:examples` 是手动冒烟且需先各自 build，其中 Vue 前端还随 `verify:tarball` 复制到仓库外、替换为同批次真实 tarball 后验证。
- `tooling/material-mcp-server` 是面向上层工具链的物料模板 MCP provider，由根级测试与 `verify:material-mcp` 验证。

## 包边界

- 这是一个 pnpm/Turbo 单体仓库。`packages/` 下固定 12 个包，由 `tooling/checks/packages.mjs` 强制校验：`contracts`、`core`、`renderer`、`engine`、`material`、`plugin-core`、`plugin-manager`、`plugin-sdk`、`react`、`vue`、`sdk` 和 `testing`。
- 与 `packages/` 平行存在顶层 `plugins/` 外围插件区，承载带受控第三方依赖、独立于固定包清单交付的能力（现有 `plugins/plugin-echarts`、`plugins/plugin-metrics`、`plugins/plugin-board-materials`、`plugins/plugin-pipeline`）。分区的权威决策见 ADR-0074（外围插件区与依赖分区），兼容策略见 ADR-0075（外围插件兼容策略）。`check-packages.mjs` 的固定包清单约束不扩大到 `plugins/`。
- 外围插件依赖方向严格单向：`plugins/*` 可依赖 `packages/*` 的公共导出，`packages/*` 绝不依赖 `plugins/*`（含 dev 与 test）。外围插件无运行时特权，走与宿主插件相同的宿主提供/宿主加载/宿主授权通道，不新增信任通道。
- 新增包、放宽包清单或改变跨包导出时，必须更新包及边界检查。仅当该变更改变长期架构决策、包依赖/所有权或公共兼容策略时，才新增或更新 ADR；只有跨多个独立交付阶段、需要迁移或回滚方案，或用户明确要求时，才创建 Spec。所有包都是私有的、仅 ESM、只发布 `dist`，并通过 `exports` 暴露公共 API。
- 派生事实只有一个权威落点，引用而不复制：固定包清单在 `tooling/checks/packages.mjs`，依赖白名单在 `tooling/checks/boundaries.mjs`，工具版本在 manifest 与 lockfile。散文不得复述可由这些来源推导的数量或清单，避免产生两份没有门禁比对的副本。
- 机器可读索引 `.base-screen/integration-capabilities.json` 的 `references` 必须指向仍然存在的路径：`pnpm integration` 在 peer 仓库存在时校验它们，删除或改名被引用文件时必须同批更新该索引。
- 跨包导入只能使用声明的 `@base-screen/*` 公共导出。`tooling/checks/boundaries.mjs` 会拒绝未声明的依赖、来自 `examples`、`tooling` 或 Nebula 的导入、被禁止的依赖图边，以及对 `testing` 的生产依赖。
- 依赖白名单编码在 `tooling/checks/boundaries.mjs` 中，**按区维护**：`packages/` 区只有 `contracts` 可以使用外部 `zod`，React/Vue 仅作为各自桥接包的 peer 依赖；`plugins/` 区改为逐插件显式申报允许的外部依赖，不接受通配与继承。新增依赖时，必须同时更新该白名单和对应清单。
- `contracts`、`core`、`plugin-core`、`plugin-manager`、`plugin-sdk` 和 `testing` 使用 `tsc` 构建；它们内部的相对 TypeScript 导入必须使用 `.js` 后缀（`.json` 除外）。浏览器包和桥接包在声明文件生成后使用 Vite。
- `@base-screen/testing` 消费公共包 API 来提供 fixture 和一致性辅助工具。生产包绝不能导入它。

## 产品定位与宿主边界

- Base Screen 是轻量、可嵌入的大屏设计器基座，不是完整业务应用、项目管理产品、数据平台或后端平台。权威决策见 ADR-0027（轻量设计器基座与宿主处理）。
- Base Screen 负责 canonical document、严格契约、当前实例内的命令/事务/历史/画布/检查器、Viewer/Designer 渲染、物料 ABI，以及有界请求的取消、deadline、generation guard 和安全结果投影。
- 宿主负责实际存储与检索、认证授权、业务路由与 Store、数据查询/聚合/缓存/ETL、资产存储与转码、发布部署、公开 URL、截图/视频/批量导出和长任务。Base Screen 只通过 JSON-safe intent、port、method 或 event 请求这些能力。
- 需要凭证或租户状态、跨项目/跨实例共享、无明确容量上限、后台队列/持久缓存/长任务，或依赖特定业务基础设施的处理默认归宿主；不得在 Engine 中补建后端、通用网络客户端、任务队列或业务降级实现。
- 物料自定义属性面板使用 JSON-safe、声明式的 Manifest Editor Descriptor，控件为 Base Screen 内建控件或宿主授权的插件贡献控件（`control: 'custom'` + `kind: 'inspectorControl'`，仅绑 `props`/`style`）；不得注入 React/Vue component、render function、DOM Node、Promise 或宿主服务对象。Engine 只实例化 plugin-manager 解析出的授权目录项，绝不按清单标签 `createElement`——宿主注册过某标签不构成授权，未授权标签渲染为降级提示。依据见 ADR-0084（插件贡献词汇与信任；检查器自定义控件，原 ADR-0073 已由该主线合并记录吸收）。
- 右侧「数据源」页只有一条渲染路径（`DesignerDatasetController`）：宿主是否提供 `datasetPort` 只决定 `dataset` 选项是否可用，不得再用它决定渲染哪套面板；面板内容按 `data-ds-section` 分段，状态变化只换受影响的段。`host-resource` 数据源由宿主经公开的 host-resource authoring intent（`insertHostResource` 等）创建，Engine 不再提供 resourceType/resourceId 的自由文本编辑器，也不按清单标签推断授权。
- **已实现（ADR-0089）**：图片上传、存储、转码、CDN、素材目录、权限与删除保护归宿主；Base Screen 只提供统一资源选择桥（`base-screen-host-resource-selection-request` + `requestHostResourceSelection` / `commitHostResourceSelection`，由 `hostResourceSelectionButton` 启用）与有界校验，不建立资产目录、Store 或网络客户端。组件图片在文档中只存 `host-resource` 身份；`static` URL 仅用于历史/外部图片，画布背景 URL 是唯一例外。组件提交只写 legacy `dataSource`，且只接受没有 `dataValue` 键的组件（命令不能删键，契约禁止两种取值写法并存）。示例后端与三端宿主已实现上传、列表、插入/替换/背景、统一选择器与删除保护。
- **已实现（ADR-0090）**：在线物料包由宿主在线生成 ESM 代码并负责审核、`import()`、`define()` 与完整性；Base Screen 不 fetch，只接收重建后的 catalog。catalog 热刷新通过 `refreshCatalog()` 与 renderer `setCatalog()` 实现：Manifest-only 变化不重挂载，constructor / tagName / adapter 变化才重挂载；物料 `type` 跨构建稳定，代码更新使用同 type、新 tagName + 新 constructor，文档与 Manifest 不存版本字段。示例后端提供 `MaterialPackage` 持久化，三端宿主提供「在线物料」面板（模板生成 ESM、发布代码、仅更新清单、上下架与引用保护）。
- 宿主实时告警走宿主侧适配层：宿主订阅外部告警系统（SSE/WebSocket）、维护当前告警快照并映射为 `conditionalStylePort`；快照变化后调用公开的 `refreshConditionalStyles()` 只重算样式（不取数、不写文档、不进历史）。屏幕文档保持零告警知识，基座不新增告警契约或传输配置。
- 宿主条件样式的**作者面**由基座提供通用 `hostConditionalStyleAuthoring` 端口：宿主只声明条件源（如告警 key/等级）、当前绑定与保存，Engine 在组件检查器渲染与设计系统一致的原生表单；保存成功后宿主必须先让新绑定对 `conditionalStylePort` 生效，Engine 再重算该组件。文档仍不保存告警知识。
- 事件 Blueprint 采用一体化工作台边界：Base Screen 拥有当前实例内的顶部栏、左右面板、语义图投影、canonical 编辑、Core transaction、统一 history/revision guard 与有界 slot 协议；宿主拥有中央图形渲染、布局算法和画布手势。`blueprint.layout` 保存节点位置与视口，其余模式、选择、临时拖动和 trace 高亮只属 session。代码编辑器和复杂 ECharts/领域配置编辑器仍由宿主拥有。
- 宿主启用事件工作台时必须通过 `blueprintCapability` 贡献声明所支持的能力（`SCREEN_BLUEPRINT_CAPABILITY_IDS`）；未经授权的物料事件在作者面不可用，编译也按能力缺失失败关闭。示例宿主的中央画布在 `examples/*/src/screen/blueprint-canvas.ts` 逐字共享，只消费公开 state/command 事件。
- 宿主左侧业务分组通过严格 `leftPanelGroups[].workbenchModes` 选择 Canvas、Blueprint 或两者；省略时仅用于 Canvas。同一分组跨模式只复用一份公开命名 slot/tabpanel，宿主 light DOM 不随模式切换重挂载，宿主仍拥有其内容生命周期和业务状态。
- 宿主作者扩展通过公开 Custom Element method/event 和 JSON-safe authoring bridge 集成；宿主不得依赖 Engine 私有 Shadow DOM、内部 Store、`src` 路径或未声明的通用 UI 注入逃生口。
- 新增功能若能通过既有宿主边界完成，不得新增 Base Screen 内部工作流、package 或传输配置。只有改变产品定位、宿主/Engine 职责划分，或引入长期维护承诺的范围扩展才需要 ADR；此类改动仅在实施跨多个阶段、涉及迁移或用户明确要求时再创建 Spec。

## 目录结构与命名

- 每个包 `src/` 只放发布物。所有 `*.test.ts` 与 `__fixtures__/` 放在同包 `tests/`，并镜像 `src/` 子目录；测试用相对路径导入被测模块（如 `../src/index.js`）。`tooling/checks/packages.mjs` 会拒绝 `src/` 内的测试/fixture，以及 `dist/` 内的测试/fixture 产物。
- 每个包 `tsconfig.json` 用 `rootDir: "."` 且 include `src` 与 `tests`，供无 emit 的类型检查；`tsconfig.build.json` 必须覆写 `rootDir: "src"` 且只 include `src`，并排除测试与 fixture，避免测试进入 `dist`。
- `engine/src` 按环境分三层：`common/`（`operations`、`session`、`project`、`tools`、`ui-text`、`events`、`vendor`）是环境无关纯逻辑；`browser/`（`controllers`、`dom`、`viewport`、`styles`、`ui`）承载 DOM；`designer-element/`（根级 `base-screen-designer-element.ts` 与 `designer-element-public-api.ts`、`api/` 公开方法实现、`runtime/` 控制器装配与状态）是 `<base-screen-designer>` Custom Element 的组合根，仅 `index.ts` 引用。依赖方向单向：`designer-element/` 可依赖 `browser/` 与 `common/`，`browser/` 可依赖 `common/`，反向禁止——`common/` 与 `browser/` 不得触及 `designer-element/`，`designer-element/api/` 不得触及 `browser/`（DOM 装配一律走 `runtime/`）。`common/` 也不得引用浏览器全局（以无 DOM lib 编译验证）。`tooling/checks/engine-import.mjs` 强制这些约束及下述子层方向；`designer-element/` 的根级文件与子层在门禁中显式登记，新增文件或子目录必须同步更新登记。
- engine 的发布入口必须无副作用：导入 `@base-screen/engine` 不得注册 `base-screen-designer` Custom Element 或触碰 localStorage/sessionStorage（`check:engine-import` 会真实 import `dist/index.js` 验证）。`common/vendor/`（moveable 源码）被静态扫描禁止 DOM 全局，且有独立的 `tsconfig.vendor.json`。
- 纯逻辑需要环境能力时通过构造 options 注入回调（如 `ScreenProjectController` 的 `scheduler`），不要直接访问 DOM/global。
- 命名前缀承载层级语义，不要删除：`Screen*` 表示 canonical document、事务、项目等领域概念；`Designer*` 表示设计器编排层；`BaseScreen*` 表示 Base Screen 平台命名空间中的跨层契约与公共 API。新增类型按此选择前缀。词汇消歧：`designer-element/` 目录与 `BaseScreenDesignerElement` 指 `<base-screen-designer>` Custom Element 本体（组合根）；`common/operations/element/` 与 `DesignerElementOperations*` 指画布元素工具操作——两者是不同概念，勿混淆。

## 分层与边界

除已定义的包边界与 `engine` 的 `common/`↔`browser/`↔`designer-element/` 单向分层外，各层内部再分子层。子层依赖必须遵循下列允许方向；未明确允许的跨子层依赖默认禁止，避免环与聚合体。

- **`engine/browser/` 子层依赖方向（自叶到编排）：** `ui`（图标等纯资源）、`styles`（CSS 层）、`viewport`（画布坐标/辅助线）为叶子，不依赖兄弟子层；`dom`（DOM 节点/自定义元素封装）可依赖 `common/` 与 `ui`，但不得依赖 `controllers`。跨层共享类型应下沉至 `common/` 或由消费方定义最小接口，不得反向导入控制器；`controllers`（编排）为顶层，可依赖 `dom`、`viewport` 与 `common/`。
- **`engine/common/` 子层依赖方向（自叶到会话）：** `ui-text`、`tools`、`project` 与 `events`（键盘 chord 规范化与默认行为策略）是彼此独立的基础子层，不得互相依赖；`operations`（元素/布局/选区/剪贴板/变换/操作注册/蓝图编排）可依赖 `project`、`tools` 及同层 `operations`；`session`（`DesignerSession`）为编排顶层，可依赖 `project` 与 `operations`。
- **`engine/designer-element/` 组合根：** 根级两个装配文件与 `api/`、`runtime/` 双子层构成 Custom Element 组合根。`api/`（公开方法实现）只依赖 `common/` 与 `runtime/`，不得触及 `browser/`；`runtime/`（控制器装配、状态与生命周期）可依赖 `common/`、`browser/` 与 `api/`；两者双向可见是组合根内部的既定协作形态（api 读 runtime 状态，runtime 编排 api 实现），不是待修复的环。
- **UI 文案边界：** 用户可见字符串集中到 `common/ui-text/designer-ui-text.ts`，由 `dom`/`controllers` 消费，不得内联硬编码。`check-designer-ui.mjs`（随 engine lint 运行）会扫描整个 `browser/` 树：字符串字面量中出现 CJK 即失败，且禁止引入 `i18n`/`locale`/`language` 等本地化机制。
- **renderer 与 designer 职责边界：** `@base-screen/renderer` 只做纯展示（viewer），不含任何编辑/设计逻辑；designer（`engine` 的 `browser/` 与 `designer-element/`）构建在 renderer 之上，renderer 不得依赖或感知 designer。`sdk` 的 `viewer` 与 `designer` 入口分别对应这两条职责线。
- **plugin 三层边界：** `plugin-core`（契约与共享类型）是唯一契约层；`plugin-manager`（运行时加载/管理）与 `plugin-sdk`（插件作者面）可依赖 `contracts` 与 `plugin-core`，二者不得互相依赖；`plugin-sdk` 是对 `plugin-core` 的作者友好门面，不承载运行时管理逻辑。
- **material 与 renderer 边界：** 物料契约、manifest 类型与校验由 `plugin-core` 拥有；`@base-screen/material` 提供官方物料实现及其 manifest/注册；`@base-screen/renderer` 只通过 `plugin-core` 的 catalog 与 material element 契约执行渲染，不依赖具体官方物料。
- **物料原子化（组件制作约定）：** 一个物料只做一件事，不内建标题、说明或装饰性文案——需要标题时由文档层另放一个 `base.text`（或对应物料）组合。内建文案会把物料的内部排版与内边距锁死在一种形态上，使它无法被独立换行/配色/对齐，也无法在不需要该文案的场景复用。判定：若某个 prop 是"读数本身的构成"（单位、前后缀、表头列名）则保留；若只是"描述这个组件是什么"则移除。`tooling/checks/material-atomicity.mjs`（随 `pnpm lint` 运行）把这条变成可执行检查：禁止读取 manifest 未声明的 `props`/`style` 键，并禁止描述性文案 prop 出现在官方物料、外围插件物料与宿主示例上（宿主示例连 `label` 一起禁）。图表类物料的 `title`/`legend`/`axis` 属于图形自身构件，按脚本内的 `CHART_FURNITURE_EXEMPTIONS` 显式豁免，非图表物料一律不豁免。`plugin-board-materials` 的单元测试对 title 类字段另有一道断言。
- **物料渲染盒不变式：** 物料宿主元素的渲染盒必须等于 canonical `component.size`——渲染器先写像素宽高再赋 `model`，因此物料在 `renderMaterial()` 里写宿主元素 `width`/`height` 会覆盖声明尺寸；画边框的物料必须 `box-sizing: border-box`。唯一例外是 `base.text` 的自适应宽度（其宽度由引擎测量后投影回文档）。由 `pnpm verify:browser` 的目录级断言兜底，新增物料不遵守即失败。
- **sdk 聚合层边界：** `@base-screen/sdk` 是产品级入口与组合层，可负责公共 API 转发、Custom Element 注册及自动注册编排（auto-register、designer、viewer、material、plugins）；不得实现 contracts、core、renderer、engine、material 或 plugin-manager 所属的领域与运行时逻辑。包内实现仍直接通过各自声明的 `@base-screen/*` 公共导出交互，不得经 sdk 反向耦合。

## 契约与产物

- `@base-screen/contracts` 是规范文档类型、解析、诊断、序列化和 JSON Schema 的唯一所有者。不要在其他包中复制或绕过其解析器。
- 其规范解析器是失败关闭（fail-closed）的：不要添加未知字段剥离、默认值、强制转换或隐式未来版本回退。变更公共文档契约时，必须同步更新解析、schema、测试以及适用的迁移/兼容处理；只有改变兼容性政策、领域边界或长期演进方向时才需要 ADR，复杂或高风险的多阶段变更才需要 Spec。
- 探索阶段命名规则：不要在文档、物料标识、标签名、清单、fixture、ADR、Spec、计划或公共 API 中引入或保留 `V1`/`V2`/`V3`、`v1`/`v2`/`v3`、`/vN`、`-vN`、诸如 `apiVersion`/`schemaVersion`/`implementationVersion` 的版本标记字段、按版本区分的分支或带版本后缀的公共名称。只使用一个当前形态和一个稳定名称。任何兼容性或版本化设计都必须在项目离开此阶段后，获得用户的明确批准。
- `packages/contracts/src/screen-document.schema.json` 是一个已提交的黄金产物，由构建后的 schema 通过 `pnpm --filter @base-screen/contracts build` 以及随后的 `node tooling/build/emit-schema-golden.mjs` 生成。黄金产物更新要与其 schema 变更一起有意识地提交；构建只会把该文件复制进 `dist`。

## 代码与测试

- **高内聚、低耦合。** 相关逻辑应聚合在同一模块/包内，跨模块只通过明确、最小化的公共接口交互；模块不得依赖其内部实现细节或兄弟模块的实现。职责单一，避免聚合体（god object）与循环依赖。上述分层（`common`/`browser`）、跨包公共导出以及依赖边界检查，都是本约定的具体落地。
- Biome 是唯一的格式化/检查工具：2 个空格、LF、单引号、分号、100 列行宽。使用 `pnpm format` 应用格式化；不要为样式添加 ESLint 或 Prettier。
- **样式稳定性：不得出现抖动。** Designer/Viewer 样式改动不得引入视觉抖动（jitter/flicker），包括但不限于：布局在初次渲染或数据/状态变化时发生位移、滚动条出现/消失导致内容跳动、hover/active 状态改变几何或边框宽度、字体加载后文本换行重排、主题切换时出现闪烁或回退。判定与做法：几何变化只允许由状态切换或过渡动画驱动；避免在布局/绘制路径上依赖异步加载资源（字体、图片、字体测量）；`overflow: auto/scroll` 容器应预留稳定轨道；不使用会改变元素尺寸的 hover 样式（改用 `outline`/`box-shadow`/`transform` 等不触发 reflow 的方式）；主题/Token 变化走单一 style node 原子更新，不逐属性打补丁。
- 测试自定义校验、转换、区分/条件 schema、安全辅助函数、服务分支和 hook 状态转换。不要添加只重复内置 Zod 校验或默认未知键剥离行为的测试。
- **按完整职责组织模块，不设机械行数上限。** 一个模块可以完整承载同一功能行为及其紧密相关的状态、失败分支和辅助逻辑；只有识别出可独立命名、测试、复用或演进的职责时才拆分。不得为缩短文件制造仅转发调用、打散状态机或迫使阅读者跨文件追踪同一行为的薄模块；也不得借“功能完整”容纳互不相关的聚合体。生成/纯数据产物仍须注明生成器或权威来源。

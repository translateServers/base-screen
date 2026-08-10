# Base Screen 仓库指南

## 环境搭建与验证

- 使用 Node `22.23.2`（见 `.node-version`）和 pnpm `11.18.0`（见 `packageManager`）。通过 `pnpm install --frozen-lockfile` 安装；`.npmrc` 有意强制要求严格 peer 依赖，并禁用了自动安装 peer 依赖。
- CI 会在 Node 22.23.2 和 24.18.1 上运行 `pnpm verify:m0`。它依次运行 `format`（会写入文件）、`format:check`、`lint`、`typecheck`、`test`、`build`、`check:packages`、`check:api`、`check:engine-import` 和 `verify:tarball`。`pnpm verify:fast` 是同一套门禁减去 `verify:tarball`。
- 迭代过程中使用聚焦检查：`pnpm --filter @base-screen/contracts test`、`pnpm exec vitest run packages/contracts/tests/document/document.test.ts` 或 `pnpm --filter <package> typecheck`。在交付会影响包、构建产物或公共契约的改动前，先运行 `pnpm verify:m0`。
- `pnpm lint` 先跑各包 lint（engine 包的 lint 还会执行 `check-designer-ui.mjs` 与 `check-designer-styles.mjs`），再运行 `scripts/check-boundaries.mjs`；`pnpm test` 会先通过 Turbo 运行各包测试，再运行根级 `tests/`。Turbo 的 `lint` 和 `typecheck` 会先构建依赖。
- `pnpm check:api` 需要构建好的 `dist/index.d.ts`。`pnpm verify:tarball` 会打包每个包，并把每个 tarball 安装到一个临时消费者工程中跑 publint/ATTW；ATTW 的 Node10/CJS 诊断属于预期噪音，除非命令本身失败。门禁失败排查见 `docs/troubleshooting/verify-m0-troubleshooting.md`。
- 手动验证用示例（workspace 成员）：`pnpm dev:browser-harness`、`pnpm dev:playground`、`pnpm dev:vue-harness` 起 Vite dev server；`verify:browser`、`verify:playground`、`verify:vue-harness`、`verify:runtime` 是对应的 Playwright 验证脚本。

## 包边界

- 这是一个 pnpm/Turbo 单体仓库。`packages/` 下固定 12 个包，由 `scripts/check-packages.mjs` 强制校验：`contracts`、`core`、`renderer`、`engine`、`material`、`plugin-core`、`plugin-manager`、`plugin-sdk`、`react`、`vue`、`sdk` 和 `testing`。
- 不要在不更新包及边界检查、以及对应的 Spec/ADR 的情况下新增包或放宽包清单/导出。所有包都是私有的、仅 ESM、只发布 `dist`，并通过 `exports` 暴露公共 API。
- 跨包导入只能使用声明的 `@base-screen/*` 公共导出。`scripts/check-boundaries.mjs` 会拒绝未声明的依赖、来自 `examples`、`scripts` 或 Nebula 的导入、被禁止的依赖图边，以及对 `testing` 的生产依赖。
- 依赖白名单编码在 `scripts/check-boundaries.mjs` 中；只有 `contracts` 可以使用外部 `zod`，React/Vue 仅作为各自桥接包的 peer 依赖。新增依赖时，必须同时更新该白名单和包清单。
- `contracts`、`core`、`plugin-core`、`plugin-manager`、`plugin-sdk` 和 `testing` 使用 `tsc` 构建；它们内部的相对 TypeScript 导入必须使用 `.js` 后缀（`.json` 除外）。浏览器包和桥接包在声明文件生成后使用 Vite。
- `@base-screen/testing` 消费公共包 API 来提供 fixture 和一致性辅助工具。生产包绝不能导入它。

## 目录结构与命名

- 每个包 `src/` 只放发布物。所有 `*.test.ts` 与 `__fixtures__/` 放在同包 `tests/`，并镜像 `src/` 子目录；测试用相对路径导入被测模块（如 `../src/index.js`）。`scripts/check-packages.mjs` 会拒绝 `src/` 内的测试/fixture，以及 `dist/` 内的测试/fixture 产物。
- 每个包 `tsconfig.json` 用 `rootDir: "."` 且 include `src` 与 `tests`，供无 emit 的类型检查；`tsconfig.build.json` 必须覆写 `rootDir: "src"` 且只 include `src`，并排除测试与 fixture，避免测试进入 `dist`。
- `engine/src` 按环境分层：`common/`（`operations`、`session`、`project`、`tools`、`ui-text`、`events`、`vendor`）是环境无关纯逻辑，`browser/`（`controllers`、`dom`、`viewport`、`styles`、`ui`）承载 DOM。依赖方向单向：`browser/` 可依赖 `common/`，反向禁止，`common/` 也不得引用浏览器全局（以无 DOM lib 编译验证）。`scripts/check-engine-import.mjs` 强制这些约束及下述子层方向。
- engine 的发布入口必须无副作用：导入 `@base-screen/engine` 不得注册 `base-screen-designer` Custom Element 或触碰 localStorage/sessionStorage（`check:engine-import` 会真实 import `dist/index.js` 验证）。`common/vendor/`（moveable 源码）被静态扫描禁止 DOM 全局，且有独立的 `tsconfig.vendor.json`。
- 纯逻辑需要环境能力时通过构造 options 注入回调（如 `ScreenProjectController` 的 `scheduler`），不要直接访问 DOM/global。
- 命名前缀承载层级语义，不要删除：`Screen*` 表示 canonical document、事务、项目等领域概念；`Designer*` 表示设计器编排层；`BaseScreen*` 表示 Base Screen 平台命名空间中的跨层契约与公共 API。新增类型按此选择前缀。

## 分层与边界

除已定义的包边界与 `engine` 的 `common/`↔`browser/` 单向分层外，各层内部再分子层。子层依赖必须遵循下列允许方向；未明确允许的跨子层依赖默认禁止，避免环与聚合体。

- **`engine/browser/` 子层依赖方向（自叶到编排）：** `ui`（图标等纯资源）、`styles`（CSS 层）、`viewport`（画布坐标/辅助线）为叶子，不依赖兄弟子层；`dom`（DOM 节点/自定义元素封装）可依赖 `common/` 与 `ui`，但不得依赖 `controllers`。跨层共享类型应下沉至 `common/` 或由消费方定义最小接口，不得反向导入控制器；`controllers`（编排）为顶层，可依赖 `dom`、`viewport` 与 `common/`。
- **`engine/common/` 子层依赖方向（自叶到会话）：** `ui-text`、`tools`、`project` 与 `events`（键盘 chord 规范化与默认行为策略）是彼此独立的基础子层，不得互相依赖；`operations`（元素/布局/选区/剪贴板/变换/操作注册/蓝图编排）可依赖 `project`、`tools` 及同层 `operations`；`session`（`DesignerSession`）为编排顶层，可依赖 `project` 与 `operations`。
- **UI 文案边界：** 用户可见字符串应集中到 `common/ui-text/designer-ui-text.ts`，由 `dom`/`controllers` 消费。新增用户可见文案一律不得内联硬编码，必须收敛到 `designer-ui-text.ts`；现有内联文案应逐步迁移，不得继续扩散。`check-designer-ui.mjs` 已兜底部分文件，约定以全量为准。
- **renderer 与 designer 职责边界：** `@base-screen/renderer` 只做纯展示（viewer），不含任何编辑/设计逻辑；designer（`engine/browser`）构建在 renderer 之上，renderer 不得依赖或感知 designer。`sdk` 的 `viewer` 与 `designer` 入口分别对应这两条职责线。
- **plugin 三层边界：** `plugin-core`（契约与共享类型）是唯一契约层；`plugin-manager`（运行时加载/管理）与 `plugin-sdk`（插件作者面）可依赖 `contracts` 与 `plugin-core`，二者不得互相依赖；`plugin-sdk` 是对 `plugin-core` 的作者友好门面，不承载运行时管理逻辑。
- **material 与 renderer 边界：** 物料契约、manifest 类型与校验由 `plugin-core` 拥有；`@base-screen/material` 提供官方物料实现及其 manifest/注册；`@base-screen/renderer` 只通过 `plugin-core` 的 catalog 与 material element 契约执行渲染，不依赖具体官方物料。
- **sdk 聚合层边界：** `@base-screen/sdk` 是产品级入口与组合层，可负责公共 API 转发、Custom Element 注册及自动注册编排（auto-register、designer、viewer、material、plugins）；不得实现 contracts、core、renderer、engine、material 或 plugin-manager 所属的领域与运行时逻辑。包内实现仍直接通过各自声明的 `@base-screen/*` 公共导出交互，不得经 sdk 反向耦合。

## 契约与产物

- `@base-screen/contracts` 是规范文档类型、解析、诊断、序列化和 JSON Schema 的唯一所有者。不要在其他包中复制或绕过其解析器。
- 其规范解析器是失败关闭（fail-closed）的：不要添加未知字段剥离、默认值、强制转换或隐式未来版本回退。公共文档契约变更需要先有已接受的 ADR 和活动的 Spec。
- 探索阶段命名规则：不要在文档、物料标识、标签名、清单、fixture、ADR、Spec、计划或公共 API 中引入或保留 `V1`/`V2`/`V3`、`v1`/`v2`/`v3`、`/vN`、`-vN`、诸如 `apiVersion`/`schemaVersion`/`implementationVersion` 的版本标记字段、按版本区分的分支或带版本后缀的公共名称。只使用一个当前形态和一个稳定名称。任何兼容性或版本化设计都必须在项目离开此阶段后，获得用户的明确批准。
- `packages/contracts/src/screen-document.schema.json` 是一个已提交的黄金产物，由构建后的 schema 通过 `pnpm --filter @base-screen/contracts build` 以及随后的 `node scripts/emit-schema-golden.mjs` 生成。黄金产物更新要与其 schema 变更一起有意识地提交；构建只会把该文件复制进 `dist`。

## 文档与出处

- 功能 Spec 存放在 `docs/specs/<kebab-case-feature>/`；计划存放在 `docs/plans/<kebab-case-feature>/`。保持它们有版本管理，不要把工作流输出留在 `.trae/` 中。
- 遵循 `docs/specs/README.md`：实现不得悄悄偏离活动的 Spec；公共边界变更需要先更新相关的 ADR/Spec。
- **持久化 Spec 执行。** 当用户要求实现、执行、完成或整改某个活动的 Spec 时，把它的 `tasks.md` 和 `checklist.md` 当作完成状态机。只要还有任何适用项未勾选，就不要发送最终/完成回复。某个聚焦检查通过、`pnpm verify:m0` 通过或完成一个 Task 只是证据，并不代表 Spec 已完成。
- **硬性 final 门槛。** 活动 Spec 存在时，`final` 只能在以下条件全部满足后发送：所有适用的顶层 Task 和子项、所有适用 checklist 项均为 `[x]`；测试矩阵已反映当前 case；必需质量门已通过。发送前必须执行 `rg -n "^- \[ \]" docs/specs/<feature>/{tasks,checklist}.md` 或等效逐文件检查。命令找到任何未勾选项时，禁止发送 `final`，即使用户只询问阶段性结果或某个 Task 已完成。
- **恢复与继续门槛。** 任何继续、恢复、上下文压缩后的后续回合，先读取活动 Spec 的 `tasks.md`、`checklist.md` 和测试矩阵，确认第一个未勾选的适用项；将其标记为唯一进行中事项后立即继续执行。阶段性更新只能使用 `commentary`，不得以完成语气替代执行。除非用户明确暂停、转向其他工作或出现需要用户决策的阻塞，否则不得在一个已开始的活动 Spec 中止于状态报告或单个 Task。
- 在结束持久化 Spec 工作前，核实每个适用的 Task 和 checklist 项都已用当前代码和自动化证据勾选，当 Spec 要求时需求到测试的映射是最新的，并且所有必需的质量门槛都已通过。随着证据的获得，增量更新 Spec 产物；永远不要在没有证据的情况下勾选某项为完成。
- 每完成一个经核实的改动后，直接继续到下一个未勾选的适用项。只有在 Spec 完成条件满足、用户明确暂停或转向其他工作、或出现真正需要用户决策的阻塞时，才停止。遇到阻塞时，说明确切的未勾选项、所依据的契约/ADR 约束、已尝试的解决方案，以及需要用户做的决策。

## 代码与测试

- **高内聚、低耦合。** 相关逻辑应聚合在同一模块/包内，跨模块只通过明确、最小化的公共接口交互；模块不得依赖其内部实现细节或兄弟模块的实现。职责单一，避免聚合体（god object）与循环依赖。上述分层（`common`/`browser`）、跨包公共导出以及依赖边界检查，都是本约定的具体落地。
- Biome 是唯一的格式化/检查工具：2 个空格、LF、单引号、分号、100 列行宽。使用 `pnpm format` 应用格式化；不要为样式添加 ESLint 或 Prettier。
- 测试自定义校验、转换、区分/条件 schema、安全辅助函数、服务分支和 hook 状态转换。不要添加只重复内置 Zod 校验或默认未知键剥离行为的测试。
- 文件大小阈值是审查信号：领域/运行时模块以 300 行为目标，超过 500 行拆分；UI 控制器以 250 行为目标，超过 400 行拆分；契约/schema 文件以 400 行为目标，超过 600 行拆分；测试以 500 行为目标，超过 800 行拆分。生成/纯数据产物可豁免，但必须注明其生成器或权威来源。

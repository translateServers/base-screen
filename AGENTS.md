# Base Screen 仓库指南

## 环境搭建与验证

- 使用 Node `22.23.2`（见 `.node-version`）和 pnpm `11.18.0`（见 `packageManager`）。通过 `pnpm install --frozen-lockfile` 安装；`.npmrc` 有意强制要求严格 peer 依赖，并禁用了自动安装 peer 依赖。
- CI 会在 Node 22.23.2 和 24.18.1 上运行 `pnpm verify:m0`。它会依次运行 `format`（会写入文件）、`format:check`、`lint`、`typecheck`、`test`、`build`、`check:packages`、`check:api` 和 `verify:tarball`。
- 迭代过程中使用聚焦检查：`pnpm --filter @base-screen/contracts test`、`pnpm exec vitest run packages/contracts/src/document/document.test.ts` 或 `pnpm --filter <package> typecheck`。在交付会影响包、构建产物或公共契约的改动前，先运行 `pnpm verify:m0`。
- `pnpm lint` 还会运行 `scripts/check-boundaries.mjs`；`pnpm test` 会先通过 Turbo 运行各包测试，再运行根级测试。Turbo 的 `lint` 和 `typecheck` 会先构建依赖。
- `pnpm check:api` 需要构建好的 `dist/index.d.ts`。`pnpm verify:tarball` 会打包每个包，并把每个 tarball 安装到一个临时消费者工程中；对于空的 ESM 包，ATTW 的 Node10/CJS 诊断属于预期噪音，除非命令本身失败。

## 包边界

- 这是一个 pnpm/Turbo 单体仓库。`packages/` 下固定 12 个包，由 `scripts/check-packages.mjs` 强制校验：`contracts`、`core`、`renderer`、`engine`、`material`、`plugin-core`、`plugin-manager`、`plugin-sdk`、`react`、`vue`、`sdk` 和 `testing`。
- 不要在不更新包及边界检查、以及对应的 Spec/ADR 的情况下新增包或放宽包清单/导出。所有包都是私有的、仅 ESM、只发布 `dist`，并通过 `exports` 暴露公共 API。
- 跨包导入只能使用声明的 `@base-screen/*` 公共导出。`scripts/check-boundaries.mjs` 会拒绝未声明的依赖、来自 `examples`、`scripts` 或 Nebula 的导入、被禁止的依赖图边，以及对 `testing` 的生产依赖。
- 依赖白名单编码在 `scripts/check-boundaries.mjs` 中；只有 `contracts` 可以使用外部 `zod`，React/Vue 仅作为各自桥接包的 peer 依赖。新增依赖时，必须同时更新该白名单和包清单。
- `contracts`、`core`、`plugin-core`、`plugin-manager`、`plugin-sdk` 和 `testing` 使用 `tsc` 构建；它们内部的相对 TypeScript 导入必须使用 `.js` 后缀（`.json` 除外）。浏览器包和桥接包在声明文件生成后使用 Vite。
- `@base-screen/testing` 消费公共包 API 来提供 fixture 和一致性辅助工具。生产包绝不能导入它。

## 契约与产物

- `@base-screen/contracts` 是规范文档类型、解析、诊断、序列化和 JSON Schema 的唯一所有者。不要在其他包中复制或绕过其解析器。
- 其规范解析器是失败关闭（fail-closed）的：不要添加未知字段剥离、默认值、强制转换或隐式未来版本回退。公共文档契约变更需要先有已接受的 ADR 和活动的 Spec。
- 探索阶段命名规则：不要在文档、物料标识、标签名、清单、fixture、ADR、Spec、计划或公共 API 中引入或保留 `V1`/`V2`/`V3`、`v1`/`v2`/`v3`、`/vN`、`-vN`、诸如 `apiVersion`/`schemaVersion`/`implementationVersion` 的版本标记字段、按版本区分的分支或带版本后缀的公共名称。只使用一个当前形态和一个稳定名称。任何兼容性或版本化设计都必须在项目离开此阶段后，获得用户的明确批准。
- `packages/contracts/src/screen-document.schema.json` 是一个已提交的黄金产物，由构建后的 schema 通过 `pnpm --filter @base-screen/contracts build` 以及随后的 `node scripts/emit-schema-golden.mjs` 生成。黄金产物更新要与其 schema 变更一起有意识地提交；构建只会把该文件复制进 `dist`。

## 文档与出处

- 功能 Spec 存放在 `docs/specs/<kebab-case-feature>/`；计划存放在 `docs/plans/<kebab-case-feature>/`。保持它们有版本管理，不要把工作流输出留在 `.trae/` 中。
- 遵循 `docs/specs/README.md`：实现不得悄悄偏离活动的 Spec；公共边界变更需要先更新相关的 ADR/Spec。
- **持久化 Spec 执行。** 当用户要求实现、执行、完成或整改某个活动的 Spec 时，把它的 `tasks.md` 和 `checklist.md` 当作完成状态机。只要还有任何适用项未勾选，就不要发送最终/完成回复。某个聚焦检查通过、`pnpm verify:m0` 通过或完成一个 Task 只是证据，并不代表 Spec 已完成。
- 在结束持久化 Spec 工作前，核实每个适用的 Task 和 checklist 项都已用当前代码和自动化证据勾选，当 Spec 要求时需求到测试的映射是最新的，并且所有必需的质量门槛都已通过。随着证据的获得，增量更新 Spec 产物；永远不要在没有证据的情况下勾选某项为完成。
- 每完成一个经核实的改动后，直接继续到下一个未勾选的适用项。只有在 Spec 完成条件满足、用户明确暂停或转向其他工作、或出现真正需要用户决策的阻塞时，才停止。遇到阻塞时，说明确切的未勾选项、所依据的契约/ADR 约束、已尝试的解决方案，以及需要用户做的决策。
- 本项目可能参考 `C:\worker\nebula`，但在没有 `docs/provenance/` 中逐文件的记录（涵盖来源提交/路径、授权、修改和归属决定）之前，不要将任何 Nebula 源码、应用配置或资源复制到本 MIT 仓库中。

## 代码与测试

- Biome 是唯一的格式化/检查工具：2 个空格、LF、单引号、分号、100 列行宽。使用 `pnpm format` 应用格式化；不要为样式添加 ESLint 或 Prettier。
- 测试自定义校验、转换、区分/条件 schema、安全辅助函数、服务分支和 hook 状态转换。不要添加只重复内置 Zod 校验或默认未知键剥离行为的测试。
- 文件大小阈值是审查信号：领域/运行时模块以 300 行为目标，超过 500 行拆分；UI 控制器以 250 行为目标，超过 400 行拆分；契约/schema 文件以 400 行为目标，超过 600 行拆分；测试以 500 行为目标，超过 800 行拆分。生成/纯数据产物可豁免，但必须注明其生成器或权威来源。
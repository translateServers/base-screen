# 目录结构与构建产物规则 Spec

> 状态：已归档（历史验收记录）
> 最近更新：2026-08-05
> 定位：定义 Base Screen 包内目录结构、分层边界、测试外置与构建产物卫生的工程规则
> 依据：[ADR-0001](../../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)

## 1. 目标

为 Base Screen 建立一套可自动检查的**包内结构规则**，让目录结构反映分层语义，而不是机械套用某个开源项目的目录形态。核心借鉴两条原则：

- **TanStack**：`src/` 是唯一发布物，测试与 fixture 不进 `src/`（避免污染发布产物、避免失效 Turbo 缓存）。
- **Monaco / VS Code**：环境无关内核（`common`）与 DOM 消费者（`browser`）分离，抽象层级命名，纯逻辑通过依赖注入解耦环境 API。

完成后仓库必须具备：

- 每个包 `src/` 只含发布物；测试与 fixture 外置到同包 `tests/`。
- `engine` 内部建立 `common/`（环境无关纯逻辑）与 `browser/`（DOM 依赖）垂直边界，且 `controllers/` 完成拆分。
- 所有包的 build tsconfig 显式只编译 `src/`，`dist` 无测试/fixture 泄漏。
- 增量检查脚本（`check-packages.mjs`、`check-engine-import.mjs`、`check-boundaries.mjs`）强制上述边界。
- 命名前缀语义（`Screen*` / `Designer*` / `BaseScreen*`）固化为约定，不删除。
- 纯逻辑模块需要环境能力时通过构造注入回调解耦；运行时代码不访问 DOM/global，公共 ABI 所需的 type-only DOM 形状除外。

## 2. 非目标

本 Spec 不包含：

- 修改公共 API、`exports`、包边界或依赖白名单（由 ADR-0001 与 `check-boundaries.mjs` 管理）。
- 修改包数量或包清单（由 `check-packages.mjs` 管理）。
- 删除命名前缀；前缀承载层级语义，是既有合理约定。
- 引入 DI 容器、store、Router 或任何第三方依赖。
- 改变 canonical document、Material ABI、Project Adapter 或 SDK 公共契约。
- 一次性"重构即结束"；本规则需作为常态约定与门禁持续生效。

## 3. 依据与所有权

- [ADR-0001](../../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)：包边界、依赖白名单、ESM/build 契约的唯一权威。
- 本 Spec 只整改**包内目录结构与工程约定**，不改变任何包的公共边界；因此不要求新增 ADR。若后续实现发现会触及公共边界，必须先提交并接受对应 ADR。
- `engine` 的 `common/browser` 是新的**内部结构约定**，由本 Spec 与 `check-engine-import.mjs` 作为唯一权威实现。

## 4. Requirements(R)

### R1 src 为唯一发布物
- 每个包 `src/` 只包含会随构建发布/运行的代码。
- 所有 `*.test.ts` 与 `__fixtures__/` 迁至同包 `tests/`，按 `src/` 子目录镜像。
- 测试仍被 Vitest 发现（保持 `*.test.ts` 命名），不因外置而丢失覆盖。
- 测试迁移同步更新相对 import，使其继续指向 `src/` 代码与 `tests/` fixture。
- `tsconfig.json` 用于无 emit 的完整类型检查，`include` 覆盖 `src/` 与 `tests/`，并设置 `rootDir: "."`；`tsconfig.build.json` 必须覆写为 `include: ["src/**/*.ts"]` 与 `rootDir: "src"`。

### R2 engine 垂直分层
- `engine/src` 建立 `common/`（环境无关纯逻辑）与 `browser/`（DOM 依赖）两个顶层目录。
- `common/` 内不得引用未被词法绑定的浏览器全局 `window`、`document` 或 `globalThis`，不得 import `browser/`（含传递依赖闭包）。领域对象或参数名为 `document` 不构成 DOM 引用。
- `browser/` 可依赖 `common/`，方向单向。

### R3 controllers 拆分
- `controllers/project-controller.ts` 为纯逻辑，迁入 `common/project/`。
- 其余 `designer-*-controller.ts` 依赖 DOM，保留于 `browser/controllers/`。
- `designer-*-controller` 若混入纯逻辑，须按 R2 就近下沉到 `common/`。

### R4 构建产物卫生
- 所有包 `tsconfig.build.json` 显式设置 source-only `include` 和 `rootDir: "src"`，并排除 `src/**/*.test.ts` 与 `src/**/__fixtures__/**`；已有的非测试排除项必须保留。
- `dist` 不得包含任何测试或 fixture 产物（修复 `core/dist/__fixtures__/` 泄漏）。
- `files: ["dist"]` 与 `exports` 不变。

### R5 依赖注入解耦约定
- `common/`、`core` 与 `contracts` 的纯逻辑模块需要环境能力时，通过构造 options 注入回调访问，且不访问 DOM/global。
- `plugin-*` 不得在运行时访问 DOM/global；公共 ABI 中为表达 Custom Element、port 或 element shape 所需的 type-only DOM 类型可保留。
- 不引入 Monaco 式正式 DI 容器；沿用现有轻量构造注入。

### R6 命名前缀语义
- `Screen*`：canonical document、事务、项目等领域概念，不以所属 package 判定（如 `ScreenProjectController`、`ScreenDocumentTransaction`）。
- `Designer*`：设计器编排层（如 `DesignerSession`、`DesignerOperationRegistry`）。
- `BaseScreen*`：Base Screen 平台命名空间中的跨层契约或组件，尤其是公共 API（如 `BaseScreenDesignerElement`）。
- 前缀为层级语义，禁止删除；新增类型须按层级选择前缀。

### R7 增量门禁
- `check-engine-import.mjs` 新增：以 AST 作用域判断 `common/` 未绑定的浏览器全局引用，并验证其依赖闭包不含 `browser/`。
- `check-boundaries.mjs` 的 `collectSourceFiles` 同时扫描 `src/` 与 `tests/`，测试不脱离跨包边界约束。
- `check-packages.mjs` 递归检查每个包的 `src/` 不含测试/fixture、build tsconfig 保持 source-only 配置，并在 build 后拒绝 `dist/` 内测试/fixture 产物。
- 相关静态检查脚本（`check-designer-ui.mjs`、`check-designer-styles.mjs`）路径随迁移更新。

### R8 文档同步
- `AGENTS.md` 目录约定更新为：测试外置、`common/browser` 边界、命名前缀语义。
- provenance 文档中受影响的路径（如 `lucide-designer-icons.md`）同步更新。

### R9 公共边界不变证
- 所有包的公共 `exports`、类型签名、依赖白名单在本整改前后完全一致。
- `pnpm verify:m0`（format/lint/typecheck/test/build/check-packages/check-api/check-engine-import/verify:tarball）全部通过。

## 5. 目标目录结构

### 5.1 包级约定（全部 12 包）

```text
packages/<pkg>/
├── src/          # 仅发布物
├── tests/        # *.test.ts + __fixtures__（镜像 src 子目录）
├── tsconfig.json        # no-emit typecheck；rootDir .，include src + tests
├── tsconfig.build.json  # build；rootDir src，only include src，排除测试/fixtures
├── package.json
└── (vite.config.ts | vitest.config.ts)
```

### 5.2 engine 内部结构

```text
packages/engine/src/
├─ common/                 # 环境无关纯逻辑
│  ├─ operations/          # clipboard · layout-operations · operation-registry · selection · transform
│  ├─ session/             # designer-session
│  ├─ project/             # project-controller（自 controllers/ 迁入）
│  ├─ tools/               # designer-tools
│  └─ ui-text/             # designer-ui-text
├─ browser/                # DOM 依赖
│  ├─ controllers/         # designer-gesture/import/integration/layers/panel/preview/
│  │                       #   project-feedback/viewport/workbench-controller
│  ├─ dom/                 # designer-*-dom · designer-workspace
│  ├─ viewport/            # designer-viewport · designer-canvas-aids
│  ├─ styles/              # designer-style
│  └─ ui/                  # designer-icons
└─ index.ts                # 唯一入口，聚合导出
```

## 6. 验收场景

- 场景 A：`pnpm check:packages` 检测每个 `src/` 内的 `*.test.ts` 与 `__fixtures__/`，任一存在即失败。
- 场景 B：`core/dist` 与所有 `dist` 不含 `__fixtures__` / `*.test.*` 产物。
- 场景 C：`check-engine-import.mjs` 对 `common/` 强制 DOM 禁令与 `browser/` 依赖闭包禁令，违规即报错。
- 场景 D：`check-boundaries.mjs` 对 `tests/` 内跨包导入同样生效。
- 场景 E：`pnpm verify:m0` 全绿；`check:api` 显示公共 API 较整改前无变化。

## 7. 完成定义(DoD)

- R1-R9 全部满足，且每一项有对应自动化或静态检查证据。
- `tests/` 外置后，迁移前发现的全部测试文件均已迁移、相对 import 均已更新且全部通过；不以会随开发演进的固定文件数作为完成条件。
- `engine` `common/browser` 拆分后相对导入、静态检查脚本与 provenance 路径全部同步。
- 无 `dist` 测试/fixture 泄漏；`core/dist/__fixtures__/` 清除。
- `AGENTS.md` 与 `docs/specs/README.md` 索引已更新。
- 公共 API 与包边界不变，`pnpm verify:m0` 全绿。

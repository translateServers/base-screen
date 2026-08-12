# M0 工程基线 Spec

> 状态：生效中
> 最近更新：2026-08-03
> 定位：定义 Base Screen Monorepo 初始化、十二包骨架、工具链、边界门禁和私有 tarball 验收
> 依据：[ADR-0001](../../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)

## 1. 目标

M0 只建立可重复、可检查、可打包的工程底座，不实现 Screen Document、Custom Element 物料、Renderer、Designer 或插件业务行为。

完成后仓库必须具备：

- Node.js 22+、pnpm、Turbo、TypeScript、Vite、Vitest 和 Biome 工具链。
- 十二个 private workspace package。
- 可自动执行的 workspace 与外部依赖边界检查。
- ESM-only build、declaration、exports 和 tarball smoke。
- Changesets 私有阶段版本记录。
- License、provenance 和默认无副作用基线。

## 实施状态

2026-08-03 本地在 Node 22.20.0、pnpm 11.18.0 完成 M0 初始化，并通过 `pnpm verify:m0`。Node 24.18.1 验证由新增 CI matrix 执行；首次 CI 结果是 M0 的远程环境验证记录。

`verify:m0` 门禁运行中遇到的实际问题与修复方法见[门禁排障记录](../../../troubleshooting/verify-m0-troubleshooting.md)。

## 2. 非目标

M0 不包含：

- Canonical Screen Document Schema。
- `<base-screen-designer>` 或 `<base-screen-viewer>` 注册。
- `/auto-register` package entry。
- Material Manifest、Element Model 或物料实现。
- React/Vue bridge 运行时代码。
- Playwright 浏览器业务 E2E。
- npm registry 发布、公开 scope 或 trusted publishing。
- Nebula 源码迁移。

以上能力分别进入 M1 及后续 Spec，不能用空实现提前占据公共 API。

## 3. 固定工具版本

根 manifest 使用精确 devDependency 版本：

| 依赖 | 版本 |
| --- | --- |
| `pnpm` | 通过 `packageManager: pnpm@11.18.0` 固定 |
| `turbo` | `2.10.8` |
| `typescript` | `7.0.2` |
| `vite` | `8.2.0` |
| `vitest` | `4.1.10` |
| `@biomejs/biome` | `2.5.6` |
| `@changesets/cli` | `2.31.1` |
| `@playwright/test` | `1.62.1`，M0 只固定版本，不下载浏览器 |
| `publint` | `0.3.22` |
| `@arethetypeswrong/cli` | `0.18.5` |
| `@microsoft/api-extractor` | `7.58.12` |

版本规则：

- 根 devDependencies 使用精确版本，不加 `^` 或 `~`。
- workspace production dependencies 使用 `workspace:^`。
- React bridge peer 为 `react: ^19.1.0`、`react-dom: ^19.1.0`。
- Vue bridge peer 为 `vue: ^3.5.0`。
- M0 不需要安装 React、React DOM 或 Vue；空 bridge package 不得 import framework。

## 4. Node 与 pnpm

必须创建：

```text
.node-version = 22.23.2
package.json engines.node = >=22.20.0
package.json packageManager = pnpm@11.18.0
```

CI 后续同时验证 Node 22 和 Node 24。M0 本地实现可以在满足 `>=22.20.0` 的 Node 22 上执行。

pnpm 配置必须：

- 使用 committed `pnpm-lock.yaml`。
- CI 支持 `pnpm install --frozen-lockfile`。
- `strictPeerDependencies: true`。
- `autoInstallPeers: false`。
- 不设置 `shamefully-hoist`。
- build scripts 使用显式 allowlist；M0 没有需要批准的业务依赖脚本。

## 5. 文件结构

M0 实现应产生：

```text
base-screen/
├── .changeset/
│   └── config.json
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── provenance/
│   │   └── README.md
│   └── specs/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── renderer/
│   ├── engine/
│   ├── material/
│   ├── plugin-core/
│   ├── plugin-manager/
│   ├── plugin-sdk/
│   ├── react/
│   ├── vue/
│   ├── sdk/
│   └── testing/
├── scripts/
│   ├── check-boundaries.mjs
│   ├── check-packages.mjs
│   ├── create-vite-library-config.ts
│   ├── sync-package-license.mjs
│   └── verify-tarballs.mjs
├── .gitignore
├── .node-version
├── biome.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── turbo.json
```

每个 package 至少包含：

```text
package.json
src/index.ts
tsconfig.json
tsconfig.build.json
```

Vite 构建包额外包含 `vite.config.ts`。

## 6. 根 Manifest

根 `package.json` 必须：

- `name: base-screen-monorepo`。
- `version: 0.0.0`。
- `private: true`。
- `type: module`。
- 固定 Node、pnpm 和 §3 devDependencies。
- 不包含 `publish`、`prepublishOnly` 或 registry credential 脚本。

根脚本语义：

| Script | 行为 |
| --- | --- |
| `format` | `biome check --write .` |
| `format:check` | `biome check .` |
| `lint` | Turbo 执行 package lint，再执行边界检查 |
| `typecheck` | Turbo 按依赖图执行 TypeScript no-emit check |
| `test` | Turbo 执行 Vitest，允许 M0 空业务测试，但边界脚本必须有测试 |
| `build` | 先同步 package LICENSE，再按依赖图构建十二包 |
| `check:packages` | 校验十二包集合、manifest 和 exports |
| `check:boundaries` | 校验 workspace、外部依赖和源码 import 边界 |
| `verify:tarball` | 对十二包执行 pack、publint、ATTW 和消费 smoke |
| `changeset` | 创建 changeset |
| `version-packages` | 私有阶段更新版本与内部 range，不发布 |
| `verify:m0` | 顺序执行 format check、lint、typecheck、test、build、package check、tarball verify |

## 7. Workspace

`pnpm-workspace.yaml` 只包含：

```yaml
packages:
  - packages/*
  - examples/*
```

M0 可以尚未创建 `examples/`。不存在的 glob 不构成错误。

`turbo.json` 至少定义：

- `build` 依赖 `^build`，输出 `dist/**`。
- `typecheck` 依赖 `^build`，无输出。
- `lint` 依赖 `^build`，无输出。
- `test` 依赖当前 package `build`；测试开始产出 coverage 后再将其声明为 Turbo output。
- `clean` 不缓存。

Turbo 只编排 package scripts，不复制边界、tarball 或发布逻辑。

## 8. 十二包 Manifest

没有副作用入口的 package 使用：

```json
{
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "files": ["dist"],
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

M0 只导出根入口。`/auto-register`、`/contracts`、`/viewer` 等子路径在对应行为实现时加入，不能指向空占位文件。
加入 `/auto-register` 后，package 必须把对应的构建后 JavaScript 文件逐项列入 `sideEffects`；不得继续
使用 `false`，也不得用 `true` 或通配符扩大副作用范围。默认入口及其他子路径仍须无副作用。

### 8.1 包名与构建模式

| 目录 | Package Name | Build |
| --- | --- | --- |
| `contracts` | `@base-screen/contracts` | tsc |
| `core` | `@base-screen/core` | tsc |
| `renderer` | `@base-screen/renderer` | Vite + declaration emit |
| `engine` | `@base-screen/engine` | Vite + declaration emit |
| `material` | `@base-screen/material` | Vite + declaration emit |
| `plugin-core` | `@base-screen/plugin-core` | tsc |
| `plugin-manager` | `@base-screen/plugin-manager` | tsc |
| `plugin-sdk` | `@base-screen/plugin-sdk` | tsc |
| `react` | `@base-screen/react` | Vite + declaration emit |
| `vue` | `@base-screen/vue` | Vite + declaration emit |
| `sdk` | `@base-screen/sdk` | Vite + declaration emit |
| `testing` | `@base-screen/testing` | tsc |

### 8.2 允许的 workspace dependencies

| Package | Allowed Dependencies |
| --- | --- |
| `contracts` | 无 |
| `core` | `contracts` |
| `plugin-core` | `contracts` |
| `plugin-manager` | `contracts`、`plugin-core` |
| `plugin-sdk` | `contracts`、`plugin-core` |
| `renderer` | `contracts`、`core`、`plugin-core` |
| `engine` | `contracts`、`core`、`renderer`、`plugin-core`、`plugin-manager` |
| `material` | `contracts`、`plugin-core`、`plugin-sdk` |
| `react` | `contracts`、`plugin-core`、`plugin-sdk` |
| `vue` | `contracts`、`plugin-core`、`plugin-sdk` |
| `sdk` | `contracts`、`core`、`renderer`、`engine`、`material`、`plugin-manager`、`plugin-sdk` |
| `testing` | 可以依赖所有公开生产包 |

M0 package manifest 应声明架构允许且当前源码真实使用的依赖，不要求把整张 allowlist 全部预填。未使用依赖必须拒绝。

### 8.3 外部依赖

- M0 production dependencies 为空。
- P0 起 `@base-screen/contracts` 增加 `zod` 作为唯一 production dependency（由已接受的 ADR-0002 和 [Contracts Foundation Spec](../contracts-foundation/spec.md) §4 授权）；zod 仅作为内部 runtime schema 实现，不进入 public `.d.ts`。
- `react` 只声明 React/React DOM peer，不把它们加入 dependencies 或 optionalDependencies。
- `vue` 只声明 Vue peer。
- 其他十个包不得声明 React、React DOM 或 Vue peer。
- 生产 package 不得以任何 dependency 类型引用 `@base-screen/testing`。
- 每个 package 的 lint/typecheck/test/build 工具从根 devDependencies 解析，不在十二个 manifest 重复声明。

## 9. TypeScript 配置

`tsconfig.base.json` 固定：

- `target: ES2022`。
- `module: Preserve`。
- `moduleResolution: Bundler`。
- `strict: true`。
- `noUncheckedIndexedAccess: true`。
- `exactOptionalPropertyTypes: true`。
- `useUnknownInCatchVariables: true`。
- `noImplicitOverride: true`。
- `noUncheckedSideEffectImports: true`。
- `verbatimModuleSyntax: true`。
- `isolatedModules: true`。
- `skipLibCheck: false`。
- `types: []`。

包配置：

- `tsconfig.json` 用于 `tsc --noEmit`。测试位于 `src/` 时使用 `rootDir: src`；测试外置到同包 `tests/` 时使用 `rootDir: .` 并同时 include `src` 与 `tests`。
- `tsconfig.build.json` 输出 `dist`，生成 declaration、declarationMap 和 sourceMap；它必须显式设置 `rootDir: src` 且只 include `src`，不从 typecheck 配置继承测试输入范围。
- tsc build 包输出 JS + declaration。
- Vite build 包的 build tsconfig 使用 `emitDeclarationOnly: true`，Vite 输出 JS/CSS/source map。
- `contracts`、`core` 默认只使用 `ES2022` lib。
- DOM 包显式加入 `DOM` lib。
- Node scripts 使用独立 Node types，不把 Node globals 带入 package public compilation。
- 所有 tsc build 包的源码相对 import/export 使用 `.js` specifier。
- 不创建 `baseUrl`、跨 package TS paths 或指向源码的 development exports。

## 10. Vite Library 配置

共享 helper `create-vite-library-config.ts` 必须：

- 从目标 package manifest 读取 dependencies、peerDependencies 和 optionalDependencies。
- 将 package root 及其 subpaths 一并 externalize。
- 输出单一 ESM root entry `dist/index.js`。
- target 使用 `baseline-widely-available`。
- 输出 source map。
- 不无差别使用 `external: []`。
- 不注入 Node polyfill。
- 不注册 Custom Element 或导入业务 CSS。

M0 的 Vite package `src/index.ts` 只包含 `export {};`，用于验证 pipeline，不提前形成公共 API。

## 11. Biome

`biome.json` 固定：

- LF、2 spaces、line width 100。
- JavaScript/TypeScript 单引号、分号、trailing commas。
- JSON 不允许 trailing commas。
- 忽略 `node_modules`、`.pnpm-store`、`.turbo`、`dist`、`coverage`、Playwright 和 tarball 临时目录。
- `noDebugger` 为 error。
- import organize assist 开启。

Generated lockfile 不参与 Biome format。

## 12. 边界检查

### 12.1 `check-packages.mjs`

必须验证：

- `packages/` 恰好包含十二个确认目录。
- package name、目录和 `@base-screen/*` 映射唯一。
- 所有 package `private: true`、`type: module`、`version: 0.0.0`。
- `files`、exports、types/import targets 和 `sideEffects` 满足 M0 模板。
- 没有 publish script、registry 或 publishConfig。
- build mode 与 §8.1 一致。

### 12.2 `check-boundaries.mjs`

必须验证：

- workspace dependency edge 属于 §8.2 allowlist。
- dependency graph 无环。
- 外部依赖符合 §8.3。
- framework subpath 归一到 `react`、`react-dom` 或 `vue` 根包后校验。
- 源码不跨包 deep import，不 import `examples`、`scripts`、Nebula 或绝对本机路径。
- 类型 import 与运行时 import 使用相同边界。
- tsc build 包不存在 extensionless relative specifier。
- production package 不引用 testing。

检查失败必须返回非零 exit code，并输出 package、违规 source/target 和稳定 reason code。

### 12.3 最小 reason code

```text
PACKAGE_SET_MISMATCH
PACKAGE_NAME_MISMATCH
FORBIDDEN_WORKSPACE_DEPENDENCY
FORBIDDEN_EXTERNAL_DEPENDENCY
UNDECLARED_DEPENDENCY
DEPENDENCY_CYCLE
SOURCE_DEEP_IMPORT
FORBIDDEN_SOURCE_ROOT
EXTENSIONLESS_ESM_IMPORT
TESTING_DEPENDENCY_FORBIDDEN
PUBLISH_CONFIGURATION_FORBIDDEN
```

## 13. Changesets 私有阶段

`.changeset/config.json` 必须：

- base branch 为 `master`。
- independent versions，不使用 fixed/linked group。
- `privatePackages.version: true`。
- `privatePackages.tag: false`。
- internal dependency update 为 patch。
- 不执行 registry publish。

M0 只验证 changeset 可以记录和更新 private package 版本。首次公开发布前由独立 ADR 重写 scope、access、dist-tag 和 trusted publishing 规则。

## 14. License 与 Provenance

- 根 `LICENSE` 是唯一手写许可证来源。
- `sync-package-license.mjs` 在 build/pack 前把根 LICENSE 同步到十二个 package；生成文件内容必须完全一致。
- tarball 必须包含 LICENSE。
- `docs/provenance/README.md` 记录 provenance 模板和无 Nebula 源码时的基线声明。
- M0 不复制 Nebula 源码、配置片段或资产；仅文档引用不需要文件级记录。

## 15. Tarball 验证

`verify-tarballs.mjs` 对十二包依次执行：

1. 清理并 build 目标及其 workspace dependencies。
2. `pnpm pack` 到受控临时目录。
3. 检查 tarball 只包含 `dist`、`package.json`、README/NOTICE（若存在）和 LICENSE。
4. 运行 publint。
5. 运行 Are the Types Wrong。
6. 在临时 ESM consumer 中安装 tarball 并 import 根入口。
7. 对 tsc build 包执行多文件原生 Node ESM smoke。
8. 确认默认 import 不新增 `customElements` 定义或其他全局副作用。
9. 确认 private package 不可通过仓库脚本发布。
10. 把 `examples/host-quickstart` 复制到仓库外临时 Vanilla/Vite consumer，从 tarball 安装后执行
    typecheck、生产构建与 Chromium Viewer 渲染闭环。
11. 在仓库外 React/Vue consumer 的生产构建中仅以副作用 import 使用 `/auto-register`，验证 Viewer、
    Designer 和官方物料没有被 tree-shaking 删除，并验证桥接物料生命周期。

临时文件只能写入仓库忽略目录或系统临时目录，成功和失败都应清理。

## 16. Requirements

### R1：固定 workspace

系统 SHALL 只识别十二个确认 package。

场景：新增未知 package

- GIVEN `packages/unknown` 存在
- WHEN 执行 `pnpm check:packages`
- THEN 命令以 `PACKAGE_SET_MISMATCH` 失败

### R2：严格依赖方向

系统 SHALL 同时校验 manifest 和源码依赖。

场景：Core 依赖 Renderer

- GIVEN `@base-screen/core` 声明或 import `@base-screen/renderer`
- WHEN 执行 `pnpm check:boundaries`
- THEN 命令以 `FORBIDDEN_WORKSPACE_DEPENDENCY` 失败

### R3：Testing 单向依赖

生产包 SHALL 不依赖 testing。

场景：SDK devDependency 指向 Testing

- GIVEN SDK 任意 dependency 类型包含 `@base-screen/testing`
- WHEN 执行边界检查
- THEN 以 `TESTING_DEPENDENCY_FORBIDDEN` 失败

### R4：框架隔离

Vanilla graph SHALL 不包含 React/Vue 安装依赖或公开类型。

场景：Engine 声明 React dependency

- WHEN 执行边界和 tarball 检查
- THEN 以 `FORBIDDEN_EXTERNAL_DEPENDENCY` 失败

### R5：原生 ESM

tsc build package SHALL 可被 Node 原生 ESM import。

场景：源码使用 extensionless relative import

- WHEN 执行边界检查
- THEN 以 `EXTENSIONLESS_ESM_IMPORT` 失败

### R6：默认无副作用

M0 package root SHALL 不注册元素或修改全局状态。

场景：空 consumer import SDK

- WHEN import `@base-screen/sdk`
- THEN import 成功
- AND `customElements` 没有新增 Base Screen tag

### R7：私有阶段

M0 package SHALL 不能发布到 npm。

场景：检查 manifest

- THEN 十二包全部 `private: true`
- AND 不存在 publishConfig 或 publish script

### R8：可重复安装

系统 SHALL 用固定 Node/pnpm 和 lockfile 安装。

场景：干净 CI

- WHEN 使用 Node 22 或 Node 24 执行 `pnpm install --frozen-lockfile`
- THEN 安装成功且 lockfile 不变化

### R9：真实 tarball

每个 package SHALL 从 `.tgz` 验证，而不是只验证 workspace source。

场景：exports 指向遗漏文件

- WHEN tarball consumer import package
- THEN verify 命令失败并指出缺失 export target

### R10：实现边界

M0 SHALL 不提前实现 M1 API。

场景：检查 public exports

- THEN 每个根入口为空模块
- AND 不存在 auto-register、Document Schema、Material Manifest 或 Designer/Viewer tag

## 17. 实施顺序

1. 创建 root toolchain 文件和 lockfile。
2. 创建十二个 private package manifest 与空入口。
3. 建立 TypeScript 和 Vite 两类构建模板。
4. 实现 package/boundary check 及其负向 fixture。
5. 建立 Turbo 和根命令。
6. 建立 License/provenance 基线。
7. 实现 tarball consumer。
8. 执行 `pnpm verify:m0`。

## 18. 完成定义

M0 只有在以下条件全部满足时完成：

- `pnpm install --frozen-lockfile` 在 Node 22 与 Node 24 成功。
- `pnpm format:check` 成功。
- `pnpm lint` 成功。
- `pnpm typecheck` 成功。
- `pnpm test` 成功。
- `pnpm build` 成功。
- `pnpm check:packages` 成功。
- `pnpm check:boundaries` 成功。
- `pnpm verify:tarball` 成功。
- 所有负向边界 fixture 能稳定触发对应 reason code。
- 十二包保持 private，且没有 M1 业务 API。

# ADR-0001: Monorepo、工具链、发布与包边界

> 状态：已接受
> 日期：2026-08-03
> 定位：冻结 Base Screen 的工程基线、包发布形态、浏览器基线和十二包依赖门禁
> 关联：[Base Screen 长期演进总纲](../architecture/base-screen-evolution.md)
> 实施规格：[M0 工程基线 Spec](../specs/archive/m0-engineering-baseline/spec.md)

## 1. 背景

Base Screen 当前处于 pre-implementation 阶段，仓库尚无 manifest、lockfile、workspace、源码、CI 或可执行命令。项目计划维护十二个可独立发布或消费的包，并同时满足以下目标：

- `contracts`、`core` 等纯逻辑包可以独立消费和测试。
- `renderer`、`engine`、`sdk` 可以构建浏览器 ESM、CSS 和 Custom Elements。
- `react`、`vue` 是可选物料桥接，不能污染 Vanilla consumer 的依赖图。
- 默认入口没有注册副作用，`/auto-register` 是显式副作用入口。
- 包依赖严格遵循长期总纲，不能通过源码别名或 barrel export 绕过。
- 发布包包含稳定声明、source map、明确 exports，并能在空白 consumer 中验证。
- Nebula 衍生源码进入 MIT 仓库前具有文件级 provenance 和 attribution 记录。

Nebula 已验证 pnpm、Turbo、TypeScript、Vite、Vitest 和浏览器 E2E 的可行性，但其现有仓库也暴露了不适合 Base Screen 的配置：

- `shamefully-hoist=true` 隐藏了依赖声明错误。
- `strict-peer-dependencies=false` 和 `auto-install-peers=true` 会掩盖框架 peer 边界。
- workspace 包存在指向 `src` 的 development export，发布后可能与 tarball 内容不一致。
- SDK 构建与应用内部依赖耦合，边界需要额外脚本补救。
- pnpm、Node 和工具包版本在不同文档与环境中出现漂移。

Base Screen 应继承已验证的工作流，不复制这些债务。

## 2. 决策摘要

本 ADR 提议采用以下工程基线：

| 决策项 | 结论 |
| --- | --- |
| Monorepo | pnpm workspace + Turborepo |
| Node.js | Node.js 22+；开发默认固定 22.x patch，CI 同时验证 22 与 24 LTS |
| Package Manager | pnpm 11；`packageManager` 固定精确版本 |
| Package namespace | M0 内部逻辑名使用 `@base-screen/*`，十二包全部 private；公开 scope 延后决策 |
| 语言 | TypeScript 7，strict，ESM-only |
| 纯逻辑包构建 | `tsc` 保留 ESM 模块并生成声明 |
| 浏览器包构建 | Vite 8 library mode + 独立 declaration emit |
| 格式与静态检查 | Biome 2；类型规则由 TypeScript 承担 |
| 单元测试 | Vitest 4 |
| 浏览器测试 | Playwright；Custom Element 生命周期以真实浏览器结果为准 |
| 任务编排 | Turbo 2，只编排，不拥有包行为 |
| API 与包验证 | API report、publint、Are the Types Wrong、tarball consumer |
| 依赖边界 | package manifest + 静态依赖图双重门禁 |
| 版本发布 | Changesets，包独立 SemVer；M0 禁止 npm 发布 |
| 浏览器基线 | Vite 8 Baseline Widely Available，不提供 legacy polyfill |
| 模块格式 | ESM-only，不发布 CJS、UMD、AMD 或 SystemJS |

该提案被接受后，必须先产出 M0 acceptance-oriented Spec，再创建 manifest 和可执行配置。

## 3. 仓库布局

```text
base-screen/
├── docs/                 # architecture、decisions、specs、conventions
├── packages/             # 十二个正式 workspace 包
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
├── examples/             # Vanilla、React、Vue 和 tarball consumer
├── scripts/              # 边界、包、license、tarball 和发布检查
├── package.json          # private workspace root
├── .changeset/
│   └── config.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
├── tsconfig.base.json
└── biome.json
```

约束：

- `packages/*` 只包含十二个确认包。共享工具配置放根目录，不新增只转发配置的 workspace 包。
- M0 十二个 package 全部使用内部逻辑名 `@base-screen/*` 且 `private: true`；该命名不证明 npm 官方 scope 所有权。
- `examples/*` 可以是 workspace，但必须 `private: true`，不得成为生产包依赖。
- 根 package 必须 `private: true`。
- 生产包不得 import `examples`、`scripts`、Nebula 或其他应用源码。
- 每个生产包只通过另一个包的公开 exports 访问它，不允许 `../other-package/src/*` 或 TS path alias 绕过。

## 4. Runtime 与包管理器

### 4.1 Node.js

选择 Node.js 22+ 作为开发、CI 和发布运行时。Node 22 是最低兼容线，CI 同时验证 Node 22 和 Node 24 LTS。

初始 bootstrap 值：

```text
.node-version: 22.23.2
engines.node: >=22.20.0
```

规则：

- `.node-version` 或等效文件固定最新已验证的 Node 22 patch，保证默认开发环境可复现。
- `engines.node` 表达最低兼容版本。它有意允许更高 major，但只有进入 CI 矩阵的 major 才属于持续验证范围。
- CI 最低运行 Node 22 与 Node 24 两条线；新增或移除 major 需要记录兼容验证和 CI 矩阵变化。
- Node 22/24 patch 升级可通过普通 maintenance PR 完成，不需要新 ADR。
- Node 是构建工具基线，不意味着浏览器包在运行时依赖 Node API。
- 任何进入浏览器包的 `node:*` import 都必须由构建门禁拒绝，明确 build-time 脚本除外。

选择理由：pnpm 11、TypeScript 7 和 Vite 8 均可在受支持的 Node 22 版本运行；Node 22 与 Node 24 在 2026-08-03 都由 Node 官方标记为 LTS。保留 Node 22 可降低现有开发环境和 Nebula 集成成本。

### 4.2 pnpm

选择 pnpm 11，初始 `packageManager` 固定为：

```json
{
  "packageManager": "pnpm@11.18.0"
}
```

规则：

- lockfile 由固定 pnpm 版本生成，CI 使用 `--frozen-lockfile`。
- 允许通过 Corepack、官方 standalone 或 CI action 安装，但最终执行版本必须与 `packageManager` 一致。
- pnpm 12 在本 ADR 日期仍是 beta，不进入生产基线。
- 禁止 `shamefully-hoist=true`。
- 启用严格 peer dependency 校验，不自动安装未声明 peer。
- 依赖构建脚本使用 pnpm allowlist，只批准有明确用途的包。
- workspace 发布依赖使用 `workspace:^`；Changesets 发布时转换为真实 SemVer range。

## 5. 工具版本策略

初始 bootstrap 使用下列已验证 major/minor 线，精确版本写入 manifest 和 lockfile：

| 工具 | 初始版本线 | 用途 |
| --- | --- | --- |
| Node.js | 22.23.x 默认；CI 加测 24.18.x | build、test、release runtime |
| pnpm | 11.18.x | workspace 与依赖安装 |
| Turborepo | 2.10.x | 任务图与缓存 |
| TypeScript | 7.0.x | typecheck 与 declaration emit |
| Vite | 8.2.x | 浏览器 library build |
| Vitest | 4.1.x | unit/integration test |
| Biome | 2.5.x | format 与基础 lint |
| Playwright | 当前稳定 1.x | Chromium/Firefox/WebKit E2E |

升级规则：

- lockfile 固定精确版本，不使用 `latest`、`next` 或 beta tag。
- patch/minor 升级必须通过全量质量门。
- major 升级需要单独 changeset 或 maintenance note；若改变输出、浏览器基线、公共声明或命令语义，则需要 ADR。
- 不为“保持最新”自动合并工具升级。

## 6. TypeScript 基线

所有包使用 TypeScript strict，并显式设置关键选项，不依赖版本浮动默认值。

基础方向：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "noUncheckedSideEffectImports": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

正式配置由 M0 Spec 冻结。长期规则：

- 不使用 `any` 逃避公共契约；必要的不安全边界集中在 parser/adapter 内并立即收窄为 `unknown`。
- 每个 package 显式声明 `types` 和 `lib`，避免测试、Node 或框架全局类型泄漏。
- `contracts` 与 `core` 默认不加载 DOM lib；需要 DOM 类型的包单独扩展配置。
- 不使用 `baseUrl` 建立隐式源码根。
- 不用 TS `paths` 伪造 workspace package resolution；跨包 import 使用真实包名。
- 由 `tsc` 直接输出 JS 的包，其源码相对 import/export specifier 必须写 `.js` 后缀；静态检查拒绝 extensionless relative specifier，避免原生 ESM 无法执行。
- type-only import 使用 `import type`，公共声明不得泄漏 private 源路径。
- JS 构建和 declaration emit 可以分步，但都必须从同一源码和 tsconfig 语义派生。

## 7. 构建策略

### 7.1 纯逻辑与协议包

以下包使用 `tsc` 输出保留模块结构的 ESM 与 declarations：

- `contracts`
- `core`
- `plugin-core`
- `plugin-manager`
- `plugin-sdk`
- `testing`

选择理由：这些包不需要 CSS、框架编译或资源图，保留模块比打成单 bundle 更利于 tree-shaking、调试和边界审计。

### 7.2 浏览器与框架包

以下包使用 Vite library mode 构建，并使用 TypeScript 单独生成或验证 declarations：

- `renderer`
- `engine`
- `material`
- `react`
- `vue`
- `sdk`

规则：

- 只输出 ESM。
- 生成 source map 和 declaration map。
- 多入口必须与 package `exports` 一一对应。
- 默认 externalize package dependencies 和 peer dependencies，防止重复 runtime。
- React、React DOM、Vue 必须始终 external，并由 bridge package 声明 peer range。
- SDK 是否打入某个 Engine 私有 UI runtime 由 ADR-0006 决定；在此之前不得通过 `external: []` 无差别打包全部依赖。
- CSS 产物和字体必须有明确 export/安装路径，不依赖宿主未公开类名。

### 7.3 Package exports

所有发布包使用：

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"]
}
```

具体包可以增加显式子路径。约束：

- 不提供 CJS fallback。
- 不提供指向 `src` 的 `development` condition。
- 不允许未列入 exports 的源码 deep import。
- 默认入口必须 side-effect free。
- `sideEffects` 默认为 `false`；存在 `/auto-register` 或 CSS 时使用精确文件 allowlist。
- `/auto-register` 只调用该入口承诺的 `define()`，不得加载额外物料或插件。
- JSON Schema 等非 JS artifact 必须通过 exports 显式公开并进入 tarball 检查。

## 8. 十二包依赖门禁

### 8.1 允许的生产依赖

| 包 | 允许依赖的 workspace 包 |
| --- | --- |
| `contracts` | 无 |
| `core` | `contracts` |
| `plugin-core` | `contracts` |
| `plugin-manager` | `contracts`、`plugin-core` |
| `plugin-sdk` | `contracts`、`plugin-core` |
| `renderer` | `contracts`、`core`、`plugin-core` |
| `engine` | `contracts`、`core`、`renderer`、`plugin-core`、`plugin-manager` |
| `material` | `contracts`、`plugin-core`、`plugin-sdk` |
| `react` | `contracts`、`plugin-core`、`plugin-sdk`；React/React DOM 为 peer |
| `vue` | `contracts`、`plugin-core`、`plugin-sdk`；Vue 为 peer |
| `sdk` | `contracts`、`core`、`renderer`、`engine`、`material`、`plugin-manager`、`plugin-sdk` |
| `testing` | 可以依赖公共包，仅用于向外提供测试能力 |

附加规则：

- 任何生产包都不得以 dependencies、devDependencies、peerDependencies 或 optionalDependencies 依赖 `testing`。
- `testing` 不得成为任何生产 export 的类型来源。
- `sdk` 不依赖 `react` 或 `vue`。
- `material` 不依赖 renderer、engine 或 sdk。
- 只有 `react` 可以把根包 `react`、`react-dom` 声明为 peer；只有 `vue` 可以把根包 `vue` 声明为 peer。源码或声明可以引用各自 peer 的公开 subpath，边界检查必须把 `react/*`、`react-dom/*`、`vue/*` 归一到所属根包后校验，不能把 subpath 当作独立 peer 名称。
- `contracts`、`core`、`plugin-core`、`plugin-manager`、`plugin-sdk`、`renderer`、`material` 和 `sdk` 的生产依赖、peer、optional dependency、公开声明和 dist graph 都不得出现 React、React DOM 或 Vue。
- ADR-0006 若选择框架实现 Engine UI，只能将其作为构建期 dev dependency 和明确 allowlist 的私有 bundle；不得变成 Vanilla consumer 的安装依赖、peer 或公共类型。
- M0 Spec 必须为每个包冻结 workspace 依赖和外部 npm 依赖两张 allowlist，而不是只校验 workspace edge。
- production dependency graph 必须无环。
- package manifest 声明和源码 import graph 必须同时通过检查，不能只检查其中之一。
- 类型 import 也属于依赖，不因 `import type` 豁免架构边界。

### 8.2 边界执行方式

M0 实现需要同时提供：

1. manifest graph check：读取 workspace manifests，校验 workspace 与外部依赖 allowlist、peer 归属和环。
2. source graph check：解析 TS/TSX/Vue import，拒绝跨包源码路径和未声明依赖。
3. declaration graph check：检查 `.d.ts` 不含 private package、源码绝对路径或未声明 peer。
4. dist graph check：检查 bundle/chunk 不含禁止的框架 runtime、应用源码或 Nebula 模块。
5. tarball check：从 `pnpm pack` 结果安装到空目录，验证 exports 和实际依赖解析；纯逻辑包必须执行一个包含多文件相对 import 的原生 Node ESM smoke，不能只 typecheck 或交给 bundler 重写。

Turbo 只根据 package scripts 编排这些检查，不替代边界工具。

## 9. 格式、Lint 与代码风格

选择 Biome 2 统一格式和基础 lint，不同时维护 Prettier 与 ESLint 两套重叠规则。

基线：

- 2 空格缩进。
- LF 行尾。
- 单引号。
- 保留分号。
- 100 字符建议行宽。
- 禁止 debugger。
- import 排序由 Biome assist 执行。

TypeScript compiler 负责未使用类型、严格性和类型安全。只有 Biome 无法表达且具有实际缺陷价值的规则，才评估引入额外静态检查；不得为了风格偏好重新引入 ESLint。

## 10. 测试策略

### 10.1 Vitest

- `contracts`、`core`、plugin 包的纯测试默认运行在 Node environment。
- 允许 jsdom 做不依赖真实升级时序的轻量 DOM 测试。
- Custom Element define、connected/disconnected、Shadow DOM、framework root 和浏览器布局以 Playwright 结果为权威。
- 测试与源码同目录或放 package `test/`，每个包保持单一约定。

### 10.2 Playwright

- M1 建立浏览器 harness 后，影响 Custom Element、浏览器 runtime、bridge 或 SDK 的变更至少运行 Chromium 关键 E2E；纯文档和不影响浏览器的纯逻辑变更可按路径规则跳过。
- release gate 同时运行 Chromium、Firefox 和 WebKit。
- 测试覆盖 Vanilla、React、Vue consumer、双实例、注册冲突、同步 move、延迟重连、卸载和数据取消。
- 浏览器测试使用打包后的 workspace 或 tarball，不只使用源码 alias。

### 10.3 `@base-screen/testing`

- testing 通过公共 API 消费其他包，不能依赖 private source entry。
- conformance suite 由物料或插件作者在自己的测试项目中调用。
- 生产包自身的单元测试不反向依赖 testing；需要共享的产品逻辑应归所属生产包，通用外部 harness 才进入 testing。

## 11. 浏览器与产物基线

初始 build target 使用 Vite 8 的 Baseline Widely Available 基线，并显式记录为：

```text
Chrome 111+
Edge 111+
Firefox 114+
Safari 16.4+
iOS Safari 16.4+
```

规则：

- 不发布 ES5、legacy chunk 或 Custom Element polyfill。
- 依赖 native ESM、Custom Elements、Shadow DOM 和现代 DOM API。
- 采用超出基线的新 API 前，需要 capability check、局部 fallback 或提高浏览器基线的 ADR。
- Vite major 升级如果改变 baseline target，必须在 release note 中明确，不得静默扩大最低浏览器版本。
- 浏览器兼容是 SDK 行为承诺，不等同于开发工具 Node 版本。
- 常规 Playwright 验证当前稳定 Chromium、Firefox 和 WebKit，不等同于最低版本验证。
- beta/stable 发布前必须通过真实浏览器服务或设备实验室验证 Chrome 111、Edge 111、Firefox 114、Safari 16.4 和 iOS Safari 16.4 的关键 Viewer/Designer smoke；无法提供该证据时，支持声明必须收窄到实际验证版本。

## 12. 任务与 CI 契约

每个适用包提供一致脚本名，根命令由 Turbo 编排。候选根命令：

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm check:boundaries
pnpm check:packages
pnpm check:api
pnpm verify:tarball
pnpm verify:release
```

规则：

- 根脚本只组合 package scripts 和仓库检查，不藏业务实现。
- `build` 按 workspace dependency graph 执行。
- CI 使用 frozen lockfile，禁止隐式更新依赖。
- 缓存 key 包含 lockfile、工具配置和相关源码。
- release job 必须从干净 checkout 重建，不复用开发者本地产物。
- CI provider 不属于公共架构；迁移 CI 平台不应改变根命令语义。

## 13. API、Tarball 与体积门

发布前至少执行：

- API report：记录导出声明并检测意外破坏。
- `publint`：检查 package metadata 和 exports。
- Are the Types Wrong：检查 exports/types/module resolution。
- tarball consumer：从真实 `.tgz` 安装并运行 typecheck/build。
- dependency audit：确认 bridge peer 未被重复打包。
- size report：记录各入口 raw、gzip 和主要 chunk 组成。
- source map inspection：确认不泄漏本机绝对路径、Nebula 源码或私有模块。

体积预算的具体数字由对应 package Spec 冻结。没有预算前也必须持续记录，避免首次 stable 才发现无法解释的体积增长。

## 14. 发布与版本

### 14.1 Changesets

选择 Changesets 管理独立 package SemVer、changelog 和依赖 range 更新。

- 各包独立版本，不强制十二包同步 bump。
- 破坏性公共 API 变化必须有 changeset。
- 纯文档修改无需 package changeset，除非文档宣布公共行为变化。
- pre-1.0 期间仍需明确 breaking change，不能以 `0.x` 为由静默破坏 consumer。
- package SemVer 与 Material API Version 完全独立。
- `.changeset/config.json`、pre mode、dist-tag、内部依赖更新和 base branch 属于 M0 Spec 的冻结内容。
- alpha/beta 使用 Changesets pre mode 和非 `latest` dist-tag；只有 stable release 可以更新 `latest`。
- SDK 子路径重导出的下层 API 发生 breaking change 时，SDK 也必须产生对应 breaking changeset；CI 比较 API report 与 changeset 集合，不能只依赖内部 range 自动更新。
- pre-1.0 的 breaking bump 规则必须在 M0 Spec 中显式映射，避免不同包对 `0.x` 使用不同解释。

### 14.2 私有阶段与未来发布

- M0 只建立内部 workspace 和 tarball consumer，十二个 package 全部 `private: true`。
- `@base-screen/*` 在 M0 是内部逻辑 namespace，不代表已经获得 npm 官方 scope 控制权。
- 根目录不提供可成功执行的 npm publish job；误触发布必须因 private package 或显式门禁 fail closed。
- Changesets 在私有阶段用于记录 package API 影响、独立版本和内部依赖传播，但不上传 registry。
- 首次公开 alpha/beta 前必须另立发布 ADR，确认最终 scope、组织控制权、access、dist-tag、trusted publishing/provenance、凭证边界和包名迁移。
- 在公开发布 ADR 接受前，内部包名可以有计划地调整，不构成外部兼容承诺。
- 未来发布只能由 CI 从受保护分支和干净 tag 执行，包顺序由依赖图和 Changesets 生成。

## 15. 供应链、License 与 Provenance

- lockfile 必须提交。
- CI 安装使用 frozen lockfile。
- 依赖 install scripts 默认不信任，只通过 pnpm allowlist 批准。
- 发布前生成第三方 license inventory，并检查 MIT deliverable 的兼容性。
- Nebula 衍生文件进入仓库前必须在 `docs/provenance/` 记录来源 commit、原路径、修改范围、授权人和 attribution 结论。
- 架构思想不需要文件级代码 provenance，但 ADR 应引用来源文档。
- 不允许把 Nebula `UNLICENSED` package metadata、应用资产或私有依赖直接复制进发布包。
- 发现来源不明文件时，发布门必须失败，而不是事后补记录。

## 16. 考虑的方案

### 16.1 pnpm workspace + Turbo

优点：

- 与 Nebula 团队经验一致。
- pnpm 对 peer、workspace protocol 和发布依赖处理清晰。
- Turbo 提供跨十二包任务图、增量缓存和 CI 并行。

缺点：

- 增加一个任务编排层。
- 错误的 Turbo dependsOn 可以隐藏包脚本设计问题。

结论：接受。Turbo 只编排稳定 package scripts，不成为架构边界来源。

### 16.2 只用 pnpm recursive scripts

优点：依赖更少，初始化简单。

缺点：随着十二包、consumer、browser E2E 和发布检查增加，任务缓存和依赖顺序会快速复杂化。

结论：不接受作为长期方案。

### 16.3 Nx

优点：项目图、生成器和边界能力完整。

缺点：对当前十二包库增加较重的工作区模型和生成器约束，与 Nebula 经验不一致。

结论：当前不接受；若未来项目规模和团队工作流显著扩大，可重新评估。

### 16.4 npm、Yarn 或 Bun workspace

它们都可以建立 workspace，但不会带来足以抵消迁移成本和 pnpm peer/workspace 优势的收益。

结论：当前不接受。

### 16.5 所有包统一使用 Vite

优点：配置表面统一。

缺点：contracts/core 等纯逻辑包被不必要地 bundle，模块边界和依赖审计更困难。

结论：不接受。

### 16.6 所有包统一使用 tsc

优点：工具最少，声明天然一致。

缺点：不能完整处理 Engine/SDK 的 CSS、资源、框架转换和浏览器多入口 chunk。

结论：不接受。

### 16.7 同时发布 ESM 与 CJS

优点：兼容旧 Node consumer。

缺点：Base Screen 是浏览器优先的新库；双格式增加条件导出、类型解析和双包风险，没有明确消费需求。

结论：不接受。未来出现真实 CJS consumer 时另立 ADR。

### 16.8 ESLint + Prettier

优点：生态规则多，团队熟悉度高。

缺点：与 Biome 重叠，配置和执行成本更高；Base Screen 当前没有必须依赖 ESLint plugin 的规则。

结论：不接受作为初始基线。

### 16.9 固定所有包同一版本

优点：发布和兼容矩阵简单。

缺点：小包变化会导致无关包升级，隐藏真实 API 演进，增加 consumer 更新噪声。

结论：不接受；采用独立 SemVer。

## 17. 影响

正面影响：

- 十二包有可自动执行的单向依赖边界。
- Vanilla consumer 不被 React/Vue peer 污染。
- 纯逻辑包保持易审计，浏览器包仍能处理 CSS 和框架编译。
- ESM-only 和明确 exports 降低发布组合数量。
- tarball、API 和浏览器验证从首个纵向切片开始，而不是发布前补做。
- provenance 和 license gate 与 MIT 定位一致。

负面影响：

- 本机当前 Node v22.20.0 满足最低版本，但与默认固定 patch 不同；进入实现前应通过版本管理器切换到仓库 pin，CI 仍会额外验证 Node 24 LTS。
- Vite 与 tsc 两条构建路径需要共享配置和一致声明策略。
- ESM-only 明确放弃旧 CJS consumer。
- strict peer、禁止 hoist 会更早暴露依赖声明错误，初期配置成本更高。
- 独立版本需要 Changesets 正确维护内部 range。
- 私有阶段无法通过真实 registry 验证 scope、dist-tag 和 trusted publishing，公开发布前仍需独立 ADR 与演练。
- release gate 涵盖三个浏览器和多个 tarball consumer，CI 时间高于普通单包库。

## 18. 实施与验收

本 ADR 的实施由 [M0 工程基线 Spec](../specs/archive/m0-engineering-baseline/spec.md) 约束。Spec 至少冻结：

1. 根 manifest、workspace、Turbo、TypeScript 和 Biome 的精确文件内容。
2. 十二个 package manifest、exports、sideEffects 和 allowed dependency matrix。
3. 根脚本和 Turbo task graph。
4. package boundary checker 的输入、输出和错误码。
5. 最小 tarball consumer 与 license/provenance gate。
6. CI 验收命令和缓存边界。
7. `.changeset/config.json`、私有阶段版本记录、内部依赖传播和 SDK re-export breaking change 门禁；公开 dist-tag 延后到发布 ADR。

ADR 落地完成的验收标准：

- Node 22 默认 pin、Node 22 最低线、Node 24 CI 线与 pnpm 11 在干净环境可安装。
- 十二个空包可以按依赖图 build、typecheck、pack。
- 任意一条禁止依赖都会使 boundary check 失败。
- 默认 entries 无副作用，auto-register entries 被精确标记。
- production packages 不依赖 testing。
- React/React DOM/Vue 只出现在对应 bridge peer/dev graph，或 ADR-0006 明确批准的私有 build allowlist，不进入 Vanilla consumer 必装图或公共声明。
- 所有 tarball 只包含 exports 可达产物、license 和必要 metadata。
- 十二个 package 均为 private，仓库不存在可绕过的 npm 发布路径。
- `@base-screen/*` 只作为内部逻辑 namespace；公开 scope 不在 M0 验收范围内。

## 19. 参考

- [Base Screen 长期演进总纲](../architecture/base-screen-evolution.md)
- [Node.js Releases](https://nodejs.org/en/about/previous-releases)
- [pnpm Installation and Compatibility](https://pnpm.io/installation)
- [Vite 8 Migration and Browser Baseline](https://vite.dev/guide/migration)
- [TypeScript Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/overview.html)
- Nebula `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`biome.json` 和 Screen SDK package configs

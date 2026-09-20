# verify:m0 门禁排障记录

> 状态：生效中
> 最近更新：2026-09-20
> 定位：记录 `pnpm verify:m0` 各门禁在 P0 实现中实际遇到的问题、根因与修复方法，避免重复排查
> 关联：[M0 工程基线 Spec](../specs/archive/m0-engineering-baseline/spec.md)、[Contracts Foundation Spec](../specs/archive/contracts-foundation/spec.md)

## 1. 门禁执行顺序与定位方法

`pnpm verify:m0` 按序执行（以 `package.json` 脚本为准）：

```text
format:check -> lint -> typecheck -> test -> check:packages -> check:api
-> check:engine-import -> verify:tarball
```

链中没有会写入格式修正的 `format` 步骤（格式修正须先手动运行 `pnpm format`），也没有独立的 `build`
步骤——各包构建由 Turbo 任务依赖间接触发（`test` 依赖本包 `build`，`lint`/`typecheck` 依赖 `^build`），
构建失败会在对应步骤暴露，需要单独隔离构建时可运行 `pnpm build`。CI 在 `pnpm verify:m0` 之后运行
`pnpm check:api-changesets`，并以 `git diff --exit-code` 收尾，校验整个过程未改动任何受跟踪文件。

定位失败步骤：

```powershell
pnpm format:check *> $null; Write-Output "format:check=$LASTEXITCODE"
pnpm lint *> $null; Write-Output "lint=$LASTEXITCODE"
pnpm check:docs *> $null; Write-Output "check:docs=$LASTEXITCODE"
pnpm typecheck *> $null; Write-Output "typecheck=$LASTEXITCODE"
pnpm test *> $null; Write-Output "test=$LASTEXITCODE"
pnpm check:packages *> $null; Write-Output "check:packages=$LASTEXITCODE"
pnpm check:api *> $null; Write-Output "check:api=$LASTEXITCODE"
pnpm check:engine-import *> $null; Write-Output "check:engine-import=$LASTEXITCODE"
pnpm verify:tarball *> $null; Write-Output "verify:tarball=$LASTEXITCODE"
```

注意：`verify:tarball` 会打印大量 ATTW 噪音（11 个空包各自的 node10/CJS 行均为 expected noise，可忽略）。真正失败时在尾部出现 `Error: Command failed: ...` 或 `ERR_*` 前缀错误，不要被中段噪音误导。

## 2. lint / check-boundaries

### 2.1 tsc 包相对导入 JSON 被 EXTENSIONLESS_ESM_IMPORT 拦截

- 症状：`check-boundaries` 报 `EXTENSIONLESS_ESM_IMPORT: packages/contracts/src/... -> ./screen-document.schema.json`。
- 原因：规则要求 tsc 构建包的相对导入必须以 `.js` 结尾，但 JSON 导入本身就是字面路径，不带 `.js`。
- 修复：`scripts/check-boundaries.mjs` 中豁免以 `.json` 结尾的相对导入。

### 2.2 新外部依赖被 FORBIDDEN_EXTERNAL_DEPENDENCY 拦截

- 症状：`check-boundaries` 报 `FORBIDDEN_EXTERNAL_DEPENDENCY: contracts -> zod`。
- 原因：M0 基线外部依赖为空，边界检查没有白名单。
- 修复：`scripts/check-boundaries.mjs` 增加 `ALLOWED_EXTERNAL_DEPENDENCIES`（`contracts: ['zod']`）。新增外部依赖必须先更新该白名单，再改 manifest。

## 3. typecheck

### 3.1 vitest 类型需要 DOM lib

- 症状：contracts/testing 包 `tsc --noEmit` 报 `Cannot find name 'AbortSignal' / 'Event' / 'EventTarget' / 'WebSocket'`（来自 tinybench/vite/vitest 的 `.d.ts`）。
- 原因：vitest 类型链引用 DOM global，而包 tsconfig `lib: ["ES2022"]`。
- 修复：测试配置 `tsconfig.json` 的 lib 改为 `["ES2022", "DOM"]`；`tsconfig.build.json` 必须覆盖回 `["ES2022"]` 并 `exclude: ["src/**/*.test.ts"]`，保证公共构建保持纯 ES2022、且测试不进入 dist/tarball。

### 3.2 `const type = typeof value` 不会窄化变量

- 症状：`const type = typeof value; if (type === 'string') { hasUnpairedSurrogate(value) }` 报类型错误。
- 原因：TS 只对直接 `typeof value === 'string'` 形态做控制流窄化，中间变量不生效。
- 修复：全部改为直接 `typeof value === 'string'` 等判断。

### 3.3 `Array.isArray` 无法从 union 中排除 readonly 数组

- 症状：`Array.isArray(value)` 后对剩余 union 做索引报错。
- 原因：`Array.isArray` 的 type predicate 是 `arg is any[]`，`readonly ScreenJsonValue[]` 不可赋值给 `any[]`，不会被从 false 分支排除。
- 修复：false 分支显式 cast：`value as Readonly<Record<string, ScreenJsonValue>>`。

### 3.4 `z.record(z.any())` 单参签名在 Zod 4.4.3 是 TS 错误

- 症状：`Expected 2-3 arguments, but got 1`。
- 修复：`z.record(z.string(), z.any())`。

## 4. test（vitest）

### 4.1 Vite transform 破坏字符串字面量中的 lone surrogate

- 症状：测试源码里的 `'\ud800'` 在运行时变成 U+FFFD（`�`），断言无法命中。
- 原因：Vite/esbuild 转换会重编码字符串字面量中的孤立代理项。
- 修复：测试中用 `String.fromCharCode(0xd800)` 在运行时构造，不写字面量。

### 4.2 显式校验的诊断没有让解析失败

- 症状：name/backgroundColor 等显式检查报出诊断，但 `parse` 返回 `ok: true` 且诊断被丢弃。
- 原因：`validateCanvas`/`validateComponent`/envelope 的显式检查只 `collector.add(...)`，没有让调用方知道失败；根对象 unknown-key 检查的返回值也被忽略。
- 修复：显式检查每次 `add` 同时置本地 `clean = false` 并返回；`validateDocument` 用 `collector.count` 前后差值统一判定该阶段是否失败，任何新增诊断都终止解析。

### 4.3 findParentCycles O(n²) 导致 10k 组件测试超时

- 症状：`accepts long acyclic parent chains` 超过 vitest 默认 5s 超时；单条 10k 链条解析耗时约 13s。
- 原因：每条链都从每个起点重新走一遍，Σ(i+1) ≈ 5×10⁷ 次节点访问。
- 修复：walk 中命中已 `processed` 节点时提前终止并把已走前缀标记为 `processed`，总工作量 O(n)，10k 链条降至约 250ms。

### 4.4 hasUnpairedSurrogate 对字符串末尾 lone surrogate 失效

- 症状：`'\ud800'`（孤立高位代理在末尾）未按预期拒绝。
- 原因：`charCodeAt(index + 1)` 越界返回 `NaN`，`NaN < 0xdc00` 恒为 false，条件永远不成立。
- 修复：改为 `if (!(next >= 0xdc00 && next <= 0xdfff)) return true;`（NaN 参与比较恒 false 后取反即为 true）。

## 5. build

### 5.1 z.toJSONSchema 显式 target 选项会省略 `$schema`

- 症状：`z.toJSONSchema(schema, { target: 'jsonSchema2020-12' })` 输出没有 `$schema` 键。
- 原因：Zod 4.4.3 带 target 选项时不输出 `$schema`。
- 修复：不传 target，默认输出即 `$schema: https://json-schema.org/draft/2020-12/schema`。

## 6. verify:tarball

### 6.1 JSON 子路径 types 触发 ATTW FalseExportDefault

- 症状：ATTW 报 `The resolved types use export default where the JavaScript file appears to use module.exports`（bundler 模式）。
- 原因：`./screen-document.schema.json` 子路径声明了指向 `export default` 的 `.d.ts`，与 JSON 模块的 `module.exports` 语义不匹配。
- 修复：JSON 子路径 export 不再声明 `types` 条件；删除 golden `.d.ts` 及其 build 复制步骤。TS 消费方用 `resolveJsonModule` 读取 JSON 本体获得类型。

### 6.2 私有包 tarball 的 workspace 依赖导致 consumer 安装 404

- 症状：`ERR_PNPM_FETCH_404 GET https://registry.../@base-screen/contracts: Not Found`，发生在 `pnpm install` consumer 阶段。
- 原因：manifest 中 `workspace:^` 在 pack 时被改写为 `^0.0.0`；consumer 解析该 range 时去 registry 查找私有包。pnpm 无法读取 file: tarball 的版本参与 range 解析，因此**直接 file: 依赖、`overrides` 指向 tarball/directory 均无效**（已逐一验证）。
- 修复：`scripts/verify-tarballs.mjs` 在 pack 后对每个 tarball 解包，把内部 workspace 依赖的 spec 改写为指向已打包依赖 tarball 的绝对 `file:` 路径（Windows 路径转 `/`），再重打包；consumer 只声明目标包一个 `file:` 依赖即可，传递依赖沿改写后的 spec 解析，不再访问 registry。
- 注意：外部依赖（如 zod）保持 registry 解析，不受影响；打包顺序按依赖序（contracts 最早、testing 最晚），依赖 tarball 一定已存在。

### 6.3 tarball consumer 需要依赖链时脚本报 ReferenceError

- 症状：`readFileSync is not defined`。
- 原因：`scripts/verify-tarballs.mjs` 新增函数忘记补充 `node:fs` 导入。
- 修复：补齐导入。属于笔误类，回归到脚本里新增 fs 用法时注意。

## 7. check:api

### 7.1 API_REPORT_CHANGED

- 症状：`check:api` 报 `API_REPORT_CHANGED`，并显示当前声明与已提交报告的差异。
- 原因：某个 package 根入口或子路径的公开声明发生变化，但对应 `packages/<package>/etc/*.api.md`
  尚未更新。
- 修复：确认变化有意后运行 `pnpm api:report`，审查生成报告，并为报告变化涉及的 package 补充
  Changeset。报告是生成产物，不要手工编辑。
- 注意：Vue 报告分析会提示 API Extractor 使用 `skipLibCheck`；这是因为 API Extractor 内置的 TypeScript
  版本落后于当前 Vue peer 类型。正常 `pnpm typecheck` 仍保持 `skipLibCheck: false`，该提示不代表包类型检查被放宽。

## 8. 模块完整性审查

- 仓库不按文件行数阻断 CI，也不维护逐文件行数 baseline。
- 模块过大与否由职责判断：若其中存在可独立命名、测试、复用或演进的行为，应按该边界拆分；若状态、
  失败分支和辅助逻辑共同完成同一行为，应保持在一个内聚模块中。
- 排查聚合体时优先看依赖方向、循环引用、共享可变状态和测试准备是否跨越多个无关领域；对应的自动证据
  来自 `pnpm check:boundaries`、`pnpm typecheck`、`pnpm test` 和适用的浏览器验证。
- 不要创建只转发调用、只重命名私有符号或迫使阅读者跨文件追踪同一状态机的拆分。

## 9. check:docs

### 9.1 DOC_LINK_TARGET_MISSING / DOC_LINK_TARGET_INVALID

- 症状：Markdown 相对链接或图片指向不存在、无法解码或逃出仓库的路径。
- 修复：按当前文件位置重算相对路径；移动 Spec/Plan 时同步更新外部引用。外部 URL、纯锚点和历史代码
  格式路径不参与目标存在性检查。

### 9.2 DOC_*_INDEX_MISSING / DOC_*_INDEX_ORPHAN / DOC_*_INDEX_DUPLICATE

- 症状：ADR、Spec 或 Plan 的实际目录/文件与对应索引不一致。
- 修复：活动条目登记到活动索引；完成或被取代的条目使用 Git 重命名移入 archive，并在归档索引登记。
  不要通过删除索引行掩盖仍留在活动目录中的完成 Spec。

### 9.3 DOC_ADR_*_MISMATCH / DOC_ADR_*_MISSING / DOC_ADR_FILE_DUPLICATE

- 症状：ADR 文件名编号、一级标题、索引目标、日期或规范化状态不一致，或同一编号对应多个文件。
- 修复：以 ADR 正文已审议状态为依据，使文件名、标题、日期和索引行一一对应；方向变化应新增 ADR 并
  标记取代关系，不要通过复制编号或只改索引状态制造第二份事实来源。

### 9.4 DOC_COMPLETED_SPEC_NOT_ARCHIVED

- 症状：活动 Spec 的 Tasks 与 Checklist 已无未完成项，但目录仍位于 `docs/specs/`。
- 修复：在同一交付批次归档 Spec、更新能力基线和 Roadmap，并重算相对链接。

### 9.5 DOC_VERSION_MARKER_FORBIDDEN

- 症状：文档引入按版本区分的公共名称、路径后缀或版本字段。
- 修复：使用单一稳定名称；验证编号使用 Gate/Requirement 等语义标签。AGENTS 与 Roadmap 中用于说明
  禁令的示例行由门禁显式豁免。

## 10. 关键约定（避免误改）

- JSON Schema artifact 以 `packages/contracts/src/screen-document.schema.json` 为 golden：由 `scripts/emit-schema-golden.mjs`（从 dist 生成）产出并提交；构建时 `scripts/write-schema-artifact.mjs` 复制到 `dist/`；`document/json-schema.test.ts` 的 drift 测试保证 golden 与运行时生成一致。
- 诊断 sentinel（`DIAGNOSTIC_LIMIT_REACHED`）的 path：cap 在 document 阶段触顶时为 `['document']`（envelope 场景需前缀），其余为 `[]`，见 `diagnostics/collector.ts`。
- tsc 构建包的公共编译必须保持纯 `ES2022`（`tsconfig.build.json` 覆盖 lib），DOM 只出现在测试配置里。

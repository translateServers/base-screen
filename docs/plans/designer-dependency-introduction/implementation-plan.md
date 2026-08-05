# Designer 依赖引入计划

> 状态：待评审
> 日期：2026-08-05
> 适用范围：Designer Product Completion 及其后续 Designer 增量
> 依据：[Designer Product Completion Spec](../../specs/designer-product-completion/spec.md)、[ADR-0006](../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[仓库指南](../../../AGENTS.md)
> 候选评估：[Designer 依赖候选评估](./dependency-evaluation.md)

## 1. 目标

本计划在缩短 Designer 开发周期的同时，控制直接依赖、传递依赖、包边界和长期维护成本。

具体目标：

1. 保持 framework-neutral DOM、原生 Pointer Events、Shadow DOM 和实例级状态架构。
2. 不引入 React、Vue 或其他应用/UI 框架到 Designer 生产路径。
3. 优先复用浏览器能力、现有 Core 算法、Engine operation/controller 和现有工程工具。
4. 对确实能够显著减少工期或正确性风险的外部依赖提供严格、可回退的例外通道。
5. 防止第三方类型、状态模型、DOM 结构和私有协议泄漏到 Base Screen 公共 API。
6. 每次依赖变化都具有需求依据、量化收益、许可结论、自动化证据和维护责任人。

## 2. 当前基线

- 固定保留现有 12 个 workspace package，不为单个第三方库创建 wrapper package。
- `@base-screen/engine` 当前只有 workspace 生产依赖，没有外部生产依赖。
- `scripts/check-boundaries.mjs` 当前只允许 `contracts` 使用外部 `zod`；React/Vue 只允许出现在各自桥接包。
- 根工程已有 TypeScript、Vite、Vitest、Playwright、Biome、API Extractor 和 tarball 验收能力。
- Designer 已具有原生手势、图层、标尺、参考线、吸附、operation registry 和 Core transaction/history 基础。

本计划的基线目标是：Designer Product Completion 剩余任务默认在不新增生产依赖的条件下完成。

## 3. 不可突破的约束

以下约束属于硬门禁，不能通过评分或工期理由豁免：

- 不向 `engine`、`core`、`renderer`、`material`、`sdk` 引入 React、React DOM、Vue、Svelte、Angular 或其运行时。
- 不引入 Tailwind、Radix、Ant Design、MUI 等 UI framework、全局 CSS framework 或主题运行时。
- 不引入 Zustand、Redux、MobX 等全局状态方案；Designer 状态继续由每个元素的 session/controller 持有。
- 不复制或持久化第三方图编辑器、拖拽库或布局库的私有 document shape。
- 不通过 CDN、远程 ESM、运行时脚本注入或动态下载绕过 package manifest 和 lockfile。
- 不新增 workspace package，不放宽固定包清单，不建立生产包到 `@base-screen/testing` 的依赖。
- 不允许第三方类型出现在公共导出、Custom Element 公共属性、事件、Manifest、canonical document 或 API report 中。
- 不允许 install/postinstall script、原生二进制、远程下载构建步骤或非确定性代码生成进入生产依赖链。
- 未经 accepted ADR，不改变公共 ABI、package graph、Project Adapter 或 SDK stable tag。

## 4. 默认技术选择

当前能力优先使用下表方案，不因 Nebula 使用第三方库而自动引入对应依赖。

| 能力 | 默认实现 | 当前依赖决策 |
| --- | --- | --- |
| 移动、缩放、旋转、框选、平移 | Pointer Events、pointer capture、Core 纯几何、临时 DOM preview | 不引入 Moveable、Selecto |
| 图层排序与 reparent | 原生 Drag and Drop、Core hierarchy/transaction | 不引入 dnd-kit、sortable 库 |
| 快捷键 | Engine operation metadata、Shadow Root/owner document 事件入口 | 不引入 hotkey 库 |
| 网格与吸附 | CSS 背景、Engine transient state、Core/Engine 纯算法 | 不引入画布编辑库 |
| 标尺与参考线 | DOM 或 Canvas 2D、ResizeObserver、device pixel ratio | 不引入 ruler 库 |
| 面板、菜单、对话框、tooltip | Engine 私有 semantic primitive、平台元素和 ARIA | 不引入 UI primitive 集合 |
| 图层大集合 | 分页增量渲染；达到测试阈值后再实现窗口化 | 不引入虚拟列表库 |
| Blueprint 作者能力 | canonical 表单、列表、键盘编辑和 Core diagnostics | 不引入 React Flow 或图编辑框架 |
| 图形化 Blueprint 投影 | 后续独立评估，layout 只属于 Engine session | 当前不占用依赖预算 |
| 调度与观测 | `requestAnimationFrame`、ResizeObserver、AbortController | 不引入调度工具库 |

## 5. 依赖预算

### 5.1 生产依赖

Designer Product Completion 主线采用以下预算：

- 目标：零个新增外部生产依赖。
- 例外上限：整个 Designer 主线最多一个新增直接外部生产依赖，而不是每个功能一个。
- 默认传递依赖上限：新增不超过 10 个运行时 package；超过即拒绝，除非由新 ADR 明确批准。
- 默认体积上限：Designer 浏览器入口 minified + gzip 增量不超过 40 KiB。
- 依赖必须支持 ESM、现代浏览器、Shadow DOM、多实例和显式 dispose/disconnect。
- 版本使用精确 pin；workspace 内部依赖继续使用仓库既有 `workspace:^` 规则。

达到预算不代表自动准入。任何一个候选仍必须通过全部门禁。

### 5.2 开发与测试依赖

- 优先使用根工程已有工具，不为 lint、format、unit、DOM、browser 或 bundle 检查引入功能重叠工具。
- 新工具只放根 `devDependencies`，除非发布后的 package 本身确实需要该依赖。
- 单次工具引入必须替代明确的手工流程或现有脚本缺口，不能只改善个人偏好。
- 不允许测试工具类型泄漏进生产声明文件，不允许生产源码导入测试工具。
- 一次性审计优先使用 Node 标准库脚本，不为单次报告永久增加依赖。

### 5.3 Peer 与 optional dependency

- Designer 不通过 peer dependency 变相要求宿主安装 UI、状态或交互框架。
- Designer 核心能力不使用 optional dependency 形成两套未经同等验证的运行路径。
- React/Vue peer 继续只属于各自桥接包，不进入 Engine 的实现或类型边界。

## 6. 例外触发条件

只有同时满足以下条件，才进入外部依赖评估：

1. 对应能力已属于生效中的 Spec，而不是预想功能。
2. 已完成原生方案的最小设计和工作量拆分，并识别具体高风险算法或浏览器兼容点。
3. 候选依赖预计至少节省 10 个工程日，或可显著降低安全、正确性、无障碍风险。
4. 该能力不是 Base Screen 的 canonical contract、history、hierarchy、capability 或安全边界。
5. 可以通过私有 adapter 隔离，移除依赖时无需迁移持久化文档或修改公共 API。
6. 至少存在一个不使用该依赖的明确回退实现和终止条件。

“旧项目使用了该库”“社区常用”“代码更少”和“短期 demo 更快”不能单独构成引入理由。

## 7. 候选评估流程

### Gate A：需求与原生基线

提交一页评估记录，至少包含：

- 对应 Requirement、Task 和验收 case；
- 当前代码边界和缺失行为；
- 原生实现拆分、预计工程日和主要风险；
- 不引入依赖时对交付日期的实际影响；
- 候选库只负责什么，以及明确不负责什么。

没有 Requirement 或无法量化收益时，评估终止。

### Gate B：最多两个候选

每项能力最多比较两个外部候选和一个原生方案，防止评估本身拖慢交付。候选必须先满足：

- framework-neutral；
- ESM 和 TypeScript 声明可用；
- 许可证允许当前 MIT 分发方式；
- 维护状态、发布历史和 issue 响应可接受；
- 无安装脚本、原生二进制和运行时远程代码；
- 不要求全局 Store、公共 stylesheet 或接管宿主 document。

### Gate C：量化评分

| 维度 | 权重 | 核查内容 |
| --- | ---: | --- |
| 功能与工期收益 | 25 | 实际覆盖多少验收 case，节省多少工程日 |
| 架构兼容 | 20 | 原生 DOM、Shadow DOM、多实例、生命周期、私有 adapter |
| 正确性与无障碍 | 15 | Pointer/keyboard/IME、ARIA、cancel/recovery、浏览器行为 |
| 供应链与许可 | 15 | 许可证、维护者、发布来源、install script、漏洞和所有权风险 |
| 体积与性能 | 15 | 直接/传递依赖、gzip 增量、启动和手势帧开销 |
| 可替换与维护 | 10 | API 表面积、测试替身、升级成本、回退路径 |

准入要求为总分至少 80，并且不存在硬门禁失败。评分、证据链接和测量命令进入 ADR 或依赖评估记录。

### Gate D：隔离试点

试点不得直接改写主实现。先建立最小私有 adapter，验证：

- adapter 只暴露 Base Screen 自有类型；
- 只覆盖一个垂直工作流，不扩展公共 API；
- 同一页面两个 Designer 不共享状态；
- Shadow DOM、缩放、DPR、pointer cancel、disconnect 和 reconnect 正常；
- input、textarea、select、contenteditable 和 IME 不被劫持；
- browser harness 的 1024x640、1440x900、1920x1080 和窄屏路径无回归；
- 构建产物、声明文件和 source map 不包含不允许的私有路径或类型。

试点未达到验收条件时删除试点，不保留双实现、兼容分支或未使用依赖。

### Gate E：决策与合入

生产依赖合入前必须在同一变更中完成：

1. 新建或更新 ADR，记录选择、拒绝项、预算、风险和回退条件。
2. 若行为或公共边界变化，先更新对应 Spec、tasks、checklist 和 test matrix。
3. 更新目标 `package.json`、根 `pnpm-lock.yaml` 和 `scripts/check-boundaries.mjs` 精确白名单。
4. 增加私有 adapter；业务 controller 不散布第三方 import。
5. 增加 unit、DOM、双实例和 Chromium 回归。
6. 检查 API report 和 `dist/*.d.ts`，证明第三方类型没有泄漏。
7. 记录许可证、版权 notice、直接和传递依赖清单。
8. 更新受影响架构文档；不把第三方实现细节写成 Base Screen 公共契约。

## 8. 代码隔离规则

获准依赖只能放在实际拥有该能力的 package 中。Designer 交互类依赖原则上只能由 `engine` 私有 adapter 引用。

推荐结构：

```text
packages/engine/src/integrations/<capability>-adapter.ts
packages/engine/src/controllers/<feature>-controller.ts
packages/engine/src/operations/<feature>-operations.ts
```

约束如下：

- `integrations/` 是第三方 API 的唯一 import 位置。
- controller 只消费 Base Screen 自有接口，不消费第三方 event/type。
- Core 继续拥有纯算法、transaction 和 history，不依赖 DOM 交互库。
- Contracts、Manifest 和 canonical document 不出现第三方字段。
- 第三方 CSS 必须审计并私有化到 Engine Shadow DOM；无法隔离的 stylesheet 依赖直接拒绝。
- adapter 必须提供显式 `connect`/`disconnect` 或等价生命周期，并可验证清理 listener、observer、timer 和 pointer capture。
- 测试断言可观察行为，不以第三方 DOM class、内部节点数量或私有事件名作为产品契约。

## 9. 实施顺序

### Phase A：零依赖完成高复用基础

1. 完成统一 operation 和 shortcut metadata。
2. 完成多选手势、clipboard、group、align/distribute 和异常清理。
3. 完成 Layers selection、rename、reorder、reparent 和 root drop。
4. 完成 ruler、guide、grid、snap 和 10%-500% zoom 验收。

Phase A 期间不接受交互库申请。现有原生实现已经覆盖主要路径，先以自动化暴露真实缺口。

### Phase B：零依赖完成渐进作者能力

1. 收敛工作台 primitive、状态和可访问性。
2. 完成 canonical Data/Interaction 面板。
3. 完成 Events 和 Blueprint 的表单、列表、键盘、history 与 diagnostics 闭环。

Phase B 不引入图编辑框架。图形化不是 canonical Blueprint 完成前置。

### Phase C：评估唯一例外槽位

Phase A、B 的 focused/browser 数据形成后，再判断是否存在满足例外条件的高成本能力。若没有，依赖预算保持未使用；不能为了“用掉预算”引入库。

图形化 Blueprint 若成为新的生效中 Requirement，应单独执行 Gate A-E，并与原生 SVG/DOM 投影比较。它不能反向修改 canonical Blueprint shape。

### Phase D：发布审计

1. 审计所有 package manifest 与 lockfile delta。
2. 审计许可证、notice、已知漏洞和废弃 package。
3. 检查直接/传递依赖数量和 browser bundle gzip 增量。
4. 检查 API report、`.d.ts`、source map、tarball 和 consumer 工程。
5. 运行 package focused gates、browser、runtime、boundary、API、tarball 和 `pnpm verify:m0`。

## 10. 必需验证

依赖变更至少执行：

```text
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm --filter @base-screen/engine lint
pnpm --filter @base-screen/engine typecheck
pnpm --filter @base-screen/engine test
pnpm --filter @base-screen/engine build
pnpm verify:browser
pnpm check:api
pnpm verify:tarball
pnpm verify:m0
```

如果依赖不属于 Engine，应把对应 package 的 focused lint、typecheck、test 和 build 加入验证。安全审计依赖网络或 registry 可用性时，结果必须记录日期、registry 和未完成原因，不能静默跳过。

## 11. 回退与终止条件

出现以下任一情况，候选不得合入或必须在发布前移除：

- 实际节省工期低于评估值的一半；
- 需要第三方类型进入公共 API 或 canonical document；
- 无法稳定支持 Shadow DOM、双实例、disconnect 或 pointer cancel；
- bundle gzip 增量、传递依赖数超过预算且没有获批 ADR；
- 引入全局样式、全局状态、运行时远程代码或 install script；
- 关键无障碍路径只能通过 pointer 完成；
- 维护停止、许可证变化、出现无法缓解的高风险漏洞；
- tarball consumer、API、boundary、browser 或 `verify:m0` 无法通过。

回退通过删除私有 adapter、manifest 条目和对应 lockfile delta 完成。因为公共类型和持久化数据不依赖第三方 shape，回退不应需要兼容迁移。

## 12. 持续治理

- 每次升级只解决明确问题，不使用无边界的批量升级。
- 依赖升级单独提交，不能和大规模功能改造混合，以便审查和回退。
- 每次发布前复核版本、许可证、维护状态、漏洞、传递依赖和 bundle 预算。
- 删除不再导入的依赖，并由 boundary/package 检查阻止幽灵依赖。
- 当浏览器标准或现有 Core/Engine 能力可以替代外部依赖时，建立移除任务。
- 依赖 owner 负责升级、漏洞响应、browser 回归和移除决策；没有明确 owner 的依赖不准引入。

## 13. 当前决策

在 Designer Product Completion 的当前范围内：

- React、React DOM、Vue 和其他 UI framework：禁止。
- Moveable、Selecto、dnd-kit、React Flow、Zustand、快捷键库和标尺库：不引入。
- 新增外部生产依赖预算：目标为零，唯一例外槽位暂不分配。
- 新增开发依赖：当前没有已识别需求。
- `@floating-ui/dom`、`@tanstack/virtual-core` 和 `@dagrejs/dagre` 只进入条件候选池，不写入 manifest；
  每次仍需单独通过 Gate A-E，且不能同时占用唯一例外槽位。
- 当前 Spec 已有功能继续使用现有原生实现；只有新的生效中 Requirement、自动化或性能数据证明具体缺口后
  才启动 Gate A。

# Plugin Core Contract Spec

> 状态：生效中
> 最近更新：2026-08-03
> 定位：冻结 `@base-screen/plugin-core` 的物料 ABI、插件协议、只读目录、标准事件与限权命令端口
> 依据：[ADR-0001](../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)（已接受）、[ADR-0003](../../decisions/ADR-0003-web-component-material-abi-and-registration.md)（已接受）、[ADR-0004](../../decisions/ADR-0004-plugin-lifecycle-contributions-and-trust.md)（已接受）、[Contracts Foundation Spec](../contracts-foundation/spec.md)（生效中）、[Base Screen 长期演进总纲](../../architecture/base-screen-evolution.md)（生效中）

## 1. Why

`@base-screen/plugin-core` 当前仅为空包骨架，但 Renderer、Plugin Manager、Plugin SDK、Engine 和框架桥接均依赖统一的物料与插件协议。必须先冻结可序列化身份、Web Component ABI、生命周期和权限边界，避免各消费者形成不兼容实现。

## 2. 生效条件

本 Spec 是 P1 Plugin Core 的实施依据。以下前置条件已经冻结，后续修改必须先更新对应 ADR 与本 Spec：

- ADR-0003 已接受，冻结 Web Component ABI、DOM 类型策略、显式 type/tagName 绑定与注册所有权。
- ADR-0004 已接受，冻结同 realm 信任模型、插件生命周期、贡献点、能力授权与命令权限边界。
- [Contracts Foundation Spec](../contracts-foundation/spec.md) 保持“生效中”，且发布包提供稳定的 JSON value、可配置专用资源预算的安全 parser/preflight 与诊断契约。
- Contracts 诊断契约已通过受控扩展纳入 §18 的 `PLUGIN_CORE_*` code；不得把 Plugin Core code 混入 Document 专用语义。
- 本 Spec 已根据 ADR 完整回填所有公共 strict object、discriminated union、函数签名、注册责任、资源限制、诊断责任和生命周期状态，不存在待定项。
- 本 Spec 完成评审，每项 Requirement 均可映射到自动化测试。

ADR 或 Contracts 前置改变公共边界时必须先同步本 Spec；实现不得自行选择替代行为。

## 3. What Changes

- 增加 Manifest、Element Model、标准事件及 Custom Element 结构 ABI。
- 增加稳定物料身份与显式 `tagName` 的绑定校验规则。
- 增加只读、实例级 Material Catalog 与 Plugin Catalog 接口。
- 增加 Plugin Manifest、依赖、能力、贡献点和生命周期协议。
- 增加仅允许白名单 Core 命令的 Plugin Command Port。
- 增加统一解析结果、冲突、依赖、能力和权限诊断约束。
- 保持默认入口无注册、无插件执行、无全局状态和无框架依赖。

## 4. Impact

- 受影响规格：Contracts Foundation、后续 Plugin Manager、Plugin SDK、Renderer、Engine、Material 与框架桥接规格。
- 受影响代码：`packages/plugin-core`；后续由消费者通过公共根入口接入。
- 依赖变化：仅在源码实际使用后增加 `@base-screen/contracts`，不得增加其他 workspace 或框架运行时依赖。
- **BREAKING**：无。包当前无公共业务 API；首次协议发布后，后续不兼容修改必须通过新 ADR/Spec 和主版本演进。

## 5. 目标

完成后，包必须提供：

- 与框架无关、可由 Vanilla、React bridge 和 Vue bridge 共同实现的物料 ABI。
- 可被文档稳定引用、与 npm 包版本解耦的物料身份。
- 纯数据 Manifest、受控 JSON 边界和确定性解析诊断。
- 供 Renderer、Engine 等消费者依赖的只读目录抽象。
- 描述插件依赖、能力、贡献和生命周期的最小协议。
- 提供不暴露 Core Command Bus 的限权命令调用接口。
- 可在 Node 中安全导入、在浏览器中由上层显式装配的无副作用发布包。

## 6. 非目标

本阶段不包含：

- 注册、覆盖、枚举或删除浏览器全局 Custom Element。
- 加载远程模块、执行插件、排序依赖图或构造可变 Registry。
- Plugin Manager 的启用事务、回滚、冲突仲裁或多实例运行时。
- Plugin SDK 的 `define()`、`definePlugin()` 或作者辅助工厂。
- Renderer 的 DOM 创建、diff、事件转发或缺失物料 UI。
- React、Vue、Lit、Stencil 的桥接实现或类型。
- Core 命令实现、Store、Router、Host Adapter、资源凭证或网络能力。
- iframe、Worker 或其他恶意代码安全沙箱承诺。
- 未经后续 ADR/Spec 授权的插件自定义文档 mutation、动态代码或任意宿主服务访问。

不得以 `unknown` 扩展槽、空 facade、回调函数或宿主实例提前保留这些能力。

## 7. Package 边界

`@base-screen/plugin-core` 必须满足：

- 唯一允许的 workspace dependency 是 `@base-screen/contracts`。
- 不依赖 Core、Renderer、Engine、Plugin Manager、Plugin SDK、Material、SDK、Testing 或框架包。
- 默认根入口不得访问 `window`、`document`、`customElements`、网络、文件系统、时间、随机数或环境变量。
- 默认根入口不得注册元素、执行插件、维护可变全局目录或修改 global。
- package 保持 ESM-only、`sideEffects: false`，并可由真实 tarball consumer 导入。
- public `.d.ts` 不出现 React、Vue、Zod、Store、Router、Engine、Manager 或宿主 DTO 类型。
- public `.d.ts` 直接使用 `HTMLElement`、`CustomElementConstructor`、`CustomEvent` 等 `lib.dom` 类型；package 的构建配置必须包含 `DOM` lib，消费者若使用 Element/Event API 也必须启用 DOM lib。Node 运行时导入仍不得访问 DOM global。
- 所有跨边界数据使用 readonly 类型和 Contracts 的 JSON value，不接受函数、类实例或可变宿主对象。

## 8. 物料身份

### 8.1 身份层次

物料协议必须区分：

- `type`：写入 `ScreenDocument` 的稳定身份，例如 `acme.kpi-card`。
- `tagName`：浏览器注册使用的稳定 Custom Element 名称。
- package version：分发包版本，不进入文档身份。

`type` 的格式复用 Contracts Foundation Spec，不由 Plugin Core 放宽或复制第二套规则。

### 8.2 tagName 规则

`tagName` 由 Manifest 显式声明，不从 `type` 自动推导。根入口公开 `validateBaseScreenMaterialIdentity(type: unknown, tagName: unknown)`；该函数只验证单个绑定，跨 Manifest 的 type/tagName/constructor 冲突由 Plugin Manager 在构造 snapshot 时检测。

`tagName` 必须：

- 是 ASCII、全小写，长度为 `2..63` code units，并符合 autonomous custom element name 语法：以 `[a-z]` 开头、至少包含一个连字符、其余字符仅允许 `[a-z0-9._-]`。
- 不以 `xml` 开头，不使用平台保留名 `annotation-xml`、`color-profile`、`font-face`、`font-face-src`、`font-face-uri`、`font-face-format`、`font-face-name` 或 `missing-glyph`。
- 不读取 locale、环境、DOM 或全局 registry；失败返回结构化诊断，不 trim、改写大小写或自动修复输入。

相同 type 在同一 Material Catalog snapshot 中只能绑定一个 tagName，相同 tagName 也只能绑定一个 type；冲突 fail closed，不做覆盖或 fallback。

## 9. Material Manifest

根入口必须公开 Manifest readonly 类型和以下签名：

```ts
export function parseBaseScreenMaterialManifest(
  input: unknown,
): ScreenParseResult<BaseScreenMaterialManifest>;
```

Manifest 是 strict、可序列化的纯数据对象，包含且仅包含：

- `type`、`tagName`。
- `name`、`category`、`keywords`。
- `defaultSize`、`defaultProps`、`defaultStyle`。
- 声明式 props schema 与属性面板字段。
- 标准事件 allowlist。
- 可接受的数据能力。
- 设计能力：resize、rotate、children 等明确布尔声明。

Manifest 不得包含：

- render function、validator function 或任意 callback。
- React/Vue component、VNode 或框架 Context。
- constructor、DOM node、Store、Router、服务实例或凭证。
- 远程模块地址、可执行脚本、Header、Token 或 Cookie。

props schema 使用 package 自有的有限 JSON 声明式判别联合，只允许 `string`、`number`、`boolean`、`enum`、`object`、`array` 七种 kind；object 通过 `properties` 与 `required` 描述，array 必须有 `items`，各 kind 仅允许对应约束字段。属性面板字段仅引用顶层 props schema 中已声明的 prop key，并描述 label、control 与只读展示元数据，不得另带 validator、default 或第二份约束。完整字段级结构由本 Spec 的公共 readonly 类型直接表达，不生成或公开通用 JSON Schema，也不得泄漏 Zod。

`defaultProps` 必须逐字段满足 props schema，属性面板引用、事件名和 keywords 不得重复。

解析成功必须返回 detached Manifest，不修改输入；失败不得返回部分 Manifest。

## 10. Element Model 与数据状态

根入口必须公开封闭类型 `BaseScreenMaterialModel`，包含且仅包含 `componentId: string`、`mode: 'design' | 'preview' | 'viewer'`、`interactive: boolean`、`props: ScreenJsonObject`、`style: ScreenJsonObject`、`size: { width: number; height: number }` 和 `dataState: BaseScreenMaterialDataState`；所有字段必填且 readonly。

`BaseScreenMaterialDataState` 是封闭判别联合：`{ status: 'idle' }`、`{ status: 'loading' }`、`{ status: 'ready'; value: ScreenJsonValue }`、`{ status: 'error'; code: string; message: string }`。各分支拒绝额外字段；code 为 `1..128` ASCII code units，message 为 `1..1024` Unicode code points。`ready.value` 与安全化 error 必须遵守 Contracts JSON boundary；不得包含 Error 实例、Promise、AbortSignal、Response、DOM node 或凭证。

Model 约束：

- Renderer 通过 JavaScript property 原子写入完整 model，不通过 attribute 传递复杂值。
- 物料把 model 视为只读，不得修改其字段或写入 Engine Store。
- 普通 model 更新必须允许上层复用同一元素实例。
- Plugin Core 不承诺 model 经 `Object.freeze()`；readonly 是公共契约，detached/freeze 策略由上层运行时规格定义。

## 11. Custom Element 结构 ABI

根入口必须公开 Material Element 与 Constructor 的结构契约：

- Element 暴露可写入、读取时为 readonly 的完整 `model` property。
- Constructor 暴露 readonly static `manifest`。
- 不要求继承 Base Screen 私有基类。
- 不暴露框架 renderer、框架 component 或宿主 Context。

`BaseScreenMaterialElement` 直接扩展 `HTMLElement`，`BaseScreenMaterialConstructor` 直接扩展 `CustomElementConstructor`。Plugin Core 只导出结构类型与校验函数，不调用 `customElements.define/get`；物料包的显式 `define()` 与 `/auto-register` 拥有浏览器注册，Plugin Manager 只预检已注册 constructor 并构造实例级 snapshot。

## 12. 标准物料事件

标准事件名由 `BASE_SCREEN_MATERIAL_EVENT = 'base-screen-material-event'` 固定表示。`BaseScreenMaterialEventDetail` 是 strict readonly object，只允许 `name: string` 与 `payload: ScreenJsonValue` 两个 own field；额外字段返回 `PLUGIN_CORE_EVENT_INVALID`。`name` 必须存在于 Manifest allowlist，payload 必须符合 Contracts JSON boundary。

协议要求上层 Renderer：

- 仅接受 `bubbles: true` 且 `composed: true` 的标准事件。
- 根据已启用 Manifest 校验事件名。
- 对 payload 执行 JSON 校验、独立资源限制和 detached clone。
- 从自身可信渲染上下文取得 `componentId`、type 与 interactive 状态。
- `interactive === false` 时禁止事件进入 DSL/runtime。

事件 detail 不得成为 componentId、material type、权限或交互状态的可信来源。

## 13. 只读 Material Catalog

根入口必须公开实例级 `BaseScreenMaterialCatalog`，其封闭接口仅包含 `get(type): BaseScreenMaterialCatalogEntry | undefined`、`has(type): boolean` 与 `list(): readonly BaseScreenMaterialCatalogEntry[]`。`BaseScreenMaterialCatalogEntry` 只包含 readonly `manifest` 与 `constructor`。Catalog 不得公开 `register`、`delete`、`enable`、`disable` 或可变 collection。

语义要求：

- Catalog 不等同于全局 `CustomElementRegistry`，不得通过枚举 global 自动构造。
- 未启用或不存在的 type 返回 `undefined`，不得隐式 fallback 到同名或其他 major。
- 两个 Base Screen 实例可以消费不同 Catalog，互不污染。
- `list()` 按 entry Manifest 的 `type` 使用 UTF-16 code unit 升序返回；不得依赖注册顺序、object insertion order 或 locale。同一 snapshot 重复读取必须深相等。

## 14. Plugin Manifest

根入口必须公开 Plugin Manifest readonly 类型和 `parseBaseScreenPluginManifest(input: unknown): ScreenParseResult<BaseScreenPluginManifest>`。Manifest 是 strict 纯数据对象，包含且仅包含：

- 稳定 plugin id 和严格 SemVer core version。
- 显式依赖列表；每项包含 plugin id 与首期 range `^major.minor.patch`。
- 请求的 capability 列表。
- contribution 列表。

首期 contribution 使用有限 discriminated union，精确允许：

- `material`：声明已显式注册的 material `type` 与 `tagName`。
- `command`：声明 command contribution id、展示元数据和所需 capability；handler 不进入 Manifest，由宿主显式导入的运行对象提供。
- `dataResourceType`：只声明资源类型 id、展示元数据和配置 schema，不包含 endpoint、Header 或凭证。
- `blueprintCapability`：只声明宿主白名单中的 trigger/action capability id，不携带执行函数。

Plugin Core parser 只验证单份 Manifest 的 strict shape、版本/range、自重复和引用一致性。依赖缺失、依赖版本不兼容、依赖环，以及不同插件间 type/tagName/contribution 冲突只能在候选集合解析后确定，归 Plugin Manager resolver 负责；resolver 必须复用 §18 的 code 和确定性排序。

Manifest 不得包含 activate function、handler、constructor、render function、宿主实例、远程代码地址或凭证。Manifest parser 必须拒绝未知 contribution kind、重复 dependency、重复 capability 和重复 contribution identity，并返回确定性诊断。

## 15. 插件生命周期协议

根入口必须公开由插件运行时代码实现、由宿主显式导入并由 Plugin Manager 调用的运行对象协议；`BaseScreenPluginActivationContext` 由 Plugin Manager 根据授权结果构造：

```ts
export interface BaseScreenPluginRuntime {
  readonly manifest: BaseScreenPluginManifest;
  activate(context: BaseScreenPluginActivationContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
```

运行对象与纯数据 Manifest 分离；runtime 的 `manifest` 必须与已解析 Manifest 为同一内容，activate 不能在运行时追加 Manifest 未声明的 contribution。

生命周期状态固定为 `inactive | activating | active | deactivating | failed | disposing | disposed`：

- Plugin Core 只定义协议，不执行生命周期；Plugin Manager 拥有状态机、调用与错误归一化。
- `activate` 仅可从 `inactive` 调用；并发/重复 activate fail closed。activate 失败时撤销本次获得的 session/端口并回到 `inactive`，不得发布部分 snapshot。
- `deactivate` 仅可从 `active` 调用；成功后回到 `inactive`。失败仍必须使本次 activation session 的端口失效并进入 `failed`；`failed` 不发布贡献且只能进入 `disposing`。
- `dispose` 可从 `inactive`、`active` 或 `failed` 调用；从 `active` 调用时先使端口失效并尝试 deactivate，再进入 `disposing`。释放成功或失败后均永久进入 `disposed`；Plugin Manager 归一化并记录最小化 diagnostics，后续 dispose 幂等成功，其他生命周期调用 fail closed。
- context 仅包含该实例 id、plugin id、已授予 capability 的 readonly 列表与限权端口；不包含 Core Command Bus、Store、Router、DOM root、Token、Cookie 或任意宿主 service locator。
- 端口绑定单次 activation session；deactivate 开始、activate 回滚或 dispose 开始时立即失效，之后所有调用返回稳定失败 result。
- 首期信任模型是宿主显式导入的同 realm 受信代码，不宣称隔离恶意插件。

## 16. Plugin Command Port

根入口必须公开仅由 Engine Adapter 实现的异步限权端口：

```ts
export interface PluginCommandPort {
  execute(request: PluginCommandRequest): Promise<ScreenParseResult<ScreenJsonValue>>;
}

export interface PluginCommandRequest {
  readonly commandId: string;
  readonly args: ScreenJsonValue;
}
```

session 与 plugin identity 由宿主闭包绑定，不接受插件可伪造的 request 字段。成功返回 detached JSON value 且 diagnostics 为空，失败返回统一 diagnostics。

必须满足：

- 插件不能取得或转发 Core Command Bus。
- 未授权 command id、失效 session、非 JSON args 或超限输入 fail closed。
- 首期只能编排已注册的 Core command，不允许插件定义新的文档 mutation 类型。
- 授权依据来自 Plugin Manager 已批准 capability 与 Engine 白名单，不能由插件 Manifest 自行授予。
- 返回值和 diagnostics 不包含宿主 secret、完整文档或内部 stack。
- 取消、超时和宿主副作用只有在后续 Engine/Host Resource Spec 冻结后才能增加，不得用可选 `unknown` 提前占位。

## 17. Plugin Catalog

根入口必须公开实例级 `BaseScreenPluginCatalog`，其封闭接口仅包含 `get(pluginId): BaseScreenPluginCatalogEntry | undefined`、`has(pluginId): boolean` 与 `list(): readonly BaseScreenPluginCatalogEntry[]`。Entry 只包含 readonly `manifest`、`grantedCapabilities` 和 `contributions`，后两项均为 Manifest 对应声明的 detached readonly 子集。

Catalog 不暴露生命周期对象、context、command adapter 或可变 Registry。未启用插件不进入 snapshot。`get()` 对缺失项返回 `undefined`；`list()` 按 plugin id 使用 UTF-16 code unit 升序返回，且同一 snapshot 重复读取深相等。

## 18. Diagnostics Contract

Plugin Core 必须复用 Contracts 所有的诊断 envelope、path、排序、上限和数据最小化规则，不定义第二套跨包结果结构。

本 Spec 生效前，Contracts 的 `ScreenDiagnosticCode` 必须通过显式 union 扩展拥有以下稳定 code；Plugin Core 不定义第二个 diagnostic type：

- `PLUGIN_CORE_MANIFEST_NOT_OBJECT`、`PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD`、`PLUGIN_CORE_MANIFEST_FIELD_INVALID`、`PLUGIN_CORE_LIMIT_EXCEEDED`。
- `PLUGIN_CORE_API_VERSION_UNSUPPORTED`、`PLUGIN_CORE_IDENTITY_INVALID`、`PLUGIN_CORE_TAG_NAME_INVALID`、`PLUGIN_CORE_IDENTITY_CONFLICT`。
- `PLUGIN_CORE_DEPENDENCY_MISSING`、`PLUGIN_CORE_DEPENDENCY_VERSION_INCOMPATIBLE`、`PLUGIN_CORE_DEPENDENCY_CYCLE`。
- `PLUGIN_CORE_CAPABILITY_UNDECLARED`、`PLUGIN_CORE_CAPABILITY_UNAUTHORIZED`、`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`。
- `PLUGIN_CORE_CONTRIBUTION_DUPLICATE`、`PLUGIN_CORE_CONTRIBUTION_UNKNOWN`、`PLUGIN_CORE_CONTRIBUTION_CONFLICT`。
- `PLUGIN_CORE_EVENT_INVALID`、`PLUGIN_CORE_EVENT_PAYLOAD_INVALID`。
- `PLUGIN_CORE_COMMAND_UNAUTHORIZED`、`PLUGIN_CORE_COMMAND_ARGUMENT_INVALID`、`PLUGIN_CORE_COMMAND_RESULT_INVALID`、`PLUGIN_CORE_SESSION_INVALID`、`PLUGIN_CORE_LIFECYCLE_INVALID`。

约束：

- parser 对普通无效输入返回失败 result，不抛异常。
- path 从传入 Manifest 或 command request root 开始。
- diagnostics 确定性排序，消费者只依赖 code 与 path。
- message 不回显完整 props、style、payload、args、Manifest、Document、凭证或 stack trace。

## 19. JSON 边界与资源限制

Manifest 默认值、schema 数据、事件 payload、command args/result 和 lifecycle 安全数据必须复用 Contracts 的 JSON parser，不复制或放宽其 prototype、cycle、危险键、descriptor 与 Unicode 规则。

首版固定独立上限如下；字段专用上限优先于 Contracts 通用 JSON 上限：

| 限制 | 值 |
| --- | --- |
| 单个 Material Manifest canonical UTF-8 bytes | 256 KiB |
| 单个 Plugin Manifest canonical UTF-8 bytes | 128 KiB |
| 单个 event payload canonical UTF-8 bytes | 64 KiB |
| 单个 command args / result canonical UTF-8 bytes | 各 256 KiB |
| 单个 Material Model canonical UTF-8 bytes | 2 MiB |
| 单个 activation context JSON metadata | 64 KiB |
| 单个 Material/Plugin Catalog entry JSON 数据 | 各 256 KiB |
| props schema / contribution container depth | 16 |
| keywords / events | 各 64 条 |
| dependencies / capabilities / contributions | 各 128 条 |
| props schema properties 总数 / 属性面板字段 | 各 512 条 |
| plugin id / capability id / contribution id / command id / event name | `1..128` ASCII code units |
| material name / plugin name / category / label | `1..256` Unicode code points |
| keyword | `1..64` Unicode code points |

canonical byte、depth、container 和 string 的计算语义完全复用 Contracts。Material Model 上限由 Renderer 在写入 Element 前执行，activation context 与 Catalog entry 上限由 Plugin Manager 在构造 snapshot/session 前执行；Plugin Core 提供共享 conformance contract，不执行消费者运行时。所有上限必须在无界 clone 前检查；失败返回 `PLUGIN_CORE_LIMIT_EXCEEDED`，path 指向首次确定超限的容器或字段，不返回部分结果。

## 20. 确定性与不可变性

所有 parser、identity helper 和只读协议必须满足：

- 相同输入产生深相等结果和相同 diagnostics 顺序。
- 不修改输入，不返回输入 object/array reference。
- 不读取时间、随机数、locale、环境变量或全局 registry。
- 不通过 JSON stringify/parse 掩盖非法 JavaScript 输入。
- 不以 object key insertion order 决定身份、诊断或目录语义。

## 21. ADDED Requirements

### R1：纯协议包边界

系统 SHALL 在无 DOM 的 Node 运行时安全导入默认入口，且不注册元素、不执行插件、不创建全局目录。

#### Scenario：Node ESM 导入

- **GIVEN** 仅安装 Contracts 与 Plugin Core 的空白 consumer
- **WHEN** 导入 `@base-screen/plugin-core`
- **THEN** 类型检查与运行成功
- **AND** 不访问 window、document 或 customElements
- **AND** 不产生 global mutation 或 I/O

### R2：稳定物料身份

系统 SHALL 确定性验证 type 与 tagName 的绑定。

#### Scenario：重复解析同一身份

- **WHEN** 重复解析同一合法 Material Manifest
- **THEN** 返回深相等的 detached Manifest
- **AND** type 与 tagName 绑定一致
- **AND** 不查询全局 Custom Element registry

### R3：Manifest 纯数据

系统 SHALL 拒绝包含函数、框架组件、类实例、危险键或未知字段的 Manifest。

#### Scenario：Manifest 包含 render function

- **WHEN** 解析该 Manifest
- **THEN** 返回失败 result 与稳定 code/path
- **AND** 不执行该函数
- **AND** 不返回部分 Manifest

### R4：统一 Element Model

系统 SHALL 以完整 readonly model property 作为 Renderer 到物料的更新边界。

#### Scenario：更新物料数据

- **GIVEN** 已存在的 Material Element
- **WHEN** Renderer 写入新的完整 model
- **THEN** Element 可读取新的 mode、props、style、size 与 dataState
- **AND** 协议不要求重建 Element
- **AND** 不通过 attribute 序列化复杂对象

### R5：标准事件 fail closed

系统 SHALL 只接受 Manifest allowlist 中且 payload 合法的标准物料事件。

#### Scenario：物料派发未声明事件

- **WHEN** Renderer 收到标准事件但 name 不在 allowlist
- **THEN** 事件不进入 DSL/runtime
- **AND** 返回或记录结构化诊断
- **AND** 不信任 detail 中伪造的 componentId 或权限信息

### R6：只读实例目录

系统 SHALL 允许不同实例消费不同的 Material Catalog snapshot，且消费者不能通过接口修改目录。

#### Scenario：双实例查询同一 type

- **GIVEN** 实例 A 已启用该物料而实例 B 未启用
- **WHEN** 两实例分别查询 type
- **THEN** A 得到 entry
- **AND** B 得到 undefined
- **AND** 两者不因全局注册状态互相污染

### R7：Plugin Manifest 严格解析

系统 SHALL 拒绝未知贡献类型、重复身份和不合法依赖声明。

#### Scenario：插件重复声明同一 material contribution

- **WHEN** 解析 Plugin Manifest
- **THEN** 返回失败 result
- **AND** diagnostic path 指向重复 contribution
- **AND** 不发布部分 Plugin 描述

### R8：生命周期限权

系统 SHALL 定义最小 activation context 与生命周期 conformance，使 Plugin Manager 只能构造已授权端口；实际状态机调用、回滚和 snapshot 发布由 Plugin Manager Spec 验收。

#### Scenario：插件请求未授权能力

- **GIVEN** capability 未获宿主批准
- **WHEN** Plugin Manager 构造 activation context
- **THEN** context 不包含对应端口
- **AND** 插件不能取得 Command Bus、Store 或宿主 service locator

### R9：命令端口白名单

系统 SHALL 定义白名单 command port conformance，使 adapter 对未授权 command 返回失败且不得委派；实际 Core command 调度由 Engine/Plugin Manager Spec 验收。

#### Scenario：调用未授权 command id

- **WHEN** 插件调用 Plugin Command Port
- **THEN** 返回失败 result 与未授权诊断
- **AND** Core command 不执行
- **AND** args 不出现在 diagnostic message

### R10：JSON 与资源边界

系统 SHALL 在 Manifest、事件和命令跨边界前执行统一 JSON 校验与独立资源限制。

#### Scenario：事件 payload 包含循环引用

- **WHEN** 校验标准物料事件
- **THEN** 返回 JSON cycle 诊断
- **AND** 不进入运行时
- **AND** 不修改原 payload

### R11：统一诊断

系统 SHALL 复用 Contracts 的诊断 envelope 并保持确定性、最小披露。

#### Scenario：重复解析同一非法 Manifest

- **WHEN** 连续解析两次
- **THEN** code、path 与顺序深相等
- **AND** message 不包含 canary secret 或完整输入

### R12：框架中立声明

系统 SHALL 使公共声明不依赖 React、Vue 或具体 Plugin Manager/Renderer 实现。

#### Scenario：检查发布声明

- **WHEN** 检查 tarball 中的 `.d.ts`
- **THEN** 不出现 React、Vue、Zod、Manager、Renderer 或 Engine 私有类型
- **AND** Vanilla consumer 无需安装框架依赖

### R13：只读 Plugin Catalog

系统 SHALL 仅通过实例级 readonly Plugin Catalog 暴露已启用插件的安全、确定性 snapshot。

#### Scenario：列出已启用插件

- **GIVEN** 候选集合包含已启用和未启用插件
- **WHEN** 调用 Plugin Catalog `list()`
- **THEN** 仅返回已启用插件并按 plugin id UTF-16 升序排列
- **AND** entry 不包含 runtime、activation context、command adapter 或 mutation API

## 22. MODIFIED Requirements

无。现有包尚未发布业务协议。

## 23. REMOVED Requirements

无。

## 24. Test Matrix

至少覆盖：

| 领域 | 必测行为 |
| --- | --- |
| Package | Node ESM import、唯一 workspace dependency、默认无副作用、真实 tarball consumer |
| Identity | type/tagName 合法与非法边界、碰撞、确定性、ABI/version 不兼容 |
| Material Manifest | strict shape、纯数据、重复字段语义、JSON/资源边界、detached output |
| Model | dataState 判别、readonly JSON 数据、非 JSON error/data 拒绝 |
| Event | allowlist、bubbles/composed、payload clone/limit、伪造可信字段不生效 |
| Material Catalog | get/has/list、UTF-16 排序、缺失 fail closed、双向冲突、只读接口、双实例隔离 |
| Plugin Manifest | 单份 shape/range/引用/重复检测、四类 contribution 判别、Manager 集合依赖与冲突 conformance |
| Lifecycle | context 最小权限、非法/并发 transition、activate 回滚、deactivate 失败、重复 dispose、session 失效 |
| Command Port | command allowlist、args/result JSON、失效 session、诊断最小披露 |
| Plugin Catalog | 只包含已启用 snapshot、不泄漏生命周期和 adapter |
| Determinism | 重复解析、诊断顺序、不修改输入、不读取全局状态 |
| Declaration | 无框架/Zod/实现包泄漏，DOM 类型与 §7、§11 的直接 `lib.dom` 决策一致 |

测试只保护自定义校验、判别联合、安全边界、状态语义和协议行为；不为纯字段映射或框架内置校验单独编写测试。

## 25. Implementation Shape

实现应按责任分离 Material 类型与校验、identity、event、catalog、Plugin 类型与校验、lifecycle、command port 和 diagnostics。`index.ts` 只导出本 Spec 已验收 API。

协议/声明文件以 400 行为 review threshold，超过 600 行必须按 contract 或版本拆分；纯逻辑模块目标不超过 300 行，超过 500 行必须按职责拆分。不得创建仅转发行为的空文件或尚未授权的 API facade。

## 26. 实施顺序

1. 评审并接受本 Spec 已冻结的 DOM/ABI、身份、Manifest、生命周期、贡献点、命令和资源限制决策；如评审要求另立 ADR，先建立 ADR 并同步本 Spec。
2. 确认 Contracts 发布包、JSON parser 和 `PLUGIN_CORE_*` diagnostic code 前置条件。
3. 实现物料 identity、Manifest parser、Model、Element ABI 与标准事件类型。
4. 实现只读 Material Catalog 协议。
5. 实现 Plugin Manifest、能力、贡献和生命周期协议。
6. 实现 Plugin Command Port 与只读 Plugin Catalog 协议。
7. 收敛根 exports、声明与 package dependency。
8. 完成单元、契约、浏览器结构、双实例与 tarball consumer 验收。
9. 运行 format、lint、typecheck、test、build、边界、API 与发布包门禁。

每个 export 进入根入口时必须同时具备对应 Requirement 测试，不允许先发布占位 API。

## 27. 完成定义

Plugin Core Contract 仅在以下条件全部满足后完成：

- 本 Spec 已生效，Contracts 前置与 `PLUGIN_CORE_*` code 已就绪，且不存在未记录偏离。
- DOM/ABI、身份、Manifest、生命周期、贡献点、命令、目录顺序和资源上限均为明确、可测试规则。
- 公共物料与插件协议均已实现，默认入口无注册和执行副作用。
- package 只依赖真实使用的 `@base-screen/contracts`，不依赖框架或上层实现包。
- Manifest、事件、command 和目录边界 fail closed、deterministic 且不泄漏敏感数据。
- Material Catalog 与 Plugin Catalog 是实例级只读 snapshot，可验证双实例隔离。
- 生命周期 context 和 Plugin Command Port 不暴露 Core Command Bus 或宿主 service locator。
- public declaration、API report、publint、ATTW、浏览器结构测试和真实 tarball consumer 全部通过。
- 每个 Requirement 均有自动化测试映射，且总仓库既有门禁无回归。

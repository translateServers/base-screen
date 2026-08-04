# Plugin Manager Runtime Spec

> 状态：生效中
> 最近更新：2026-08-03
> 定位：冻结 `@base-screen/plugin-manager` 在 P2 的候选预检、依赖解析、能力授权、插件生命周期和实例级只读目录事务
> 依据：[ADR-0001](../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)（已接受）、[ADR-0002](../../decisions/ADR-0002-canonical-screen-document.md)（已接受）、[Plugin Core Contract Spec](../plugin-core-contract/spec.md)（设计中）、[包开发与文档优先级](../../architecture/package-development-order.md)（生效中）

## 1. 生效条件

本 Spec 是 P2 Plugin Manager 的实施依据。P2 严格位于 P1 Plugin Core 契约完成之后；Plugin Manager 与同属 P2 的 Plugin SDK 可以并行，但二者不得互相依赖。以下前置条件已完成，后续边界调整必须先同步上游契约与本 Spec：

- [Plugin Core Contract Spec](../plugin-core-contract/spec.md) 已完成评审并转为“生效中”。
- `@base-screen/plugin-core` 已发布本 Spec 使用的 Material/Plugin Manifest parser、Material/Plugin Catalog、runtime、activation context、command port、lifecycle 和 diagnostics 公共契约。
- `@base-screen/contracts` 已发布 Plugin Core §18 所列全部 `PLUGIN_CORE_*` diagnostic code、统一结果 envelope、JSON boundary、path 与排序规则。
- Plugin Core 与 Contracts 的公共声明和真实 tarball 已通过各自完成定义，不存在 Manager 需要 deep import 私有 helper 才能实现的缺口。
- 本 Spec 完成评审，每项 Requirement 均可映射到自动化测试。

若上游实现时改变导出名称或精确字段，本 Spec 必须先按上游已生效契约同步；Manager 不得复制、放宽或替换上游 parser、类型、资源限制和诊断语义。

以下内容当前均以 Plugin Core 与 Contracts 的最终公共契约为上游冻结点：capability 的声明字段及端口映射、Material constructor 的结构 ABI 与 static Manifest 读取规则、runtime session/context/lifecycle 形状、dispose 适用对象与重复调用结果、Catalog 的 `get/has/list` 签名、diagnostic path 段与排序规则。任一冻结点仍待定时，本 Spec 保持“设计中”，对应 Task 2-11 全部为生效前阻塞项；不得据此猜测 API、编写兼容分支、发布占位 export 或修改 Manager 代码。三份文档中的示例名称只用于表达候选设计，不构成对未冻结上游的替代定义。

## 2. P2 顺序与交付边界

P2 的执行顺序固定为：

1. 完成 P1 Plugin Core 的实现、契约测试和发布包验收。
2. 冻结并生效本 Plugin Manager Runtime Spec。
3. Plugin Manager 与 Plugin SDK 分支并行实施，均只依赖 Contracts 与 Plugin Core。
4. 先完成候选预检和纯依赖解析，再实现生命周期事务。
5. 生命周期事务稳定后才发布 Material Catalog 与 Plugin Catalog snapshot。
6. 最后完成浏览器注册预检、双实例、失败回滚、tarball 和总仓库门禁。
7. P2 退出后，P3 才可使用 Manager 与 SDK 开始原生物料和框架 spike。

P2 退出条件保持仓库既有定义：

- 全局 Custom Element 定义与实例启用明确分离。
- 同一 tagName 对同一 constructor 的既有定义可重复预检；同一 tagName 对不同 constructor 必须 fail closed。
- 任一 Manager 阶段失败均不得返回或发布部分实例目录。

## 3. 目标

本阶段建立由宿主显式装配、以 Base Screen 实例为隔离单位的插件运行时。完成后必须具备：

- 对宿主显式提供的 standalone material tagName 和 plugin runtime 做完整候选预检。
- 复用 Plugin Core parser 校验 constructor static Manifest 与 runtime Manifest。
- 检测跨候选 plugin id、material type、tagName 和四类 contribution identity 冲突。
- 检测缺失依赖、`^major.minor.patch` 不兼容和依赖环，并生成确定性启用顺序。
- 将插件请求 capability 与宿主批准集合求交，拒绝未声明、未授权或不兼容能力。
- 按 Plugin Core 固定状态机执行 activate、deactivate、dispose，并约束 session 端口失效时机。
- 以一次性提交方式发布实例级不可变 Material Catalog 与 Plugin Catalog snapshot。
- 支持同一页面多个 Manager 实例使用不同候选、授权和目录，互不污染。
- 对普通无效候选和生命周期失败返回统一、最小披露、确定性的 diagnostics。

## 4. 非目标

本阶段不包含：

- 调用 `customElements.define()`、覆盖、删除或枚举全局 Custom Element registry。
- Plugin SDK 的 `createMaterialDefinition()`、`definePlugin()`、`define()` 或 `/auto-register`。
- 从 URL、Document、npm 名称、市场、网络或文件系统发现、下载或动态导入代码。
- 执行远程代码、iframe/Worker 沙箱、恶意插件隔离、代码签名或升级回滚。
- Renderer 的 DOM 创建、model 更新、事件转发、props/style/data capability 校验。
- Core Command Bus、Store、Router、History、Host Adapter 或 Engine command adapter 的实现。
- 允许插件定义新的 Document mutation、任意 UI renderer、工具、面板、主题或 import/export contribution。
- 运行时增删插件后原地修改既有 snapshot；首期变更候选集合必须创建新的 Manager 会话。
- 全局插件单例、全局可变 registry、service locator 或基于环境变量的隐式授权。

不得使用 `unknown` 扩展槽、可选回调袋、私有 deep import 或空 facade 提前保留上述能力。

## 5. Package 边界

`@base-screen/plugin-manager` 必须满足：

- 仅允许依赖源码真实使用的 `@base-screen/contracts` 与 `@base-screen/plugin-core`。
- 不依赖 Core、Renderer、Engine、Plugin SDK、Material、SDK、Testing、React、React DOM 或 Vue。
- 默认根入口不读取 `window`、`document`、全局 `customElements`、时间、随机数、环境变量、网络或文件系统。
- 默认根入口不注册元素、不激活插件、不创建 Manager、不维护全局目录、不修改 global。
- 浏览器 registry 必须由宿主在创建会话时显式提供最小只读查询端口；导入包本身仍可在无 DOM 的 Node ESM 环境安全执行。
- package 保持 ESM-only、`sideEffects: false`；公共声明不得泄漏 Zod、框架、Core、Engine 或宿主 DTO 类型。
- Manager 实现不得 deep import Contracts 或 Plugin Core 源码；只能消费其公开根入口。
- `@base-screen/testing` 只从外部消费 Manager 公共 API，生产包不得反向依赖测试包。
- Manager may derive an immutable, per-instance runtime contribution index only from its active Plugin Catalog snapshot. The index contains data-resource configuration validators and host-supported, granted Blueprint capability ids; it contains no handler, resolver, URL, credential, host object, or session port. Deactivation and disposal revoke its status as current runtime authority.

## 6. 输入与公开运行时形状

### 6.1 显式候选

一次 Manager 会话的候选输入只允许由宿主显式提供：

- 唯一 `instanceId`。
- standalone material 的 readonly tagName 列表。
- 宿主已经静态或显式导入的 readonly `BaseScreenPluginRuntime` 列表。
- 每个 plugin id 的宿主批准 capability 集合。
- 构造 Plugin Core activation context 所需的显式限权端口工厂；每个工厂只能创建其声明的具体端口，不得是通用 service locator。
- 一个只读 Custom Element 查询端口，语义等价于按 tagName 调用 `CustomElementRegistry.get()`。

输入对象和列表不得在会话存续期间被 Manager 修改。Manager 必须在执行任何 plugin lifecycle 前完成候选解析并形成 detached 内部计划。候选中不得出现模块 URL、动态 import function、凭证、DOM root、Store、Router 或 Command Bus。Manager 只读取 options、runtime 和 constructor 上由上游 ABI 明确要求的 own data property；不得通过对象展开、枚举或通用深拷贝意外执行 getter。必需字段若是 accessor、Proxy trap 抛错或读取结果不满足上游契约，必须在任何 registry 查询、端口创建或 hook 调用前 fail closed；constructor 的 static Manifest 究竟要求 own data property 还是允许上游指定读取协议，属于 §1 的生效前冻结点。

### 6.2 最小公共操作

根入口必须公开以下 Manager 自有名称，并直接引用 Plugin Core 最终发布的 Catalog、runtime、context 与 constructor 类型：

```ts
export type BaseScreenPluginManagerStatus =
  | 'inactive'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'failed'
  | 'disposing'
  | 'disposed';

export interface BaseScreenPluginManagerSnapshot {
  readonly materials: BaseScreenMaterialCatalog;
  readonly plugins: BaseScreenPluginCatalog;
}

export interface BaseScreenPluginManager {
  readonly status: BaseScreenPluginManagerStatus;
  readonly snapshot: BaseScreenPluginManagerSnapshot | undefined;
  activate(): Promise<ScreenParseResult<BaseScreenPluginManagerSnapshot>>;
  deactivate(): Promise<ScreenParseResult<null>>;
  dispose(): Promise<ScreenParseResult<null>>;
}

export function createBaseScreenPluginManager(
  options: BaseScreenPluginManagerOptions,
): BaseScreenPluginManager;
```

`BaseScreenPluginManagerOptions` 必须按 §6.1 直接表达 readonly `instanceId`、standalone material tagName、`BaseScreenPluginRuntime`、host-approved capability、具体限权端口工厂和只读 registry 查询端口，不增加通用 `services`、`metadata` 或 `unknown` 扩展字段。

`createBaseScreenPluginManager()` 只创建 `inactive` Manager 会话，不执行预检、registry 查询、端口工厂或 plugin lifecycle；必要顶层字段的安全读取与结构校验归首次 `activate()`。`activate()` 执行完整预检、resolve 和启用事务；`deactivate()` 按逆启用顺序停止当前 active 插件；`dispose()` 永久释放 Manager 会话，并只调用 Plugin Core 最终 lifecycle 契约明确拥有的 runtime dispose hook，不处置 constructor、Catalog entry 或宿主端口工厂。所有异步操作使用 Contracts 的 `ScreenParseResult`，普通候选和状态错误不抛 validation exception。公共 API 不开放 register、unregister、replace、enableOne、disableOne 或可变 collection，也不发布同义 alias。

## 7. Manager 会话状态

Manager 会话状态固定为：

```text
inactive -> activating -> active -> deactivating -> inactive
    |           |          |            |
    +-----------+----------+------------+-> disposing -> disposed
                         lifecycle failure -> failed -> disposing -> disposed
```

约束：

- `activate` 仅可从 `inactive` 调用；并发或重复调用返回 `PLUGIN_CORE_LIFECYCLE_INVALID`。
- `activate` 成功后状态为 `active`，且两个 snapshot 同时可见。
- `activate` 失败必须回滚本次已激活插件、撤销全部 session 端口并回到 `inactive`；若回滚生命周期本身失败，则进入仅允许 dispose 的 `failed`。
- `deactivate` 仅可从 `active` 调用；开始时先撤销已发布 snapshot 并使全部 activation session 端口失效，再按逆启用顺序调用 plugin `deactivate()`。
- 任一 `deactivate()` 失败后继续 best-effort 处理剩余插件，最终进入 `failed`，不能恢复或重新发布旧 snapshot。
- `dispose` 请求可从任何非 `disposed` 稳定状态发起；若有 lifecycle 操作正在执行，则按 §17 的单一队列排在其后，并依据轮到执行时的状态决定流程。active 时先完整执行 deactivate 语义；随后只对本 Manager 曾为其启动 activation 尝试、且上游契约标记为尚需释放的 runtime，按实际成功 activate 顺序的逆序调用至多一次 `dispose()`；从未进入 lifecycle 的预检失败候选不调用 hook。
- 首次 dispose 请求与其并发重复请求共享同一 in-flight Promise/result，不重复 hook；首次流程结束后永久进入 `disposed`。此后再次调用 `dispose()` 返回成功 `ScreenParseResult<null>`，不追加 diagnostic；其他 lifecycle 调用返回 `PLUGIN_CORE_LIFECYCLE_INVALID`。即使 plugin hook 抛错，也必须使所有端口永久失效且不得保留 snapshot。
- 生命周期 hook 的同步 throw 与 rejected Promise 使用同一归一化路径；diagnostic 不包含原始 stack、完整 error object 或敏感 message。

## 8. 预检流水线

一次 `activate` 必须按以下阶段执行，前一阶段存在 error 时不得进入后一阶段：

1. **输入快照**：复制并检查 instance id、tagName 列表、runtime 列表、授权和端口工厂的顶层结构。
2. **单份解析**：分别调用 Plugin Core Material/Plugin Manifest parser；Manager 不复制字段级 schema。
3. **runtime 一致性**：runtime 的 `manifest` 必须与 parser 成功得到的 detached Manifest 内容深相等，不能在 activate 时追加 contribution。
4. **集合 identity**：检测重复 plugin id、material type、tagName 和 contribution identity。
5. **依赖解析**：检测依赖缺失、SemVer range 不兼容与依赖环，生成确定性拓扑顺序。
6. **能力授权**：验证 requested、declared、host-approved capability 关系，并形成每个插件的最终 granted capability snapshot。
7. **Custom Element 预检**：按候选 tagName 查询显式 registry 端口并核对 constructor、static Manifest、type 与 tagName。
8. **计划冻结**：形成仅供本次事务使用的 detached enable plan；此时仍不发布 Catalog。
9. **生命周期执行**：按确定性拓扑顺序逐个 activate。
10. **原子提交**：全部 activate 成功后，一次性发布两个 readonly Catalog snapshot。

预检失败不得调用任何 plugin hook，不得创建可调用 session 端口，不得返回部分 plan 或部分 Catalog。

## 9. 依赖与确定性启用顺序

- Plugin Core parser 负责单份 Manifest 内 dependency shape、range 语法和自重复；Manager 只负责候选集合语义。
- plugin id 必须唯一；同 id 即使 Manifest 深相等也作为候选冲突拒绝，不做覆盖或隐式去重。
- 每条依赖必须在候选 plugin 集合中存在，并满足声明的 `^major.minor.patch`；不选择其他 major，不访问包管理器解析版本。
- 依赖图存在任意环时整体失败；diagnostic 必须覆盖可确定的环成员，顺序稳定，不只依赖 DFS 起点或输入顺序。
- 启用顺序使用拓扑序：依赖先于依赖者；多个同时可选节点按 plugin id 的 UTF-16 code unit 升序决定。
- deactivate、回滚和 dispose 顺序是实际成功 activate 顺序的严格逆序。
- 相同候选集合即使输入排列不同，也必须得到相同启用顺序、diagnostics 和 Catalog list 顺序。

## 10. 冲突规则

候选集合中以下冲突全部 fail closed：

- 同一 material type 绑定不同 tagName 或不同 constructor。
- 同一 tagName 绑定不同 material type 或不同 constructor。
- constructor static Manifest 与贡献声明中的 type/tagName 不一致。
- standalone material 与 plugin material contribution 在 type、tagName 或 constructor 上不一致。
- 不同插件声明相同 contribution identity；identity 按 Plugin Core 四类判别联合各自冻结的 id 语义比较。
- command、dataResourceType 或 blueprintCapability contribution 的同 id 重复，即使展示元数据深相等也拒绝，不做 first-wins。

完全相同的 standalone tagName 重复输入必须在预检阶段归一为稳定重复诊断或按本 Spec 生效评审冻结为幂等去重，二者只能选择一种。为保持 P2 “同 tagName/同 constructor 幂等”的退出条件，本 Spec 冻结为幂等去重；但 plugin id 和跨插件 contribution identity 不适用该幂等规则。

冲突使用 Plugin Core 已冻结的 `PLUGIN_CORE_IDENTITY_CONFLICT` 或 `PLUGIN_CORE_CONTRIBUTION_CONFLICT`，path 指向确定性的候选位置；不得新增 Manager 私有诊断 envelope。

## 11. Custom Element 预检

- Manager 不调用 `define()`，不自动导入 `/auto-register`，不写入 registry。
- 每个启用 material 的 tagName 必须可通过宿主提供的只读 registry 端口取得 constructor；缺失时整体失败。
- 取得的 constructor 必须满足 Plugin Core 的 `BaseScreenMaterialConstructor` 结构契约，并具有可解析 static `manifest`。
- static Manifest 的 type/tagName 必须与 standalone 输入或 plugin material contribution 一致。
- 同一 tagName 返回同一 constructor 时重复预检幂等；返回不同 constructor 时 fail closed。
- Manager 不枚举 registry，也不根据 registry 中额外定义自动启用物料。
- 全局定义不可回滚；Manager 的原子性仅承诺实例目录和插件启用事务，不宣称撤销浏览器已有定义。
- registry query 抛出的异常必须归一为最小披露 diagnostic，不泄漏浏览器内部 stack。

## 12. 能力授权与 Activation Context

- capability 的唯一插件请求集合来自 Plugin Core 最终冻结的 Plugin Manifest capability 字段；Manager 不接受 runtime、hook 或第二个 options 字段追加请求。文中 `requested` 与 `declared` 指同一 Manifest 集合，不是两套插件输入。
- 最终 granted capability 是 Manifest 请求集合、该 instance/plugin 的宿主批准集合以及具有兼容具体端口工厂的 capability 集合三者的交集。宿主批准但 Manifest 未请求的 capability 不授予、不建端口，也不单独报错。
- Manifest 请求但宿主未批准使用 `PLUGIN_CORE_CAPABILITY_UNAUTHORIZED`；已批准但缺少或不兼容端口使用 `PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`。`PLUGIN_CORE_CAPABILITY_UNDECLARED` 仅用于 runtime/contribution/端口使用了未在 Manifest 请求集合中的 capability 引用；若上游未冻结该引用关系和 path，本项为 §1 的生效前阻塞点。
- capability id 的比较大小写敏感，不 trim、不按 locale 归一。
- Activation Context 只包含 Plugin Core 已冻结的 instance id、plugin id、UTF-16 升序 readonly granted capability 列表和已授权具体端口。
- Context 不包含未授权端口、Core Command Bus、Store、Router、DOM root、Token、Cookie、凭证或任意 service locator。
- 每个 plugin 的每次 activation attempt 在调用其端口工厂前创建唯一 session identity；session 是 Manager 内部撤销域，不作为 token 暴露给插件。仅把上游 Activation Context 明确允许的限权端口交给该 plugin；同一次 Manager `activate()` 中不同 plugin 也不得共享 session 或有状态端口实例。
- activation attempt 失败时该 session 在记录失败后、开始任何回滚 hook 前永久失效；已成功插件的 session 在其 rollback `deactivate()` 调用前逐个失效。正常 deactivate 或 active 状态 dispose 则在第一个清理 hook 前一次性使本次 activation 的全部 session 永久失效。失效后的既有端口引用只能返回 `PLUGIN_CORE_SESSION_INVALID`，重试不得恢复。
- Plugin Command Port 的 plugin identity 和 session identity 由宿主闭包绑定，不接受插件传入或覆盖。
- Manager 负责批准与 session 撤销；Engine Adapter 继续负责 command 白名单、参数、结果和 Core 调度，Manager 不复制 Core 命令实现。

## 13. 生命周期事务与失败原子性

- Manager 在调用第一个 `activate()` 前不得发布 Catalog。
- 每个 plugin 只在其全部依赖已 active 后调用 `activate()`。
- 某 plugin activate 失败时，按 §12 的精确时序永久撤销 session；随后按逆序 deactivate 已成功 active 的插件。
- activate 失败的 plugin 未进入 active，不调用其 deactivate。Manager 是否随后对该 runtime 调用 `dispose()`，只由 Plugin Core 最终冻结的 lifecycle 所有权规则决定；冻结前不得假定“失败过即必须 dispose”或“未 active 即不得 dispose”，该项阻塞本 Spec 生效。
- 回滚完成且无二次失败时，会话回到 `inactive`，调用方可修正外部条件后重试；重试必须创建全新 session 和 plan。
- plugin hook 可产生的外部副作用由受信插件负责按 lifecycle 契约清理；Manager 只承诺端口撤销、调用顺序、目录原子性和错误归一化。
- 多个 lifecycle 错误按实际调用顺序收集后，使用 Contracts/Plugin Core 稳定排序规则输出；不得因后一个错误覆盖第一个错误。
- 失败结果不包含 runtime、constructor、context、adapter、完整 Manifest、完整 error message 或 stack。

## 14. Catalog 原子提交与不可变性

- Material Catalog 与 Plugin Catalog 必须由同一 enable plan 构建，并在全部插件 active 后作为一个提交单元发布。
- Material Catalog entry 只包含 Plugin Core 冻结的 Manifest 与 Constructor 契约；list 按 material type 的 UTF-16 code unit 升序。
- Plugin Catalog 只包含已启用插件的安全 Manifest 数据、granted capability 和 contribution 摘要；list 按 plugin id 的 UTF-16 code unit 升序。
- Catalog 不暴露 runtime、activation context、session、adapter、registry、状态机或可变 Map/Set。
- `get()` 缺失返回 `undefined`；不存在同名 fallback、其他 major fallback 或全局 registry fallback。
- 同一 snapshot 重复 `get/has/list` 深相等；返回集合不可被消费者用于改变内部目录。
- deactivate 开始或 dispose 开始后，旧 snapshot 立即不再作为会话当前目录；已持有对象仍只是一份不具备生命周期能力的只读快照。
- 任一预检、resolve、授权或 activate 失败，结果中不得包含 Catalog value，Manager 查询也不得观察到部分 entry。

## 15. 多实例隔离

- 每个 Manager 会话拥有独立状态、候选 plan、授权、session 与当前 Catalog 引用。
- 两个实例可以对同一全局 registry 选择不同 standalone material 和 plugin 集合。
- 一个实例的 activate、deactivate、dispose 或失败不得改变另一个实例的状态和 Catalog。
- 宿主必须为具有实例状态的插件提供独立 runtime 实例；Manager 不通过模块级 owner registry 猜测跨会话 runtime 所有权。
- constructor 可以被多个实例 Catalog 安全引用，前提是同 tagName 对应同 constructor；constructor 本身不由 Manager dispose。
- 不得使用模块级 mutable Map、Set、当前实例指针或 capability cache 实现隔离。

## 16. Diagnostics、安全与资源边界

Manager 必须复用 Contracts 的 `ScreenParseResult`、diagnostic envelope、path、排序、上限和数据最小化规则，并只使用 Plugin Core 已冻结的 `PLUGIN_CORE_*` code：

- identity 与 registry 预检：`PLUGIN_CORE_IDENTITY_INVALID`、`PLUGIN_CORE_IDENTITY_CONFLICT`。
- dependency：`PLUGIN_CORE_DEPENDENCY_MISSING`、`PLUGIN_CORE_DEPENDENCY_VERSION_INCOMPATIBLE`、`PLUGIN_CORE_DEPENDENCY_CYCLE`。
- capability：`PLUGIN_CORE_CAPABILITY_UNDECLARED`、`PLUGIN_CORE_CAPABILITY_UNAUTHORIZED`、`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`。
- contribution：`PLUGIN_CORE_CONTRIBUTION_DUPLICATE`、`PLUGIN_CORE_CONTRIBUTION_CONFLICT`。
- lifecycle/session：`PLUGIN_CORE_LIFECYCLE_INVALID`、`PLUGIN_CORE_SESSION_INVALID`。
- Manifest/JSON/limit 错误由上游 parser 原样按约定前缀 path 合并，不重写为 Manager 私有 code。

约束：

- 普通无效输入和 hook 失败通过 result 返回，不抛普通 validation exception。
- path 从 Manager create/activate 输入 root 开始；嵌套 Manifest diagnostic 必须添加稳定候选索引前缀。
- 相同语义候选集合必须产生深相等 code、path 与顺序。
- message 不回显完整 Manifest、command args/result、Document、凭证、constructor source、plugin error message 或 stack。
- Manager 不提高 Plugin Core 单份 Manifest 上限；候选总数首版最多 128 个 plugin runtime、512 个 standalone material，必须在无界 clone、建图或调用 registry 前检查。
- 总边数最多 16,384 条，等于 Plugin Core 每 plugin 最多 128 dependencies 的组合上限；超限返回 `PLUGIN_CORE_LIMIT_EXCEEDED`。
- Manager 内部不得以 `JSON.stringify/parse` 克隆 runtime、constructor 或输入；纯数据 Manifest 只交给 Plugin Core parser，runtime hook 只在生命周期阶段调用。

## 17. 确定性与并发

- 不读取时间、随机数、locale、环境变量或隐式 global registry。
- identity、拓扑 tie-break、Catalog list 和 capability list 均使用 UTF-16 code unit 升序。
- 同一会话的 lifecycle 操作串行化；不允许 activate/deactivate/dispose 交错执行。
- resolve 与预检不并发调用 plugin hook；activate 首版按拓扑顺序串行执行，不并发同层插件。
- 生命周期调用顺序是外部可测试语义，不因性能优化改变。
- 不依赖 object insertion order、Map 输入顺序或 Promise 完成竞态决定诊断和目录。

## 18. ADDED Requirements

### R1：P2 前置与包边界

系统 SHALL 只在 Plugin Core 生效并发布后实施 Manager，且 Manager 只依赖 Contracts 与 Plugin Core。

#### Scenario：Node ESM 导入默认入口

- **GIVEN** 空白 consumer 只安装 Manager 及其声明依赖
- **WHEN** 导入 `@base-screen/plugin-manager`
- **THEN** 导入成功
- **AND** 不读取 DOM global、不注册元素、不执行插件、不产生 I/O
- **AND** Vanilla consumer 不安装 React 或 Vue

### R2：完整预检先于副作用

系统 SHALL 在调用任何 plugin hook 前完成单份解析、集合冲突、依赖、授权和 registry 预检。

#### Scenario：候选集合存在依赖环

- **WHEN** 调用 activate
- **THEN** 返回 `PLUGIN_CORE_DEPENDENCY_CYCLE`
- **AND** 没有 plugin `activate()` 被调用
- **AND** 没有 session 端口被创建或发布
- **AND** 没有部分 Catalog

### R3：确定性依赖解析

系统 SHALL 使依赖先于依赖者，并以 plugin id UTF-16 顺序打破拓扑并列。

#### Scenario：输入顺序不同但依赖图相同

- **WHEN** 分别解析两组不同排列的相同候选
- **THEN** activate 顺序相同
- **AND** Catalog list 与 diagnostics 顺序相同

### R4：Custom Element 只读预检

系统 SHALL 只查询宿主显式提供的 registry 端口，不定义或枚举元素。

#### Scenario：tagName 已绑定不同 constructor

- **WHEN** 预检 material contribution
- **THEN** 返回 identity conflict diagnostic
- **AND** 不调用 `customElements.define()`
- **AND** 不覆盖已有 definition
- **AND** 不发布 Material Catalog

### R5：能力最小授权

系统 SHALL 只把已声明、宿主批准且具有兼容端口的 capability 放入 context。

#### Scenario：插件请求宿主未批准能力

- **WHEN** 构造 activation plan
- **THEN** 返回 `PLUGIN_CORE_CAPABILITY_UNAUTHORIZED`
- **AND** plugin 不被 activate
- **AND** context 不包含该能力或端口

### R6：activate 失败原子回滚

系统 SHALL 在任一 activate 失败时撤销 session，并逆序回滚已激活插件。

#### Scenario：第三个插件 activate rejected

- **GIVEN** 前两个插件已按依赖顺序成功 activate
- **WHEN** 第三个插件失败
- **THEN** 前两个插件按逆序 deactivate
- **AND** 所有本次 session 端口失效
- **AND** Manager 不返回或保留部分 Catalog

### R7：只读双目录原子提交

系统 SHALL 仅在全部插件 active 后同时发布 Material 与 Plugin Catalog snapshot。

#### Scenario：成功启用候选集合

- **WHEN** 最后一个 plugin activate 完成
- **THEN** 两个 Catalog 同时可读
- **AND** list 顺序分别按 type 和 plugin id 确定
- **AND** Catalog 不暴露 mutation、runtime、context 或 adapter

### R8：deactivate 与 dispose 失效语义

系统 SHALL 在清理 hook 开始前撤销 session 和当前 snapshot。

#### Scenario：deactivate hook 尝试继续调用旧 command port

- **WHEN** Manager 开始 deactivate
- **THEN** 旧调用返回 `PLUGIN_CORE_SESSION_INVALID`
- **AND** 当前 Catalog 已撤销
- **AND** hooks 按逆启用顺序执行

### R9：多实例隔离

系统 SHALL 允许不同实例消费不同候选与授权，且无模块级可变目录。

#### Scenario：实例 A 启用物料而实例 B 未启用

- **WHEN** 两实例查询同一 type
- **THEN** A 得到 entry
- **AND** B 得到 `undefined`
- **AND** dispose A 不改变 B

### R10：诊断最小披露

系统 SHALL 归一化 registry 与 lifecycle 错误且不泄漏敏感输入。

#### Scenario：plugin 抛出包含 canary secret 的 Error

- **WHEN** activate 失败
- **THEN** 返回稳定 lifecycle diagnostic
- **AND** message 不包含 canary secret、stack 或完整 Manifest
- **AND** 重复运行得到相同 code/path 语义

## 19. MODIFIED Requirements

无。`@base-screen/plugin-manager` 当前仅为空包骨架，尚未发布业务 API。

## 20. REMOVED Requirements

无。

## 21. Test Matrix

至少覆盖：

| 领域 | 必测行为 |
| --- | --- |
| Package | Node ESM import、允许依赖、默认无副作用、声明无框架泄漏、真实 tarball consumer |
| Candidate | 输入不变、runtime/Manifest 一致、候选上限、getter/函数不被意外执行 |
| Resolver | 缺失依赖、不兼容 range、环、稳定拓扑、输入排列无关 |
| Conflict | plugin id、type、tagName、constructor、四类 contribution identity 冲突 |
| Registry | 缺失定义、同 constructor 幂等、不同 constructor 拒绝、只读查询、不枚举/不 define |
| Capability | declared/approved/compatible 三重约束、context 最小权限、排序 |
| Lifecycle | 串行 activate、逆序 rollback/deactivate/dispose、重复/并发调用、failed 状态 |
| Session | activate rollback、deactivate 开始、dispose 开始后立即失效 |
| Catalog | 同时提交、失败无部分值、get/has/list、稳定顺序、不泄漏 runtime/adapter |
| Isolation | 双实例不同目录/授权、单实例失败和 dispose 不污染另一实例 |
| Diagnostics | 统一 code/path、稳定顺序、异常归一化、canary secret 和 stack 不泄漏 |
| Integration | Plugin Core conformance、Engine fake port 边界、浏览器真实 registry 预检 |

测试只保护自定义 resolver、冲突、安全边界、生命周期状态流转、错误路径和副作用条件；不为纯 readonly 字段映射、TypeScript 类型本身或框架内置行为单独编写测试。

## 22. Implementation Shape

实现应按责任分离候选 preflight、dependency resolver、conflict detector、capability planner、registry inspector、lifecycle coordinator、session revocation 和 Catalog snapshot。纯 resolver 保持 Node 可测；真实 Custom Element 行为通过注入查询端口和浏览器 harness 验证。

Manager、adapter 和 runtime 模块目标不超过 300 行，超过 500 行必须按职责拆分；协议/声明目标不超过 400 行，超过 600 行必须按 contract 拆分；测试目标不超过 500 行，超过 800 行按行为场景拆分。不得为了满足行数创建 forwarding-only 文件或重复 canonical parser。

`index.ts` 只导出本 Spec 已验收的稳定 API。每个 export 进入根入口时必须同时具备 Requirement 测试，不允许先发布占位 API。

## 23. 实施顺序

1. 完成 Plugin Core Spec、实现和发布包前置验收，本 Spec 转为“生效中”。
2. 对齐 Plugin Core 最终公共名称，冻结 Manager 最小 create/session/result API。
3. 实现候选输入快照、单份 parser 编排和 runtime/Manifest 一致性预检。
4. 实现集合 identity/contribution 冲突检测、依赖解析和确定性拓扑序。
5. 实现 capability approval plan 与最小 activation context/session 工厂。
6. 实现只读 registry inspector 与 constructor/static Manifest 预检。
7. 实现 lifecycle coordinator、session 立即失效、逆序回滚/deactivate/dispose。
8. 实现 Material/Plugin Catalog 的原子构建、提交、撤销和双实例隔离。
9. 收敛根 exports、声明、package dependency 与 testing conformance。
10. 完成 Node 单元/契约测试、浏览器 registry 测试、双实例与真实 tarball consumer。
11. 运行 format、lint、typecheck、test、build、边界、API、publint、ATTW、tarball 和总仓库回归门禁。

不得跳过 resolver 直接编写 lifecycle，也不得在 lifecycle 完成前向 Renderer/Engine 暴露半成品 Catalog。

## 24. 完成定义

Plugin Manager Runtime 仅在以下条件全部满足后完成：

- P1 Plugin Core 已完成，本 Spec 已生效，代码不存在未记录偏离。
- Manager 只依赖 Contracts 与 Plugin Core，默认入口无 DOM/global/注册/执行副作用。
- parser 与 resolver 责任清晰，Manager 未复制 Manifest、JSON、SemVer range 或 diagnostic envelope 契约。
- 候选预检、冲突、依赖环、稳定拓扑、能力授权和 registry 检查全部 fail closed。
- activate、rollback、deactivate、dispose 与 session 失效严格符合 Plugin Core 生命周期。
- 任一失败均不返回或保留部分 Material/Plugin Catalog。
- 两个 Catalog 是实例级 readonly snapshot，顺序稳定且不泄漏 runtime、context 或 adapter。
- 同 tagName/同 constructor 预检幂等，不同 constructor 稳定拒绝；Manager 从不调用 define 或覆盖 registry。
- 双实例不同候选、授权、失败和 dispose 行为可自动验证且互不污染。
- 每个 Requirement 均有自动化测试映射，且只测试业务约束和安全边界。
- public declaration、API report、publint、ATTW、浏览器测试、真实 tarball consumer 和总仓库既有门禁全部通过。

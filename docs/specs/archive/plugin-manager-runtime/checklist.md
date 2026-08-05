# Plugin Manager Runtime 验收清单

## P2 顺序与前置契约

- [x] P0 Contracts 与 P1 Plugin Core 已完成各自 Spec、实现、测试和真实 tarball 退出条件。
- [x] Plugin Core Contract Spec 已为“生效中”，Manager 使用的公共名称、类型和 diagnostics 不存在待定项。
- [x] Contracts 已包含 Plugin Core §18 全部 `PLUGIN_CORE_*` code、统一结果 envelope、path、排序和数据最小化规则。
- [x] 本 Spec 已完成评审并转为“生效中”，且已加入 `docs/specs/README.md` 索引。
- [x] Manager 实施未早于 P1 完成；P3 Material/React/Vue spike 未早于 Manager 与 Plugin SDK 各自完成。
- [x] Manager 与 Plugin SDK 保持 P2 并行关系，二者不存在直接依赖。

## Package 与默认入口边界

- [x] `@base-screen/plugin-manager` 只依赖源码真实使用的 `@base-screen/contracts` 与 `@base-screen/plugin-core`。
- [x] 包不依赖 Core、Renderer、Engine、Plugin SDK、Material、SDK、Testing、React、React DOM 或 Vue。
- [x] 默认入口可在无 DOM 的 Node ESM 环境导入。
- [x] 默认入口不读取 window、document、全局 customElements、时间、随机数、环境变量、网络或文件系统。
- [x] 默认入口不注册 Custom Element、不激活插件、不创建实例、不维护全局目录、不修改 global。
- [x] package 保持 ESM-only、`sideEffects: false`，exports、dist 和 tarball 内容正确。
- [x] public declaration 不泄漏 Zod、框架、Core/Engine 私有类型、宿主 DTO、runtime 私有状态或 service locator。
- [x] 源码、声明和 dist 均不 deep import Contracts/Plugin Core 私有文件或 Nebula/应用源码。

## 公共 API 与会话状态

- [x] 根入口只公开已验收的 create options、readonly session、状态、lifecycle 操作和结果类型。
- [x] create 只创建 inactive 会话，不执行预检副作用或 plugin lifecycle。
- [x] activate/deactivate/dispose 使用统一 result envelope，普通无效调用不抛 validation exception。
- [x] 公共 API 不开放 register、unregister、replace、enableOne、disableOne 或可变 collection。
- [x] 状态只允许 Spec 固定的 inactive/activating/active/deactivating/failed/disposing/disposed 转换。
- [x] 重复或并发 lifecycle 调用 fail closed，重复 dispose 幂等成功。
- [x] status 不暴露 runtime、activation context、adapter、session token 或 registry。

## 候选输入与预检流水线

- [x] 候选只来自宿主显式提供的 instance id、standalone tagName、runtime、批准能力、具体端口工厂和 registry 查询端口。
- [x] 候选不包含模块 URL、动态 import、凭证、DOM root、Store、Router 或 Command Bus。
- [x] plugin 数、standalone material 数和 dependency edge 数在 clone、建图、registry 查询与 hook 调用前检查。
- [x] runtime Manifest 和 constructor static Manifest 均调用 Plugin Core 公共 parser，Manager 未复制字段级 schema。
- [x] runtime Manifest 与 parsed detached Manifest 内容一致，activate 不能追加未声明 contribution。
- [x] Manager 不修改输入，不通过 JSON stringify/parse 克隆 runtime 或 constructor，预检阶段不调用 runtime lifecycle hook。
- [x] 单份解析、集合冲突、依赖、授权、registry 预检、计划冻结严格先于任何 plugin hook。
- [x] 任一预检失败不创建可调用 session、不调用 hook、不返回 plan 或部分 Catalog。

## Resolver 与确定性

- [x] 重复 plugin id 整体拒绝，不覆盖、不 first-wins、不隐式合并。
- [x] 依赖缺失返回 `PLUGIN_CORE_DEPENDENCY_MISSING`。
- [x] 任意依赖环返回 `PLUGIN_CORE_DEPENDENCY_CYCLE`，环 diagnostics 不依赖 DFS 起点或候选输入顺序。
- [x] 拓扑序保证依赖先于依赖者，并以 plugin id UTF-16 code unit 顺序打破并列。
- [x] deactivate、rollback 和 dispose 使用实际成功 activate 顺序的严格逆序。
- [x] 相同语义候选集合的不同输入排列产生相同启用顺序、diagnostics 和 Catalog list。
- [x] resolver 不读取 locale、时间、随机数、环境变量、隐式 registry 或 object insertion order。

## Identity 与贡献冲突

- [x] 同一 material type 绑定不同 tagName 或不同 constructor 时 fail closed。
- [x] 同一 tagName 绑定不同 type 或不同 constructor 时 fail closed。
- [x] constructor static Manifest 与 standalone/plugin material contribution 的 type/tagName 必须一致。
- [x] standalone material 与 plugin material contribution 的冲突整体拒绝。
- [x] command、dataResourceType、blueprintCapability 的跨插件同 identity 冲突整体拒绝。
- [x] 完全相同 standalone tagName 对同一 constructor 的重复输入按 Spec 幂等去重。
- [x] plugin id 与跨插件 contribution identity 不适用幂等去重。
- [x] identity/contribution 冲突只使用 Plugin Core 冻结 code，并具有稳定候选 path。

## Custom Element Registry 边界

- [x] Manager 仅使用宿主显式注入的最小只读 tagName 查询端口。
- [x] Manager 不调用 `customElements.define()`、不自动导入 `/auto-register`、不枚举或覆盖 registry。
- [x] 每个启用 material 的 tagName 均已定义且返回符合 Plugin Core 结构 ABI 的 constructor。
- [x] constructor static Manifest 已解析并与候选 type/tagName 一致。
- [x] 同 tagName/同 constructor 重复预检幂等；同 tagName/不同 constructor 稳定拒绝。
- [x] registry 中未列入候选的额外 definition 不会自动进入实例目录。
- [x] registry query 异常被归一化，diagnostic 不泄漏 stack、constructor source 或浏览器内部 message。
- [x] 真实 Custom Element 行为由浏览器 harness 验证，而非只依赖 jsdom。

## 能力授权与 Context

- [x] 最终 granted capability 同时满足 Manifest declared、宿主批准和具体端口兼容。
- [x] 未声明、未批准和不兼容能力分别返回对应 Plugin Core diagnostic。
- [x] capability id 比较大小写敏感，不 trim、不使用 locale。
- [x] granted capability 列表按 UTF-16 code unit 升序且 readonly。
- [x] Activation Context 仅含 instance/plugin identity、granted capability 和已授权具体端口。
- [x] Context 不含 Command Bus、Store、Router、DOM root、Token、Cookie、凭证或通用 service locator。
- [x] Plugin Command Port 的 plugin/session identity 由宿主闭包绑定，插件不能伪造。
- [x] 每次 activate 创建全新 session，旧 session 在回滚/deactivate/dispose 后永久失效。
- [x] Manager 不复制 Core 命令实现，不承担 Engine Adapter 的参数、结果或 Core 调度职责。

## Lifecycle 与失败原子性

- [x] plugin 按稳定拓扑序串行 activate，依赖未 active 时不调用依赖者。
- [x] 第一个 activate 前没有 Catalog 对外可见。
- [x] activate 失败时失败 plugin session 立即失效，已 active plugin 按逆序回滚。
- [x] activate 失败的 plugin 不调用 deactivate；dispose 仍按 Plugin Core 语义至多调用一次。
- [x] 回滚成功回到 inactive；回滚或 deactivate 失败进入仅允许 dispose 的 failed。
- [x] deactivate 开始前撤销当前 Catalog 并使所有本次 session 立即失效。
- [x] deactivate 某 hook 失败后继续 best-effort 清理剩余插件，且不重新发布旧 Catalog。
- [x] active 状态 dispose 先执行 deactivate 语义，再逆序 dispose 尚需释放的 runtime。
- [x] 首次 dispose 后永久 disposed，所有端口失效且无当前 Catalog；重复 dispose 不重复释放。
- [x] 同步 throw 与 rejected Promise 使用同一归一化路径；多个错误稳定聚合且不互相覆盖。

## Catalog 原子性与不可变性

- [x] Material Catalog 与 Plugin Catalog 从同一 enable plan 构建并同时提交。
- [x] 只有全部 plugin active 后两个 Catalog 才同时可见。
- [x] 任一 parser、resolver、授权、registry 或 lifecycle 失败均无 Catalog value 和部分 entry。
- [x] Material Catalog 支持 Plugin Core 冻结的 get/has/list，list 按 type UTF-16 升序。
- [x] Plugin Catalog 支持 Plugin Core 冻结的 get/list，list 按 plugin id UTF-16 升序。
- [x] 缺失查询返回 `undefined`，不 fallback 到同名或全局 registry。
- [x] Catalog 不暴露 register/delete/enable/disable、可变 Map/Set、runtime、context、session、adapter 或 registry。
- [x] 同一 snapshot 重复读取深相等，消费者不能通过返回值改变内部目录。
- [x] deactivate/dispose 开始后旧 snapshot 不再是会话当前目录，且旧对象不保留 lifecycle 能力。

## 多实例隔离

- [x] 每个 Manager 会话拥有独立状态、候选 plan、授权、session 和当前 Catalog 引用。
- [x] 两个实例可对同一 registry 启用不同 material/plugin 集合。
- [x] 实例 A 的失败、deactivate 或 dispose 不改变实例 B 的状态和 Catalog。
- [x] 不存在模块级 mutable registry、当前实例指针、runtime owner Map 或 capability cache。
- [x] 文档明确要求宿主为具有实例状态的插件提供独立 runtime，Manager 不以 global owner registry 猜测所有权。
- [x] 相同 constructor 可被不同实例 Catalog 引用，前提是 tagName/constructor identity 一致。
- [x] 双实例测试覆盖不同目录、不同授权、单边失败和单边 dispose。

## Diagnostics、安全与资源限制

- [x] Manager 复用 Contracts 的 `ScreenParseResult`、diagnostic envelope、path、排序、上限和数据最小化规则。
- [x] Manager 不定义第二套 diagnostic type 或未获 Plugin Core 授权的新 code。
- [x] 嵌套 Manifest diagnostic 带稳定候选索引前缀，path 从 Manager 输入 root 开始。
- [x] 相同非法候选重复运行得到深相等 code/path/顺序语义。
- [x] message 不包含完整 Manifest、Document、command args/result、凭证、constructor source、plugin Error message 或 stack。
- [x] canary secret 出现在 hook Error、Manifest 或 registry exception 时不会进入 diagnostics。
- [x] plugin runtime 上限为 128、standalone material 上限为 512、dependency edge 上限为 16,384。
- [x] Manager 不放宽 Plugin Core 单份 Manifest 与字段资源限制。
- [x] 生命周期操作串行，结果不受 Promise 竞态、Map 输入顺序或 locale 影响。

## 测试与发布验收

- [x] 每个 R1-R10 均映射到自动化测试。
- [x] 测试覆盖 resolver、冲突、安全边界、生命周期状态流转、错误路径和副作用条件。
- [x] 未为纯字段映射、内置必填、TypeScript 类型或框架自身行为编写无价值测试。
- [x] 纯 resolver 与状态测试在 Node 运行，真实 registry 行为在浏览器运行。
- [x] `@base-screen/testing` 从外部消费 Manager 公共 API，production package 不反向依赖。
- [x] 真实 tarball consumer 验证 Node ESM、exports、types 和 Vanilla 无框架安装。
- [x] public `.d.ts`、API report、publint、ATTW、dist graph 和 tarball 检查全部通过。
- [x] package format、lint、typecheck、test、build 与适用 Chromium E2E 全部通过。
- [x] workspace boundary、总仓库既有验证和 Contracts/Plugin Core/P1 回归门禁全部通过。

## 文件规模与实现形状

- [x] preflight、resolver、conflict、capability、registry、lifecycle、session 和 Catalog 按可独立测试职责组织。
- [x] Manager/adapter/runtime 模块目标不超过 300 行，超过 500 行已按职责拆分。
- [x] 协议/声明目标不超过 400 行，超过 600 行已按 contract 拆分。
- [x] 测试目标不超过 500 行，超过 800 行已按行为或场景拆分。
- [x] 未为行数创建 forwarding-only 文件、重复 parser、空 facade 或未授权扩展点。
- [x] `index.ts` 只导出 Spec 已验收且已有 Requirement 测试的稳定 API。

## P2 退出条件

- [x] 全局 Custom Element 定义与实例启用已明确分离，Manager 从不拥有 define 责任。
- [x] 同 tagName/同 constructor 幂等，同 tagName/不同 constructor fail closed。
- [x] 任一 Manager 失败不返回、不发布、不保留部分实例目录。
- [x] 双 Catalog、生命周期、能力授权和双实例行为均已通过自动化验收。
- [x] 本清单全部完成后才进入 P3；未完成项没有通过文档豁免或实现 fallback 绕过。

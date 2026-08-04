# Runtime And Ecosystem Hardening Spec

> 状态：生效中
> 最近更新：2026-08-04
> 定位：增量冻结远程 sandbox、Host Resource、Blueprint、插件运行时贡献、框架 tarball consumer 与 Nebula importer 的生产级验收边界
> 依据：[ADR-0004](../../decisions/ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0009](../../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)、[ADR-0010](../../decisions/ADR-0010-host-resource-deadline-and-blueprint-v2.md)、[ADR-0011](../../decisions/ADR-0011-nebula-importer-auditable-migration.md)、[Host Resource And Blueprint Spec](../host-resource-blueprint/spec.md)、[Remote Plugin Sandbox Spec](../remote-plugin-sandbox/spec.md)、[Nebula Importer Spec](../nebula-importer/spec.md)
> 实施：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)

## 1. Why

Base Screen 已完成远程插件 sandbox、Host Resource、Blueprint、插件 contribution、React/Vue
bridge 和 Nebula importer 的第一条纵向切片，但当前验收仍以成功路径和结构解析为主：

- Remote sandbox 没有浏览器测试；现有 `allow-scripts` opaque origin 与 exact-origin 消息判断也需
  在继续实施前形成新的可执行决策。
- Renderer 已在 replace/remove/clear/dispose 时 abort Host Resource，却没有超时策略和取消
  conformance harness。
- Blueprint 只能静态匹配事件、写静态值和发送静态 payload，事件 payload 实际未参与求值。
- `dataResourceType` 与 `blueprintCapability` contribution 进入 Plugin Catalog 后没有投影到
  Renderer/Core runtime。
- React/Vue bridge 的浏览器测试直接消费 workspace 源码，没有证明安装后 tarball、peer 和
  consumer-local 类型增强可用。
- Importer 只覆盖一个接近 canonical 的 fixture，没有变体识别、字段级 loss 报告和迁移决策。

本 Spec 是现有生效中规格的增量，不重新定义其已完成基线。

## 2. 生效前置

以下决策已经完成并构成本 Spec 的实施授权：

1. [ADR-0009](../../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md) 取代
   ADR-0008 的 opaque-origin/exact-origin 不可执行组合，冻结 strict cross-origin transport。
2. [ADR-0010](../../decisions/ADR-0010-host-resource-deadline-and-blueprint-v2.md) 明确
   Renderer resource deadline 的边界，以及 Blueprint V2 兼容和 capability 求值方式。
3. [ADR-0011](../../decisions/ADR-0011-nebula-importer-auditable-migration.md) 为 importer 提供
   独立、唯一编号的离线迁移决策；决策索引不再重复使用 ADR-0008。
4. Blueprint V2 实施必须同步 Contracts Foundation Spec 和 committed JSON Schema golden；V1
   已持久化文档继续可解析。

## 3. 目标

- 建立真实浏览器中的 remote sandbox transport、超时、畸形输入和 dispose 门禁。
- 冻结 Host Resource deadline、abort 分类、迟到响应和 conformance helper。
- 用数据型 value expression 和 condition 扩展 Blueprint，不引入脚本执行。
- 让已授权的 data-resource/Blueprint contribution 真正约束文档校验和运行时能力。
- 从已安装 tarball 构建并运行 React/Vue consumer，验证本地类型增强。
- 把 importer 变成可审计的 analyze -> decide -> convert 两阶段迁移工具。

## 4. 非目标

- 不支持 remote Material constructor、远程物料渲染、远程属性面板或远程文档 mutation。
- 不给 remote plugin 传递 Material Catalog、Plugin Catalog、Document、Host Resource port、
  command port、凭证或宿主 service object。
- 不在 Blueprint 中执行 JavaScript、表达式字符串、网络请求或插件提供的 handler。
- 不改变 Designer 选择、画布工具、历史、属性 UI 或项目 load/save/publish 状态机。
- 不让 importer 调用 Engine、Project Adapter、save 或 publish。
- 不引入第十三个 package 或绕过既有十二包依赖方向。

## 5. 所有权与并行边界

| 领域 | 本 Spec 拥有 | 不得修改 |
| --- | --- | --- |
| Contracts | Blueprint V2、Host Resource/Blueprint runtime port、对应诊断 | Project Adapter、project revision 与 dirty 状态 |
| Core | Blueprint compile/evaluate 与 capability 校验 | Designer session、selection UI、project lifecycle |
| Renderer | resource deadline/cancel 与 contribution 消费 | Designer overlay、history 和 persistence |
| Plugin Core/Manager | contribution runtime projection、remote sandbox | Project Adapter 和 Engine command UI |
| React/Vue/SDK/Testing | tarball consumer 与 runtime conformance | Designer 产品功能 |
| Scripts | Nebula analyze/decision/convert | Engine load/save/publish |

配套的
[Designer Authoring And Project Lifecycle Spec](../designer-authoring-project-lifecycle/spec.md)
只读取 immutable Material Catalog 和 property/design declarations。两个 Spec 不共享状态机、adapter
或 Playwright 项目；根级总门禁只在两条独立验证命令都稳定后做聚合。

## 6. Remote Sandbox 增量

### 6.1 Transport 提案

successor ADR 应采用以下可验收语义，或提供安全性等价且可在浏览器证明的替代：

- API 使用 `entryUrl` 表示远程 HTML bootstrap，而不是把 JavaScript module URL 直接赋给
  `iframe.src`。
- 创建 iframe 前分别解析 `entryUrl` 与 `expectedOrigin`；二者标准化 origin 必须精确相等，且
  必须与宿主 document origin 不同。same-origin remote plugin 在任何副作用前拒绝。
- iframe 使用 `sandbox="allow-scripts allow-same-origin"`。加入 `allow-same-origin` 仅用于恢复
  可验证的 cross-origin `MessageEvent.origin`；“插件 origin 必须不同于宿主”是强制安全前置。
- iframe 使用 `referrerPolicy="no-referrer"`，不添加 forms、popups、downloads、top-navigation、
  pointer-lock 或其他 sandbox token。
- iframe load 后，宿主只向已知 `contentWindow` 发送 strict init，`targetOrigin` 必须是精确
  `expectedOrigin`，禁止 `'*'`。
- 宿主只接受 `event.source === iframe.contentWindow` 且 `event.origin === expectedOrigin` 的消息。
  重定向到其他 origin 的 entry 无法收到 init，其消息也会被拒绝并最终 timeout。
- 远端 bootstrap 发送 strict `ready` 后，宿主才完成 `ready()`。

### 6.2 协议与状态

协议继续限制为：

```ts
type RemoteSandboxMessage =
  | { readonly protocolVersion: 1; readonly type: 'ready' }
  | {
      readonly protocolVersion: 1;
      readonly type: 'emit-event';
      readonly name: string;
      readonly payload: ScreenJsonValue;
    };
```

- 两个分支都是 strict object，拒绝未知字段；单消息 canonical UTF-8 上限为 64 KiB。
- `ready` 只能出现一次；ready 前的 `emit-event`、重复 ready 和未知 type 都是协议错误。
- event name 复用 canonical ASCII identifier，payload 先通过 JSON boundary 再 detached clone。
- 状态固定为 `loading -> ready | failed -> disposed`，`disposed` 为终态。
- 默认 ready timeout 为 5 秒，可配置范围为 100..60,000ms；超限配置在创建 iframe 前失败。
- iframe load error、timeout、invalid URL/origin、畸形消息和 dispose 使用固定 diagnostic code，
  message 不回显 URL、payload、远端 Error 或 stack。
- `dispose()` 幂等，移除 iframe、load/message 监听器和计时器，并结束 pending ready。
- remote Material 仍明确 unsupported；测试只能验证拒绝，不能增加 constructor/registry 通道。

## 7. Host Resource 增量

### 7.1 Deadline 与取消

`CreateBaseScreenRendererOptions` 增加 `resourceTimeoutMs?: number`：

- 默认 15,000ms，合法范围 100..60,000ms，非法值在创建 Renderer 时 fail closed。
- 每次 `resolve()` 使用一个 AbortController 和一个 deadline timer。
- deadline 到达先 abort，再发布固定 `HOST_RESOURCE_TIMEOUT` error state。
- replace、component removal、`clear()` 和 `dispose()` 归类为 silent cancellation，不向已卸载
  Material 写 error model，也不派发错误事件。
- Host port rejection/throw 为 `HOST_RESOURCE_FAILED`；非 JSON/超限成功值为
  `HOST_RESOURCE_INVALID`；三类不得互相折叠。
- generation guard 继续是最终写入闸门；即使 Host 忽略 signal，迟到结果也不得更新 model。
- Renderer 不自动 retry、cache 或 deduplicate；这些继续由 Host 明确实现。

### 7.2 Conformance

`@base-screen/testing` 增加从公共 API 外部消费的 Host Resource conformance helper，至少接受
Renderer factory、fake port 和 DOM root，不被生产包反向 import。helper 必须覆盖 success、reject、
malformed、never-settling、timeout、replace、remove、clear 和 dispose。

## 8. Blueprint V2 与 Plugin Contribution

### 8.1 版本兼容

- `ScreenBlueprint` 改为 `apiVersion: 1 | 2` 的判别联合。
- V1 shape 和语义保持精确兼容，不默认升级、不 strip 字段。
- V2 才允许 value expression、condition 和 `requiredCapabilities`。
- parser/serializer 保留输入版本；Importer 若没有可证明的动态映射，继续输出显式空 V1。

### 8.2 Value expression

V2 action value/payload 使用封闭、递归、纯数据表达式：

```ts
type ScreenBlueprintValueExpression =
  | { readonly kind: 'literal'; readonly value: ScreenJsonValue }
  | { readonly kind: 'event-payload'; readonly path: readonly string[] }
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'array'; readonly items: readonly ScreenBlueprintValueExpression[] }
  | {
      readonly kind: 'object';
      readonly properties: Readonly<Record<string, ScreenBlueprintValueExpression>>;
    };
```

- path 最多 16 段，每段使用 canonical identifier，并拒绝 `__proto__`、`prototype`、
  `constructor`。
- 缺失 event path/variable 返回固定 diagnostic，该 action 不产生副作用。
- expression 最大深度、container 数量和结果 bytes 复用 Contracts 的专用预算。
- 求值不得调用 getter、函数、`eval`、`new Function` 或任意脚本解释器。

### 8.3 Condition

V2 rule 可选一个 condition：

```ts
interface ScreenBlueprintCondition {
  readonly left: ScreenBlueprintValueExpression;
  readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  readonly right?: ScreenBlueprintValueExpression;
}
```

- `exists` 禁止 right，其他 operator 要求 right。
- 数值比较只接受有限 number，不进行 string coercion。
- `contains` 只接受 string/string 或 array/JSON value。
- false 跳过该 rule 全部 actions；求值错误返回 diagnostic 且不提交部分变量/host event。
- 同一 event 的匹配 rule 和 action 按 canonical document 顺序串行执行。

### 8.4 Capability 与 contribution 投影

首版稳定 capability id 为：

- `blueprint.trigger.material-event`
- `blueprint.value.event-payload`
- `blueprint.value.variable`
- `blueprint.condition.compare`
- `blueprint.action.set-variable`
- `blueprint.action.emit-host-event`

Plugin Manager 从 active Plugin Catalog 构建 immutable runtime contribution index：

- `dataResourceType.id` 对应 Document 的 `resourceType`；其 `configSchema` 校验同 source 的
  `params`，但不包含 resolver、URL 或 credentials。
- `blueprintCapability.id` 必须是宿主支持且已授权的稳定 capability id；未知 id 不进入 index。
- Renderer 在调用 Host Resource port 前验证 resource type 已启用且 params 满足 contribution
  schema。
- Blueprint compiler 接收 readonly capability index；V2 rule 的 `requiredCapabilities` 必须全部
  可用，否则该 plan fail closed。
- contribution 只控制 allowlist/config validation，不携带 handler，不获得 runtime port。
- 两个 Plugin Manager 实例的 index 相互隔离；deactivate/dispose 后旧 index 不再是当前能力源。

## 9. React/Vue Installed-Tarball Consumers

验证脚本必须在临时目录中：

1. pack 并安装 `@base-screen/react` 或 `@base-screen/vue` 及其全部 workspace tarball 依赖。
2. 安装对应 framework peer，不使用 workspace link、source alias 或仓库 tsconfig path。
3. 创建最小 Vite + TypeScript consumer，定义一个框架 Material 并装配 SDK Viewer。
4. React consumer 在本地声明 `JSX.IntrinsicElements`；Vue consumer 在本地声明
   `GlobalComponents` 和 custom-element compiler 规则。
5. 运行 typecheck、production build 和 Chromium Playwright，覆盖 model 首次写入、更新不重建、
   标准事件 forwarding、microtask disconnect/reconnect 和最终 unmount。
6. 检查 lockfile/解析路径不包含 `workspace:*`、仓库源码或隐式另一框架 peer。

本门禁扩展现有 `verify:tarball`，不替代 publint、ATTW 和 Node no-side-effect smoke。

## 10. Nebula Importer 两阶段工作流

### 10.1 Variant 与 fixture

首期至少以脱敏真实 export 覆盖三个唯一 variant：document root、project envelope、export wrapper。
每个 detector 使用明确签名和版本，不按“字段大概存在”猜测；零匹配或多匹配均失败。

真实 fixture 必须更新 provenance，记录来源 commit/path、授权、脱敏和 no-copy 判断。fixture 不得
包含业务数据、凭证、URL、asset 或用户信息。

### 10.2 Report 与 decision

```ts
interface NebulaImportFinding {
  readonly code: string;
  readonly severity: 'blocking' | 'warning' | 'info';
  readonly sourcePath: readonly (string | number)[];
  readonly targetPath?: readonly (string | number)[];
  readonly reason: string;
  readonly decisionId?: string;
}

interface NebulaImportDecision {
  readonly id: string;
  readonly action: 'map' | 'drop' | 'cancel';
  readonly targetMaterialType?: string;
}
```

- `--analyze` 只写 report，不写 canonical output。
- 每个 skipped component 和 unmapped field 都必须有 finding，不能只增加计数。
- `drop` 必须由 decision 文件显式确认；`map` 必须指定兼容 Material type；`cancel` 终止转换。
- unresolved blocking finding 时不写 output；成功 output 必须重新 parse 和 serialize。
- input、output 和 report/decision path 必须互不相同；工具在读 input 前拒绝同路径。
- 写 output/report 使用临时文件后原子 rename，失败不得留下 stale success output。
- 全流程离线，不读取 Nebula 配置，不调用 Engine/Adapter，不访问网络。

## 11. ADDED Requirements

### R1：Sandbox 浏览器协议

系统 SHALL 在真实 Chromium 中证明 ready、invalid origin/URL、timeout、malformed、load error 和
dispose 均产生确定结果，且 remote Material 能力仍不可达。

### R2：资源 deadline 与取消

当 Host Resource 超时、替换、移除或 Renderer dispose 时，系统 SHALL abort 对应 signal、抑制
迟到结果，并按 timeout 与 silent cancellation 的不同语义处理。

### R3：Blueprint 动态值

当 V2 rule 引用 event payload 或 variable 时，系统 SHALL 在资源预算内得到 detached JSON 值；
缺失或危险 path 不得产生 action 副作用。

### R4：Blueprint 条件

当 condition 为 false 时，系统 SHALL 跳过该 rule；当条件非法时，系统 SHALL 返回确定性诊断
且不提交部分变量或 host event。

### R5：Contribution 运行时投影

当 active plugin 声明并获准 data-resource/Blueprint contribution 时，Renderer/Core SHALL 使用
同一 immutable index 校验能力；未启用、冲突或未授权 contribution 必须 fail closed。

### R6：Installed-tarball consumer

当 React/Vue consumer 只安装本地 tarball 和 framework peer 时，系统 SHALL 通过本地类型增强、
production build 和浏览器 lifecycle/event 测试。

### R7：Importer loss 可见

当 legacy export 含未映射字段或组件时，Importer SHALL 输出字段级 finding，并在 decision 未解决
blocking 项时禁止写 canonical output。

## 12. Test Matrix

| 领域 | 必测行为 |
| --- | --- |
| Sandbox | entry origin preflight、exact source/origin、ready 顺序、64 KiB、timeout、load error、dispose、无 remote Material |
| Host Resource | success、reject、throw、malformed、never-settling、timeout、replace/remove/clear/dispose、late result |
| Blueprint V1 | 既有 fixture/parser/compiler/serializer 行为不变 |
| Blueprint V2 | expression 全分支、危险 path、预算、condition operator、原子失败、顺序 |
| Contribution | resource config、capability allowlist、授权、冲突、双实例、deactivate 后失效 |
| Tarball | React/Vue 本地增强、peer 隔离、Vite build、model/event/disconnect 浏览器行为 |
| Importer | 三类真实 variant、零/多匹配、字段 loss、decision、同路径、原子输出、round-trip |

Runtime browser tests 使用独立 harness，不向 Designer harness 追加场景。测试 helper 位于
`@base-screen/testing`，生产包不得反向依赖。

## 13. 完成定义

- 所有生效前置 ADR/Spec 已接受并消除决策索引的 ADR 编号冲突。
- Remote sandbox 在真实浏览器中满足 transport、timeout、malformed 和 dispose 约束。
- Host Resource timeout/cancel conformance 覆盖 signal 和 DOM 生命周期，不只有 success smoke。
- Blueprint V1 保持兼容，V2 expression/condition/capability 全部 fail closed 且有 golden 更新。
- data-resource/Blueprint contribution 从 active catalog 投影到 runtime，不再只是 parsed metadata。
- React/Vue installed-tarball consumer 通过类型、构建和 Chromium 门禁。
- Importer 真实 variants、字段级 report、decision 和 provenance 全部可审计。
- 本 Spec 未修改 Engine project lifecycle、Designer UI 或 persistence baseline。
- 定向检查及 `pnpm verify:m0` 全部通过，且不存在未记录的公共 API 偏离。

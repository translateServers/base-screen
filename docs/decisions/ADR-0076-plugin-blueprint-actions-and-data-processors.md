# ADR-0076: 插件贡献蓝图动作与数据处理器

> 状态：已接受
> 日期：2026-09-14
> 关联：[ADR-0004](./ADR-0004-plugin-lifecycle-contributions-and-trust.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0068](./ADR-0068-datav-global-variables.md)、[ADR-0070](./ADR-0070-plugin-command-chrome-projection.md)、[ADR-0071](./ADR-0071-plugin-design-context-read-access.md)、[ADR-0072](./ADR-0072-plugin-panel-contribution-minimal-loop.md)、[ADR-0073](./ADR-0073-inspector-custom-form-controls.md)
> 范围：`kind: 'blueprintAction'` 与 `kind: 'dataProcessor'` 两类贡献、两个宿主端口、以及 `host-action` / `processorId` 的解析语义；不改变 `screen-document` 契约，不引入用户代码执行，不改变插件信任模型

## 背景

已有六类贡献（material / command / dataResourceType / blueprintCapability / panel / inspectorControl）全部落在两个面：**作者面**（material、panel、inspectorControl）与**资源类型**（dataResourceType）。运行时行为面只有 `command`，而它作用在插件自己的 chrome 上，不能参与文档的交互语义。

结果是插件对**蓝图**与**数据链路**无从下手，而这两块恰是 DataV 这类产品能力最密集的地方。核查现状（2026-09-14，实测代码）：

1. **`processorId` 是一处悬空引用。** canonical 文档允许组件数据源与动态变量携带 `processorId`（`schema.ts`），Renderer 与 Designer 都把它原样透传给宿主 `ScreenHostVariablePort`（`viewer-host-variable-resolution.ts`），但 `plugin-core` / `plugin-manager` **没有任何处理器注册表**——文档能写、宿主能收，**插件却无处声明**。等价于"声明侧存在、供给侧不存在"。
2. **`host-action` 完全没有注册表与授权。** `ScreenBlueprintHostActionPort.execute(action)`（`host.ts`）对 `actionId` 不做任何校验；Engine 拿到 `hostActions` 后逐个交给端口（`designer-canvas-runtime-controller.ts`）。也就是说蓝图里的宿主动作是一个**无授权的通吃端口**：谁是合法动作、谁批准了这个动作，系统里没有任何记录。它替换掉了 DataV 的"宿主动作 / 页面导航"这类节点，但插件连"我提供一个动作"都做不到。

因此本决策要解决的不是"再加一类能力"，而是**把插件词汇表从作者面扩到运行时面**，同时把上面两处松口收紧。

## 决策

沿用 `dataResourceType` 已验证的模式：**插件声明 JSON-safe 的类型标识与参数 schema → 文档引用该标识 → 宿主提供执行端口 → manager 按"声明 ∩ 授权 ∩ 支持"解析**。执行内核始终在宿主，插件提供的是"这个标识怎么被解释"。

### 1. 新增两类贡献

```ts
// 蓝图动作：文档 host-action.actionId 引用它
{ kind: 'blueprintAction'; id: string; name: string;
  payloadSchema: BaseScreenMaterialObjectSchema;
  requiredCapability: string }   // 必须是受支持能力表中的 blueprint.action.* 之一

// 数据处理器：文档 processorId 引用它
{ kind: 'dataProcessor'; id: string; name: string;
  configSchema: BaseScreenMaterialObjectSchema }
```

`id` 必须满足文档既有的标识模式（变量名模式，用于 `processorId`）或组件 id 模式（用于 `actionId`）；两类都按 `blueprintAction:<id>` / `dataProcessor:<id>` 参与既有的跨插件身份冲突检测。

### 2. 新增两个宿主端口，并收紧两处松口

```ts
interface BaseScreenPluginBlueprintActionPort {
  execute(request: { actionId: string; payload: ScreenJsonValue }): Promise<ScreenParseResult<ScreenJsonValue>>;
}
interface BaseScreenPluginDataProcessorPort {
  apply(request: { processorId: string; value: ScreenJsonValue; config: ScreenJsonValue }): Promise<ScreenParseResult<ScreenJsonValue>>;
}
```

- **`host-action` 从"任意 id 通吃"收紧为"必须引用已声明动作"**：宿主端口收到未声明的 `actionId` 时必须失败关闭并产生诊断，而不是静默交给宿主自由解释。这是**行为收紧**，理由是无授权通吃端口与"声明 ∩ 授权"的整体模型自相矛盾。
- **`processorId` 获得注册表**：此前悬空的引用现在有明确供给方。未声明的 `processorId` 在解析阶段失败关闭。

### 3. 执行一律经端口，引擎不直接调用插件代码

与 ADR-0029（宿主负责加载与信任）和 ADR-0072（面板动作路由回插件自己的命令）一致：**Engine 只负责"是否可用"的门禁与作者面呈现，从不直接调用插件函数**。实际执行由宿主把端口接到 manager 的贡献路由上，插件 handler 在 manager 侧运行、受激活会话与授权门禁约束。

这条边界同时保住了产品定位（ADR-0027）：Base Screen 不因新增贡献类型而获得任何后端、队列或业务处理职责——它只是把"有这个动作/处理器"变成文档与作者面可引用的东西，实际发生什么仍由宿主决定。

### 4. 新增两项能力，沿用现有端口工厂模式

`blueprint.action.execute`（需要 blueprint-action 端口工厂）与 `data.process`（需要 data-processor 端口工厂）。与 `command.execute` / `design.read` 同构：无 factory 即 `CAPABILITY_INCOMPATIBLE`，未授权即 `CAPABILITY_UNAUTHORIZED`。蓝图动作贡献还须把自己的 `requiredCapability` 声明在清单 `capabilities` 里。

### 5. 不引入用户代码执行、不改文档契约

- `actionId` 与 `processorId` 在 canonical 文档里**本来就是不透明字符串**（`COMPONENT_ID_PATTERN` / `VARIABLE_NAME_PATTERN`），因此**本次不修改 `screen-document` schema、黄金产物或解析器**，只扩插件词汇表与执行端口。这是本决策能做小的关键。
- 插件提供的处理器是**同 realm 受信代码**（ADR-0004），不是用户可在界面里编写的脚本。DataV 的"策略脚本"若将来要支持，属于另一个决策（需要沙箱与执行隔离，本 ADR 明确不预支）。

## 后果

- 插件第一次能参与**文档的交互语义**：一个动作可以被蓝图规则引用，一个处理器可以被数据源/变量引用。DataV 的宿主动作、页面导航、数据过滤器由此有了承载面。
- **收紧会暴露此前被掩盖的用法**：任何依赖"任意 `actionId` 直接落到宿主"的现有接入，在升级后若未声明为贡献将开始失败关闭。这是刻意的：那把通吃端口本来就是缺陷。已知当前仓库内只有 harness 的 `harness.*` 用法，会在同一批次内改为声明式。
- `processorId` 从"透传字符串"变为"必须解析"的门禁，可能拒绝既有文档中拼写的未知处理器；迁移策略为失败关闭 + 诊断，不静默降级（与契约层的既有取向一致）。
- 未做（明确推迟）：触发器类型（计时器 / WebSocket 等，需 engine 运行时新增语义）、`processorId` 的用户可编写策略、逻辑组合、以及任何需要访问外部网络的处理器实现（仍归宿主）。
- 验证：`plugin-core` 覆盖两类贡献的身份与 schema 规则；`plugin-manager` 覆盖能力门禁、未声明拒绝、端口缺失即 incompatible；`engine` 覆盖蓝图作者面对已声明/未声明动作的差异；新增外围插件示例真实贡献一个处理器与一个动作，并由 `scripts/browser-harness` 端到端断言"执行发生、处理器确实变换了值、未声明路径失败关闭"。

# ADR-0084: 插件贡献词汇表与信任边界

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0004、ADR-0014、ADR-0015、ADR-0070、ADR-0071、ADR-0072、ADR-0073、ADR-0076（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0029](./ADR-0029-host-managed-material-package-distribution.md)、[ADR-0074](./ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)、[ADR-0075](./ADR-0075-peripheral-plugin-compatibility-policy.md)、[插件与贡献用法](../usage.md)

## 背景

插件主线是一条**逐步生长**的线，没有反转，但夹带两次局部收敛：

- **ADR-0004** 定下最小信任模型与初始四类贡献（`material` / `command` / `dataResourceType` / `blueprintCapability`）：插件是可扩展的，但文档、包名或远程位置都不得加载任意代码；生命周期失败不得让半成品目录对外可见。
- **ADR-0014、ADR-0015 对 ADR-0004 的局部收敛。** 前者把 Manifest 的 API/core 版本字段与依赖区间删掉，只留 identity 与显式 id 依赖（探索期命名规则禁止版本标记；兼容策略需用户明确批准的后继决策）。后者把渲染器与核心所需的查询收进一份**实例级、只读、原子发布**的 runtime contribution authority，而不是暴露 Manager 内部集合。
- **其后四步把贡献面从 `command` 扩出去**：ADR-0070 打开出站 chrome 投影，ADR-0071 补上入站只读 `design.read`，ADR-0072 做面板最小闭环，ADR-0073 允许检查器自定义控件。
- **ADR-0076 把词汇表推到运行时面**（`blueprintAction` / `dataProcessor`），并首次**收紧**既有松口：`host-action` 从"任意 id 通吃"变为"必须引用已声明动作"，`processorId` 从"透传字符串"获得注册表。

本文件把这八份记录中仍然生效的决策收敛为一份现行契约，并给出**当前完整的贡献种类清单**、**能力/授权模型**与信任不变式。被吸收记录保留历史正文，但不再作为新实现的独立依据。

## 决策

### 1. 信任不变式（本主线的地基，ADR-0004）

1. 首个插件模型**只接受宿主显式提供、同 realm、受信的模块实例**，不作任何"能防住恶意代码"的声明。插件仍是同 realm 受信代码：capability 系统限制的是**受支持的 Base Screen 集成点**，不是 JavaScript 的环境权限。文档必须显式写明这条边界。
2. **远程发现与 `dynamic import` 归宿主**，由宿主负责加载、审核与信任来源；Base Screen 自身不 fetch、不 dynamic import。ADR-0029 的物料分发同条规则，面板与检查器控件（见第 4、7 条）复用同一信任模型。
3. 本主线**不引入沙箱、iframe / Worker 隔离、签名市场或不受信执行**。执行隔离、用户可在界面里编写的脚本、插件间组合等一律为明确推迟项（见`## 后果`）。
4. 激活上下文只含实例 id、插件 id、已授予能力与受限端口，**绝不包含 Core command bus、Engine Store、Router、DOM 根、凭证、Cookie、Token 或通用 `services` 对象**。插件不能伪造插件身份或会话，也不能定义新的文档变更类型。

### 2. Manifest 形状与身份（ADR-0014，收敛 ADR-0004 的一部分）

1. Manifest 是**严格可序列化数据**，字段固定为 `id`、`dependencies`、`capabilities`、`contributions`，**不含任何版本或 API 版本字段**。
2. 每条 `dependencies` 只声明目标插件 `id`。Manager 拒绝缺失依赖与依赖环，但**不比较区间、不选择备选候选**。插件 id 是精确、区分大小写的身份，同一候选集合内同一 id 至多一个。
3. 包发布元数据属**分发关注点**，不影响插件身份、Manifest 解析、目录查询或运行期依赖解析。
4. 运行时对象与 Manifest 分离，暴露 `activate`、`deactivate`、`dispose` 三个钩子。Manifest 只承载**声明数据**：没有 handler、渲染回调、模块 URL、凭证、DOM 根、Router、Store 或可执行配置。

### 3. 生命周期与激活语义（ADR-0004）

1. 状态集为 `inactive`、`activating`、`active`、`deactivating`、`failed`、`disposing`、`disposed`。生命周期操作**串行化**；激活按解析后的拓扑序推进，回滚、停用与释放按**成功激活的逆序**执行。
2. Manager 在执行任何钩子前先解析全部候选：经 Plugin Core 解析 Manifest、校验 runtime/manifest 等价、拒绝重复身份与贡献冲突、按显式依赖做确定性拓扑排序、核验宿主批准的能力、并通过注入的**只读 registry 查询**预检物料构造函数。
3. 会话端口在停用、回滚或释放钩子开始前**先行失效**。激活失败回滚已成功插件且不留任何目录；清理失败进入 `failed`，此时只允许释放。释放是终态，完成后**幂等**。
4. 物料目录与插件目录是**每实例不可变快照**，仅在全部必需插件激活成功后**单次提交**发布，并在清理开始前撤销。目录只暴露 `get`、`has` 与有序 `list`，绝不暴露运行时对象、激活上下文、端口或可变注册 API。

### 4. 当前完整的贡献种类清单

八类，`kind` 与字段如下（`?` 表示可选）：

| `kind` | 字段 | 文档 / 作者面引用方 | 门禁与解析 |
| --- | --- | --- | --- |
| `material` | `type`、`tagName` | 文档 `component.type` | 物料身份校验；preflight 经只读 registry 查询解析构造函数 |
| `command` | `id`、`name`、`requiredCapability`、`menus?`、`shortcut?` | 命令面板 / 菜单 / 快捷键 | 需 `command.execute` 授权 + `createCommandPort`；`requiredCapability` 必须在清单 `capabilities` 中 |
| `dataResourceType` | `id`、`name`、`configSchema`、`queryScope?` | 文档 `dataSource.resourceType` | `id` 必须匹配文档变量名模式；`configSchema` 必须是 object schema |
| `blueprintCapability` | `id`、`name` | 蓝图规则能力 | `id` 必须是受支持能力表中 `blueprint` 项；且列入清单 `capabilities` |
| `panel` | `id`、`name`、`tagName` | Designer 左栏 rail | `tagName` 必须是合法 custom element 名；构造函数由宿主 registry 解析；**不新增 capability** |
| `inspectorControl` | `id`、`name`、`tagName` | `editorDescriptor` 字段的 `control: 'custom'` | 同上；Engine 只 `new entry.constructor()`，绝不 `createElement(tagName)` |
| `blueprintAction` | `id`、`name`、`payloadSchema`、`requiredCapability` | 文档 `host-action.actionId` | `id` 必须匹配组件 id 模式；`requiredCapability` 须是受支持的 `blueprint.action.*` 且被授权 |
| `dataProcessor` | `id`、`name`、`configSchema` | 文档数据源 / 变量的 `processorId` | `id` 必须匹配变量名模式；`configSchema` 必须是 object schema |

未知 `kind` 一律失败关闭并报 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN`。

补充约束：

1. 四类既有贡献（material / command / dataResourceType / blueprintCapability）在 ADR-0004 中即为初始集；panel / inspectorControl（ADR-0072 / 0073）与 blueprintAction / dataProcessor（ADR-0076）是后续扩项，**都在同一 `contributions` 数组内、同一份清单校验与同一套冲突检测下**，没有并行通道。
2. `dataResourceType` 的 `queryScope` 只允许字面量 `'resource'`（缺省即组件域、不共享），且仅作声明，不含其它运行时语义。
3. `blueprintAction.payloadSchema` 与 `dataProcessor.configSchema`、`dataResourceType.configSchema` 都是 **object schema**，与物料 props schema 校验同构。
4. `panel` / `inspectorControl` 的 `tagName` 必须是合法 custom element 名，非法即 `PLUGIN_CORE_TAG_NAME_INVALID`；`id` / `name` 走通用标识与显示名校验。
5. 供给侧：`command` 需 `commands` handler 记录、`blueprintAction` 需 `blueprintActions` 记录、`dataProcessor` 需 `dataProcessors` 记录，三者规则完全相同——**缺 handler 或多 handler 都失败关闭**（多出的 handler 报 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN`）。`material` / `panel` / `inspectorControl` 的构造函数则由宿主 registry 端口提供。

### 5. 贡献身份与冲突检测

1. 每种贡献都有稳定身份串，参与**跨插件**冲突检测：`material:<type>`、`command:<id>`、`dataResourceType:<id>`、`blueprintCapability:<id>`、`panel:<id>`、`inspectorControl:<id>`、`blueprintAction:<id>`、`dataProcessor:<id>`。
2. 物料身份冲突报 `PLUGIN_CORE_IDENTITY_CONFLICT`；其余贡献冲突报 `PLUGIN_CORE_CONTRIBUTION_CONFLICT`；同一插件的 Manifest 内重复贡献身份报 `PLUGIN_CORE_CONTRIBUTION_DUPLICATE`。候选集合内重复插件 id 报 `PLUGIN_CORE_IDENTITY_CONFLICT`，重复 id 按稳定顺序 first-wins。
3. 依赖缺失报 `PLUGIN_CORE_DEPENDENCY_MISSING`，依赖成环报 `PLUGIN_CORE_DEPENDENCY_CYCLE`。

### 6. 能力与授权模型

1. 能力表是唯一来源（`plugin-manager` 的 `PLUGIN_CAPABILITY_DESCRIPTORS`）。当前受支持能力：`command.execute`（需 `createCommandPort` 工厂）、`design.read`（需可选工厂 `createDesignReadPort`）、`data.process`、`blueprint.action.execute`，以及 `contracts` 导出的蓝图能力 id 集（标记 `blueprint: true`，可供 `blueprintCapability` 贡献引用）。
2. **未声明、未授权、不受支持三者分别诊断**：Manifest 请求了但宿主未批准 → `PLUGIN_CORE_CAPABILITY_UNAUTHORIZED`；能力不在受支持表中，或能力需要端口工厂而宿主未提供 → `PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`；贡献引用了未列入清单 `capabilities` 的能力 → `PLUGIN_CORE_CAPABILITY_UNDECLARED`。
3. 授权结果的判据是 **"声明 ∩ 授权 ∩ 支持"**：插件只得到三者交集里的能力，`activate(context)` 只看到这批能力对应的端口；未授予 `design.read` 时 `context.designReadPort` 为 `undefined`。
4. `data.process` 与 `blueprint.action.execute` **没有端口工厂**：它们标记"该插件声明的处理器/动作可被执行"，请求方向是**宿主/引擎 → 插件**，由 Manager 路由到插件 handler，与 `command.execute` / `design.read`（插件 → 宿主，需要 factory）方向相反。未在清单 `capabilities` 中声明为能力的动作或处理器不进入可执行集合。
5. 宿主侧单点授权：Manager 是候选解析、能力批准、激活会话生命周期与目录发布的**唯一所有者**；Engine 只做"是否可用"的门禁与作者面呈现，从不直接调用插件函数，也不自行授权。

### 7. 端口、会话与读取语义

1. `command.execute` 对应 `PluginCommandPort.execute({ commandId, args })`，异步、固定命令 id、JSON-bounded 参数，会话由宿主闭包绑定。插件不能伪造身份或会话。
2. `design.read` 对应 `PluginDesignReadPort.read()`，返回**原子快照** `{ document, selectedComponentIds, focusedComponentId }`：文档与选区在同一次调用内取值，避免跨两次读取拼出撕裂状态。快照是 JSON 往返得到的**私有深冻结副本**，写入不触及 canonical 文档；只做按需读取，**不做变更通知**（订阅引入生命周期、背压与取消承诺，确有需求时另立决策）。端口保持异步，便于跨 realm 代理满足同一形状。
3. `base-screen-designer` 提供公开只读 `selection`，返回 core 既有的 `ScreenInteractionState`，宿主不再靠事件重放重建选区。
4. `blueprintAction` 与 `dataProcessor` 由宿主端口执行（`BaseScreenPluginBlueprintActionPort.execute` / `BaseScreenPluginDataProcessorPort.apply`）。**Engine 不直接调用插件代码**：执行一律经端口，插件 handler 在 Manager 侧运行，受激活会话与授权门禁约束。
5. 面板与检查器控件的构造函数在 preflight 经宿主 registry 解析，同 realm ABI，解析失败即**激活失败关闭**（与 material 同一规则），避免静默少渲染。
6. **`host-action` 从"任意 id 通吃"收紧为"必须引用已声明动作"**：宿主端口收到未声明的 `actionId` 必须失败关闭并产生诊断。**`processorId` 获得注册表**，未声明即解析阶段失败关闭。两处都是行为收紧，与"声明 ∩ 授权"模型保持一致。`actionId` 与 `processorId` 在 canonical 文档里本来就是不透明字符串，因此本主线**不修改 `screen-document` 契约、黄金产物或解析器**。

### 8. 实例级 runtime contribution authority（ADR-0015）

1. `@base-screen/plugin-core` 拥有只读的运行时贡献权威接口，含数据资源类型查询与蓝图能力成员判定；ADR-0076 起扩展出按 id 查询/枚举已声明的蓝图动作与数据处理器（枚举方法可选，消费方须容忍缺失）。
2. Manager **仅在全部插件成功激活后**从 active 插件目录派生该权威，并与物料、插件目录**原子发布**。权威只含**脱离原对象的贡献数据与已授予能力 id**，绝不含插件运行时对象、handler、resolver、端口、URL、凭证、文档或宿主对象。
3. Renderer 与 Viewer 经 Plugin Core 接口消费，不 import Manager、不探视目录内部。停用与释放撤销 Manager 当前快照；**此前取得的权威保持惰性只读数据，不会获得生命周期能力**。运行期校验因此可以失败关闭，且不需要全局注册表或跨实例缓存。

### 9. 贡献面的四处外延（ADR-0070 / 0071 / 0072 / 0073）

1. **chrome 投影（出站）**：`kind: 'command'` 的 `menus` 只允许 `commandPalette`、`menu.tools`、`context.canvas`、`context.component`、`context.multi` 五个字面量；省略 `menus` 时仅出现在命令面板（零回归），写出的 `menus` 是完整列表，`menus: []` 表示 handler 存在但不投影。未知 menu、重复 menu、非法 `shortcut` 形状失败关闭；`shortcut` 永不覆盖内建操作、别名或工具 chord，目录内重复 chord 按贡献 id 稳定排序后者丢弃（命令仍可经菜单或面板调用）。菜单项用 `data-plugin-command`，**不得**用 `data-menu-action`（避免进入 `DesignerOperationRegistry`）；点击走与命令面板同一路径。
2. **面板（ADR-0072）**：`kind: 'panel'` 只覆盖 Designer 左栏**一处位置**，元素挂在宿主分组之后并保持容器末尾。面板 `model` 直接复用 ADR-0071 的设计快照，不新增状态类型。经 `base-screen-plugin-panel-action` 回传 `{ panelId, commandId, args }`，Engine 用绑定时已知的 `panelId` 做一致性拒绝后路由到该插件自己的命令。**面板路径允许真实 `args`**，chrome 路径继续 `args: null`。刷新挂在 `emitChange`（提交/撤销/重做/替换文档，不经 `renderInteraction`）与 `renderInteraction`（选区变化）两点，并按"文档代际 + 选区"指纹去重赋值以避免抖动。
3. **检查器自定义控件（ADR-0073）**：控件联合新增 `custom` 与 `tagName`（`tagName` 仅在该控件下合法，其余控件携带即失败关闭）。**授权与实例化解耦，授权依据是贡献而非注册**：宿主 registry 注册过某标签不构成授权；Engine 只能 `new entry.constructor()`，**绝不 `createElement(tagName)`**；物料清单引用了未被任何插件贡献的标签时渲染可见降级提示且不进入写回路径。控件读回值必须经 `parseScreenJsonValue` 校验，非 JSON-safe 返回视为未编辑。**只允许 `target: 'props' | 'style'`**，不放宽 `data`（绑定字段仍只能 `field-selector`）与 `interaction`。
4. 以上四处都**不新增贡献种类**（新增 `panel` / `inspectorControl` 是词汇表扩项，chrome 投影则明确不新增 kind），都不给插件 DOM 根、Store 或通用服务，也都不把 command 写入第 8 条的运行期权威索引。

### 10. 与产品定位、宿主职责和外围插件的边界

1. 新增贡献类型**不改变产品定位**（ADR-0027）：Base Screen 只把"有这个动作 / 处理器 / 资源类型"变成文档与作者面可引用的东西，**实际发生什么由宿主决定**。它不因 `dataProcessor` 或 `blueprintAction` 获得任何后端、队列、持久缓存、业务降级或网络职责；连接、聚合、脱敏、长任务仍归宿主。
2. capability 只限制 **Base Screen 集成点**，不限制 JavaScript 环境权限；这是第 1 条不变式的直接推论，也是本主线一切"信任"讨论的前提。
3. 外围插件（`plugins/*`，ADR-0074）**无运行时特权**：走与宿主插件相同的宿主提供 / 宿主加载 / 宿主授权通道，不新增信任通道。`plugins/*` 可依赖 `packages/*` 的公共导出，反向禁止；分区不适用于本主线的能力模型与冲突检测，二者规则一致。
4. 兼容性策略（ADR-0075）建立在本主线既有诊断之上：`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE` / `PLUGIN_CORE_CAPABILITY_UNAUTHORIZED` / `PLUGIN_CORE_CONTRIBUTION_UNKNOWN` 等码即"插件声明超出宿主支持面"的可观测出口。

## 后果

- 贡献词汇表已从"四类作者面 + 资源类型"长到八类，覆盖**作者面**（material / panel / inspectorControl）、**资源类型**（dataResourceType）、**chrome 触发**（command）与**文档运行时语义**（blueprintAction / dataProcessor）。宿主与插件作者可以用声明式手段接入现有 Designer chrome 与蓝图/数据链路，而不打开任意 UI 面或代码执行面。
- Engine 始终不依赖 plugin-manager；变更插件集合仍须 `unload()` 后重新 `configure()`。Renderer 与 Viewer 只经 Plugin Core 接口消费权威，包依赖图保持不变。
- **收紧会暴露此前被掩盖的用法**：依赖"任意 `actionId` 直接落到宿主"或"未知 `processorId` 透传"的现有接入，升级后未声明即失败关闭。这是刻意的，迁移策略为失败关闭 + 诊断，不静默降级。
- 面板可见性目前等价于"宿主是否激活该插件、registry 里是否有该标签、是否传入 `pluginPanels`"；宿主无法在不激活插件的前提下单独禁止面板，需要更细粒度时再加 capability。
- 快照按读取次数做 JSON 深拷贝，成本随 canonical 文档体积增长；文档体积由 `contracts` 的字节上限约束，且读取只发生在用户动作触发时。
- **明确推迟（非目标，不在本主线授权范围内）**：执行隔离与沙箱；用户可在界面里编写的脚本 / 策略代码；插件间组合与逻辑组合；触发器类型（计时器 / WebSocket 等需 Engine 运行时新增语义）；订阅式状态观测；`when` 语言、工具栏、任意 DOM 注入、视图注册表、SlotMap 与具名槽位协议；需要访问外部网络的处理器实现（仍归宿主）；`data.process` / `blueprint.action.execute` 之外的多能力门控；以及任何形式的版本或兼容性设计（须用户明确批准的后继决策）。
- 验证落点：`plugin-core` 覆盖 Manifest 与各贡献的身份、字段、schema 规则；`plugin-manager` 覆盖依赖排序、冲突、能力交集、未声明拒绝、端口缺失即 incompatible、会话失效、回滚、终态释放与双实例隔离；`engine` 覆盖 chrome 投影、面板归属拒绝与刷新指纹、检查器授权与写回；`scripts/browser-harness` 端到端跑真实 UI，并以反向对照确认断言能抓到错误实现。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0004 插件生命周期、贡献与信任边界 | 第 1、2、3、5、6、7 条：同 realm 受信代码、capability 限制集成点而非 JS 权限、远程发现归宿主、不引入沙箱；Manifest 只承载声明；七态生命周期与串行/逆序语义；端口先失效、失败回滚、目录单次提交且只读 | 主体被吸收，状态标为已取代；其中"同 realm 受信、无沙箱"的不变式由本文件完整承载 |
| ADR-0014 Manifest 仅承载 identity | 第 2 条：无版本字段、依赖只声明 id、不比较区间、插件 id 精确且唯一、包发布元数据不参与身份 | 整体吸收（原本已取代 ADR-0004 的版本与依赖区间部分），状态标为已取代 |
| ADR-0015 实例级 runtime contribution authority | 第 8 条：只读权威接口、激活成功后派生并原子发布、只含脱离数据与已授予能力 id、撤销后惰性 | 整体吸收，状态标为已取代 |
| ADR-0070 command 的 chrome 投影 | 第 9 条第 1 项：`menus` / `shortcut` 字段、五个 menu 字面量、`data-plugin-command`、args 语义、不新增 kind | 整体吸收，状态标为已取代 |
| ADR-0071 设计上下文只读访问 | 第 6 条第 3 项、第 7 条第 2、3 项：`design.read` 与原子快照、私有深冻结副本、按需读取不做通知、公开 `selection` | 整体吸收，状态标为已取代 |
| ADR-0072 面板贡献最小闭环 | 第 4、6、7、9 条：`kind: 'panel'`、复用物料信任模型且不新增 capability、复用设计快照、动作事件与 `panelId` 归属拒绝、真实 args、左栏一处位置与两条刷新点 | 整体吸收，状态标为已取代 |
| ADR-0073 检查器自定义表单控件 | 第 4、6、7、9 条：`control: 'custom'` 与 `tagName`、`kind: 'inspectorControl'`、授权依据贡献而非注册、Engine 只 `new` 不 `createElement`、只绑 `props`/`style`、`parseScreenJsonValue` 校验 | 整体吸收，状态标为已取代 |
| ADR-0076 蓝图动作与数据处理器 | 第 4、6、7、8、9 条：`blueprintAction` / `dataProcessor` 两类贡献、两个宿主端口、`blueprint.action.execute` 与 `data.process` 能力、`host-action` 收紧、`processorId` 注册表、不改文档契约 | 整体吸收，状态标为已取代 |

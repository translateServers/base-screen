# 安全与插件运行时

> 返回[当前能力基线](./README.md)。
> 最近更新：2026-09-20（插件激活失败归因细化）。


- **远程插件 Sandbox**：不可信 iframe 插件协议、来源校验、能力缩减与跨 origin transport。
  依据：[Remote Plugin Sandbox](../specs/archive/remote-plugin-sandbox/spec.md)、[ADR-0009](../decisions/ADR-0009-remote-plugin-sandbox-cross-origin-transport.md)。
- **插件生命周期与权限**：候选预检、依赖解析、能力授权与实例级 contribution authority。
  依据：[Plugin Manager Runtime](../specs/archive/plugin-manager-runtime/spec.md)、[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)。
- **贡献命令与 Core 命令端口**（2026-09-06 增量）：runtime 可选 `commands` 必须与 Manifest
  `command` 贡献一一对应；Manager `executeContributionCommand` 在 active 会话内分发。
  Designer 可选 `pluginCatalog` / `pluginCommandPort` 把已授权命令列入命令面板；插件经
  `command.execute` 拿到的 Core adapter 只能编排已有 `ScreenDocumentCommand`。该入站写入自
  2026-09-09 起由 browser-harness 端到端行使（此前仅有实现与文档，无调用方接线）。
  Renderer contribution index 不增加 command 查询。plugin-sdk 提供 `createPluginPackage`。
- **诊断规范序与贡献类型词汇单一化**（2026-09-16，整合：对外契约零破坏、纯新增导出）：
  诊断排序收敛为 `contracts` 独占的 `compareScreenDiagnostics` / `sortScreenDiagnostics`，
  删除四份逐行复刻的本地实现；同时修掉三处已发生的分歧——renderer 与 `contracts` dataset 模块
  的 `path.join('/')` 字符串排序（会使 `['components',10]` 排在 `['components',2]` 之前，属可观测
  顺序变更，已单独登记 changeset）、以及 plugin-manager 预检的「按路径长度优先」第三种规则。
  诊断的上限哨兵保持各调用方原有语义（Contracts 相位感知、Plugin 侧路径为空），未合并。
  贡献类型词汇收敛为 `plugin-core` 内的 `ContributionKindDescriptor` 单一实现落点，`validateContribution`
  由 205 行 switch 改为查表；plugin-manager 新增以 kind 联合类型为键的穷尽式
  `CONTRIBUTION_KIND_PLAN`（漏项即编译失败），三个近似的 `collect*` 收敛为一个参数化收集器，
  贡献身份与 handler 对应关系各自只剩一份实现；`plugin-sdk` 的 handler 读取器删除改为委派。
  对外只新增窄行为接口（kind 联合类型、handler 字段/声明 id/身份查询、共享 handler 读取器）
  与两个身份词法谓词 `isScreenComponentId` / `isScreenVariableName`，替换三处本地正则字面量。
  该批次曾留下两处不对称：`PLUGIN_CORE_CAPABILITY_UNDECLARED` 只对 `command` 报告、
  懒激活只合并命令 handler，两者均已由下面的 2026-09-17 增量关闭。
  词汇与边界见 [领域词汇](../../CONTEXT.md)、[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)。
- **运行期贡献的懒激活可达性与声明门单一化**（2026-09-17，行为变更：已声明贡献从不可达变为可达）：
  两类运行期贡献在 `activation: 'lazy'` 下恢复可达。原因不是缺一个 `if`，而是 eager 激活与懒激活
  各写了一份 handler 合并逻辑：eager 合并 command / blueprintAction / dataProcessor 三类，懒激活
  只合并 command，于是已声明、已授权、在作者面可见的动作与处理器，执行时按"未声明"失败关闭。
  现在三个 Map 收进一个 `ContributionHandlerRegistry`，两条激活路径共用同一份合并实现，懒激活
  索引（贡献 id → 声明插件）与可执行集合读同一份判定，因此"会为它触发懒激活"与"激活后真能执行"
  不再有两种答案。三类贡献的首次使用（命令、蓝图动作、数据处理器）都会按依赖拓扑序唤醒其插件。
  同批关闭第二处不对称：`PLUGIN_CORE_CAPABILITY_UNDECLARED` 改为对**所有声明了能力字段的 kind**
  报告，判据来自 `plugin-core` 贡献类型描述符的 `capabilityField`（经新增窄接口
  `contributionCapabilityField` 读取），manager 计划表里那份重复的 kind 清单随之删除——
  `blueprintAction` 的声明校验缺失正是两份清单漂移的产物。对外只新增该一个窄接口。
- **共享 JSON 相等、数据源校验入口与层级查询接缝**（2026-09-16，整合：对外仅新增导出）：
  结构化 JSON 相等收敛为 `contracts` 的 `screenJsonEquals`，删除 core 内部 `equality.ts`、renderer
  `jsonEquals` 与 plugin-sdk `areEqual` 三份同语义实现（三者逻辑一致，比较结果不变）；
  plugin-manager 预检的自有数据属性相等**有意保留**——它回答的是「运行时对象是否等于其规范化结果」，
  只读自有数据属性并纳入不可枚举键，与 JSON 相等是不同问题。数据源校验新增
  `contracts` 的 `parseScreenDataSource`：engine 两处不再为校验一个字段手工拼装整份
  `ScreenDocument`（判定仍走同一文档校验路径，诊断相对数据源；信封是** relocate 而非消除**——
  彻底移除需重做组件级失效关闭诊断，属重设计）。层级接缝加宽：`core` 公开
  `ComponentIndex` 与 `getRootIds` / `getAncestorIds` / `getAncestorDepth` / `getDescendantIds` /
  `getDescendantSet`；engine 的 `selectionSubtree`（结果集与文档序不变，另获环保护与索引缓存）
  与 `groupEditingPath`（根优先名称路径不变，保留悬空祖先即停）已转换；renderer 的隐藏判定含
  session 覆盖语义、inspector 的后代遍历是广度优先（共享查询为深度优先，转换会改变可观察顺序），
  故这两处**有意不转换**。见 [领域词汇](../../CONTEXT.md)。
- **贡献命令 chrome 投影**（[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：
  `command` 贡献可选 `menus` / `shortcut`。省略 `menus` 仅命令面板；写出的 `menus` 为完整列表。
  Designer 投影到命令面板、更多→工具与画布右键，菜单项使用 `data-plugin-command`。快捷键不得覆盖
  内建 chord。不新增 contribution kind，不扩展 ADR-0084 index。
- **插件设计上下文只读访问**（2026-09-09，[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：
  新增 `design.read` 能力；授予且宿主提供 `createDesignReadPort`（可选 manager 入参，缺工厂则失败
  关闭）后，`activate(context)` 拿到 `context.designReadPort`。`read()` 返回同一次调用内取到的原子
  快照 `{ document, selectedComponentIds, focusedComponentId }`，是 JSON 往返后的深冻结私有副本，
  写入不触及 canonical 文档。只做按需读取，不提供变更通知，也不开放订阅或任意状态查询。
  `base-screen-designer` 新增公开只读 `selection`，返回 core 既有 `ScreenInteractionState`，
  不新增类型或跨包导出。贡献命令 handler 由此可先读现状再写回可撤销事务。
- **插件面板贡献**（2026-09-10，[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：
  新增 `kind: 'panel'` 贡献（`id` / `name` / `tagName`），构造函数由宿主 registry 解析，与物料同一信任
  模型，解析不到即激活失败关闭。Designer 把面板挂在左栏宿主分组之后并保持容器末尾（否则会静默改变
  rail 键盘导航顺序），写入与 `designReadPort` 同形的快照作为 `model`，只在文档代际或选区变化时重新
  赋值；刷新同时挂 `emitChange` 与 `renderInteraction`，因为文档提交不经后者。面板经
  `base-screen-plugin-panel-action` 回传 `{ panelId, commandId, args }`，Engine 校验归属后派发到该插件
  自己的贡献命令——这是唯一放开真实 `args` 的路径，chrome 触发仍为 `null`。不引入 `when`、工具栏、
  任意 DOM 注入或具名槽位协议。
- **属性面板插件自定义控件**（2026-09-10，[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：
  editorDescriptor 字段可用 `control: 'custom'` + `tagName` 绑定 `props`/`style` 路径；控件由
  `kind: 'inspectorControl'` 贡献声明、plugin-manager 在 preflight 从宿主 registry 解析为
  `snapshot.inspectorControls`，解析不到即激活失败关闭。**授权依据是贡献而非注册**：Engine 只
  `new entry.constructor()`，绝不 `createElement(tagName)`；未授权标签渲染为降级提示且不进写回路径。
  控件与内建控件同形（宿主写 `model`，控件派发 `change`，宿主读 `value`），因此复用
  `update-components` props/style 事务，撤销与 dirty 语义自动继承；读回值必须 JSON-safe，否则视为未编辑。
  不放开 `data`/`interaction` target，不提供变更订阅。已知盲区：`validateControlForSchema` 对无法解析的
  path 提前返回，因此绑到不存在的 props 路径不会在校验期报错（既有行为，对所有控件一致）。
- **数据资源类型作者面承载**（2026-09-12，[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md) R9）：
  `kind: 'dataResourceType'` 贡献进入 Engine 作者面——运行时贡献索引支持 `listResourceTypes()` 枚举，
  属性面板宿主资源数据源以授权类型选择器呈现（索引不可枚举时回退文本输入），事务期与渲染期继续按
  `configSchema` 校验参数。`dataResourceType` id 收敛到文档 `resourceType` 命名模式
  （`VARIABLE_NAME_PATTERN`，由 contracts 导出），不满足模式的清单在解析期失败关闭，杜绝
  "作者期合法、提交文档才失败"的裂缝。渲染器侧补齐未知资源类型 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN`
  的回归测试。
- **插件注册编排与可选端口**（2026-09-12，[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md)）：
  `@base-screen/plugin-sdk` 新增 `createPluginRegistration`——创建期完成输入校验、runtime 规范化与
  计划内 tag 冲突检查，`define()` 先对注册表做整体冲突预检（任何冲突发生在第一个 define 之前，
  同构造函数重放视为幂等），随后统一注册插件包物料、宿主物料与面板/控件元素，返回值直接作为
  `createBaseScreenPluginManager` 的 `plugins` 与 `standaloneMaterialTagNames`。宿主不再手工维护
  "注册一处、清单一处"的两份账，也不再自建冲突校验；类型/身份级冲突仍由 manager preflight 裁决。
  `createCommandPort` 选项真正可选：缺键与显式 `undefined` 同义，仅授予 `command.execute` 时才需要
  提供工厂。
- **插件失败爆炸半径收敛**（2026-09-12，[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md)）：
  激活原子性从"全部插件整体回滚"收敛为**每插件原子**——可归因到单插件的预检失败（清单解析、
  能力授权、registry 解析、跨插件冲突）只排除该插件；跨插件冲突按稳定顺序 first-wins，后声明方
  失败；运行期 `activate()` 失败只失效自身会话并级联其声明依赖方，已激活插件与核心目录不受影响。
  `snapshot.failures` 逐插件记录 `{ index, pluginId, diagnostics }`；宿主自营物料
  （`standaloneMaterialTagNames`）解析失败仍是全局门，整体保持未激活。宿主如需"全或无"语义，
  可在 activate 后检查 `failures` 并自行 deactivate。
- **插件懒激活**（2026-09-12，[外围插件分区 Spec](../specs/archive/peripheral-plugin-partition/spec.md)）：
  `createBaseScreenPluginManager` 新增 `activation: 'lazy'` 模式与 `ensureActive(pluginId)`。
  lazy 模式下 activate() 只完成预检与目录发布（授权语义与 eager 完全一致，目录与命令面板立即可见），
  插件 activate 钩子推迟到其贡献命令或面板动作首次经 manager 使用时按依赖拓扑序运行，
  也可由宿主显式 ensureActive。懒激活失败记入 snapshot.failures 并失败关闭、拒绝重试；
  deactivate 只回收真正运行过的插件。eager 行为保持缺省不变。

- **插件运行期贡献**（2026-09-14，[ADR-0084](../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)）：
  新增 `kind: 'blueprintAction'` 与 `kind: 'dataProcessor'` 两类贡献，使插件首次能参与**文档的运行时
  语义**，而不只是作者面。此前两处是"声明侧存在、供给侧缺失"：`processorId` 只是透传给宿主的字符串
  （无任何注册表），`host-action.actionId` 既无注册表也无授权（宿主自由解释任何 id）。现在两者都必须
  引用已声明贡献，未声明失败关闭（`PLUGIN_CORE_CONTRIBUTION_UNKNOWN`）；`blueprintAction` 的
  `requiredCapability` 走"声明 ∩ 批准 ∩ 支持"，与 command 一致。两项能力（`data.process`、
  `blueprint.action.execute`）都是**宿主→插件**方向，因此无端口工厂——manager 经
  `executeBlueprintAction` / `applyDataProcessor` 路由到插件自己的 handler 记录，Engine 永不直接调用
  插件代码（ADR-0029）。**未修改 screen-document 契约**：两个 id 本就是既有模式下的不透明字符串，
  schema、黄金产物与解析器均未变。插件仍是同 realm 受信代码（ADR-0084），不引入用户脚本执行与沙箱，
  数据加工职责仍归宿主（ADR-0027）。示例见 [`plugins/plugin-pipeline`](../../plugins/plugin-pipeline)。
- **插件激活失败归因细化**（2026-09-20）：运行期激活失败不再把“会话装配失败”与“插件钩子抛错”
  收敛到同一条通用文案。两类稳定诊断——`Plugin activation session setup failed.`（宿主端口工厂或
  管理器的端口校验抛错，插件代码尚未运行）与 `Plugin activation hook failed.`（插件自己的
  `activate` 抛出或拒绝）——让宿主可直接从 `snapshot.failures` 判断失败发生在环境接线还是插件代码。
  eager 与懒激活改用同一份尝试实现，归因不会在两条路径间漂移。爆炸半径与最小披露边界均不变：
  单插件失败仍只排除自身并级联其声明依赖方；被捕获 error 的 message、name、stack 仍不进入诊断、
  快照与结果。

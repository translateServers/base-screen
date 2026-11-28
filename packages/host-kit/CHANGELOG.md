# @base-screen/host-kit

## 0.3.0

### Minor Changes

- 3d0f236: 蓝图级联模拟下沉 `core`（ADR-0115 D6）。

  - `core` 新增 `simulateScreenBlueprint(document, event, options)` 与 `SCREEN_BLUEPRINT_SIMULATION_MAX_DEPTH`：从一个事件出发逐次分派，变量值改变后分派它的 `data-updated`，从画布开合与页面导航按查看器的顺序级联；请求类动作只登记。结果给出每次分派的轨迹、级联超限或求值失败，以及模拟结束时变了的变量、显隐变了的组件、引用变量且求值结果变了的数据源参数。纯函数，不取数、不调宿主动作。
  - `engine`：蓝图工作台的「模拟」改用它，轨迹与原先一致。
  - `host-kit`：筛选联动采纳前，按画像样本逐个取值造来源事件交给 `simulateScreenBlueprint`，看目标实例参数会不会变成不同的合法取值；页签（`tabChange.value`）与数值类（`valueClick.value`）负载也纳入模拟，不再记「未模拟」。

- cb20d1f: 文档级集合的按 id 局部命令与提案单元分组提示（ADR-0115 D4、D5）。

  - `core` 新增六条命令：`add-data-sources`、`update-data-source-params`（合并参数，`null` 删除）、`add-variables`、`remove-variables`、`add-blueprint-elements`、`remove-blueprint-elements`（删节点连带删掉接在它上面的连线与布局位置）。只动点名的项，其余原样保留；新增遇到已有 id、删除 / 更新遇到不存在的 id 都失败；引用完整性仍由文档校验把关。整体替换命令不变。
  - `engine`：`DesignerChangeProposalInput.groups` 可选分组提示（`label`、`commandIndexes`、`notes`），按它拆采纳单元；分组须恰好覆盖全部命令、互不重叠、每组能单独成立，否则忽略提示走默认拆分，整屏替换仍不拆。单元新增 `notes`，评审面逐行列出（文档级变化没有组件差异行时靠它说明）。新增 `remainingChangeProposalInput`，采纳 / 忽略一个单元后分组下标随剩余命令重排。
  - `host-kit`：`editIntent` 改用上述局部命令写联动（不再整体替换变量、数据源与蓝图），版面与联动都变了时返回 `groups`（「版面与内容」「联动」，联动组带新增 / 去掉的说明）。`IntentEditCommand` 去掉三条整体替换命令，新增六条局部命令；新增 `IntentEditGroup`。

- 82cdf39: 状态外观预置下沉 `core`，MCP 补行为工具（ADR-0115 D8、D10）。

  - `core` 新增 `screenStatePresetStyle(source, tone)` 与 `ScreenStatePresetSource`：给语义色调算出状态要覆盖的样式键（清单声明的 `statePresetKeys` 优先，否则推断主色、描边色与 `danger` 时的发光），规则与原先 engine 的一致。
  - `engine`：`designerStatePresetStyle` 改用 core 的规则；新增公开的 `readDesignerStatePresetSource(manifest)`，从外观区读出键表。
  - `host-kit`：`IntentCatalogMaterial.statePreset` 可选；阈值状态按它生成外观，与设计器「按分级生成状态」一致，缺省退回只换文字色。三端示例宿主的目录摘要带上键表。
  - `tooling/screen-mcp-server`：`compile_screen_intent` 接受 `capabilities` 与数据集样本 `values`，返回编译出的 `behaviors`，说明里写明联动、阈值状态与 `gaps`；新增 `simulate_blueprint`（一个事件及其级联的模拟，返回各层触发的规则与结束时变了的变量、显隐、数据源参数）。冒烟检查更新为 17 个工具。

- 2dd17d3: 行为生成补齐 ADR-0115 D2 推迟项，修复浏览器核对中发现的问题。

  - `host-kit`：
    - 筛选联动支持 `reset: true`（再点同一项恢复原值，编译成蓝图条件分支）；
    - 新增「设状态」联动 `{ kind: 'state', from, event, to, state }`，按状态名或色调指向指标已声明的状态，`reset` 恢复按判定显示；
    - 指标状态支持 `{ source: 'level-scale' }`，按引用数据集上宿主给的 `levelScales` 生成，没有分级表时不编译并记 `AGENT_STATE_LEVEL_SCALE_UNAVAILABLE`；
    - `IntentBehaviorSummary.kind` 增加 `set-state`；会话摘要带上指标已有的状态名；
    - 局部修改里指标阈值的简写（`rules` / `suggested` 写在 set 顶层、`states` 写成数组）折成 `states`。
  - `engine`：草案层渲染时带上变量取值（画布已有的沿用当前值，草案新增的取初值），智能体生成的联动参数在草案上不再报「变量没有值」。

- e6e049d: `host-kit` 意图层能生成行为：联动与阈值状态（ADR-0115）。

  - IR：块与指标卡可带 `key`（联动引用的句柄）；根上的 `interactions` 不再是预留键，支持两种模板——`filter`（来源事件的值写进目标块数据集的查询参数）与 `show`（来源事件显示 / 隐藏 / 切换目标块）；绑了数据集字段的指标卡可带 `states`（阈值规则，`suggested` 标记模型补的阈值）。变量与蓝图由编译器推出，模型不写。
  - 编译：`compileScreenIntent` 编出静态变量、目标实例参数改为引用变量、蓝图节点与连线、组件状态（按结果第一行判定，命中时文字色换成语义色位）；`show` 模式的目标初始隐藏。新增 `capabilities` 入参：给了已授权的蓝图能力表时，缺能力的联动不编译并记 `AGENT_INTERACTION_CAPABILITY_MISSING`。编译结果新增 `behaviors` 摘要。
  - 采纳前模拟（静态）：用画像样本里该字段出现过的取值判断「点了之后参数会不会变」，不会变或取值不合法记 `AGENT_INTERACTION_NO_EFFECT` 进修复回环；来源 / 目标 / 事件 / 字段不成立的诊断同样进修复（`BEHAVIOR_REPAIRABLE`）。目标数据集的必填参数没有默认值时，从来源样本的第一个合法取值起步（`INTENT_FILTER_INITIAL_FROM_SOURCE`）。
  - 数据上下文：数据集引用新增 `values`（样本里各字段出现过的取值，只留在宿主里）；`validateIntentData` 对参数引用静态变量的实例按变量初值验证。
  - 多轮：`editIntent` 支持 `link` / `unlink` 操作与指标卡的 `states` 修改；删除块时连带去掉以它为来源的联动。联动变化只换智能体生成的那部分变量（`agent-var-*`）与连线（`agent:*` 节点、`agent-edge-*` 连线），用户自己连的不动；命令按「变量扩成并集 → 数据源 → 组件 → 变量收拢 → 蓝图」排序。基线新增可选的 `variables` / `blueprint`。`describeSession` 带出句柄与当前联动。
  - 官方物料的编辑器描述符补上事件负载声明（`payloadSchema`）：表格与滚动表 `rowClick`、表格 `cellClick`、图表 `pointClick`、页签 `tabChange`、翻牌器与水位图 `valueClick`。

- 59747d6: `host-kit` 新增智能体意图层的确定性编译器（ADR-0113 S2），自示例后端 `agent-compose.ts` 行为等价迁入：

  - `compileScreenIntent({ intent, catalog, references?, mode?, stream? })`：目录驱动，把 `ScreenIntent` 编成文档草稿。类型一律来自目录，样式起点是物料默认样式、只叠加设计令牌，表格写示例数据标记 + 绑定角色，素材与数据集落成数据源实例。字号不低于 core 的可读下限。
  - 来源表：随产物返回「组件 id → 模型原文路径」，供修复回环把文档诊断翻译回模型写的那一处；组件 id 与层级仍按位置分段，流式帧之间不漂移。
  - 流式：`stream` 帧按骨架一次算定全部几何，未到的格子画占位框，内容到达后原地填充。
  - `formatKpiValue` / `formatKpiDelta`：指标数值与增减量的统一格式（万 / 亿折算、千分位、百分点）。
  - `resolveIntentStyle` 与四套风格预设（`INTENT_STYLE_PRESETS`）。
  - 依赖：`host-kit` 新增对 `@base-screen/core` 的依赖（仅取可读字号下限），对外发布面不变——单包 `base-screen` 构建期内联。
  - 目前只编译「一条指标带 + 一条栅格」；`split` 与其他区域顺序返回 `INTENT_LAYOUT_UNSUPPORTED`，待布局求解器接手。

- 1b34cf4: `host-kit` 的意图层编译器输出「外壳 + 原子物料」的组合（ADR-0113 S4）：

  - 一张指标卡、一个块各编成一个外壳（目录里声明了 `children` 的容器物料）加上它的底板、标题、说明、主体；外壳是整体移动、复制、删除的把手，图层里是一个可折叠的组。子组件的 `parentId` 指向外壳，位置仍是画布绝对坐标。
  - 目录形状 `IntentCatalogMaterial` 增加可选的 `children`。外壳是编译器的组合手段：解析会拒绝把它当块类型，底板挑选也会排除它。
  - 目录里没有可用外壳时退回平铺，并在产物的告警里写 `INTENT_SHELL_UNAVAILABLE`，不静默降级。
  - 组件 id 不变：外壳占该来源的第 0 个，其后是底板与文字（`agent-kpi-0-0` 是外壳，`agent-kpi-0-1` 是底板）；流式落稿时外壳与底板先到、内容后补，已有组件的 id 与几何不变。

- 202ad20: `host-kit` 新增智能体意图层的类型与解析（ADR-0113 S1）：

  - `ScreenIntent`：模型产出的「这屏讲什么、怎么分区、每块用什么」。区域分 `band`（指标条）、`grid`（四列栅格）、`split`（主区 + 侧栏），块的取值归一成 `table / dataset / text / asset / none` 的判别联合。没有版本字段，演进靠加可选键。
  - `parseScreenIntent(input, { catalog })`：宽容解析，认区域写法与平铺的 `kpis + blocks` 写法。单项瑕疵只降级该项（裁行、丢未声明的参数、截断文案、丢弃坏块），整份不可用才返回 `intent: undefined`；`panels`、两种写法混用一律拒绝；`pages / facts / variables / interactions / states` 为预留键，出现时只提醒并忽略。
  - `parseIntentKpi` / `parseIntentBlock`：单项解析，供流式逐项出帧使用。
  - 每个指标与块带 `origin`（它在模型原文里的路径），丢弃坏项之后修复提示仍能指回模型自己写的那一处。
  - `IntentCatalog`：意图层看到的纯 JSON 组件目录，`host-kit` 不依赖物料契约。

- bc7613e: `host-kit` 新增智能体意图层的布局求解器与区域编译（ADR-0113 S3）：

  - `solveLayout(regions)`：纯函数，区域序列 + 每格的内容量（指标个数、每块占几列、是不是数据型）→ 像素矩形，或容量冲突。区域三种：`band`（一排等宽指标卡）、`grid`（四列栅格，行内 span 补齐）、`split`（主区 + 侧栏，比例 `wide-narrow` / `even`，侧栏可在左在右，纵向堆叠）。区域之间从上到下排，指标带固定高度，其余按内容权重分剩余高度。
  - 装不下返回 `LAYOUT_CAPACITY_EXCEEDED`（带区域在模型原文里的路径、需要与可用的像素），不硬塞；指标带的卡片不得窄于 240px。
  - `compileScreenIntent` 改按区域排版：区域写法的组件 id 带区域序号（`agent-r1-m0-0`），来源表指回模型原文路径（`regions[1].main[0]`）；平铺写法的 id 与几何保持不变。
  - 流式骨架改为区域序列（`IntentSkeleton`），平铺写法用 `flatSkeleton(kpis, blocks)` 构造；流式帧按位置路径给内容（`IntentStreamFrame.kpis` / `.blocks`）。
  - 区域类型 `IntentBand` / `IntentGrid` / `IntentSplit` 增加 `origin`（区域在模型原文里的路径）。

- f85f1ad: `host-kit` 意图层补齐宿主前端整条链（ADR-0113 S5）：

  - `prepareIntent({ output, catalog, references?, mode })`：模型原文 → 解析 + 编译，一并给出值得请模型修的诊断（解析丢掉的项、版面放不下的 `LAYOUT_CAPACITY_EXCEEDED`、列满足不了绑定角色的空图，按模型原文路径）、告警，以及「问题只在个别项、其余可用」的 `deliverable`。
  - `mapDocumentIssues` 把版面审计 / 引擎拒绝的文档诊断按来源表翻回模型原文路径；`repairKey` 判断同一组诊断是否原地打转。
  - `createIntentStreamAssembler(catalog)` 与 `parseIntentSkeleton`：把后端推来的骨架与逐项内容接成编译器吃的流式帧；骨架一经接受不再变，几何从第一帧起不变。
  - `parseScreenIntent` 增加 `placeholders` 选项（确定性兜底允许指标值为 `null` 占位）；`parseIntentKpi` 同步。
  - 编译期把模型写明的 `substituteFor` 作为 `INTENT_BLOCK_SUBSTITUTED` 告警带出（`IntentDiagnostic.detail` 给出 `wanted` / `used`），不静默降级。
  - 文本长度上限按字符宽度算：含中日韩字符按原字数，纯西文放宽一倍，英文标题不再被截在词中间（`clampText`）。
  - 多轮迭代的库层（ADR-0113 S6 前半）：`createIntentSession` 持有 IR；`applyIntentOps` 把 `change / swap / delete / add` 依次应用到 IR（要么全部成功要么一个都不应用，`rebind` 暂返回 `INTENT_OP_NOT_SUPPORTED`）；`editIntent` 重编译后与上一次产物做差，只给变化组件的命令——未变组件的 id 与几何不动，删一块后后面的块上移但 id 不漂（`ident` 稳定标识），用户改过的组件不被覆盖并列在 `keptForUser`，新增组件层级抬到现有最高层之上，数据源冲突时换 id 并改写引用。
  - 文本长度上限按字符宽度算：含中日韩字符按原字数，纯西文放宽一倍，英文标题不再被截在词中间（`clampText`）。
  - 多轮迭代的库层（ADR-0113 S6 前半）：`createIntentSession` 持有 IR；`applyIntentOps` 把 `change / swap / delete / add` 依次应用到 IR（要么全部成功要么一个都不应用，`rebind` 暂返回 `INTENT_OP_NOT_SUPPORTED`）；`editIntent` 重编译后与上一次产物做差，只给变化组件的命令——未变组件的 id 与几何不动，删一块后后面的块上移但 id 不漂（`IntentBlock.ident` / `IntentKpi.ident` 稳定标识），用户改过的组件不被覆盖并在 `keptForUser` 里列出，新增组件层级抬到现有最高层之上，数据源冲突时换 id 并改写引用。

- 20054a5: `host-kit` 意图层补齐多轮迭代与几处显示问题（ADR-0113 S6、S7）：

  - `pickSession(candidates, baseline)`：在宿主留着的几份会话里挑出与活文档对得上的那份（提案被采纳 / 被拒绝都能对上；整屏换了别的内容或画布改了尺寸则返回 undefined）。
  - `describeSession(session)`：把会话压成发给后端的摘要（标题、区域路径、每个指标 / 块的稳定标识与当前文字），供模型输出对 IR 的操作列表。
  - `editIntent`：换物料（`swap`）时 `update-components` 改不了 `type`，改为先移除再以同一 id 新增，层级沿用活文档里的；用户改过的组件不换。比较组件时键顺序与缺省字段不算差异。`change` 写了该项没有的字段时整批拒绝（`INTENT_OP_INVALID`），不再静默忽略。
  - 指标格式化：单位自带数量级（「万元」「亿元」「K」「M」）时不再折算（修复「28.6 万万元」）；四舍五入为零的增减量不带符号、用中性色；英文屏（标题副标题无中日韩字符）用 K / M / B 与 `pp`，页脚文案也跟随语言。新增 `detectIntentLanguage`。
  - 编译期告警的说明文字统一为英文开发者文案（用户可读文案由宿主按码映射），数据集不在引用里时的说明与实际行为（该块被跳过）一致。

### Patch Changes

- Updated dependencies [5e27baa]
- Updated dependencies [7bfdce9]
- Updated dependencies [6deb116]
- Updated dependencies [1d6b802]
- Updated dependencies [3d0f236]
- Updated dependencies [cb20d1f]
- Updated dependencies [82cdf39]
  - @base-screen/contracts@0.3.0
  - @base-screen/core@0.3.0

## 0.2.0

### Minor Changes

- 077d408: 推送订阅 helper（ADR-0104 切片 3）。

  - `createSseSubscribe({ url, mapEvent?, events?, fetchSnapshot?, cursorFromEventId?, suspendAfterMs?, withCredentials?, EventSource? })`：
    返回可直接作为端口 `subscribe` 的函数。基于原生 `EventSource`，不自写重试；映射推送事件，从 `Last-Event-ID`
    （`<epoch>:<revision>`）补齐游标；连接状态映射为 `open` / `reconnecting` / `suspended` / `failed`；提供 `fetchSnapshot`
    时每次（重新）打开后拉取快照，拉取期间的增量暂存并按游标去重；`signal` abort 即关闭。
  - `createSubscriptionHub({ keyOf, open, lingerMs?, replayRows? })`：按键引用计数复用上游连接，迟到订阅者收到连接状态与
    合成快照，最后一个订阅者离开后延迟 `lingerMs`（缺省 2000）关闭，上游 `failed` 时立即关闭并清空缓存。
  - 新类型 `HostKitSubscribe`、`HostKitSubscriptionHub`、`SubscriptionHubOptions`、`SseSubscribeOptions`、
    `HostKitSseMessage`、`HostKitPushSnapshot`、`HostKitEventSource`、`HostKitEventSourceConstructor`。

### Patch Changes

- Updated dependencies [591d730]
- Updated dependencies [314eda0]
- Updated dependencies [c27b41a]
- Updated dependencies [7b9d601]
- Updated dependencies [591d730]
- Updated dependencies [aa547bf]
- Updated dependencies [c213715]
  - @base-screen/contracts@0.2.0

## 0.1.0

### Minor Changes

- 061fa02: Reduce host integration protocol and lifecycle boilerplate while retaining the full element API.

  Engine exposes an isolated, lightweight authoritative project snapshot and change event. Designer mount controllers and framework components project the accepted initial snapshot and subsequent state through `onProjectState`, without a duplicate project read or host state machine. Failed normalized-document commits retain the previous project revision.

  Mount diagnostics carry the actual failure phase, instance availability and recovery mode through controllers, framework callbacks and fallback rendering. Existing one-argument diagnostics callbacks remain supported. Catalog refresh failures retain the active instance; configuration, project load and teardown failures have distinct contexts.

  Standard runtimes accept framework bridge catalog entries directly, preserving tabular data adapters through the existing registration and authorization plan. Full host examples use one standard runtime and tracked mounts, with online-material changes committed through `setCatalog`.

  Host-kit adds transport-neutral project and dataset adapters over existing host business callbacks. REST adapters reuse the same migration, contract validation, cancellation and error handling. Validated-result observers receive isolated request data, results and errors; observer mutations or failures cannot alter the port result. Host-owned business requests, authorization, persistence, asset management and alarm transports remain outside Engine. Query operations also receive their per-request execution context, preserving host tracing and project revision audit without shared state.

  Restore the ten stable `plugin.chart.*` chart-family identities already consumed by the production host, including their manifests, dataset adapters and ECharts options, so upgrading the host does not silently remove existing charts.

- 061fa02: 新增宿主接入辅助包 `@base-screen/host-kit`：`createHttpProjectAdapter` 与 `createRestDatasetPort`
  收编示例里反复手抄的项目适配器与数据集端口样板，内置契约硬规矩（剥 groups、signal 第二参、不下发
  componentId、错误码映射）与取消语义。仅依赖 contracts，可选使用，不改变既有公共契约。见 ADR-0096。

  各操作可通过 `mapping` 分别投影请求路径、方法、JSON body 与响应 envelope；投影结果仍经 canonical
  解析。项目自定义映射保留 opaque revision，数据集查询保留 boolean 参数和分页 cursor。请求或响应
  映射抛错会转为端口诊断，取消仍返回空诊断。底层 `HostKitHttp.request<T>()` 保持兼容。

### Patch Changes

- 061fa02: Prepare the core packages for public npm distribution with explicit public registry metadata and GitHub repository links. Peripheral plugins remain private and outside this release scope.

  Preserve the public host-token stylesheet during tree shaking. Mark Vue component factories as pure so Viewer-only consumers can remove Designer code.

  Add `createBaseScreenViewerRuntime` to the SDK Viewer entry with explicit material selection and no Designer registration. Full and Viewer runtimes share plugin activation, catalog transactions, tracked mounts and disposal. React and Vue Viewer components accept either runtime while Designer components retain their full runtime requirement.

  Verify original packed archives, converted internal semver ranges and isolated consumer imports without rewriting published manifests. Add Viewer-only production-bundle and browser lifecycle coverage and fix the documented result handling.

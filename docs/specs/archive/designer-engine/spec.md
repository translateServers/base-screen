# Designer Engine 规格

> 状态：生效中
> 最近更新：2026-08-04
> 阶段：M3 后续增量
> 定位：由 `@base-screen/engine` 主导设计器产品闭环、中文工作台与项目生命周期
> 依据：[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0012](../../../decisions/ADR-0012-designer-project-lifecycle.md)、[Core Domain Spec](../core-domain/spec.md)、[Plugin Core Contract Spec](../plugin-core-contract/spec.md)
> 实施：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 样式增量：[Designer Workbench Control Styles](../designer-workbench-control-styles/spec.md)

## 1. 背景

Designer Engine 已经具备文档会话、Core command/history、选择与变换、图层、属性、画布视口以及
project load/save/publish 的实现切片，但现有规划由 Nebula parity、项目生命周期和 Runtime 集成共同
牵引，产品主线不够清晰：

- Engine 的工作台编排职责没有成为唯一实施主线，功能按外部 parity 清单横向铺开。
- UI、手势、历史、项目异步状态和 capability 判断分散，容易形成多个状态源。
- Blueprint、Host Resource 和插件能力的上游实现进度会反向阻塞基础编辑闭环。
- 当前 Engine 自有可见文案主要为英文，与目标产品语言不一致。
- 旧增量规格同时承担历史进度和未来规划，已不适合作为现行验收依据。

本规格取代旧的 Designer 增量规划。Engine 是设计器产品能力的编排者：它决定工作台结构、命令状态、
作者交互、临时状态、历史提交、项目操作反馈和集成能力的呈现方式；它不接管其他包的权威模型。

## 2. 产品原则

1. **Engine 主导。** 每一项用户工作流先定义 Engine 会话、命令、状态和反馈，再连接 Core、Renderer、
   Contracts 或 Plugin Core；不得从某个面板或 DOM click handler 反推领域语义。
2. **一个文档真相。** Canonical `ScreenDocument` 是持久状态，Core history 是文档历史，Engine 只持有
   viewport、selection、gesture、panel、clipboard 和 project operation 等实例级状态。
3. **命令先于控件。** 按钮、快捷键、菜单和 pointer gesture 必须调用同一 Engine operation；可用性、
   capability 与失败诊断不得在多个入口分别判断。
4. **渐进集成。** Material、数据源、Blueprint、preview 和 publish 能力按已绑定 capability 呈现；缺少
   上游能力不妨碍文档、画布、图层、属性和历史的基础闭环。
5. **中文单语言。** Engine 自有界面只提供简体中文，不设计或保留国际化扩展面。
6. **实例隔离。** 两个 Designer 实例不共享文档、历史、选择、剪贴板、项目请求或面板状态。

## 3. 所有权边界

| 领域 | Engine 主导内容 | 权威来源 | Engine 不得做 |
| --- | --- | --- | --- |
| 文档 | 会话装配、replace、operation 调度、变更事件 | Contracts parser/serializer | 复制 schema、容错迁移或 strip unknown fields |
| 编辑 | command/transaction 编排、一次操作一次历史、undo/redo 反馈 | Core command/history/geometry/hierarchy | 复制几何、树校验或另建文档 reducer |
| 渲染 | 渲染时机、overlay 和交互模式编排 | Renderer Material DOM/model 生命周期 | 直接管理 Material 内部 DOM 或资源状态 |
| 物料 | 工具与物料映射、面板投影、capability 驱动禁用 | Plugin Core Material Catalog/Manifest | 创建隐式物料、执行插件 UI callback |
| 项目 | operation generation、取消、dirty、冲突、retry 和 UI | Contracts `ScreenProjectAdapter` | 访问 credential、URL、Router、Store 或推算 revision |
| Blueprint | 作者界面和 canonical projection | Contracts shape、Core compile/evaluate | 私建 runtime schema、执行脚本或 host action |
| 产品元素 | 未注册的底层 Designer element | SDK 注册和稳定 product tag | 默认 import 注册 custom element |

Runtime/Ecosystem 规格可以扩展其权威能力，但不得修改 Engine session、Designer Shadow DOM、项目状态机
或中文界面规则。Engine 只消费已经公开且通过现行 Spec 的能力。

## 4. Engine 结构

### 4.1 元素与会话

- `BaseScreenDesignerElement` 是未注册的宿主边界，只负责属性/方法/事件、连接生命周期和 controller
  装配；默认 import 无注册副作用。
- 每个元素只有一个 `DesignerSession`，持有 current document、Core history、interaction state 与
  project controller。
- controller 按职责拆分 viewport、gesture、layers、inspector、project feedback 和 integration
  surface；controller 不拥有 canonical document 副本。
- DOM renderer 只把 session/controller 状态投影为 Shadow DOM。DOM 查询结果、按钮 class 或 tab
  hidden 状态不得成为领域真相。
- 超过仓库 UI controller 文件阈值时按上述职责拆分，不继续把工作流堆入元素入口文件。

### 4.2 Operation 与状态投影

Engine 内部为用户动作维护一个稳定 operation registry。每个 operation 至少定义：

- 稳定 id 和中文 label/tooltip；
- 当前 scope：`global | canvas | layers | inspector | blueprint`；
- `isAvailable` 与 `isEnabled`，前者决定能力是否存在，后者决定当前是否可执行；
- 可选 shortcut；
- 一个执行入口和确定性成功/失败结果。

Toolbar、菜单、快捷键和 pointer completion 读取同一 operation 状态。不可用能力不渲染或明确禁用；
暂时不可执行的能力保留位置并禁用。click handler 不允许静默返回成功。

### 4.3 持久与临时状态

| 状态 | 所有者 | 是否进入 document/history |
| --- | --- | --- |
| component、canvas、data source、Blueprint | Contracts/Core | 是 |
| selection/focus | Engine + Core interaction reducer | 否 |
| viewport、zoom、grid、guide、panel layout | Engine instance | 否 |
| pointer drag/resize/rotate/marquee preview | Engine gesture controller | 否 |
| clipboard | Engine instance | 否 |
| project revision、baseline、pending operation | Engine project controller | 否 |
| Material DOM/model/resource state | Renderer | 否 |

## 5. 中文界面契约

### 5.1 语言范围

- Engine 自有的标题、按钮、菜单、tab、tooltip、状态、空状态、确认框、错误摘要和无障碍名称全部使用
  简体中文。
- 不新增 locale 属性、language 配置、翻译 key、message dictionary、语言包、运行时切换或 i18n 依赖。
- 不使用浏览器语言、系统语言或宿主 locale 决定文案；所有实例显示同一套中文产品词汇。
- 稳定 API、event name、diagnostic code、document 字段、Material type 和内部 operation id 保持英文标识，
  不因 UI 中文化改名。
- Material Manifest 的 `name`、property `label` 与 enum value 属物料作者内容，Engine 原样显示；目标产品
  的内置物料必须自行提供中文名称和字段标签，Engine 不做翻译或 fallback 猜测。
- diagnostic `message` 不是 UI 文案来源。Engine 用 diagnostic code 映射固定中文摘要，详细诊断仍通过
  `base-screen-diagnostic` 事件交给宿主。

### 5.2 固定术语

| 概念 | 界面词汇 |
| --- | --- |
| Materials / Layers | 物料 / 图层 |
| Appearance / Data / Interaction / Events | 外观 / 数据 / 交互 / 事件 |
| Select / Hand / Text / Rectangle / Ellipse / Image / Zoom | 选择 / 抓手 / 文本 / 矩形 / 椭圆 / 图片 / 缩放 |
| Undo / Redo / Group / Ungroup | 撤销 / 重做 / 编组 / 取消编组 |
| Save / Publish / Preview | 保存 / 发布 / 预览 |
| Direct document | 直接文档 |
| Conflict / Retry / Cancel | 冲突 / 重试 / 取消 |
| Blueprint | 蓝图 |

快捷键字母、百分比、坐标、尺寸、component id、revision 和 Material type 可保留技术字符；不得把完整
英文句子作为可见状态或 `aria-label`。

## 6. 工作台信息架构

### 6.1 稳定区域

- 左侧工具栏提供选择、抓手、创建和缩放工具，使用图标、中文 tooltip 与可访问名称。
- 左面板提供“物料 / 图层”tab；物料来自当前 catalog，图层来自 canonical hierarchy。
- 中央区域包含顶部命令栏、标尺、viewport、canvas、overlay 和底部状态栏。
- 右面板提供“外观 / 数据 / 交互 / 事件”tab；内容只对应 focused selection 或画布。
- 蓝图与直接预览是工作台内的明确模式，不另建第二个 Designer session。
- conflict、discard confirmation 与不可编辑尺寸提示是覆盖层，不清空当前会话。

默认几何保持 48px 顶栏、28px 状态栏、20px 标尺、56px 工具栏、240px 左面板和 288px 右面板；
面板可折叠/调整，布局状态只属于实例。完整编辑最小尺寸为 1024x640，更小尺寸显示中文只读提示，
不得出现 body overflow、控件重叠或运行时异常。

### 6.2 可访问与交互

- 熟悉命令优先使用图标按钮；不熟悉图标必须有中文 tooltip 和 accessible name。
- tab 使用正确 role、selected 与 focus 行为；disabled、busy、conflict 和 focus-visible 状态明确。
- 快捷键不得劫持 `input`、`select`、`textarea` 或 `contenteditable` 的文本编辑行为。
- 固定控件尺寸不得因 hover、busy 文案、selection 数量或 revision 改变而推动布局。
- light/dark 是视觉主题，不是语言模式；两者使用相同中文词汇并满足 WCAG AA。

## 7. 核心工作流

### 7.1 建立会话

- Engine 在 catalog 可用后初始化工作台，但无 document 时只显示中文空状态，不伪造默认文档。
- direct document replace 先经过 canonical parse 和 Renderer 验证，成功后建立新 history 与 document
  baseline；失败保持原会话。
- project load 使用 `ScreenProjectController`，成功后以 adapter envelope 建立 project baseline。
- replace、load、unload 和 disconnect 必须取消手势、清理不再适用的 clipboard/selection/operation。

### 7.2 编辑闭环

- 单击、modifier、多选框和图层操作统一进入 Core interaction reducer。
- drag、resize、rotate、guide 和 marquee 的 pointer move 只更新临时投影；pointer completion 最多提交
  一个 Core transaction 和一个 history entry。
- group、ungroup、reparent、align、distribute、paste 和属性提交均是高层 operation，整体一次 undo。
- Core 或 Renderer 拒绝 transaction 时 document、history、selection 和 DOM 保持提交前状态，并显示
  与 diagnostic code 对应的中文反馈。
- undo/redo 后统一 reconcile selection、overlay、图层、检查器、dirty 和 operation enabled 状态。

### 7.3 检查器与集成

- 外观只编辑通用 geometry/status 和 Manifest 声明的 property fields；完整 props 先验证后提交。
- 数据只投影 canonical static/host-resource 能力；不提供 credential、URL test、API 或 dataset 私有字段。
- 交互只控制设计器已公开的 design/preview 交互状态，不修改 Material 内部实现。
- 事件展示当前组件相关 rule 摘要，并进入蓝图作者模式；蓝图修改仍通过 canonical command/history。
- capability 缺失时相关 tab、field 或 operation 明确 absent/disabled，不创建兼容 shape。

### 7.4 项目与文件

- load/save/publish/cancel/conflict/retry/dirty 继续遵守 ADR-0012；revision opaque，响应必须重新 parse。
- save/publish 的进行中、成功、冲突、取消和错误反馈使用中文；原始 Error、stack、payload 不进入 UI。
- project preview 只引用最近成功保存的 projectId/revision；direct document preview 使用当前 canonical
  document，退出后恢复原 viewport/selection。
- export 输出 canonical JSON；import 先 parse 并确认替换，再建立新的 document baseline。legacy 输入只能
  通过独立 importer 转换。

## 8. 非目标

- 不实现多语言、语言切换、宿主翻译注入或中英文双份文案。
- 不以 Nebula 的 DOM、CSS、图标、截图、组件数量或源码组织作为验收目标。
- 不实现移动端编辑承诺、多人实时协作、merge editor、force overwrite 或系统剪贴板。
- 不引入 React、Vue、Router、全局 Store、第三方画布框架或 UI framework。
- 不把 Engine 变成 Contracts parser、Core reducer、Renderer、Plugin Manager 或 Blueprint runtime。
- 不在本规格修改 canonical document、Material ABI、Project Adapter 或稳定 SDK product tag；需要修改时
  必须先更新对应 ADR 与上游 Spec。

## 9. Requirements

### R1：Engine 单一编排

Designer SHALL 由一个实例级 Engine session 编排 document、history、interaction、viewport、gesture、
panel 和 project controller；DOM 与其他 package 不得成为第二状态源。

### R2：统一 Operation

每个用户动作 SHALL 通过同一 operation 定义驱动按钮、快捷键、菜单或 pointer completion 的可用性、
capability、执行和反馈。

### R3：中文单语言界面

Engine 自有可见文案和无障碍名称 SHALL 全部使用固定简体中文，且实现 SHALL NOT 暴露 locale、翻译表、
语言包、运行时语言切换或 i18n 依赖。

### R4：原子编辑与历史

每个持久高层动作 SHALL 先通过 Core command/transaction 和 Renderer 验证，再提交一个 history entry；
失败或取消不得产生部分文档、DOM 或历史更新。

### R5：选择与画布一致性

Canvas、Layers、overlay 与 inspector SHALL 投影同一 Core interaction state，并在 document/history 变化后
确定性 reconcile。

### R6：Capability 驱动工作台

工具、物料创建、属性、数据、交互、事件、蓝图、preview 和 publish SHALL 只在对应公开 capability
可用时出现或启用，不得使用隐式物料、私有 schema 或宿主 fallback。

### R7：项目生命周期

load/save/publish SHALL generation-safe、可取消且遵守 canonical baseline、opaque revision、conflict 与
retry 规则；迟到响应不得污染新会话。

### R8：实例隔离

两个 Designer 实例 SHALL 不共享 document、history、selection、clipboard、viewport、panel layout、
project operation、revision、baseline 或 transient gesture。

### R9：渐进可用

缺少 project、Host Resource、Blueprint 或 publish capability 时，基础 document authoring SHALL 仍可用；
集成能力必须明确 absent/disabled，并给出中文反馈。

### R10：可验证工作台

Engine SHALL 通过 controller 单测、DOM 集成测试和真实浏览器 workflow/geometry/accessibility 测试证明
上述行为，而不是依赖手工观察或历史 parity 清单。

## 10. 测试矩阵

| 领域 | 必测行为 |
| --- | --- |
| Session | replace/load/unload、单一状态源、双实例隔离、disconnect cleanup |
| Operation | scope、available/enabled、按钮/快捷键/pointer 同源、失败中文反馈 |
| 中文界面 | 可见文本、title、tooltip、aria-label、状态、dialog、空状态无英文句子 |
| Transaction | Core/Renderer failure 原子性、每个高层动作一次 history、undo/redo reconcile |
| Selection | click/modifier/marquee/Layers、hidden/locked、focused selection |
| Canvas | pan/zoom/create/drag/resize/rotate、cancel path、grid/guide 与临时状态 |
| Inspector | Canvas、Manifest props validation、data capability、非法 draft |
| Project | generation、abort、dirty、save race、publish、conflict、retry、late response |
| Integration | events/Blueprint projection、direct/project preview、canonical import/export |
| Workbench | desktop geometry、窄屏提示、light/dark、keyboard、focus、无 overlap/overflow |

Vitest 覆盖纯 operation、session 和 controller 分支；DOM 测试覆盖 Shadow DOM 投影；独立 Designer
Playwright harness 覆盖真实 pointer、keyboard、project race、中文可访问名称和工作台几何。

## 11. 完成定义

- `spec.md`、`tasks.md`、`checklist.md` 是 Designer Engine 的唯一现行实施与验收三件套。
- 旧 Designer Authoring And Project Lifecycle 三件套已归档，只保留历史进度和 provenance。
- Engine 自有 UI 不含英文句子，不存在 locale/i18n API、字典、依赖或语言分支。
- Engine operation 成为控件、快捷键和手势完成阶段的共同入口，不存在静默失败入口。
- 基础 authoring、project lifecycle 和 capability-gated integration 均满足 R1-R10。
- 两个 Designer 实例及 replace/unload/disconnect 的隔离与清理通过自动化验证。
- 受影响 package 的 format、lint、typecheck、test、build、API、tarball、browser 门禁及
  `pnpm verify:m0` 全部通过。

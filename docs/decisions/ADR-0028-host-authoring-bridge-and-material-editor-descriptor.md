# ADR-0028：宿主作者桥与 Material Editor Descriptor

> 状态：已接受
> 日期：2026-08-10
> 依据：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)
> 部分取代：[ADR-0026](./ADR-0026-designer-event-blueprint-authoring.md)（仅 Engine 内部表单作者 UI 范围）、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)（扩展，不删除）
> 关联：[ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md)
> 规格：[Designer Authoring Extension](../specs/archive/designer-authoring-extension/spec.md)
> 计划：[实施计划](../plans/archive/designer-authoring-extension/implementation-plan.md)

> 2026-08-23 增补：Designer 内建静态数据作者能力扩展为 Manifest 可选 `staticData` 描述。
> 该增补不改变自定义物料创作协议；未声明描述的物料继续使用原始 JSON 编辑路径。

## 1. 背景

Designer 的属性面板只能编辑少量顶层标量（`propertyPanel`/`stylePanel` 单层 `prop`/`style` 字段），无法安全表达
嵌套配置、受限数组、条件显示与结构化事件；Blueprint、代码编辑和复杂领域配置缺少稳定的宿主作者集成边界。
ADR-0027 已把重型处理与长生命周期编辑会话划归宿主，但 Base Screen 侧缺少对应的 JSON-safe 作者契约与提交
入口，导致宿主只能通过通用 `executeCommand()` 或私有 DOM 逃生口集成。

## 2. 决策

### 2.1 Material Editor Descriptor（声明式作者描述）

1. 物料 Manifest 增加**可选**的 `editorDescriptor`：按 `appearance`、`data`、`interaction` 与 `events` 四个语义
   分区声明可编辑字段、canonical target、受 schema 校验的 path、内建 control、条件显示与帮助文本。
2. Descriptor 只描述“编辑什么”与“使用哪种内建控件”，不描述“如何渲染 DOM”。所有 label、help、option、default
   与 validation 均必须是 JSON-safe 数据；`path` 是经 schema 校验的 canonical 路径，不是任意 document pointer。
3. `when` 条件只允许有限的结构化比较、存在性与枚举比较，不允许表达式脚本、函数或任意谓词。
4. 字段、section、array item、condition、schema depth、数组长度与 manifest bytes 均设上限；未知字段、危险
   path、非 JSON 值、超深/超大结构 fail closed 并返回定位诊断，不得注册或渲染无效作者描述。
5. 既有 `propertyPanel`/`stylePanel` 继续有效；Descriptor 是其超集迁移路径，不删除既有字段。

### 2.2 内建作者控件边界

1. 内建控件只包含被多个物料证明可复用且由 Descriptor 声明的通用编辑需求：既有 scalar（text/number/boolean/
   select/color/json）与按风险逐步增加的 group、array、repeatable array、reorderable array、field selector、
   unit number 等 primitive。
2. 需要注入 component、function、DOM、Promise、回调、代码编辑器、图形编辑器或领域专用 UI 的编辑需求，不得
   实现为 Base Screen 内建控件；一律通过宿主作者桥交给宿主。
3. 控件 SHALL 支持稳定的 disabled、readonly、invalid、busy、empty 与 reset 状态，状态切换不得产生布局抖动。
4. 所有写入经 Core transaction 原子提交，成功一次最多产生一个 history entry；唯一 canonical 状态源保持不变。

### 2.3 宿主作者桥

1. `contracts` 定义 JSON-safe 的 authoring request、detached context、commit result 与容量限制；Engine 通过
   公开 Custom Element method 与 CustomEvent 提供宿主作者桥。
2. 上下文必须是 detached JSON，不包含 DOM、class instance、port、function 或内部 controller 引用；宿主只能
   通过公共 `@base-screen/*` exports 集成，不得访问 Shadow DOM、内部 Store 或 `src` 路径。
3. 提交方法为用途明确的专用入口（组件文本编辑与 Blueprint 编辑），提交时校验 requestId 归属、expected
   revision、component identity、目标 schema、容量限制与 Designer unload/dispose 状态；陈旧、跨实例、无效
   或超限提交 fail closed，不修改 document、history 与其他实例。
4. 请求事件只携带请求信息（requestId、revision、快照），不等待编辑器 Promise；宿主可打开长时间编辑会话，
   之后通过专用 commit method 返回 canonical candidate。

### 2.4 结构化事件声明

1. 既有 `events: readonly string[]` 扩展为可选的结构化事件声明：canonical event name、可访问显示信息、作者
   提示、payload schema、JSON budget、允许的 Blueprint trigger context 与必要 capability。
2. Blueprint action 仍只使用 canonical `set-variable`、`emit-host-event`、`host-action` 语义；物料不得通过
   Manifest 注入私有 action executor。
3. 为缺少 capability 的事件创建 trigger，或提交不符合 payload schema/容量限制的事件数据时 fail closed，保留
   document 与 history 并返回可定位诊断。

### 2.5 重型编辑器与源码归属

1. Blueprint 图形布局、代码编辑器 session、Material 源码、完整 ECharts option 编辑器与领域专用编辑器及其依赖
   **由宿主拥有**，不进入 ScreenDocument、history、导出物或 Base Screen 默认 bundle。
2. 宿主侧源码编译/类型检查/安全检查失败时保留旧 catalog 与合法 document；Base Screen 不接收源码、不执行
   编译、不污染当前 Designer session，诊断只由宿主显示。
3. **部分取代 ADR-0026**：ADR-0026 的“表单为唯一作者路径、图形整体延后”在 Engine 内部范围内不再授权实施；
   宿主可通过公开作者桥自行实现表单或图形 Blueprint 编辑器，只提交 canonical Blueprint。ADR-0026 的 Core
   Blueprint 契约、compile/trace/replace command、history、revision guard 与诊断继续有效并保持单一事实来源。
4. ECharts 语义试点：官方 ECharts 物料提供受限语义 Descriptor 与 adapter（标题、图例、网格、坐标轴、series、
   字段绑定、颜色、基础交互）；常见折线/柱状图无需 raw option 即可配置；完整 option 只作为宿主高级编辑器
   输入，并在 Material schema/adapter 校验后提交。

### 2.6 依赖与包边界

1. 本期新增外部生产依赖为零；不新增第十三个核心 package；不修改 `scripts/check-boundaries.mjs` 白名单（除非
   必要且经门禁评估）。
2. Descriptor、桥与事件声明只承载 JSON-safe 数据：不含 component、function、DOM、Promise、服务对象、源码、
   凭证或任意网络配置。
3. 任何把宿主职责迁回 Base Screen 的后续提案，必须由新的已接受 ADR 明确取代本决策并由生效中的 Spec 验收。

### 2.7 静态数据描述与内建表格作者能力（2026-08-23 增补）

1. Manifest 可选声明 `staticData`：`scalar` 描述 string/number/boolean 与多行文本；`tabular`
   描述 canonical `ScreenTabularDataset` 与默认字段角色绑定。声明后的 `defaultData` 必须通过对应类型或
   `parseScreenTabularDataset` 校验，默认绑定必须满足 Manifest 的角色数量和字段类型约束。
2. `ScreenStaticDataSource` 可携带与宿主资源同形的字段角色 binding。Renderer 对声明为 tabular 的静态数据
   复用物料 `tabularDataAdapter`，使静态数据与宿主资源进入同一物料运行时形态，不允许物料侧猜测字段角色。
3. Designer 为 scalar 提供类型表单，为 tabular 提供有界表格编辑器、字段角色选择、每页最多 100 行的网格和
   Excel/TSV 粘贴推断；表单与高级 JSON 共用草稿，无效输入只报告路径诊断，不写入文档。
4. 应用静态数据与 binding 必须由单个 Core transaction 提交；取消零副作用，撤销/重做沿用现有 history。
   数据集仍受 256 列、10000 行、1 MiB canonical 上限约束，不引入文件导入、网络处理或持久化。
5. `requestComponentTextEdit('data')` 对 static 暴露并提交实际静态值，对 host-resource 只暴露 literal params；
   两条路径都保留 request identity、revision、component identity、JSON budget、Schema 和单事务守卫。

## 3. 排除方案

- 在 Engine 中继续实现图形/代码/领域专用编辑器：拒绝，属于宿主产品与依赖决策（ADR-0027、ADR-0019）。
- 提供可注入任意 function/component 的面板逃生口：拒绝，无法验证、序列化、取消、限权或审计。
- 把 ECharts 全部 option 字段映射为内建表单：拒绝，面板不可用且文档失控；只保留被证明可复用的语义子集。
- 为宿主编辑器长期开放通用 `executeCommand()` 作为唯一提交路径：拒绝，缺少 requestId/revision/身份守护；
  专用 commit method 承担此职责（通用命令入口继续存在但不替代作者桥）。
- 允许 Manifest 携带 render function/formatter 或宿主服务对象：拒绝，违反 framework-neutral ABI。

## 4. 后果与回退

- plugin-core 拥有 Descriptor 契约与 parser；plugin-sdk 提供纯数据 builder/validator；core 保持纯 JSON/command；
  engine 提供内建面板 primitives 与作者桥适配；material 拥有 ECharts 语义模型与 adapter；sdk 仅转发公共类型。
- 每个新增 primitive 必须有真实物料用例、parser 测试、DOM 键盘测试、无效输入测试与移除路径；只有被多个物料
  独立需要时才提升为 Engine 内建控件。
- 若某控件只能通过注入 React/Vue component 实现，则停止将其加入 Base Screen，转为宿主外部编辑器。
- 未来若需在 Base Screen 内恢复图形编辑器，须重新执行 ADR-0019 评估并以新 ADR 批准。

## 5. 确认记录

2026-08-10 用户批准轻量作者扩展方向：JSON-safe 声明式 Descriptor + 宿主作者桥 + ECharts 语义试点，重型编辑器
归宿主；本 ADR 自即日接受，Designer Authoring Extension Spec 同步生效。

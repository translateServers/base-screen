# 核心与插件职责划分评审

> 状态：已评审，结论已落地（归档记录）
> 日期：2026-09-16（2026-09-17 归档）
> 场景：与[DataV 能力插件承载差距调研](../datav-capability-plugin-coverage/research.md)构成双向评审——前篇回答
> "插件能补什么"（外向差距），本篇回答"核心该留什么"（内向审计），**原本 `packages/` 的全部
> 功能点纳入评审范围**。
> 参考：[当前能力基线](../../../baseline/README.md)、[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0074](../../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)~[ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)

---

## 一、评审动机

前篇调研确认了"宿主自写插件"通道已经打通，且 DataV 功能域多数可由现有 8 类贡献直接或组合
承载。随之而来的反向问题是：**核心库（`packages/` 固定 12 包）里现有的一切，都应该留在核心吗？**

如果只增不减，核心会持续膨胀成"什么都管一点"的聚合体，最终违背轻量基座定位
（ADR-0027）与高内聚低耦合约定。本评审对每个包、每个功能域问同一个问题：
**它凭什么必须在核心？**

## 二、判定标准

### 2.1 核心必备判据（满足任一条即不可插件化）

| # | 判据 | 说明 |
| --- | --- | --- |
| C1 | **canonical 所有权** | 文档类型、解析、诊断、schema、黄金产物的唯一所有者，一切引用的事实标准（`contracts` 全部） |
| C2 | **事务与编辑语义** | 命令、事务原子性、历史、undo/redo、generation/revision guard——编辑器的"编辑"本身（`core`、`engine/common/operations`） |
| C3 | **渲染管线与物料 ABI** | 纯展示渲染、Web Component ABI、渲染盒不变式、数据态协议（`renderer`、`plugin-core` 契约） |
| C4 | **插件平台自身** | 贡献词汇表、能力授权、激活/门禁/失败关闭——平台不能建立在自身插件之上（`plugin-core` / `plugin-manager` / `plugin-sdk`） |
| C5 | **公共 API 面** | Custom Element、authoring bridge、React/Vue 桥接、sdk 聚合——宿主集成的稳定契约 |
| C6 | **跨物料一致的结构** | 画布交互原语、检查器框架、图层树、主题 Token、UI 文案、无抖动约束——所有物料共享的骨架，单物料无法自带 |

### 2.2 可插件化 / 宿主化信号（满足任一条即进入候选）

| # | 信号 | 已验证先例 |
| --- | --- | --- |
| P1 | 特定领域物料的实现 | `base.echarts` 移出 → `plugins/plugin-echarts`（2026-09-11） |
| P2 | 需要受控第三方依赖 | 外围插件区存在的理由（ADR-0074） |
| P3 | 长尾/业务性面板、控件、命令 | `kind: 'panel'` / `inspectorControl` / `command`（ADR-0072/0073） |
| P4 | 领域编辑器（代码/复杂配置） | ADR-0028 已定归宿主 |
| P5 | 数据的实际获取与加工执行 | `resourcePort`、`dataResourceType`、`dataProcessor` |

### 2.3 划分档位

| 档位 | 含义 |
| --- | --- |
| **K1 核心必备** | 满足 C1~C6，不可插件化 |
| **K2 核心承载、插件可扩展** | 核心提供框架或最小实现，扩展点已开放给插件/宿主 |
| **K3 候选下沉** | 当前在 `packages/` 但可评审移至 `plugins/`、examples 或宿主面 |
| **K4 已在外部** | 已位于 `plugins/`、`examples/` 或宿主面，无须动作 |

## 三、按包评审结论（12 包 + 外围区）

| 包 | 核心职责 | 判定 | 依据 |
| --- | --- | --- | --- |
| `contracts` | 文档类型、fail-closed 解析、诊断、序列化、JSON Schema 黄金产物 | K1 | C1 |
| `core` | 命令、事务、历史、项目域 | K1 | C2 |
| `renderer` | 纯展示渲染、物料宿主元素、数据态 | K1 | C3 |
| `engine` | Designer 编排：画布交互、检查器、面板、蓝图 shell、事件系统 | K1（功能域级见第四节） | C2/C5/C6 |
| `material` | 官方物料：文本、矩形、椭圆、图片、容器、图表、表格 | **K2/K3 混合** | 结构性物料满足 C6 载体；图表/表格见 4.1 |
| `plugin-core` | 插件契约：8 类贡献、能力、manifest | K1 | C4 |
| `plugin-manager` | 运行时加载、激活、预检、门禁 | K1 | C4 |
| `plugin-sdk` | 作者门面、`createPluginRegistration` 编排 | K1 | C4/C5 |
| `react` | React 桥接 | K1 | C5 |
| `vue` | Vue 桥接 | K1 | C5 |
| `sdk` | 产品级聚合、自动注册、Custom Element 注册 | K1 | C5 |
| `testing` | fixture 与一致性辅助（生产禁依赖） | K1（仅开发期） | C4 的测试载体 |
| `plugins/*`（echarts、metrics、datav-materials、pipeline） | 领域能力 | K4 | ADR-0074 已裁决 |

## 四、功能域级评审（灰色地带逐项）

结构性结论先行：**核心面没有发现"该是插件却在核心"的明显错位**——此前 76 个 ADR 的边界
裁决基本把该移的都移了（echarts、缩略图、素材目录、代码编辑器）。灰色地带集中在少数
"核心承载是否过重"的点位，逐项如下。

### 4.1 官方图表与表格物料（`base.chart` / `base.table`）

- **现状**：官方物料范围内保留，作为 [ADR-0022](../../../decisions/ADR-0022-official-data-material-contracts.md)
  最小数据语义契约（dimension/measures、columns）的官方载体；真实图表竞争力已归
  `plugins/plugin-echarts`。
- **判定**：K2，建议保留。理由：契约需要一个无第三方依赖的官方实现来验证可用性（含
  binding、adapter、Editor Descriptor 全链路测试）；移出后契约验证载体漂移到外围区，
  测试与锁步交付都要跟着走，收益仅是核心体积略减。
- **附带结论**：应固化"官方物料 = 无外部依赖的契约载体"这条隐含标准，官方物料不再追求
  视觉竞争力——那是外围插件的战场。

### 4.2 内建检查器控件集（含三段式调色板）

- **现状**：string/number/boolean/enum/object/array 内建控件 + 统一三段式颜色调色板
  （ADR-0050/0051）全面替换原生 color input。
- **判定**：K2，保留核心。理由：插件自定义控件（ADR-0073）**与内建控件同形**——内建集
  定义了"形"（model/change/value 契约），是扩展点的规范来源；且渐变色值是文档字段语义
  的一部分，控件若未加载，带渐变值的文档将无作者面可编辑，体验割裂。
- **附带结论**：内建控件集应视为**冻结面**——新增内建控件须过评审，判据是"平台原语"
  （所有物料的字段编辑都需要），单物料特化控件走 `inspectorControl`。

### 4.3 静态数据作者工具（标量表单 / 有界表格网格 / Excel·TSV 粘贴推断）

- **判定**：K2，保留。静态数据是 canonical 概念（ADR-0028 的 `staticData` 作者契约），
  其作者面满足 C6（所有声明 `staticData` 的物料共享）。

### 4.4 图片一次性倍图尺寸（`1x`~`4x`）

- **现状**：单选 `base.image` 时 Designer 几何区提供，实现在 engine。
- **判定**：K2，短期保留，**标注观察**。这是"功能在 engine、语义属于特定物料"的孤例；
  当前无通用承载面（无"物料几何工具"贡献类型）。若未来出现第二个同类需求（如任意图片类
  物料要自定义几何工具），再考虑新贡献类型，不为孤例预建词汇。

### 4.5 文本自适应宽度（ADR-0065）

- **判定**：K1 侧。运行时宽度要投影回选择、命中、框选、吸附与布局操作（C6——引擎测量
  是跨操作的结构性能力），物料自带无法完成。核心保留无疑义。

### 4.6 蓝图 shell 与节点语义

- **现状**：Base Screen 拥有语义面板/图投影/规则编辑（shell），宿主拥有中央图形渲染；
  节点词汇 = 物料事件 + 变量节点 + 规则边 + `host-action`（引用 `blueprintAction` 贡献）。
- **判定**：shell 为 K1（C6）；节点词汇已是 K2（`blueprintCapability` / `blueprintAction`
  扩展点开放）。C 档缺口（中间数据节点、逻辑组合）见前篇第五节，此处不重复。

### 4.7 变量面板与响应预览

- **判定**：K1 侧。变量是 canonical 一等实体（ADR-0068），其作者面是 C1 的直接延伸；
  响应预览已走宿主 `authoring-preview` 有界请求，边界正确。

### 4.8 物料库（分组 / 投影 / 封面 / 错误控制台 / 视觉层级）

- **判定**：K1/K2 正确分工已成立。物料库 UI 与插入路径是画布骨架（C6）；分组、条目投影、
  状态已经是宿主面（`leftPanelGroups`、`materialLibraryItems`、宿主动作事件）。

### 4.9 Nebula Importer（历史迁移）

- **现状**：`packages/` 内的离线 legacy 转换工具（ADR-0011）。
- **判定**：**K3 候选**。非运行时能力、非公共契约消费方，属一次性迁移工具；若 legacy 迁移
  使命已完成，可评审移出发布面（保留源码归档或移至 examples）。**须确认实际迁移进度后
  再决策**，本评审仅立案。

### 4.10 主题 Token、UI 文案、事件系统、边界门禁

- **判定**：K1（C6）。全物料、全插件共享的一致性结构，无争议。

## 五、候选下沉清单（K3 汇总）

| 候选 | 建议 | 前置条件 |
| --- | --- | --- |
| Nebula Importer | 移出发布面（归档或移 examples） | 确认 legacy 迁移使命已完成 |
| 官方图表/表格物料 | 保留（定位固化为契约载体） | 无——建议反向动作：固化"契约载体"标准进基线 |
| 内建控件集扩张 | 冻结面 + 评审门禁 | 无——治理规则而非代码变更 |

结论：**K3 实际可动的只有 Nebula Importer 一项**。核心面整体健康，边界裁决史（76 个 ADR）
已消化了绝大多数错位。

## 六、与前篇的合并结论

1. **核心必备**（本篇 K1）：canonical、事务、渲染管线、插件平台、公共 API、跨物料结构——
   六条判据构成不可让渡的骨架。
2. **核心承载 + 插件扩展**（本篇 K2）：物料、控件、命令、面板、数据类型、蓝图词汇——
   核心出框架与最小实现，长尾全部走 8 类贡献。
3. **插件/宿主承载**（前篇 A/B 档）：DataV 功能域绝大多数，含计时器、脚本过滤器、推送
   数据三个组合路径。
4. **待立项缺口**（前篇 C 档）：蓝图语义层四项，触发条件"2 个以上宿主真实需求"。
5. **归宿主**（D 档）：存储、网络、队列、发布、AI 服务——ADR-0027 红线不变。

由此得到完整的职责分层：**核心 = 骨架 + 扩展点；插件 = 词汇；宿主 = 基础设施与业务**。
宿主的"千奇百怪需求"应先在扩展点上找承载面（前篇四档分类），找不到才进 C 档立项，
永不进 D 档红线。

## 七、待拍板项与落地结果

2026-09-17 评审通过，五项全部处置：

| 待拍板项 | 结果 | 落地位置 |
| --- | --- | --- |
| C1~C6 六条判据作为"新功能归属"默认裁决标准 | 接受 | [能力基线「功能归属裁决」](../../../baseline/README.md) |
| Nebula Importer 立案移出发布面 | **无须动作**——复核发现该工具位于 `scripts/import-nebula.mjs`，不属于 12 个发布包、也不在 `verify:m0` 内，本就在发布面之外。本文 4.9 节"位于 `packages/` 内"的前提有误 | [能力基线「历史迁移」](../../../baseline/README.md) |
| 官方物料 = 无外部依赖的契约载体、不追求视觉竞争力 | 固化为范围标准 | [能力基线「功能归属裁决」](../../../baseline/README.md) |
| 内建检查器控件集确立"冻结面 + 平台原语判据" | 接受 | 同上 |
| 倍图尺寸类单物料工具按"第二个同类需求才立项" | 接受，维持观察 | 同上 |

## 八、参考来源

- Base Screen：[当前能力基线](../../../baseline/README.md)、
  [ADR-0011](../../../decisions/ADR-0011-nebula-importer-auditable-migration.md)、
  [ADR-0022](../../../decisions/ADR-0022-official-data-material-contracts.md)、
  [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
  [ADR-0081](../../../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md)、
  [ADR-0077](../../../decisions/ADR-0077-canvas-background-and-color-authoring.md)、
  [ADR-0085](../../../decisions/ADR-0085-text-and-image-material-authoring.md)、
  [ADR-0083](../../../decisions/ADR-0083-variable-system.md)、
  [ADR-0074](../../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)、
  [ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)。
- 姊妹篇：[DataV 能力插件承载差距调研](../datav-capability-plugin-coverage/research.md)。

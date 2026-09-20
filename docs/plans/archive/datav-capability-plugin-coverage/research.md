# DataV 能力插件承载差距调研

> 状态：已评审，结论已落地（归档记录）
> 日期：2026-09-15（2026-09-17 归档）
> 场景：宿主以自写插件承接长尾需求——DataV-Board 7.0 上尚未对齐的功能，能否都走插件通道
> 姊妹篇：[核心与插件职责划分评审](../core-plugin-responsibility-review/review.md)（内向审计——核心该留什么）
> 参考：DataV-Board 7.0 官方用户指南；Base Screen [当前能力基线](../../../baseline/README.md)、[ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)（原 ADR-0070–0076 的插件贡献面已由该主线合并记录吸收）

---

## 一、问题缘起

Base Screen 的功能点已比较完善，但大屏设计器这类产品的宿主方有大量长尾需求。方向性想法是：
**让宿主自己写插件来完成自己的需求**——包括 DataV 上很多没有实现的功能，后续都通过插件实现。

回答之前先固定两个前置事实：

1. **"宿主自写插件"的通道今天已经存在。** 外围插件分区（[ADR-0074](../../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)）
   与 `createPluginRegistration`（plugin-sdk）允许宿主以与官方插件完全相同的
   "声明 ∩ 授权 ∩ 支持"通道注册插件包、物料与控件，无特权也无额外限制。
2. **插件词汇表现有 8 类贡献**：material、command、dataResourceType、blueprintCapability、
   panel、inspectorControl、blueprintAction、dataProcessor（后两类为
   [ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md) 新增）。

因此真正的问题不是"宿主能不能写插件"，而是：**拿着这 8 类贡献和既有公开面，
DataV 的功能域有多少能落进来，多少落不进来。**

## 二、分类方法

每个 DataV 功能域归入四档之一：

| 档位 | 判定 |
| --- | --- |
| **A 已覆盖** | 现有贡献类型或公开 API 直接可做 |
| **B 可组合覆盖** | 多个现有面组合可达，产品形态与 DataV 有差异 |
| **C 缺承载面** | 需要新贡献类型、新能力或新端口语义，须走 ADR/Spec |
| **D 归宿主/非目标** | 基础设施或产品形态问题，不进插件词汇表 |

## 三、逐域差距清单

### 3.1 底层输入：资产沉淀与数据准备

| DataV 功能域 | 档位 | Base Screen 承载方式 / 缺口 |
| --- | --- | --- |
| 组件库（图表 / 地理 / 交互 / 媒体 / 基础） | A | `material`；已有 `plugins/plugin-echarts`、`plugins/plugin-datav-materials` 先例 |
| 自定义组件开发（脚手架） | A | plugin-sdk + 物料 ABI + 宿主 Skill kit，宿主已有完整作者路径 |
| 设计资源（图标 / 边框 / 装饰） | A | `material`；物料原子化约定（不内建装饰文案）已有强制校验 |
| 区块（可复用组件组合） | B | 宿主可用 `panel` 自建区块库面板 + `insertComponent` 公开方法插入组件树；Base Screen 不设"区块"一等实体（与[数据绑定调研](../../数据绑定与数据包调研.md)对"数据包"的同型结论：不新增合成实体） |
| 数据源（静态 / 数据库 / API 等） | A | `dataResourceType` 声明作者面 + 宿主 `resourcePort` 执行查询；宿主自写插件时声明方与执行方同体，完全自由 |
| 三维城市构建器 | B/D | 领域编辑器与服务归宿主；宿主可以 `panel` 挂入口、以 `material` 挂呈现。Base Screen 不内建 3D 能力 |

### 3.2 画布编辑器

| DataV 功能域 | 档位 | Base Screen 承载方式 / 缺口 |
| --- | --- | --- |
| PC 画布编辑器 | A | 已是基线能力（选择 / 拖拽 / 检查器 / 图层树 / 历史等） |
| 移动端画布编辑器 | D | 产品形态决策：大屏设计器非目标；若做属独立立项，不在插件词汇表内解决 |
| 组件样式与主题 | A | 官方物料 `styleSchema` + 宿主样式 Token；插件物料自带样式 |
| 组件交互配置（事件 → 条件 → 动作） | A | 蓝图规则：物料事件 → 结构化条件（8 操作符）→ `host-action`（引用 `blueprintAction` 贡献） |
| 数据驱动的告警样式 | A | 文档 `styleRules`（ADR-0058）+ `conditionalStylePort`（ADR-0059）双通道，已对齐 |
| 组件级数据绑定（选源 + 映射 + 过滤器） | A | 数据集资源 + `binding.fields` + `processorId`（处理器供给面见 [ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)；[数据绑定调研](../../数据绑定与数据包调研.md) 仍为待评审草稿，尚未形成决策） |

### 3.3 蓝图编辑器

| DataV 功能域 | 档位 | Base Screen 承载方式 / 缺口 |
| --- | --- | --- |
| 图层节点 | A | 蓝图投影为基线能力 |
| 全局变量（静态 / 数据源 / URL 来源、受控、自动更新） | A | [ADR-0083](../../../decisions/ADR-0083-variable-system.md) 已对齐；调度归宿主 |
| 过滤器（预置变换库） | A | `dataProcessor`（ADR-0076），未声明失败关闭 |
| 过滤器（用户可编写 JS） | B | 见 4.2：宿主组合 `panel`（编辑器 UI）+ 自注册 `dataProcessor`（config 带 `scriptId`）+ 宿主资产服务；执行信任归宿主 |
| 计时器等触发节点 | B/C | 见 4.1：功能可由"宿主定时器 → 写变量 → `data-updated` 事件 → 蓝图规则"组合；蓝图上作者可编辑的触发器节点形态缺承载面（ADR-0076 明确推迟） |
| 逻辑节点（串行数据处理 / 工具方法） | C | 蓝图当前是"事件 → 动作"规则边，无中间数据节点；数据接力可用"变量 + `processorId`"组合，但蓝图上可见的多段数据加工节点无承载面 |
| 逻辑组合（子图封装复用） | C | 需 canonical 新组合实体 + 引用语义；roadmap "Blueprint 扩展节点"已列，触发条件是 canonical 需求成立 |
| 条件树（可视化 + JS 双模式） | B | 结构化条件已有；JS 模式走用户脚本同型路径（归宿主） |

### 3.4 管理与发布

| DataV 功能域 | 档位 | Base Screen 承载方式 / 缺口 |
| --- | --- | --- |
| 快照 / 回滚 / 发布 / 分享 / 公开 URL | D | [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) 宿主职责，已定 |
| AI 设计辅助 / AI 大屏生成 | B/D | AI 服务归宿主；入口可由 `panel` / `command` 挂进设计器 |
| 数据轮询 / 订阅 | B | 变量 `autoUpdate` 配置 + 宿主调度（`refreshVariables`）；推送型数据走"宿主订阅 → 写变量"（ADR-0068 既定路径） |

## 四、关键发现：三个"看似缺、实可组合"的案例

DataV 的三个标志性能力，直觉上是缺口，实际上多数场景可由宿主组合实现。这是本调研
最重要的结论——**C 档缺口比直觉少**。

### 4.1 计时器触发

- **DataV**：蓝图上加计时器节点（如延迟 2 秒），到点触发动作。
- **组合路径**：宿主自建 `setInterval`/`setTimeout` → 调 `getVariable(id).set(...)` 或
  `refreshVariables` → 变量 `data-updated` 事件 → 蓝图规则 → `host-action`。
- **缺的**：蓝图上作者可见、可编辑延迟参数的节点（作者面形态），不是功能本身。
  ADR-0068 已定"Engine 不建计时器"，边界合理。
- **结论**：短期走组合；若多个宿主需要统一的"作者可编辑触发器"形态，再按 ADR-0076
  模式立项（届时为 C）。

### 4.2 用户可编写过滤器脚本

- **DataV**：过滤器面板直接写 JS，组件数据流经过滤器。
- **组合路径**：宿主注册一个 `dataProcessor` 贡献（如 `host-filter`），`configSchema`
  声明 `scriptId` 字段；用 `panel` / `inspectorControl` 提供脚本编辑器 UI
  （[ADR-0081](../../../decisions/ADR-0081-event-and-blueprint-authoring-ownership.md)：
  代码编辑器归宿主）；handler 从宿主资产服务取脚本执行。
- **信任边界**：插件 handler 是宿主受信同 realm 代码（ADR-0004）。宿主在其中执行自己
  管理的企业内部脚本，属宿主自身的信任决策；Base Screen 不提供沙箱、不背书。
- **结论**：B 档。仅当 Base Screen 要**产品化**"用户脚本"（含不可信输入隔离）时才需要
  新 ADR（ADR-0076 已预留此口子，明确不预支）。

### 4.3 WebSocket / 推送数据源

- **DataV**：数据源可订阅（服务端推送）。
- **组合路径**：`resourcePort` 是请求-响应语义（deadline、generation guard），推送不走
  资源端口。推送走"宿主订阅 → 写变量 → 变量事件"（ADR-0068 既定）；宿主物料（`material`）
  自带数据通道（物料内部订阅，组件数据态由物料管理）是另一选项。
- **结论**：B 档，但需在使用文档写清推荐路径，避免宿主在 `resourcePort` 上硬造轮询 hack。

## 五、真正的缺口清单（C 档汇总）与触发条件建议

| 缺口 | 需要什么 | 建议触发条件 |
| --- | --- | --- |
| 蓝图中间数据节点（串行处理 / 工具方法节点家族） | canonical 蓝图语义扩展：数据节点 + 输入输出锚点 | 2 个以上宿主提出真实需求；当前变量接力可用 |
| 逻辑组合（子图封装复用） | canonical 新组合实体 + 引用语义 | 同上；roadmap 已挂"Blueprint 扩展节点" |
| 蓝图触发器节点形态 | Engine 运行时语义（计时 / 条件触发作为一等节点） | 多宿主需要统一作者面；ADR-0076 明确推迟 |
| 复杂条件（AND / OR 嵌套） | 规则条件结构扩展 | 低优先级：多规则 + 变量接力可近似 |

共性判断：**C 档全部集中在蓝图语义层，且全部触碰 canonical 契约**。这解释了它们为何被
ADR-0076 推迟——插件词汇表扩展（如 0076 本身）可以做小（不碰 schema），蓝图语义扩展
做不小（新实体、引用语义、快照/发布一致性）。

## 六、边界守卫

"千奇百怪的需求都走插件"的隐含风险是词汇表无限膨胀。以下守卫规则应随本调研结论一并确认：

1. 插件扩展的是**词汇表**（新类型、新控件、新动作、新数据类型），不是**基础设施**
   （存储、网络客户端、队列、后端、沙箱）。
2. 每个新贡献类型必须走"声明 ∩ 授权 ∩ 支持" + JSON-safe 契约 + 失败关闭（ADR-0076 模式）。
3. 触碰 canonical 文档结构的需求不是插件问题，是契约演进，须走 ADR/Spec。
4. 新 `kind` 要有真实多宿主需求驱动，不为单一宿主预建。
5. 宿主自写插件是受信代码，可在 handler 内自行使用网络等宿主能力，但 Base Screen
   不提供、不背书这些原语——信任自担，应在使用文档明示。

## 七、待拍板项与落地结果

2026-09-17 评审通过，三项全部落地：

| 待拍板项 | 结果 | 落地位置 |
| --- | --- | --- |
| B 档组合路径作为中期答案并写进使用文档 | 接受 | [接入宿主数据](../../../usage/host-data.md)「组合实现长尾能力」 |
| C 档四项按"2 个以上宿主真实需求"挂路线图 | 接受 | [后续路线图](../../../roadmap/README.md)「蓝图语义扩展（调研 C 档四项）」 |
| 补一组宿主可复制的 harness 示例 | 接受并已实现 | `examples/browser-harness/datav-composition-fixture.ts`；浏览器断言 `scripts/browser-harness/plugins/assert-datav-composition.mjs`，由 `pnpm verify:browser` 执行 |

补充结论（评审时确认）：C 档四项**全部触碰 canonical 契约**，因此它们的触发条件不能只看需求数量，
还要先有 canonical Spec；四项均未预建。

## 八、参考来源

- 阿里云 DataV-Board 7.0 官方帮助中心：核心功能概览、蓝图编辑器界面介绍、逻辑组合配置、
  组件交互配置、全局变量配置与案例。
- Base Screen：[当前能力基线](../../../baseline/README.md)、
  [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、
  [ADR-0083](../../../decisions/ADR-0083-variable-system.md)、
  [ADR-0074](../../../decisions/ADR-0074-peripheral-plugin-host-and-dependency-partitioning.md)、
  [ADR-0084](../../../decisions/ADR-0084-plugin-contribution-vocabulary-and-trust.md)、
  [数据绑定与数据包调研](../../数据绑定与数据包调研.md)、
  [DataV 全局变量调研（归档）](../datav-global-variables/research.md)。

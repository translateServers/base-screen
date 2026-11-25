---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/plugin-core': minor
'@base-screen/engine': minor
'base-screen': minor
---

蓝图改为节点图模型，蓝图工作台按 LIGHT CHASER 的交互重做（ADR-0107）。

**破坏性变更（文档契约）**

- `ScreenBlueprint` 由 `{ relations, layout? }` 改为 `{ nodes, edges, layout? }`。节点六种：组件、全局变量、业务系统（单例）、
  实例就绪（单例）、定时器、条件判断；`enabled: false` 是停用的唯一写法，定时器 / 条件可带 `name`。
  执行流连线 `{ kind: 'flow', from: { node, port }, to: { node, port }, value?, payload?, transition?, requiredCapabilities? }`，
  语义连线 `{ kind: 'semantic', from: { node }, to: { node }, role }`。锚点 id：组件 `event:<事件名>` 输出、`show` / `hide` /
  `toggle` / `request-data` 输入；变量 `data-updated` 输出、`set` / `request` 输入；宿主 `event:<事件名>` / `action:<动作 id>` 输入；
  就绪 `ready`、定时器 `tick`、条件 `judge` → `yes` / `no`。
- 变量事件 `request-state` 移除（运行时从未发出）；派生的「结构包含 / 变量依赖」连线不再出现在画布上。
- 上限：节点 2000、连线 10000、单条路径串联条件 16、单条派生规则展开步骤 1024、派生规则 1000。
- `migrateScreenDocument` 一次迁完 `rules` → `relations` → 节点图：被引用的组件 / 变量生成节点（沿用旧布局 id 与位置），
  每组「连续、同源、同条件」的关系生成一个条件节点；`request-state` 来源关系丢弃并记 `rejected` 决策。新增决策 kind
  `blueprint-node` / `blueprint-edge`。

**运行时**

- `deriveScreenBlueprintRules` 产出深度优先的步骤树（`steps`），条件在到达时求值，停用节点裁剪路径；
  `ScreenBlueprintRuleTrace.condition` 改为 `conditions[]`（`nodeId` / `edgeId` / `passed`），动作轨迹带 `edgeId`。
  变量写入引发的 `data-updated` 仍作为后续分派（级联上限 32）。

**作者面（engine）**

- 默认蓝图画布重做：164px 类型色卡片、先输出后输入的锚点行、28px 吸附、紫色贝塞尔连线 + 光晕 + 中点，标签仅悬停 / 选中显示；
  左键空白框选、Ctrl/Shift 加选、整组拖动；右键拖动 / 空格 / 中键平移，Ctrl+滚轮缩放；双击标题或 F2 重命名（定时器 / 条件）；
  右键菜单复用设计器菜单样式（删除、重命名、复制节点、停用 / 启用、从此节点模拟、在此处新增节点、全选、自动布局、适应画布）；
  底部模拟条按触发锚点深度优先模拟并高亮轨迹。
- 画布协议：`selection` 改为 `{ nodes, edges }` 多选；`connect` 改为 `from` / `to` 锚点；新增 `update-node`、`reorder-edge`、
  `duplicate-nodes`、`clear-simulation`；`run-simulation` 改为 `{ nodeId, port, payload }`；状态新增 `simulationTriggers`、
  `showSemantic`，`viewRequest.type` 增加 `fit` / `auto-layout`；画布节点带 `inputs` / `outputs` 锚点、连线带 `category` 与同源顺序。
- 工作台聚焦 `focus.kind` 改为 `component` / `variable` / `node` / `edge`（组件 / 变量尚无节点时自动加入）。
- 检查器按「锚点信息 / 基础配置 / 节点配置 / 上下游连线」分组；连线可改目标锚点、写入值、负载、过渡、语义角色与同源执行顺序；
  多选支持批量启用 / 停用 / 删除。新增画布令牌 `--designer-blueprint-*`（黑夜 / 浅色两档）。

**组合分片（plugin-core / engine）**

- 分片的 `relations` 改为 `blueprint: { nodes, edges }`（`BaseScreenFragmentBlueprint`），`parseScreenBlueprintRelation`
  改为 `parseScreenBlueprintGraph`；插入结果的 `relationIds` 改为 `edgeIds`。

# ADR-0092：变更提案、幽灵草案与事务来源标注

> 状态：已接受  
> 日期：2026-10-28  
> 关联：ADR-0027（轻量基座与宿主处理）、ADR-0084（插件贡献词汇与信任）、
> ADR-0089（宿主素材与统一选择桥）。变更来源取值的「不建模身份」沿用 ADR-0027 的宿主边界。

## 背景

研究报告主张把设计器做成智能体的编译器后端：宿主把模型产出的改动编译成一份**提案**，
设计器以**未写入**的草案形式呈现，由人逐条采纳或放弃。原型（OpenDesign
`agent-workbench`）把这条链路拆成四通道 + 六态状态机，其中三点直接落在引擎职责内：

- 候选文档必须在**不写 canonical 文档、不进历史**的前提下渲染；
- 采纳后的变更要能追溯「来自哪里、依据什么」；
- 采纳必须与手动编辑共享同一套事务、历史与撤销。

对照仓库现状：`executeTransaction` 已是整批原子提交；历史节点只有 `before`/`after`，
没有任何来源标注；也没有渲染「另一个候选文档」的能力（预览是同一文档的播放态）。

同时必须守住既有边界：模型调用、身份、角色与审批都在宿主侧。引擎不新增网络客户端、
不建审批对象、不感知哪个模型产生了提案。

## 决策

### 1. 事务来源标注（公共契约的加法）

`ScreenDocumentTransaction` 增加可选的 `provenance`：

```ts
type ScreenTransactionSource = 'manual' | 'host' | 'agent';
interface ScreenTransactionProvenance {
  readonly source: ScreenTransactionSource;
  readonly label?: string;
}
```

- 来源只回答「谁触发了这次提交」：`manual`（设计器内直接编辑）、`host`（宿主代用户发起）、
  `agent`（**经宿主提交、由人采纳**的自动提案）。引擎不区分提案由哪个模型生成。
- `label` 是**不透明字符串**（如「经营会 · 整屏编排」），引擎不解析、不索引、不算权限。
- `ScreenHistoryEntry` 同步带上可选 `provenance`；旧节点缺省即「无记录」，不做回填。
- 不引入 Actor / Role / Permission / Approval 契约。审批与责任链归宿主，引擎不建第二套身份模型。

### 2. 变更提案（引擎内的候选文档）

宿主通过 `<base-screen-designer>` 的 `submitChangeProposal(input)` 提交：

```ts
interface DesignerChangeProposalInput {
  readonly title: string;
  readonly rationale: string;
  readonly scope: string;
  readonly commands: readonly ScreenDocumentCommand[];
}
```

引擎在文档副本上整批试算（`applyScreenDocumentTransaction`），**全部成功且确有差异**才产出
提案；否则失败关闭并返回诊断。提案包含候选文档、受影响组件与组件级属性 diff。

- 提案只存在于当前设计器实例，不持久化、不进文档、不进历史；`discardPendingChange()` 撤回。
- 一次提案 = 一次可提交的事务：采纳时直接用同一批命令走 `executeTransaction`（带 `provenance`），
  因此撤销、修订号与手动编辑完全一致，不需要平行的「采纳事务」。
- **可拆可合**：提案按「共享同一条命令的组件」并集成**单元**，每个单元是一条可独立成立的子事务；
  逐条采纳或忽略某个单元后，用剩余命令重新编译提案（diff 与草案都基于当前文档重算）。
  任一单元无法独立成立时退回单一单元，等价于整批采纳。
- 「全部采纳」必须二次确认；确认前不写文档。
- 宿主负责产出命令与理由；引擎不调用模型、不做意图理解。

### 3. 幽灵草案（不写入的叠加渲染）

引擎在画布内维护第二个渲染器，挂载到 `[data-canvas-ghost]` 的独立根节点：

- 与主画布共享物料目录、资源端口与条件样式端口，`interactive: false`，不转发原生事件；
- 只渲染**受影响组件及其祖先**（并过滤相关蓝图关系）；未变更组件不重复挂载，
  避免重复取数与占位文案与画布不一致；
- 「对比旧版」= 隐藏草案层；放弃 = `clear()` + 隐藏，全程不触碰文档与历史。
- 叠加层定位放在外层容器，渲染器根节点单独一层：渲染器会把挂载根写成
  `position: relative`，两层分离才能保证与画布像素对齐。

### 4. 右栏一级页签、意图入口、评审态与目标屏叠加

- **右栏一级页签**：检查器与变更共享右栏（`data-right-pane`）。提案到达只更新计数与草案条，不抢焦点；
  用户点「查看变更」或进入全部采纳确认态时才切换。
- **意图入口**：右栏底部常驻输入区。引擎把「文本 + 作用域（由选区收敛）」结构化后交给宿主绑定的
  `setIntentHandler`；未绑定时停用并说明原因。引擎不调用模型、不猜指代、不流式输出正文。
- **评审态**：`enterReviewMode({ reviewer, approver })` 让画布只读、右栏固定为变更页签，逐条批准 / 驳回
  并显示进度；人员信息只做展示，权限由平台决定。
- **目标屏叠加**：宿主经 `setTargetDisplayProfile` 提供拼接 / 安全区 / 观距，引擎绘制安全区、拼接缝与
  3m 标注；三个开关独立。参数不写入 Screen Document——它是渲染与校验输入，不是画布内容。
- **场景切换**：宿主经 `setSceneCatalog` 声明场景身份与展示名，经 `setSceneHandler` 把目标场景翻译成
  一批文档命令；引擎在副本上整批试算后复用幽灵层预览，应用时才走一次带 provenance 的事务。
  场景内容、版本与存储仍在宿主，引擎不按场景名推断内容，也不做场景版本化。

### 5. 回到任一历史态（指针式回退）

`ScreenHistoryEntry` 之外再提供 `revertScreenHistory(history, index)`：把当前状态移到任意历史节点，
**不删除任何节点**；被跳过的节点整体进入前进栈（保持顺序），因此回退之后可以再前进，也可以再次回退。
`<base-screen-designer>` 暴露 `revertToHistoryState(index)` 与 `readHistory()`，后者返回节点列表与来源标注。

回退与撤销的区别：撤销一次只回退一步并把该步放进前进栈；回退直接跳到目标节点，把中间的每一步都放进前进栈。
两者共用同一个历史模型，不新增平行存储。

## 影响
- `@base-screen/core` 与 `@base-screen/engine` 的 API 报告更新（可选字段与方法，均为加法）。
- 引擎新增 `common/validation`（WCAG 对比度与守卫判定）、`common/operations/change`（提案编译与 diff）
  与 `common/operations/scene`（场景命令试算与预览）三个纯逻辑子层；`engine-import` 的子层登记同步更新。
- 宿主若要接入智能体，只需在自己的适配层把提案编译成命令并调用 `submitChangeProposal`，
  采纳由用户在设计器内触发；宿主不需要新的信任通道。
- 明确不做：审批流（评审态只展示人员与逐条处理结果，权限归平台）、场景版本化、偏好补丁固化、
  按需编译/自愈。
- 已知限制：草案只预览受影响组件，删除类提案不会让被删组件在草案中消失；
  数据绑定组件在草案里沿用自身取数结果，可能与主画布存在时序差。

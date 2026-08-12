# Designer 事件 Blueprint 规格

> 状态：生效中
> 最近更新：2026-08-10
> 定位：轻量设计器基座内的 Blueprint 规范与宿主作者边界（Core 三件套、面板摘要与宿主请求入口）
> 前置：[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0018](../../../decisions/ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](../../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0026](../../../decisions/ADR-0026-designer-event-blueprint-authoring.md)、[ADR-0028](../../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 计划：[implementation-plan.md](../../../plans/archive/designer-event-blueprint/implementation-plan.md)
> 作者扩展：[Designer Authoring Extension](../designer-authoring-extension/spec.md)

## 1. 目标与范围

本规格定义 Designer 事件 Blueprint 的规范与宿主作者边界：Base Screen 继续拥有 canonical Blueprint、严格解析、
compile、trace、replace command、history、revision guard 与诊断；其内部事件面板只呈现事件摘要、能力状态与
JSON-safe 宿主作者请求入口。Blueprint 图形布局、编辑器 draft、长期 session 与宿主侧表单/图形编辑器由宿主
拥有，只提交 canonical Blueprint（[ADR-0028](../../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)）。

ADR-0026 的图形路径延后与候选评估结论继续有效；[ADR-0028](../../../decisions/ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)
部分取代 ADR-0026 的 Engine 内部表单作者 UI 范围：宿主可通过公开作者桥自行实现表单或图形编辑器，Base Screen
不授权在 Engine 内部继续建设表单/图形作者工作流。

## 2. 不变边界

- Contracts、JSON Schema、解析器、序列化和现有 runtime dispatch 的输入输出语义保持不变；不增加 delay、comment、
  layout、兼容字段、版本字段或可执行表达式。
- Canonical Blueprint 只包含物料事件 trigger、可选 condition 和有序 actions；actions 仍只有
  `set-variable`、`emit-host-event`、`host-action` 三类。
- ADR-0018 的图形 session 边界仍然有效且归宿主：节点位置、边路由、视口、选区、MiniMap、draft 与搜索状态即使
  未来实现也只属于编辑器 session，不进入 document、history、export、日志、遥测或 host payload。
- Core 保持纯计算与 framework-neutral；Engine 保持 Shadow DOM 私有 DOM、实例级状态与 common/browser 分层；
  作者桥仅通过公开 Custom Element method 与 CustomEvent 与宿主交互（本规格与作者扩展 Spec 授权的新增公共
  契约，见 §4）。
- 所有内容修改最终通过一次 `replace-blueprint` command 提交；失败保持 document 与 history 原子不变。
- 宿主编辑器 draft 永不进入 document；宿主提交只携带 canonical Blueprint 与受控元数据。
- UI 继续使用中文；窄屏只显示现有提示，不新增编辑模式。

## 3. Core trace 契约

以下类型是本规格的 Core 公共 API。所有 JSON 输出必须是独立 detached 值，调用者修改 trace 不得影响
plan 或 state。

```ts
export type ScreenBlueprintConditionTraceState =
  | 'not-evaluated'
  | 'none'
  | 'passed'
  | 'failed';

export interface ScreenBlueprintSetVariableActionTrace {
  readonly type: 'set-variable';
  readonly actionIndex: number;
  readonly variableName: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintEmitHostEventActionTrace {
  readonly type: 'emit-host-event';
  readonly actionIndex: number;
  readonly eventName: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export interface ScreenBlueprintHostActionTrace {
  readonly type: 'host-action';
  readonly actionIndex: number;
  readonly actionId: string;
  readonly output: ScreenJsonValue;
  readonly detached: ScreenJsonObject;
}

export type ScreenBlueprintActionTrace =
  | ScreenBlueprintSetVariableActionTrace
  | ScreenBlueprintEmitHostEventActionTrace
  | ScreenBlueprintHostActionTrace;

export interface ScreenBlueprintRuleTrace {
  readonly ruleId: string;
  readonly triggerMatched: boolean;
  readonly condition: ScreenBlueprintConditionTraceState;
  readonly actions: readonly ScreenBlueprintActionTrace[];
}

export interface ScreenBlueprintTraceResult extends ScreenBlueprintDispatchResult {
  readonly ruleTraces: readonly ScreenBlueprintRuleTrace[];
}

export function traceScreenBlueprintEvent(
  plan: ScreenBlueprintPlan,
  state: ScreenJsonObject,
  event: ScreenBlueprintEvent,
): ScreenParseResult<ScreenBlueprintTraceResult>;
```

`detached` 是动作执行意图的 JSON-safe 快照，包含动作类型、动作索引、动作目标字段（变量动作含 `variableName`，
宿主事件含 `eventName`，宿主动作含只读 `actionId`）与求值后的 `output`。Trace 不接触任何宿主 port，不执行
host event/action，不写日志或遥测。

`ruleTraces` 保持 plan 规则顺序。触发不匹配的规则使用 `not-evaluated` 且没有动作 trace；无 condition 的匹配规则
使用 `none`；condition 求值为真或假分别使用 `passed` 或 `failed`。表达式、条件或动作错误返回既有失败结果，并在
诊断 path 中定位规则索引与 condition/action 索引，不能返回部分成功的 dispatch。

`dispatchScreenBlueprintEvent` 与 trace 必须调用同一个内部求值内核。对任一成功输入，trace 继承的
`variables`、`hostEvents`、`hostActions` 必须与独立 dispatch 逐字段、逐顺序、逐 JSON 值相等；错误码和诊断定位
也必须一致。

## 4. 宿主作者边界

### 4.1 内部事件面板

- Base Screen 内部事件面板只呈现：事件摘要（逐事件规则计数）、能力状态（material-event/condition/action 相关
  capability 是否可用）与 JSON-safe 宿主作者请求入口。
- 请求入口按 [Designer Authoring Extension](../designer-authoring-extension/spec.md) 的作者桥契约发起
  authoring request（requestId、expected revision、component identity、blueprint 快照与容量限制），不等待
  编辑器 Promise，不携带编辑器 UI 状态。
- 组件切换、取消、关闭、reload、document replacement 与 Designer dispose 后，任何过期提交由 requestId、
  revision 与实例生命周期 guard 拒绝，不修改 document/history。

### 4.2 宿主 Blueprint 编辑器

- 宿主编辑器（表单或图形）只提交 canonical Blueprint；Base Screen 负责 parse、compile、trace、replace command
  与诊断。
- `host-action` 只提交已授权 action id 与 JSON payload，真实执行仍走 `ScreenBlueprintHostActionPort`。
- 编辑会话失效规则：编辑器打开后发生 document replacement、组件/事件失效、取消、关闭、reload 或 Designer
  dispose 时，宿主必须使本地会话失效；Base Screen 侧通过 §4.1 的 guard 拒绝过期提交。

### 4.3 结构化事件声明

- 物料可通过结构化事件声明提供 canonical event name、显示信息、作者提示、payload schema、JSON budget、
  允许的 Blueprint trigger context 与必要 capability（契约归属 [Designer Authoring Extension](../designer-authoring-extension/spec.md)）。
- 为缺少 capability 的事件创建 trigger，或提交不符合 payload schema/容量限制的事件数据时 fail closed，保留
  document 与 history 并返回可定位诊断。

## 5. 质量与容量

- 必须覆盖 1024x640、1440x900、1920x1080，窄屏提示，light/dark、forced-colors、reduced-motion、空态、复杂规则
  与双实例。
- 必须覆盖完整 pointer 流程、完整 keyboard-only 流程、undo/redo、能力撤销、组件/事件失效、无效载荷、项目替换、
  disconnect/reconnect、双实例和所有监听清理。
- 合法极限 document 不得崩溃，仍受 Contracts 当前规则、动作、表达式和 JSON budget 限制。

## 6. 完成定义

- ADR-0026 与 ADR-0028 已接受（2026-08-10）。
- 本目录 `tasks.md`、`checklist.md` 的所有适用项与测试矩阵证据全部完成。
- Core trace 与 dispatch 共享同一求值内核，成功输出逐字段等价，错误码与定位一致。
- 作者桥、提交守护、面板摘要与宿主 harness 的单元/DOM/browser/双实例证据由 [Designer Authoring Extension](../designer-authoring-extension/spec.md)
  的测试矩阵承载并已通过；focused quality gates、browser、API、boundary、license、consumer bundle、tarball 与
  `pnpm verify:m0` 均通过。
- 图形路径不属于 Base Screen 验收范围（ADR-0026 延后 + ADR-0028 宿主归属）。

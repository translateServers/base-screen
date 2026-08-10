# Designer 事件 Blueprint 规格

> 状态：生效中
> 最近更新：2026-08-10
> 归属：Designer Full Product Task 5（R7 表单部分、R9）
> 前置：[Designer Full Product](../designer-full-product/spec.md)、[ADR-0018](../../decisions/ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](../../decisions/ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 计划：[implementation-plan.md](../../plans/designer-event-blueprint/implementation-plan.md)

## 1. 目标与范围

本规格定义 Designer 事件 Blueprint 的表单作者闭环：以完整键盘表单为唯一作者路径，编辑同一 canonical
`ScreenBlueprint`，并提供 Core trace、诊断、模板、受限模拟与可发布验收。

图形路径按 [ADR-0026](../../decisions/ADR-0026-designer-event-blueprint-authoring.md) 整体延后：本期不实现
图形 UI、GraphAdapter、图库依赖或连接语义，也不属于本规格验收范围；未来恢复图形需求时须重新立项并执行
ADR-0019 依赖评估。

## 2. 不变边界

- Contracts、JSON Schema、解析器、序列化和现有 runtime dispatch 的输入输出语义保持不变；不增加 delay、comment、
  layout、兼容字段、版本字段或可执行表达式。
- Canonical Blueprint 只包含物料事件 trigger、可选 condition 和有序 actions；actions 仍只有
  `set-variable`、`emit-host-event`、`host-action` 三类。
- ADR-0018 的图形 session 边界对未来仍有效：节点位置、边路由、视口、选区、MiniMap 与搜索状态即使未来实现也只
  属于 Engine session，不进入 document、history、export、日志、遥测或 host payload。
- Engine 保持 framework-neutral、Shadow DOM 私有 DOM、实例级状态和现有 common/browser 分层；不引入 UI framework、
  全局样式或全局 Store，且不新增 Engine 公共属性、事件或导出。
- 所有内容修改最终通过一次 `replace-blueprint` command 提交；失败保持 document 与 history 原子不变。
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

## 4. Engine authoring 需求

### 4.1 表单、draft 与模板

- 表单必须能够完整编辑 trigger、condition、action 及递归 array/object/value expression；图形与表单共享的
  canonical 语义由表单侧完整承担。
- 配置在实例级 draft 中进行；“应用”一次性校验并提交（单 history entry），“取消”丢弃。切换节点、视图或关闭时
  有未保存 draft 必须得到中文可访问保护反馈，不得静默丢弃。
- 固定模板只有“空事件规则”“转发事件”和能力可用时的“写入变量”；模板只产生 canonical rule。
- `host-action` 只能展示、编辑 payload、删除和在原规则中重排；`actionId` 只读且没有新增入口。缺少 capability
  时整项只读并显示问题。

### 4.2 诊断、搜索与模拟

- 问题面板定位到规则、condition、action 或表达式字段；能力撤销、组件/事件失效、非法 payload 和 compile 失败
  均 fail closed。
- 规则/动作搜索使用高亮和上/下一项定位，不删除条目、不改变 document/history。
- 模拟面板接受现有 JSON budget 内的事件载荷，展示逐规则 condition 状态、变量结果、host-event 与 host-action
  intent。模拟结果只保存在当前实例内存，不调用端口、不写 history、不进入日志或遥测。

## 5. 质量与容量

- 必须覆盖 1024x640、1440x900、1920x1080，窄屏提示，light/dark、forced-colors、reduced-motion、空态、复杂规则、
  配置、问题、模拟和搜索。
- 必须覆盖完整 pointer 流程、完整 keyboard-only 流程、undo/redo、能力撤销、组件/事件失效、无效载荷、项目替换、
  disconnect/reconnect、双实例和所有监听清理。
- 表单提供分页，规则/动作面板支持过滤；达到冻结的可交互条目阈值后必须先过滤。
- 合法极限 document 不得崩溃，仍受 Contracts 当前规则、动作、表达式和 JSON budget 限制。

## 6. 完成定义

- ADR-0026 已接受（2026-08-10）。
- 本目录 `tasks.md`、`checklist.md` 的所有适用项与测试矩阵证据全部完成。
- Designer Full Product Task 5 回链、R7（表单部分）/R9 双向映射、focused quality gates、browser、API、boundary、
  license、consumer bundle、tarball 与 `pnpm verify:m0` 均通过。
- 图形路径不属于本规格验收范围（ADR-0026 延后）。

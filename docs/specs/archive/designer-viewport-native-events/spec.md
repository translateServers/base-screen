# Designer Viewport Native Events Spec

> 归档：2026-08-30（已完成）
> 状态：已归档（历史验收记录）
> 日期：2026-08-14
> 依据：ADR-0036

## 1. 目标

把 Designer 底部状态栏的静态「事件」占位改为与「吸附」「参考线」同形态的有状态切换开关，
控制设计态画布渲染器的 `interactive` 状态：开启后画布内组件原生事件（`base-screen-material-event`）
在设计视图中生效并转发给宿主；关闭时行为与现状完全一致。切换不得重建渲染管线（物料 DOM、
数据集请求与数据状态保持），不得改动 ScreenDocument、Material Manifest、Viewer 行为与宿主边界。

## 2. Requirements

### R1：状态栏开关 DOM 契约

状态栏 SHALL 以 `<button data-status-toggle="native-events" role="switch" aria-checked="false">`
替换静态「事件」文本；结构为 `.status-toggle` + `.status-toggle-dot` + 文案，与 snap/guides 开关
同形；文案 SHALL 来自 `DESIGNER_UI_TEXT.nativeEvent`。默认 `aria-checked="false"`（默认关闭）。
`.status-item` 静态样式规则（仅此占位使用）SHALL 移除。

### R2：工作台控制器状态与路由

`DesignerWorkbenchController` SHALL 持有 `nativeEventsEnabled`（默认 false）、`toggleNativeEvents()`
与只读 getter；`onClick` SHALL 路由 `data-status-toggle="native-events"` 到该切换；切换时 SHALL 调用
可选回调 `onNativeEventsChange(enabled)` 并同步 `aria-checked`（`renderStatusToggles()` 统一渲染）。
回调未提供时开关仍可作为纯 UI 状态工作。

### R3：Renderer 实例级 interactive 切换

`BaseScreenRenderer` SHALL 新增 `setInteractive(enabled: boolean): ScreenParseResult<null>`：

- 已 render 过文档：原地重渲染，已挂载物料元素实例复用（同 type 同 id 不 remove/append），
  模型 `interactive` 字段更新；资源请求与数据状态保留，不重新 resolve；
- 尚未 render：只记录状态，下一次 `render()` 使用新值；
- 已 dispose：返回 `PLUGIN_CORE_LIFECYCLE_INVALID` 失败诊断，零副作用；
- 同值切换：no-op，返回 ok；
- `interactive=false` 时物料点击事件不入 `onMaterialEvent`（既有行为）；`true` 时声明的事件按既有
  校验路径进入 `onMaterialEvent`。

`CreateBaseScreenRendererOptions.interactive` 保持为初始化值语义，Viewer 行为不变。物料侧的原生
CSS/悬停交互 SHALL 与点击事件同受 `model.interactive` 门控：echarts 数据点在关闭时不注册悬停
监听、不设置 pointer 光标，开启（或 Viewer）时随物料重渲染恢复交互示意；React/Vue 桥接物料在
非交互模式 SHALL 给元素打 `data-base-screen-interactive="false"` 并按所在 shadow root（或
light DOM document）幂等注入 `[data-base-screen-interactive="false"] * { pointer-events: none; }`，
使桥接渲染的原生控件（button 等）的 hover/active/focus 原生样式静默，指针事件落到物料元素自身、
设计器命中测试不受影响。`interactions.hover` 等 props 的既有渲染语义不变。

### R4：Designer 元素接线与宿主事件转发

`BaseScreenDesignerElement` SHALL：

- `createRenderer()` 以工作台当前 `nativeEventsEnabled` 初始化渲染器 `interactive`；
- `onMaterialEvent` SHALL 转发为 designer 元素上的 `base-screen-material-event` CustomEvent
  （`bubbles: true, composed: true`，detail 为 `{ componentId, type, name, payload }`，与 Viewer 同形）；
- `onNativeEventsChange` SHALL 调用渲染器 `setInteractive`，失败（如已 dispose）经
  `emitDiagnostics` 上报；
- 渲染器重建（unload/initialize 循环）后开关状态保持（重建读取同一状态源）。

### R5：契约与边界兼容

ScreenDocument、Material Manifest、Viewer、宿主状态 schema、SDK 公共 API 与既有 `data-*` 契约
SHALL 零破坏；公共边界变更仅为 renderer 的 additive `setInteractive` 方法。不新增依赖与 package。
全部新增用户可见文案 SHALL 集中于 `designer-ui-text.ts`（browser 树不得内联 CJK 字面量）。

### R6：质量与无抖动

开关切换 SHALL 不引起画布/面板几何变化或视觉闪烁（物料元素原地更新模型，不重挂载）；
hover/active 样式沿用既有 `.status-toggle`，不改变几何。单元测试、真实浏览器 harness 断言
与 `pnpm verify:m0` SHALL 全部通过。

## 3. 非目标

- 放行视窗原生交互（滚轮平移/缩放、右键菜单、文本选择、拖放）。
- 开关状态持久化、跨实例共享或宿主配置字段。
- 设计态事件进入 Blueprint 触发链路。
- 状态栏其它布局或内容调整。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部完成，测试矩阵与当前实现一致。
- 聚焦测试（renderer、engine 工作台/workspace/样式）、真实浏览器 harness 与 `pnpm verify:m0` 通过；
  基线 README 登记本增量。

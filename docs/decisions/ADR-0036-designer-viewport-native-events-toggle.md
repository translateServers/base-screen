# ADR-0036：Designer 视窗原生事件开关

> 状态：已接受
> 日期：2026-08-14
> 关联：[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)、[ADR-0006](./ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0024](./ADR-0024-designer-public-style-tokens.md)
> 部分取代：无。`BaseScreenRenderer` 仅新增可切换的 `interactive` 运行时状态，既有构造选项语义不变

## 1. 背景

Designer 的画布渲染器创建时硬编码 `interactive: false`（`mode: 'design'`）。物料原生事件（如文本
`valueClick`、图表 `seriesClick`、表格行点击等）全部以 `model.interactive !== true` 为门控，只会在
Viewer（`mode: 'viewer'`、`interactive: true`）中派发 `base-screen-material-event`。设计态下宿主无法在
画布内直接验证组件交互，只能切到预览；底部状态栏的「事件」静态文本是未接线的占位，与相邻的
「吸附」「参考线」开关（`data-status-toggle` + `role="switch"` + `aria-checked`，由
`DesignerWorkbenchController` 统一渲染）不一致。

把该占位改为同形态的有状态切换按钮，让设计态画布按需进入交互模式，是本次增量。

## 2. 决策

1. 底部状态栏 SHALL 以 `data-status-toggle="native-events"` 的 switch 按钮替换静态「事件」文本，
   复用 `.status-toggle`/`.status-toggle-dot` 样式与吸附/参考线完全一致；文案沿用
   `DESIGNER_UI_TEXT.nativeEvent`。默认关闭（`aria-checked="false"`），保持现有设计器行为不变。
2. 开关状态 SHALL 归 `DesignerWorkbenchController` 持有（与 snap/guides 同源模式），提供
   `nativeEventsEnabled` 只读状态与 `toggleNativeEvents()`；点击经既有 surface router →
   `onClick` 路由，`renderStatusToggles()` 统一同步 `aria-checked`。切换时通过可选的
   `onNativeEventsChange` 回调通知组合根（BaseScreenDesignerElement）。
3. `@base-screen/renderer` 的 `BaseScreenRenderer` SHALL 新增实例级
   `setInteractive(enabled: boolean): ScreenParseResult<null>`：`interactive` 从构造选项的一次性
   快照变为实例内可切换状态。已 render 过文档时原地重渲染（复用已挂载物料元素、保留资源请求
   与数据状态，不重挂载、不重取数）；尚未 render 时只记录状态；已 dispose 时失败关闭并返回
   诊断；同值切换为 no-op。该新增是 additive 的，`CreateBaseScreenRendererOptions.interactive`
   仍是初始化值，Viewer 行为不变。
4. `BaseScreenDesignerElement` 的 `createRenderer()` SHALL 以工作台当前开关状态初始化
   `interactive`，并把 `onMaterialEvent` 转发为 designer 元素上的 `base-screen-material-event`
   CustomEvent（`bubbles/composed`，detail 为 `{ componentId, type, name, payload }`，与 Viewer 同形）。
   开关关闭时物料事件被既有门控静默，零事件外泄。`setInteractive` 失败时经 `emitDiagnostics` 上报。
5. 开关为实例内 UI 状态：不进入 ScreenDocument、不持久化、不新增宿主配置字段或回调。
   `unload`/重建渲染器后开关状态保持（渲染器重建读取同一状态源）。
6. 物料的原生 CSS/悬停交互 SHALL 与点击事件同受 `model.interactive` 门控：
   - 官方物料：echarts 数据点的 `cursor: pointer` 与 mouseenter/mouseleave 放大复位在
     interactive=false 时不注册、不生效；
   - React/Vue 桥接物料：桥接层在非交互模式给元素打 `data-base-screen-interactive="false"`
     并按 shadow root（或 light DOM document）幂等注入 `[data-base-screen-interactive="false"] * {
     pointer-events: none; }`，使桥接渲染的原生控件（button 等）的 hover/active/focus 原生
     样式静默；指针事件落到物料元素自身，设计器的选择/拖拽命中测试不受影响。
   设计态开关关闭时画布内组件保持静态编辑示意，开启（或 Viewer）时才出现交互示意。
   门控不改变 `interactions.hover` 等 props 的既有渲染语义。

## 3. 非目标

- 放行视窗原生交互（滚轮平移/缩放、右键菜单、文本选择、拖放）——设计态编辑手势与默认行为
  策略保持不变。
- 把开关状态或事件日志持久化、跨实例共享或暴露为宿主配置。
- 修改 Material Manifest、事件声明、Viewer、ScreenDocument、宿主状态 schema 或 SDK 导出。
- 为设计态事件建立 Blueprint 触发链路（事件 Blueprint 仍在 Viewer 运行时生效）。

## 4. 结果

- 设计态可在画布内原地验证组件原生事件（点击与 CSS/悬停交互），宿主在 designer 元素上监听
  `base-screen-material-event`，与 Viewer 集成方式一致；关闭时行为与现状完全一致。
- 交互模式切换不重建渲染管线：物料 DOM 实例、数据集请求与数据状态保持，无闪烁、无重复取数；
  物料渲染层按 interactive 重建交互示意（光标/悬停监听），编辑态无 hover 干扰。
- 状态栏「吸附/参考线/事件」形成同构的三开关组，样式、ARIA 与状态来源统一。
- 公共边界变更仅为 renderer 的 additive 方法，由专项 Spec 与真实浏览器 harness 验收。

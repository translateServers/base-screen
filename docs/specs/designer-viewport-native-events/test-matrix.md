# Designer Viewport Native Events Test Matrix

> 状态：已完成（2026-08-14，与实现一致）
> 映射：Requirement -> 测试位置 -> 断言要点

| R# | 测试位置 | 断言要点 |
| --- | --- | --- |
| R1 | `scripts/verify-browser-harness.mjs`（真实浏览器，`assertNativeEventsToggle`）+ `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts`（aria 同步） | 状态栏含 `[data-status-toggle="native-events"]`（role=switch），默认 aria-checked="false"，文案=DESIGNER_UI_TEXT.nativeEvent；切换后 aria 与状态同源；无静态 `.status-item` 残留 |
| R1 | `packages/engine/tests/browser/styles/designer-style.test.ts` | workbench CSS 含 `.status-toggle`/`.status-toggle-dot` 规则；不再含 `.status-item` 规则 |
| R2 | `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts` | 默认 `nativeEventsEnabled=false`；`toggleNativeEvents()` 翻转并回调 `onNativeEventsChange`；`onClick({statusToggle:'native-events'})` 返回 true 并翻转；`initialize()` 后按钮 aria-checked 与状态同步；回调缺省不抛错；多实例状态隔离 |
| R3 | `packages/renderer/tests/renderer.test.ts` | `setInteractive(true)` 后已挂载元素模型 `interactive=true` 且元素实例不变（root.children 引用相同）；物料事件进入 `onMaterialEvent`；`setInteractive(false)` 后事件被门控；未 render 时 setInteractive 只记录状态（随后 render 生效）；disposed 后返回 `PLUGIN_CORE_LIFECYCLE_INVALID`；同值 no-op；host-resource 组件资源状态不被重挂载/重取数（元素引用不变）；多事件 manifest 逐名转发（rowClick+cellClick），未声明事件名被过滤 |
| R3 | `packages/material/tests/native-events.test.ts`（全部官方 element） | 声明表：text=valueClick、echarts=seriesClick、chart=pointClick、table=rowClick+cellClick、image/rectangle/ellipse/container=[]；门控：四类交互物料在 interactive=false 时零事件、true 时按声明派发且 payload 形状正确（含表格单元格 stopPropagation）；原生 CSS/悬停门控：echarts 圆点在 interactive=false 时无 mouseenter/mouseleave 监听且无 pointer 光标，true 时注册监听 + cursor=pointer + mouseenter 放大（r=symbolSize/2）与 mouseleave 复位；chart 圆点任何状态下均无悬停监听/光标；非交互物料无任何事件监听（元素自身与渲染子树） |
| R4 | `scripts/verify-browser-harness.mjs`（真实浏览器） | 开关初始 aria-checked=false；点击切换 true/false；开启后点击画布文本组件宿主收到 `base-screen-material-event`（detail.name=valueClick、componentId=title、type=base.text，与 Viewer 同形）；关闭后点击无事件。渲染器重建保持开关状态由实现保证（`createRenderer` 读取工作台同一状态源，typecheck 覆盖），失败诊断走既有 emitDiagnostics 通道 |
| R4 | `scripts/verify-browser-harness.mjs`（真实浏览器，探针设计器） | 在页面内创建独立 probe designer（text/chart/echarts/table 四类静态数据组件）：开关关闭时四类 element 点击零事件且 echarts 圆点悬停无效果（r 不变、无 cursor）；开启后逐类命中（text 元素、chart/echarts 的 svg circle、table 的 tbody tr 与 td）转发正确 componentId/type/name（valueClick/pointClick/seriesClick/rowClick/cellClick），echarts 圆点 hover 放大生效（r 变为 2、cursor=pointer）；再次关闭后全部静默；探针同步创建/移除，不污染主设计器文档与历史 |
| R4 | `scripts/verify-browser-harness.mjs`（真实浏览器，探针设计器 React/Vue 桥接） | 探针含 harness.react-button/harness.vue-button 组件：开关关闭时桥接 button 的 computed pointer-events=none 且点击零事件（JS 门控）；开启后 pointer-events=auto 且点击转发 valueClick（componentId/type/name 正确）；再次关闭 pointer-events 回到 none；断言覆盖 React 初始异步提交后的真实 DOM |
| R5 | `pnpm verify:m0`（含 check:api、check-packages、边界检查） | 全绿；公共 API 仅 renderer additive 方法 |
| R6 | `packages/engine/tests/browser/styles/designer-style.test.ts` + harness 几何断言 | 开关 hover/active 不改变几何；状态栏高度与既有几何断言不变 |

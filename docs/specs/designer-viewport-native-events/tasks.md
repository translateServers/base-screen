# Designer Viewport Native Events Tasks

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0036 与 Spec 四件套，登记 ADR 索引、Spec「生效中」索引、路线图当前生效行
      （R1-R6）。
- [x] Task 2：Renderer `setInteractive`：`interactive` 改为实例内可切换状态（构造选项仍是初始化值），
      已渲染文档时原地重渲染、复用物料实例与资源状态；disposed 失败关闭、同值 no-op（R3）。
- [x] Task 3：Renderer 单元测试：交互切换后模型字段更新且元素实例复用（不重挂载）、事件门控随开关
      反转、未渲染时先记录状态、disposed 返回失败、同值 no-op（R3、R6）。
- [x] Task 4：workspace DOM：状态栏静态「事件」替换为 `data-status-toggle="native-events"` switch
      （默认 aria-checked="false"，复用 status-toggle 样式）；移除 `.status-item` 样式规则（R1）。
- [x] Task 5：工作台控制器：`nativeEventsEnabled` 状态、`toggleNativeEvents()`、`onClick` 路由与
      `renderStatusToggles()` aria 同步、可选 `onNativeEventsChange` 回调（R2）。
- [x] Task 6：Designer 元素接线：`createRenderer()` 读取开关状态初始化 interactive、`onMaterialEvent`
      转发为 composed `base-screen-material-event`、`setInteractive` 失败经 emitDiagnostics 上报（R4）。
- [x] Task 7：Engine 单元测试：工作台开关路由/状态/回调/aria 同步与多实例隔离、样式测试同步
      （移除 status-item 断言）（R1、R2、R6）。
- [x] Task 8：verify-browser-harness 断言：开关初始态、点击切换 aria、开启后画布内组件事件转发
      到宿主、关闭后无事件；usage/baseline 文档登记（R4-R6）。
- [x] Task 9：质量门禁与 Spec 勾选：engine/renderer 聚焦 typecheck/test、`pnpm format`、
      `pnpm verify:m0`；tasks/checklist/test-matrix 同步（R5、R6）。
- [x] Task 10：原生 CSS/悬停交互纳入门控：echarts 数据点 cursor/mouseenter/mouseleave 按
      interactive 注册与渲染；物料单测覆盖 hover 门控与半径复位，浏览器探针覆盖真实 hover 效果
      （R3、R4、R6）。
- [x] Task 11：React/Vue 桥接原生 CSS 交互纳入门控：非交互模式打
      `data-base-screen-interactive="false"` 并按 shadow root/document 幂等注入 pointer-events
      规则，桥接渲染的原生 button 的 hover/active/focus 静默；浏览器探针覆盖桥接按钮的
      pointer-events 门控与事件转发（R3、R4、R6）。

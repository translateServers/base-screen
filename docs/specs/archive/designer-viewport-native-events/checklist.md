# Designer Viewport Native Events Checklist

> 状态：已完成（2026-08-14）

- [x] 状态栏以 `data-status-toggle="native-events"` switch 替换静态「事件」，默认 aria-checked="false"。
- [x] 开关样式与 snap/guides 一致（.status-toggle/.status-toggle-dot），无几何变化、无抖动。
- [x] `.status-item` 样式规则及其测试断言已移除，无死代码残留。
- [x] 工作台控制器持有独立实例状态；点击经 surface router 路由；aria 与状态同源渲染。
- [x] 开关切换触发 `onNativeEventsChange` 回调；回调缺省时开关仍可用。
- [x] Renderer `setInteractive`：原地重渲染、元素实例复用、资源请求/数据状态保留。
- [x] Renderer `setInteractive`：disposed 失败关闭、同值 no-op、未渲染时仅记录状态。
- [x] 关闭时物料事件零外泄；开启时声明事件进入 `onMaterialEvent` 并按 manifest events 校验。
- [x] 原生 CSS/悬停交互（echarts 数据点 pointer 光标与 mouseenter/mouseleave 放大复位）与点击事件同受 interactive 门控：设计态开关关闭时无悬停监听、无光标，编辑态无 hover 干扰。
- [x] React/Vue 桥接原生控件（button 等）的 hover/active/focus 原生 CSS 交互同受门控：非交互模式注入 pointer-events 规则后按钮无指针交互，设计器选择/拖拽命中测试不受影响。
- [x] Designer 元素转发 `base-screen-material-event`（bubbles/composed，detail 与 Viewer 同形）。
- [x] 渲染器重建（unload/initialize）后开关状态保持（createRenderer 读取工作台同一状态源，typecheck 覆盖）；setInteractive 失败经 emitDiagnostics 上报（applyNativeEvents 守卫，代码评审覆盖）。
- [x] 无 ScreenDocument/Material Manifest/Viewer/宿主状态 schema/SDK 导出破坏；renderer 变更 additive。
- [x] 文案全部来自 `designer-ui-text.ts`；browser 树无内联 CJK 字面量（check-designer-ui 门禁）。
- [x] 单元测试、verify-browser-harness 与 `pnpm verify:m0` 全绿；测试矩阵与实现一致。

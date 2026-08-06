# Designer 事件系统验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 宿主零影响

- [x] window 级监听仅处理 `composedPath` 含本 shadow root 或本设计器发起的事件，其余零副作用（unit + browser 证据）。
- [x] 焦点在宿主页面时，宿主全部快捷键与默认行为不受设计器影响（browser harness `assertEventSystemGuards`）。
- [x] 不注册 beforeunload/visibilitychange/resize；dirty 状态只经既有事件暴露（event-boundaries.md §4）。
- [x] `disconnectedCallback` 注销全部 window/capture 监听，多实例无监听泄漏（unit + 多实例 browser smoke）。

## 键盘管控

- [x] 无条件黑名单（F5、Ctrl+R、Alt 单按；非可编辑的 Ctrl+W/T/N/P/J、Alt+←/→）在 capture 阶段被拦截（`designer-event-policy.test.ts` + `designer-event-system.test.ts`，浏览器端证据由 Task 6 harness 补齐）。
- [x] 条件黑名单（Ctrl+S/P/0/=/-/D/H/K/L/F）：命令执行则应用语义，未执行也 preventDefault。
- [x] Firefox 快速查找（`/`、`'`）在非可编辑目标被拦截。
- [x] IME composition 期间不路由任何命令；AltGr 布局不误触发 Ctrl+Alt 命令；repeat 按操作分类（`repeatable` 接线：delete/nudge 系列）。
- [x] 仲裁顺序保持现状超集；既有操作快捷键、Space 抓手、tablist 方向键回归通过。

## 手势抑制

- [x] 拖拽/变换/框选/平移/创建激活期间快捷键零执行（capture 全吞）、contextmenu 阻止。
- [x] 全退出路径（pointerup/pointercancel/lostpointercapture/window blur）恢复抑制状态。

## 指针管控

- [x] 画布 wheel=垂直平移、shift+wheel=水平平移、ctrl/meta+wheel=缩放，宿主页面不滚动。
- [x] 面板等可滚动表面 wheel 保持原生滚动（监听绑定在 viewport 内）。
- [x] selectstart 系统化（画布禁选、手势期全 shadow 禁选、可编辑放行）；中键 mousedown 阻止自动滚动；
      Safari gesturestart/gesturechange 阻止；画布与 viewport `touch-action: none`。
- [x] contextmenu 全 shadow 表面阻止默认；画布多态菜单可用，面板不新增菜单。

## 窗口守卫

- [x] 拖拽不出设计器（window dragover/drop 仅拦本设计器发起或落点在本 shadow 的事件）；文件拖入不默认打开；
      宿主自身拖拽零干预。
- [x] copy/cut/paste 非 editable 路由到应用剪贴板 ops（cut 无注册操作仅阻止默认），editable 保留原生。
- [x] window blur 统一复位手势、空格、菜单、context menu、面板 resize、参考线拖拽；`disconnectedCallback` 注销全部 window 监听。

## 边界文档

- [x] 不可阻止键清单与平台差异矩阵已文档化（[event-boundaries.md](./event-boundaries.md)：DevTools/隐身/Alt/AltGr/Firefox 快速查找/iframe 隔离）。

## 质量

- [x] `common/events/` 纯逻辑有 chord/黑名单/上下文分类单元测试（`designer-key-chords.test.ts`、`designer-event-policy.test.ts`，24 例）。
- [x] browser 测试与 harness 覆盖键盘拦截、手势抑制、wheel、剪贴板、DnD、多实例与生命周期（`assertEventSystemGuards` + engine browser/dom 测试）。
- [x] test matrix 双向映射完整；受影响包质量门与 `pnpm verify:m0` 通过。

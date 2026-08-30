# Designer 事件系统任务

> 状态：实施中
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

- [x] Task 1：`common/events/` 纯逻辑层（R2、R7）。
  - [x] 新增 `engine/common/events/` 叶子子层：增强 chord 规范化（修饰键归一 + IME 守卫 + AltGr 守卫 + repeat 分类）。
  - [x] 黑名单表：全目标（无条件 F5/Ctrl+R/Alt；条件 Ctrl+S/0/=/±）、非可编辑（无条件 Ctrl+W/T/N/P/J/Alt+←/→；条件 Ctrl+D/H/K/L/F）与 Firefox 快速查找条目。
  - [x] 上下文裁决：editable / 手势激活 / repeat 分类，输出"阻止默认 / 执行命令 / 放行"三态。
  - [x] operation 定义新增 `repeatable` 声明并接线（delete、nudge 系列为 true）。
  - [x] 单元测试：`designer-key-chords.test.ts`（chord 解析、IME/AltGr）、`designer-event-policy.test.ts`（黑名单三态、手势抑制、repeat、editable 原生保留），共 24 例通过。
  - [x] 同步 AGENTS.md 的 `engine/common/` 子层依赖方向描述与 `check-engine-import.mjs` 的 `COMMON_SUBLAYERS`（events 为独立叶子）。

- [x] Task 2：键盘通道接入（R1、R2）。
  - [x] capture 阶段监听接入 shadow root（`DesignerSurfaceRouter` 新增 `keyDownCapture`/`keyUpCapture` capture 绑定），黑名单接线（无条件+条件）。
  - [x] 统一仲裁入口收敛 `index.ts` `onKeyDown`：capture 全吞（block）→ bubble 命令通道（command：阻止默认 + 执行；未启用也阻止浏览器默认）→ viewport 状态通道；控件级（tablist/layers/panel）优先顺序保持现状超集。
  - [x] 多实例归属：shadow-root capture 只接收进入本 shadow 的事件，天然按实例隔离（window 级监听由 Task 5 负责归属过滤）。
  - [x] 回归：既有操作快捷键、Space 抓手、Escape 菜单、tablist 方向键行为不变（engine 全量 157+7 例通过，不含工作区既有的 workbench WIP 失败）。
  - [x] 测试：`designer-event-system.test.ts`（capture 全吞/editable 原生/手势抑制/命令解析/AltGr）、`designer-event-policy.test.ts` 黑名单三态与未命中补位 prevent。

- [x] Task 3：手势激活抑制（R3）。
  - [x] 手势 controller 上报激活状态（`active` getter，覆盖拖拽/变换/框选/平移/创建），经回调注入事件系统。
  - [x] 激活期间 capture keydown/keyup 全吞（keyup 例外：Space 放行到 viewport 以复位抓手）；contextmenu 阻止；全退出路径（pointerup/pointercancel/lostpointercapture/window blur）恢复。
  - [x] 测试：`designer-gesture-controller.test.ts` 新增 `active` 全退出路径用例；`designer-event-system.test.ts` 手势全吞用例。

- [x] Task 4：指针默认行为（R4）。
  - [x] wheel：画布内普通滚轮=垂直平移、shift+wheel=水平平移、ctrl/meta+wheel=缩放（光标锚定），passive:false 全 preventDefault（含 deltaMode 行/页换算）；画布外面板保持原生滚动（监听绑定在 viewport 内）。
  - [x] selectstart 系统化（shadow 级：手势激活期全 shadow 禁选，可编辑放行；画布常禁选保留在手势控制器）。
  - [x] auxclick 中键：画布 mousedown button 1 preventDefault（自动滚动由 mousedown 默认动作启动）。
  - [x] Safari gesturestart/gesturechange：非可编辑目标阻止默认（router 新增 gesture 绑定）。
  - [x] 画布与 viewport 声明 `touch-action: none`（designer-workbench.css）。
  - [x] contextmenu 全 shadow 表面阻止默认（画布走多态菜单，面板仅阻止，不新增菜单）。
  - [x] 测试：viewport wheel 三语义 + deltaMode + 阻断页面滚动；router selectstart/gesture 路由；gesture 控制器中键。

- [x] Task 5：window 级守卫与生命周期（R5）。
  - [x] window DnD 防线：`connectWindowGuards` 仅拦本设计器发起的拖拽（dragstart 标记）或落点在本 shadow 的事件（文件拖入不默认打开）；宿主拖拽零干预（测试证明）。
  - [x] copy/cut/paste 事件路由：非 editable → 应用剪贴板 ops（copy/paste）+ preventDefault；cut 无注册操作仅阻止默认；editable → 原生。
  - [x] window blur 统一复位（手势/空格/菜单/context menu/面板 resize/参考线拖拽，经 `onWindowBlur` 回调）。
  - [x] connect/disconnect 对称生命周期：`connectedCallback` 注册、`disconnectedCallback` 注销全部 window 监听；多实例各自持有引用。
  - [x] 测试：`designer-event-system.test.ts` 自有拖拽拦截/宿主拖拽零干预/文件拖入阻止/监听注销。
  - [x] 空格抓手与键盘焦点解耦（R4 增量）：viewport 维护 hover 状态（pointerenter/leave），事件系统 window keydown/keyup 旁路（落点在本 shadow 内跳过），鼠标悬停视窗即可空格拖拽平移；可编辑目标保留原生空格。证据：`designer-viewport-controller.test.ts`（hover 激活/editable 保护）、`designer-event-system.test.ts`（window 归属过滤）、浏览器实测（焦点在 body + hover 空格拖拽 transform 变化、视窗外空格宿主滚动不受影响）。
  - [x] 修复空格松开后工具/光标残留：拖拽产生的 click 事件被 `executeToolFromTarget` 的 `closest('[data-tool]')` 误命中 viewport 容器上的 `data-tool="hand"`（工具状态属性与工具栏按钮命中选择器同名）→ 误执行 `tool.hand` 永久切换工具。修复：viewport 工具状态属性改名 `data-active-tool`（CSS 同步），`executeToolFromTarget` 限定 `button[data-tool]`（双保险）。证据：浏览器实测拖拽后松开空格 `activeTool=select`/`cursor=auto`/状态栏恢复，harness 全量通过。

- [x] Task 6：边界文档与质量门（R6、R7）。
  - [x] 不可阻止键清单与平台差异矩阵文档化：[event-boundaries.md](./event-boundaries.md)（DevTools/隐身/Alt/Firefox 快速查找/deltaMode/Safari gesture/AltGr/Cocoa 文本键；iframe 隔离声明；beforeunload 宿主契约）。
  - [x] browser harness 新增 `assertEventSystemGuards`：设计器内 Ctrl+S/W/R 拦截、宿主焦点下零影响、拖拽隔离（自有拖拽拦截 + 宿主拖拽零干预）、多实例 smoke；全量 `verify-browser-harness.mjs` 通过（4 视口）。
  - [x] 修复守卫注册时机缺陷：connectedCallback 在 catalog 未注入时 initialize 早退导致 shadowRoot 为空、window 守卫漏注册 —— 守卫注册改为"shadow 表面就绪即注册"（connectedCallback + initialize 双入口，实例幂等），browser case 证明加载即生效。
  - [x] 修复 Edge/Chrome Alt 访问键聚焦：Chromium 对 Alt 自身 keydown 上报 altKey=true，产生 'Alt+Alt' 伪 chord 使黑名单失配 —— chord 规范化对修饰键自身返回裸键名（`designer-key-chords.ts` + 单元测试），真实可信 Alt 按键 browser case 证明焦点保持（不聚焦浏览器"设置及其他"按钮）。
  - [x] harness 断言范围修正：窄屏视口命中 `@media (max-width: 1023px)` 会隐藏 `.workspace`（可用空间警告），`assertEventSystemGuards` 限定在完整桌面流程视口执行；焦点恢复走真实点击路径（规避 Chromium 复杂流程后 shadow 元素编程 focus() 静默失效）。
  - [x] test matrix 反向映射；engine 全量测试、`check-engine-import`、boundary、`pnpm verify:m0` 通过。

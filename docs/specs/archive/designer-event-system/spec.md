# Designer 事件系统规格

> 状态：生效中
> 最近更新：2026-08-06
> 定位：浏览器默认键盘/鼠标事件行为管控与统一事件通道，零宿主影响
> 前置：[Designer Engine](../designer-engine/spec.md)、[ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md)（本地作者内核范围）
> 评审：[设计评审](../../../plans/archive/designer-event-system/design-review.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 1. 目标

以 PS 级桌面应用的输入管控标准，为 Designer 建立系统级事件管理：管控浏览器默认键盘/鼠标行为
（标签页、保存网页、缩放、滚动、文本选择、右键菜单、原生拖拽、剪贴板等），统一快捷键仲裁通道，
并在手势激活期间系统性抑制误操作。所有拦截 SHALL 只作用于设计器自身 shadow 表面，对宿主页面
零影响、零监听泄漏。

## 2. 不变边界

- **零宿主影响（硬边界）**：所有 window/document 级监听只处理"落点在本设计器 shadow 内"的事件
  （`event.composedPath().includes(ownRoot)` 归属过滤）或本设计器发起的事件；其余事件一律零副作用
  （不 preventDefault、不 stopPropagation、不改状态、不产生任何可观测行为）。
- 不注册 `beforeunload`、`visibilitychange`、`resize` 等页面级监听；dirty 守卫、自动保存时机是宿主
  契约，designer 只通过既有 `base-screen-dirty-change` 事件暴露 dirty。
- 同一页面多实例互不干扰：每个实例只拦截落点在自己 shadow 内的事件；监听器以实例字段持有，
  `disconnectedCallback` 对称注销，无泄漏。
- 浏览器 chrome 级快捷键（DevTools、隐身窗口等）页面无法阻止，列为文档化预期，不承诺。
- 零新增生产依赖；不改变 Engine 公共导出；不改变 canonical document、operation 语义与既有仲裁链行为。
- 探索阶段命名规则：不引入版本标记字段或版本化公共名称。

## 3. Requirements

### R1：键盘默认行为黑名单

事件落点在本设计器 shadow 内时，Designer SHALL 在 capture 阶段拦截 keydown/keyup 的浏览器默认行为。
黑名单分全目标与非可编辑目标两组（避免破坏 macOS Cocoa 文本编辑组合，如 `Ctrl+W` 删词、`Ctrl+T` 换位、
`Ctrl+N` 下一行、`Ctrl+D/K` 与 `Option+←/→` 词跳转）：

- **全目标无条件**（无应用命令、无原生文本语义，永远 preventDefault）：`F5`、`Ctrl+R`、
  `Alt` 单按（Firefox 菜单栏；AltGr 除外）。
- **全目标条件**（命令优先，命令未执行时也 preventDefault；可编辑目标上同样阻止浏览器默认）：
  `Ctrl+S`（保存网页）、`Ctrl+0`、`Ctrl+=`、`Ctrl+-`（浏览器缩放）。
- **非可编辑无条件**：`Ctrl+W`、`Ctrl+T`、`Ctrl+N`、`Ctrl+P`、`Ctrl+J`、`Alt+←`、`Alt+→`。
- **非可编辑条件**（命令优先，命令未执行时也 preventDefault）：`Ctrl+D/H/K/L/F`
  （收藏/历史/地址栏/查找 vs 应用操作）。
- Firefox 快速查找：非可编辑目标上的 `/`、`'` keydown preventDefault。
- 条件语义：先按统一命令通道裁决，命令未执行（未注册/不可用/未启用）时仍然 preventDefault。
- 既有已注册操作的阻断行为（如 `Ctrl+Z/C/V/X/A`）保持不变；可编辑目标保留全部原生文本编辑组合。
- 多实例：拦截只对 `composedPath` 含本 shadow root 的事件生效。

### R2：统一键盘命令通道

Designer SHALL 用单一仲裁入口取代 `index.ts` `onKeyDown` 的散落逻辑，仲裁顺序保持为现有行为超集：

1. IME 守卫：`event.isComposing === true` 或 `event.key === 'Process'` 时不路由任何命令、不阻止默认。
2. editable 守卫：`input/select/textarea/contenteditable` 目标保留原生文本编辑与原生快捷键。
3. 控件级：workbench tablist 方向键等 shadow 内控件自带键盘行为优先（现状保持）。
4. Escape/菜单：菜单与 context menu 关闭优先（现状保持）。
5. 命令通道：chord 规范化 → operation registry 查找与执行（沿用 `shortcutFromKeyboardEvent` 归一规则）。
6. viewport 状态通道：Space（抓手）与缩放等 viewport 语义经同一入口调用，行为不变。

chord 规范化 v2 SHALL 增加：

- **AltGr 守卫**：`getModifierState('AltGraph') === true` 时不匹配任何带 Alt 的命令（防 `Ctrl+Alt+L/H/V`
  等对齐快捷键在 AltGr 布局误触发），默认行为放行。
- **repeat 分类**：操作定义新增 `repeatable` 声明（`Delete`、方向键 nudge 等连续型为 true）；
  非 repeatable 操作在 `event.repeat === true` 时不执行命令，但 preventDefault 保持。

纯裁决逻辑（chord 解析、黑名单判定、上下文分类）SHALL 位于 `engine/common/events/` 新叶子子层，
环境无关、以结构事件形状输入、vitest 可测；`browser/dom/` 只负责监听挂载与分发。

### R3：手势激活抑制

任一画布手势激活期间（拖拽、变换、框选、平移、创建）：

- keydown/keyup SHALL 在 capture 阶段被吞（preventDefault + stopPropagation），不执行任何应用命令；
- contextmenu 默认行为阻止；
- 手势结束 SHALL 全退出路径恢复（pointerup/pointercancel/lostpointercapture/window blur）。

手势 controller SHALL 上报激活状态（对齐既有 `setPanning` 回调模式）；事件系统在激活期间切换裁决为"全吞"。
当前阶段无例外按键；例外留待真实需求出现时以 Spec 增量引入。

### R4：指针默认行为

- **wheel**：画布内普通 wheel = 垂直平移画布（`panBy({x: 0, y: deltaY})`）、`shift+wheel` = 水平平移、
  `ctrl/meta+wheel` = 缩放（现状保留）；全部 preventDefault（passive:false），阻断宿主页面滚动。
  画布外表面（面板、工具栏、图层列表等可滚动区域）保持宿主/面板滚动，不拦截。
- **空格抓手与键盘焦点解耦**：窗口级 keydown/keyup 旁路（落点在本设计器 shadow 内的事件由既有
  链路处理），鼠标悬停视窗（pointerenter/leave 维护 hover 状态）即激活临时抓手，无需先点击聚焦
  视窗；可编辑目标保留原生空格输入；鼠标不在视窗内时宿主页面空格滚动不受影响。
- **selectstart**：画布表面始终禁选；手势激活期全 shadow 禁选；可编辑目标放行（系统化现有
  canvas 级 selectstart prevent + user-select 切换）。
- **auxclick**：画布表面中键 preventDefault（禁浏览器自动滚动）。
- **gesturestart/gesturechange**（Safari 触控板双指）：非可编辑目标 preventDefault，与 ctrl+wheel 等价。
- **touch-action**：画布与 viewport 容器声明 `touch-action: none`。
- **contextmenu**：全 shadow 表面阻止浏览器默认菜单（现状仅 viewport 内，index.ts contextMenu 绑定）；
  画布（`data-viewport` 内）走既有多态菜单；面板表面仅阻止默认，不新增菜单。

### R5：window 级守卫与生命周期

- **原生 DnD 防线**：window 级 `dragover`/`drop` 仅拦截本设计器发起的拖拽（dragstart 时在 dataTransfer
  写入设计器类型标记），阻止拖出设计器触发页面导航；宿主自身拖拽零干预。文件拖入设计器表面：
  阻止默认打开文件，不触发导航，不自动导入（导入保持显式操作）。
- **剪贴板事件**：非 editable 目标上的 `copy`/`cut`/`paste` 事件路由到应用剪贴板操作
  （与既有 `Ctrl+C/V` ops 同源）并 preventDefault；editable 目标放行原生。
- **blur 复位**：window blur SHALL 统一复位设计器内部状态（手势、空格、菜单/context menu、
  面板 resize、参考线拖拽）；复位只改设计器状态，不触达宿主。
- **生命周期**：capture/window 监听与 shadow root 同生命周期，`disconnectedCallback` 对称注销全部
  监听；window 监听回调内先做归属过滤，非归属事件立即返回。

### R6：边界与预期

- 浏览器不可阻止键 SHALL 文档化并列为预期（`F12`/`Ctrl+Shift+I/J/C` DevTools、`Ctrl+Shift+N` 隐身等）；
  完整键盘锁定由宿主 kiosk/PWA 负责。
- iframe 嵌入：window 级监听作用于 iframe 自身 window，宿主页面快捷键天然隔离，SHALL 在文档中声明。
- 平台差异矩阵（Chrome/Firefox/Safari/Edge）SHALL 记录拦截可靠性与 `Alt`/AltGr/快速查找差异。
- beforeunload、visibilitychange、resize 不在本 Spec 范围（宿主契约或后续 Spec）。

### R7：产品质量

- `common/events/` 纯逻辑有完整单元测试：chord 解析（修饰键归一、IME、AltGr、repeat）、
  黑名单裁决（无条件/条件/未命中）、上下文分类（editable/手势激活/菜单）。
- browser 测试覆盖：手势抑制、wheel 语义、剪贴板事件路由、contextmenu 全表面、blur 复位、
  connect/disconnect 生命周期。
- browser harness 新增 case：焦点在设计器内时 `Ctrl+S`/`Ctrl+W` 被拦截；焦点在宿主时宿主快捷键不受影响；
  拖拽不出设计器；多实例隔离与监听注销。
- 受影响包 lint/typecheck/unit、`check-engine-import`、boundary 与 `pnpm verify:m0` 通过。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的全部适用项均已完成。
- R1-R7 与当前自动化证据双向映射（`test-matrix.md`）。
- 宿主零影响边界有专门验证证据（多实例、拖拽、宿主按键不受影响、监听注销）。
- 受影响包质量门、browser、API、boundary、tarball 与 `pnpm verify:m0` 均通过。

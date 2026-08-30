# Designer 事件系统设计评审

> 状态：已评审（2026-08-06 拍板：wheel=平移画布、common/events/ 新子层、P1+P2 一个 Spec、新建独立 Spec）
> 日期：2026-08-06
> 评审对象：拟议的"系统级事件管理"（capture 黑名单 + 命令通道 + 上下文通道三通道设计）
> 代码基线：engine 当前 HEAD（含未提交的工作区改动）

## 1. 结论摘要

拟议设计方向成立（PS 级应用必须拥有系统级默认行为管控），但需要三处修正后才能进入 Spec：

1. **拆分归属**：纯逻辑（增强 chord 规范化、黑名单表、上下文裁决）下沉到 `common/` 做环境无关可测实现；`browser/dom/` 只保留 DOM 编排（capture 监听、window 监听、生命周期），手势状态经回调注入 —— 遵守 `dom` 不得依赖 `controllers` 的分层。
2. **范围分层**：评审确认存在 3 个真实正确性缺口（手势激活中快捷键漏入、浏览器 chrome 快捷键无拦截、画布滚轮滚宿主页面），应作为 P1；window 级守卫（DnD、剪贴板事件）为 P2；模态栈/遥测等系统化为 P3。
3. **预期管理**：DevTools、隐身窗口等浏览器级快捷键页面无法可靠阻止，Spec 必须声明 best-effort 边界，完整锁定由宿主（kiosk/PWA）负责。

## 2. 现状盘点（代码证据）

### 2.1 已管控

| 事件 | 位置 | 说明 |
| --- | --- | --- |
| `selectstart` | gesture-controller.ts:147 | 画布系统性禁选文本 |
| `ctrl/meta+wheel` 缩放 | viewport-controller.ts:37,125 | passive:false，阻止浏览器缩放 |
| `Space` 滚动 | viewport-controller.ts:134-145 | keydown 拦截 + keyup/blur 复位 |
| 画布焦点收敛 | gesture-controller.ts:172-173 | pointerdown preventDefault + focusViewport |
| `contextmenu` 路由 | surface-router.ts:40 | shadow 内已挂载（画布多态菜单，designer-menu.ts） |
| `Escape` 菜单关闭 | index.ts:1041-1046 | 先于操作注册表 |
| editable 输入隔离 | index.ts:1047 | isEditableTarget 守卫 |
| `lostpointercapture`/`pointercancel` | gesture-controller.ts:144, surface-router.ts:65 | 手势取消 |
| 物料 DnD | gesture-controller.ts:149-150 | dragover/drop 白名单 |
| 快捷 chord 解析 | operation-registry.ts:74-85 | `shortcutFromKeyboardEvent`（Backspace→Delete、Cmd→Ctrl 归一） |

### 2.2 真实缺口（按严重度）

| # | 缺口 | 复现路径 | 严重度 |
| --- | --- | --- | --- |
| 1 | **手势激活期间快捷键漏入** | 拖拽/缩放/旋转/框选进行中按 `Delete`/`Ctrl+Z`/`Ctrl+C`，操作直接执行（可能删除正在拖拽的组件）；当前无任何 gesture-active 抑制 | 高（正确性 bug） |
| 2 | **浏览器 chrome 快捷键无拦截** | `Ctrl+W/T/N/S/P/F5` 从未被注册，按下即关标签/存网页/刷新；`Ctrl+0/=/-` 仅在 op enabled 时 preventDefault（index.ts:1049），op 禁用态（如无文档）漏出浏览器缩放 | 高 |
| 3 | **画布滚轮滚宿主页面** | viewport 只拦 ctrl/meta+wheel，普通滚轮在画布上滚动宿主页面，无 PS 式画布平移 | 高 |
| 4 | **copy/cut/paste 事件通道绕过** | 快捷键 `Ctrl+C/V` 走 ops，但右键菜单原生复制、Linux `Ctrl+Insert`/`Shift+Insert`、浏览器原生 paste 事件绕过应用剪贴板 | 中 |
| 5 | **window 级 DnD 守卫缺失** | 把画布图片拖到标签页会打开图片导航；文件拖入窗口默认打开 | 中 |
| 6 | **Alt 键未管控** | Firefox `Alt` 单按触发浏览器菜单栏；`Alt+←/→` 历史导航 | 中 |
| 7 | **IME 守卫不完整** | 输入框靠 isEditableTarget 间接挡；无 `isComposing`/`key==='Process'` 显式守卫（防御纵深 + 未来画布内文本编辑必用） | 中 |
| 8 | **触控路径缺失** | Safari `gesturestart/change`（触控板双指缩放）未处理；全部 CSS 无 `touch-action` 声明 | 低-中 |
| 9 | **状态复位不完整** | 只有 viewport blur 一处复位；window blur（焦点离开页面）时空格/手势/菜单状态无统一复位 | 中 |
| 10 | **页面级时机未接入** | `beforeunload`（dirty 守卫）、`visibilitychange`（自动保存时机）、`resize`/DPR（标尺重渲染）均未处理 | 低-中 |

## 3. 拟议设计逐项评审

### 3.1 三通道：capture / command / context

方向成立，两点修正：

- **capture 通道须区分两类黑名单**：
  - *无条件*：`Ctrl+W/T/N/S/P/F5` 等，永不产生应用命令，capture 阶段直接 preventDefault；
  - *条件*：`Ctrl+0/=/-`（浏览器缩放 vs 应用缩放）、`Ctrl+D/H/K/L`（收藏/历史/地址栏 vs 应用操作），仅在命令未执行/不可用时 preventDefault —— 现行 `findByShortcut` 只在 `enabled` 时 preventDefault（index.ts:1049），需要"未命中也拦"的补位。
- **context 通道顺序是现有仲裁链的超集**：workbench 控件（tablist 方向键）→ Escape/菜单 → 操作注册表 → viewport（Space）。新系统不得改变该顺序；`Space`/缩放建议收敛进 operation registry，viewport 的 `onKeyDown` 只留状态复位。

### 3.2 归属与分层

| 层 | 职责 | 依据 |
| --- | --- | --- |
| `common/events/`（新叶子子层） | 增强 chord 规范化（IME/AltGr/repeat 分类）、黑名单表、上下文裁决 | 沿用 `DesignerKeyboardEventShape` 模式（operation-registry.ts:66），环境无关、vitest 可测 |
| `browser/dom/designer-event-system.ts` | shadow capture 监听、window 监听、connect/disconnect 生命周期、手势状态回调注入 | 与 DesignerSurfaceRouter 同为纯 plumbing，组合根（index.ts）注入 bindings |
| `controllers` | 手势 controller 增加 `setActive` 上报 | 现 `setPanning`（gesture-controller.ts:124）已有先例 |

否决项：`common/operations` 内塞黑名单（污染操作层）、`controllers` 层新建大系统（违反 dom 不依赖 controllers 的单向规则）。

### 3.3 手势抑制语义

- gesture-active 期间 capture keydown 一律吞掉（含 preventDefault），**但**需定义例外：`Delete` 重复、拖拽中 `Alt`（复制语义跟随指针而非键盘）——建议 P1 先全吞，例外等真实需求。

### 3.4 window 监听与多实例

- **shadow retargeting**：window 级监听里 `event.target` 会被重定向为 host 元素，归属过滤必须用 `event.composedPath().includes(root)`，不能用 `root.contains(target)`。
- **多实例**：window 监听按实例注册/注销（disconnectedCallback），同一页面多个 designer 各自过滤归属；黑名单只对"事件落点在自己 shadow 内"生效，不得全局劫持宿主页面。
- **beforeunload 不归 designer**：多实例无法仲裁；宿主已有 `base-screen-dirty-change` 事件，dirty 守卫是宿主契约，designer 只负责暴露状态。

### 3.5 浏览器不可阻止键

`F12`/`Ctrl+Shift+I/J/C`（DevTools）、`Ctrl+Shift+N`（隐身）等页面无法可靠 preventDefault。Spec 必须声明 best-effort 边界，并给出平台差异矩阵（Chrome/Firefox/Safari/Edge）。

## 4. 技术风险与对策

| 风险 | 对策 |
| --- | --- |
| window 监听误判归属（shadow retargeting） | 一律 `composedPath().includes(root)` 过滤 |
| 多实例 window 监听泄漏 | disconnectedCallback 注销；实例字段持有 listener 引用 |
| AltGr 布局误触发 `Ctrl+Alt+字母` 快捷键 | `getModifierState('AltGraph')` 或 key 长度守卫，`Ctrl+Alt+L/H/V` 等对齐快捷键需重测 |
| key repeat 误触发瞬时操作 | 操作定义表新增 `repeatable` 声明（Delete/nudge=可重复，缩放=去抖） |
| 手势中 `setPointerCapture` 后键盘仍可达 | capture keydown 无条件吞（3.3） |
| window 级 DnD 全局劫持宿主 | 仅拦截"本 shadow 发起的拖拽"（dragstart 时打类型前缀标记），其余放行 |
| 与现有仲裁顺序冲突 | 保持超集顺序（3.1），回归现有 gesture/workbench 测试 |
| 与活动 Spec 重叠 | 相关快捷键与菜单能力由本 Spec 独立收敛；范围受 [ADR-0027](../../../decisions/ADR-0027-lightweight-designer-foundation-host-processing.md) 约束 |

## 5. 备选方案

| 方案 | 评价 |
| --- | --- |
| A. 增量加固现有 router（capture 监听 + 黑名单表 + 手势抑制回调） | P1 推荐：不改结构、风险最小，可在现有 `DesignerSurfaceRouter` 上扩展 capture 阶段与 window 生命周期 |
| B. 全新 `DesignerEventSystem` 替换 router | P2 需要（window 守卫、copy/paste 事件、模态栈），但应以 A 的接口演进，不推翻重来 |
| C. 第三方库（hotkeys-js 等） | 否决：依赖评估已拒绝（dependency-evaluation.md:21），维持零新增依赖 |

## 6. 建议范围（阶段划分）

- **P1 正确性**（一个 Spec 落地）：capture 黑名单（无条件+条件）、增强 chord 规范化（IME/AltGr/repeat）、手势激活抑制、wheel 语义决策。
- **P2 窗口守卫**：window DnD、copy/cut/paste 事件、auxclick/gesturestart/touch-action、window blur 复位。
- **P3 系统化**：模态栈、焦点环管理、事件遥测、resize/DPR、beforeunload 宿主契约。

## 7. 决策记录（2026-08-06 已拍板）

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | wheel 语义 | 画布普通滚轮 = 平移画布（shift+wheel=水平平移，ctrl/meta+wheel=缩放保留） |
| 2 | 归属 | `common/events/` 新叶子子层 |
| 3 | 范围 | P1+P2 合并为一个 Spec |
| 4 | Spec 归并 | 新建 `docs/specs/designer-event-system/`，作为轻量作者内核的独立 Spec |
| 5 | 右键菜单 | 全 shadow 表面阻止默认菜单；仅画布多态菜单，面板不新增菜单（写入 Spec 边界） |
| 6 | beforeunload | 宿主契约，designer 不接管（写入 Spec 边界） |
| 7 | 宿主影响 | **零宿主影响硬边界**：window 级监听仅处理落点在本设计器 shadow 内的事件（composedPath 归属过滤），其余一律零副作用；DnD 仅拦本设计器发起的拖拽；不注册 beforeunload/visibilitychange；disconnectedCallback 注销全部监听 |

Spec：[designer-event-system](../../../specs/archive/designer-event-system/spec.md)

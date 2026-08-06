# Designer 事件系统边界说明

> 依据：[spec.md](./spec.md)
> 日期：2026-08-06
> 定位：浏览器默认行为管控的边界预期、平台差异与宿主契约文档化（R6）

## 1. 浏览器不可阻止键

以下浏览器 chrome 级快捷键无法被页面可靠阻止，设计器不承诺拦截，完整键盘锁定由宿主
（kiosk 模式 / PWA 全屏）负责：

| 按键 | 说明 |
| --- | --- |
| `F12`、`Ctrl+Shift+I/J/C` | DevTools 打开（页面无法阻止） |
| `Ctrl+Shift+N` | 隐身窗口（Chromium 系不可阻止） |
| 浏览器地址栏/下载条内置组合 | 由浏览器 chrome 接管，页面不可达 |

其余已列入黑名单的浏览器默认行为（标签页、保存网页、缩放、历史导航等）在焦点位于设计器内时
SHALL 被拦截，见 spec R1。

## 2. 平台差异矩阵

| 行为 | Chrome | Firefox | Safari | Edge |
| --- | --- | --- | --- | --- |
| `Alt` 单按弹菜单栏 | 无 | 有（已被黑名单拦截） | 无 | 无 |
| `/`、`'` 快速查找 | 无 | 有（非可编辑目标已被拦截） | 无 | 无 |
| `wheel` deltaMode | 像素（0） | 行（1），需要换算 | 像素（0） | 像素（0） |
| 触控板双指缩放事件 | `ctrlKey+wheel` | `ctrlKey+wheel` | `gesturestart/gesturechange`（已被阻止） | `ctrlKey+wheel` |
| AltGr 布局（欧式键盘） | `getModifierState('AltGraph')` 可用 | 可用 | 不适用 | 可用 |
| 中键自动滚动 | mousedown button 1 触发（已被阻止） | 同左 | 同左 | 同左 |
| macOS Cocoa 文本编辑组合（`Ctrl+W/T/N/D/K` 等） | 可编辑目标保留原生（黑名单不触碰 editable） | 同左 | 同左 | 同左 |

拦截可靠性结论：`Ctrl+0/=/-`、`Ctrl+W/T/N`、`Ctrl+S`、`F5`、`Ctrl+R`、`Alt+←/→` 在焦点位于
页面（含 shadow 内）时均可通过 keydown preventDefault 阻止；DevTools/隐身组合除外（见第 1 节）。

## 3. iframe 嵌入

- 设计器嵌入 iframe 时，window 级守卫（DnD 防线、blur 复位）作用于 iframe 自身的 window，
  与宿主页面天然隔离；宿主页面快捷键不会进入 iframe。
- 宿主页面的全局快捷键处理与设计器的拦截互不可见，宿主不得假设能观察到设计器内部的按键。

## 4. 宿主契约（designer 不接管）

| 能力 | 归属 | 说明 |
| --- | --- | --- |
| `beforeunload` dirty 守卫 | 宿主 | designer 只通过既有 `base-screen-dirty-change` 事件暴露 dirty 状态 |
| `visibilitychange` 自动保存 | 宿主 | 保存时机由宿主编排 |
| `resize` / DPR 标尺重渲染 | 宿主或后续 Spec | 当前标尺随 viewport 变化重渲染 |
| 页面级快捷键（焦点在宿主时） | 宿主 | designer 的拦截只对焦点位于自身 shadow 内的事件生效 |

## 5. 零宿主影响边界（硬边界验收口径）

- window 级监听仅处理"落点在本设计器 shadow 内"或"本设计器发起"的事件；其余一律零副作用。
- 证据：`verify-browser-harness.mjs` 的 `assertEventSystemGuards`（宿主焦点下按键不受影响、
  宿主拖拽零干预）、`designer-event-system.test.ts`（自有/宿主拖拽、监听注销）。

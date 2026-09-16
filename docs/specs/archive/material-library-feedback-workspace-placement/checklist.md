# Material Library Error Console Checklist

> 状态：已完成
> 依据：ADR-0035

## 控制台与状态（R1、R2）

- [x] 状态栏有稳定宽度的控制台入口、错误计数和可访问展开状态；弹窗关闭后焦点返回入口。
- [x] `data-material-library-status` 位于控制台而非 `[data-materials]`；部分/失败记录为错误，离线/更新显示为当前可操作状态。
- [x] `retry`、`reload`、`details` data-* 与 composed 宿主动作事件保持；草稿/不可用卡片语义不变。

## 可访问性与稳定性（R3）

- [x] 控制台错误条目具有 `alert`，非中断状态具有 `status`；清空、关闭、焦点、forced-colors 与 reduced-motion 可用。
- [x] 记录有界、重复状态不重复记录；打开、关闭、清空和状态切换不改变左侧搜索、分组、网格、画布或状态栏轨道几何。
- [x] 当前状态与历史记录分区清晰，历史最新优先且具有记录数和有上下文的空态。
- [x] Tab/Shift+Tab 不离开弹窗，Escape/遮罩关闭并返回入口焦点；清空后同一当前失败不立即回填历史。

## 兼容性与交付（R4、R5）

- [x] 状态 schema、catalog、Manifest、ScreenDocument、Renderer、Viewer、SDK API 和无状态路径保持不变。
- [x] DOM/控制器/样式与真实浏览器覆盖位置、状态、控制台、动作、卡片标记和无抖动。
- [x] 格式化、相关 Engine 检查、`pnpm verify:browser` 与 `pnpm verify:m0` 通过。
- [x] ADR/Spec 索引、能力基线、任务、检查表和测试矩阵均已同步完成状态。

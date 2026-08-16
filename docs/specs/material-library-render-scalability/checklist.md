# Material Library Render Scalability Checklist

> 状态：已完成（2026-08-16，`pnpm verify:fast` 全绿）

## 屏外跳过渲染（R1）

- [x] `.material-card-wrap` 含 `content-visibility: auto` 与 `contain-intrinsic-size: auto 140px`。
- [x] `auto` 关键字：记住最近真实渲染尺寸；未渲染元素用 140px 估算；`.rail` scrollbar-gutter 稳定，
      首帧无跳动。
- [x] 无 JS 窗口化/分页/DOM 结构变更；`hidden` 过滤与 CV 互不干扰（`display:none` 优先）。
- [x] 焦点/拖拽/可访问性不变（聚焦屏外卡片强制渲染为浏览器原生行为）。

## 搜索防抖（R2）

- [x] `onInput` 120ms 防抖：连续输入合并为一次渲染；窗口内再次输入重置计时器；
      `#materialSearch` 触发时统一更新。
- [x] clear 按钮 / Escape 清空立即取消未决计时器并同步渲染，无残留中间态。
- [x] 其余渲染路径（筛选/收藏/添加/分组/catalog 重建）保持同步不变。

## 边界与渐进增强（R3）

- [x] catalog、`materialLibraryState`、宿主动作、卡片 DOM 与可访问性语义不变。
- [x] 不支持 CV 的浏览器（Safari < 18、Firefox < 125）退回全量渲染，零功能损失；
      无需 polyfill / `@supports`。
- [x] 无抖动：估算尺寸只在首次渲染前生效，渲染后以真实尺寸为准。

## 质量门禁

- [x] engine 聚焦测试（防抖 3 个 + 既有面板控制器回归，18 个）通过；engine 全量测试 442/442 通过。
- [x] engine 相关文件 biome check 通过；干净提交 9704137 全量构建（turbo 12 任务）通过。
- [x] `pnpm verify:browser` 通过（含 CV 生效断言与适配防抖时序后的搜索断言）。
- [x] 基线 README、docs/specs/README.md、docs/decisions/README.md、usage.md 已登记；
      ADR-0041/0042 关联互注。
- [x] `pnpm verify:fast` 全量通过（2026-08-16 补跑：ADR-0043 提交后 12 任务 + check-packages /
      check-api / check-engine-import 全绿）。

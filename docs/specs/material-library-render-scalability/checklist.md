# Material Library Render Scalability Checklist

> 状态：进行中（2026-08-16）

## 屏外跳过渲染（R1）

- [ ] `.material-card-wrap` 含 `content-visibility: auto` 与 `contain-intrinsic-size: auto 140px`。
- [ ] `auto` 关键字：记住最近真实渲染尺寸；未渲染元素用 140px 估算；`.rail` scrollbar-gutter 稳定，
      首帧无跳动。
- [ ] 无 JS 窗口化/分页/DOM 结构变更；`hidden` 过滤与 CV 互不干扰（`display:none` 优先）。
- [ ] 焦点/拖拽/可访问性不变（聚焦屏外卡片强制渲染为浏览器原生行为）。

## 搜索防抖（R2）

- [ ] `onInput` 120ms 防抖：连续输入合并为一次渲染；窗口内再次输入重置计时器；
      `#materialSearch` 触发时统一更新。
- [ ] clear 按钮 / Escape 清空立即取消未决计时器并同步渲染，无残留中间态。
- [ ] 其余渲染路径（筛选/收藏/添加/分组/catalog 重建）保持同步不变。

## 边界与渐进增强（R3）

- [ ] catalog、`materialLibraryState`、宿主动作、卡片 DOM 与可访问性语义不变。
- [ ] 不支持 CV 的浏览器（Safari < 18、Firefox < 125）退回全量渲染，零功能损失；
      无需 polyfill / `@supports`。
- [ ] 无抖动：估算尺寸只在首次渲染前生效，渲染后以真实尺寸为准。

## 质量门禁

- [ ] engine 聚焦测试（防抖 + 既有面板控制器回归）通过；engine lint/typecheck/test 通过。
- [ ] `pnpm verify:fast` 全量通过。
- [ ] `pnpm verify:browser` 通过（含 CV 生效断言与既有封面/几何断言）。
- [ ] 基线 README、docs/specs/README.md、docs/decisions/README.md、usage.md 已登记；
      ADR-0041/0042 关联互注。

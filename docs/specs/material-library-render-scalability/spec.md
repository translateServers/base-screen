# Material Library Render Scalability Spec

> 状态：生效中（2026-08-16）
> 依据：[ADR-0042](../../decisions/ADR-0042-material-library-render-scalability.md)、[ADR-0040](../../decisions/ADR-0040-material-manifest-cover.md)、[ADR-0041](../../decisions/ADR-0041-material-cover-adaptive-fit.md)

## 1. 目标

在不改变物料库 DOM 结构、catalog 契约与宿主边界的前提下，用 CSS 原生能力（`content-visibility: auto`
+ `contain-intrinsic-size`）跳过屏外卡片渲染、用搜索防抖合并快速输入触发的渲染，支撑 500~2000+ 张
物料的物料库（真实宿主 xjdatahub 素材图片物料上限 500）保持流畅；不支持 CV 的浏览器静默退回全量
渲染（渐进增强，零功能损失）。

## 2. Requirements

### R1：卡片网格项跳过屏外渲染

- `.material-card-wrap` 声明 `content-visibility: auto` 与 `contain-intrinsic-size: auto 140px`。
- `auto` 关键字语义：元素最近一次真实渲染尺寸被记住；从未渲染的元素用 140px 估算——滚动条高度稳定
  （配合 `.rail` 的 `scrollbar-gutter: stable`），首帧不出现跳动。
- 不引入 JS 窗口化、不分页、不改变 DOM 结构；`hidden` 过滤（`renderMaterials` 的 `card.hidden`）与
  CV 互不干扰（`display:none` 优先）。
- 焦点/拖拽/可访问性不变：聚焦屏外卡片强制其渲染（浏览器原生行为），键盘导航与拖拽源稳定。

### R2：搜索输入防抖

- `onInput`（`data-material-search`）对 `renderMaterials` 做 120ms 防抖：连续输入只触发一次渲染；
  窗口内再次输入重置计时器；`#materialSearch` 在计时器触发时统一更新。
- clear 按钮与 Escape 清空路径立即取消未决计时器并同步渲染，不残留中间态。
- 其余渲染路径（筛选切换、收藏、添加物料、分组切换、catalog 重建）保持同步，行为不变。

### R3：边界不变与渐进增强

- 不改变 catalog、物料身份、`materialLibraryState`、宿主动作、卡片 DOM 结构与可访问性语义。
- 不支持 `content-visibility` 的浏览器（Safari < 18、Firefox < 125）退回全量渲染，功能零损失；
  不需要 polyfill 或 `@supports` 分支。
- 无抖动规约：`contain-intrinsic-size: auto` 只在首次渲染前提供估算，渲染后以真实尺寸为准；
  几何与滚动条不因 CV 引入新增跳动。

## 3. 非目标

- 真虚拟滚动/窗口化（IntersectionObserver 增删卡片）：5000+ 条目才需要。
- 分页或「加载更多」交互。
- 改变卡片 DOM、catalog 契约、宿主分组投影、`materialLibraryState`。
- 为旧浏览器提供降级分支或 polyfill。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部勾选；测试矩阵与当前实现一致。
- engine lint/typecheck/test、`pnpm verify:fast` 与 `pnpm verify:browser`（含 CV 生效断言）全部通过。
- ADR-0042/Spec 索引（docs/specs/README.md、docs/decisions/README.md）、usage.md 与基线 README 已登记。

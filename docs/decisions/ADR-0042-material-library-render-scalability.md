# ADR-0042：物料库渲染可扩展性（content-visibility + 搜索防抖）

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0034](./ADR-0034-designer-material-library-visual-hierarchy.md)、[ADR-0040](./ADR-0040-material-manifest-cover.md)、[ADR-0041](./ADR-0041-material-cover-adaptive-fit.md)

## 1. 背景

物料库目录由宿主投影（ADR-0031），条目数无引擎侧硬上限：真实宿主（xjdatahub）把素材库图片逐张注册为
物料条目，上限 500（`ASSET_IMAGE_CATALOG_MAX_ITEMS`），加官方物料约 520 张卡片。实测（本机 Chromium，
复刻引擎真实卡片样式）显示主要成本：

- **全量渲染首帧**：500 张卡片「建 DOM + 首帧」约 93ms，2000 张约 289ms，5000 张约 621ms；
- **滚动**：500~5000 张平均帧 7~9ms，p95 ≤14ms——滚动本身不是瓶颈；
- **搜索/筛选**：`renderMaterials` 只做 `hidden` 切换（O(N) 属性操作），500 张约 1~2ms，快速连续输入时
  每键一次布局失效仍可感知。

`content-visibility: auto` 让屏外卡片跳过渲染（layout/paint），实测把首帧从 93ms 压到 50ms（500 张）、
289ms 压到 160ms（2000 张）；配合 `contain-intrinsic-size` 保持滚动条高度稳定。这是纯展示优化：
不支持 CV 的浏览器（Safari < 18、Firefox < 125）静默退回全量渲染，行为与现状一致（渐进增强）。

## 2. 决策

1. 物料卡片网格项（`.material-card-wrap`）声明 `content-visibility: auto` 与
   `contain-intrinsic-size: auto 140px`（140px ≈ 卡片真实渲染高度估算）：屏外卡片跳过渲染，`auto`
   关键字记住最近一次真实渲染尺寸，滚动条高度估算稳定；不引入 JS 窗口化、不分页、不改变 DOM 结构。
2. 搜索输入（`onInput`）对 `renderMaterials` 做 **120ms 防抖**：快速连续输入只触发一次渲染；
   防抖窗口内再次输入重置计时器；清空（clear 按钮 / Escape）立即取消未决计时器并同步渲染。
   搜索状态 `#materialSearch` 在计时器触发时统一更新，避免中间态。
3. 只优化渲染路径：不改变 catalog、物料身份、`materialLibraryState`、宿主动作、卡片 DOM 结构、
   可访问性（aria/焦点/键盘导航）与拖拽行为；`hidden` 过滤语义不变。
4. 纯渐进增强：不支持 `content-visibility` 的浏览器（Safari < 18、Firefox < 125）自动退回全量渲染，
   无需 polyfill 或 `@supports` 分支；`contain-intrinsic-size` 单独声明无副作用。
5. 无抖动规约（ADR-0034）继续适用：`contain-intrinsic-size: auto` 只在元素首次渲染前提供估算尺寸，
   元素渲染后以真实尺寸为准；`.rail` 的 `scrollbar-gutter: stable` 已预留滚动条轨道。
6. 非目标维持：不做 IntersectionObserver 窗口化（5000+ 才需要，当前无宿主达到）、不做分页、
   不做服务端缩略图（ADR-0027 归宿主）。

## 3. 非目标

- 真正的虚拟滚动/窗口化（IntersectionObserver 增删卡片）：5000+ 条目才需要，留待未来。
- 分页、「加载更多」等交互模式变更。
- 改变卡片 DOM 结构、catalog 契约、宿主分组投影或 `materialLibraryState`。
- 为不支持 CV 的浏览器提供 polyfill 或降级分支。

## 4. 结果

- 500~2000 张物料的全量渲染首帧下降 40~57%（实测数据见 Spec 测试矩阵），滚动帧率不受影响。
- 搜索输入对每次击键的渲染触发合并为防抖后一次，快速输入无中间态、无布局抖动。
- 宿主（xjdatahub 500 张素材）无需改造；老浏览器退回现状，功能零损失。
- 实现、测试与验证由专项 Spec 保护。

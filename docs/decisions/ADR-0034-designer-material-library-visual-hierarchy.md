# ADR-0034：Designer 物料库视觉层级

> 状态：已接受
> 日期：2026-08-13
> 关联：[ADR-0024](./ADR-0024-designer-public-style-tokens.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0031](./ADR-0031-material-library-host-state.md)、[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)、[ADR-0033](./ADR-0033-host-controlled-material-library-grouping.md)
> 设计依据：项目本地 `ui-ux-pro-max` 检索的 Data-Dense Dashboard、Drill-Down Analytics、可见焦点、稳定几何与减少动态效果准则

## 1. 背景

ADR-0032 和 ADR-0033 已交付左侧物料库的缩略图网格、宿主分组路径与逐级导航。现有控件虽保留了功能和无抖动约束，
但路径、子组、筛选、状态与卡片缩略图同时使用强边框和强调色，导致紧凑侧栏缺少扫描优先级；基于分类色相的高饱和缩略图
也会让目录语义和物料操作竞争注意力。

Designer 是嵌入式大屏设计工具，不是营销页面。它需要用受限的面、间距、字重和状态色建立可重复扫描的操作界面，同时必须
保留宿主主题 Token、深浅主题、现有可访问语义和既有 data-* 交互契约。

## 2. 决策

1. 物料库采用紧凑的 data-dense/drill-down 层级：路径作为固定高度的上下文轨道，当前层级子组作为单行标签-计数控制，
   筛选作为单一选中态的分段控件。强调色只用于当前路径、当前筛选、键盘焦点和明确的语义状态，不再作为每个静态元素的
   外框。
2. 物料卡片采用安静的中性表面、固定预览区和清晰的名称/type 文本层级。分类图标继续由现有确定性规则生成，但缩略图
   不再依赖高饱和分类色相或装饰性渐变；悬浮、收藏、草稿与不可用状态必须在不改变卡片几何的前提下保持可辨识。
3. 样式仅消费既有 `--designer-*` Token 及 `color-mix()` 派生值。不得新增外部字体、图片请求、固定全局调色板、
   新依赖或宿主私有 DOM 入口；默认主题 Token 与公共主题 API 不因本次视觉优化而改变。
4. 所有已存在的分组、筛选、搜索、状态、卡片、收藏和键盘导航 data-* 契约及 ARIA 状态保持不变。视觉状态要提供
   `:focus-visible` 反馈，并在 `prefers-reduced-motion` 下移除新增加的过渡效果；hover/focus/active 不得改变布局尺寸、
   滚动轨道或网格位置。
5. 验收覆盖深浅主题、分组 drill-down、长标签截断、悬浮与焦点、收藏/不可用/草稿状态以及多视口截图。原有分组契约、
   catalog 一致性、Renderer 隔离和无分组兼容路径继续由 ADR-0033 的验证保护。

## 3. 非目标

- 修改 `BaseScreenMaterialLibraryGrouping`、Material Manifest、catalog、ScreenDocument、Renderer、Viewer 或 SDK 公共 API。
- 为宿主分组增加图标、颜色、拖拽排序、存储、网络、权限或新的配置字段。
- 重做整个 Designer 的全局主题、顶栏、画布、图层树或属性面板。
- 引入营销式 hero、装饰性 HUD、渐变背景、异步字体/图片或改变布局的悬浮动画。

## 4. 结果

- 宿主控制的目录树在窄侧栏中获得明确的路径和当前层级上下文，卡片网格更易于快速扫描与重复添加。
- Designer 保持可嵌入、Token 可覆写、深浅主题兼容和零新依赖的边界。
- 视觉策略、测试矩阵和交付证据由专项 Spec 记录，并与 ADR-0032/0033 的功能边界配套维护。

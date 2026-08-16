# Designer Left Panel Spec

> 状态：生效中
> 日期：2026-08-13
> 依据：[ADR-0032](../../decisions/ADR-0032-designer-left-panel-refactor.md)
> 修订：2026-08-16 —— 非目标第 4 条「Manifest 缩略图字段」项被 [Material Cover Thumbnail](../material-cover-thumbnail/spec.md)
> （依据 ADR-0040）取代：Manifest 现允许可选 `cover` URL 字段，仅用于物料库卡片封面展示；R2 缩略图由
> 分类图标/色相确定性派生与可选封面叠加组成，占位与失败回退语义见新 Spec。

## 1. 目标

重构 Designer 左侧面板的信息架构与交互，使其达到 Light Chaser 与阿里云 DataV 同类产品的组件库/
图层面板水准：缩略图网格组件库、按 Tab 隔离的工具栏、折叠图标轨、增强的图层树与键盘可达性；
同时保持全部既有 data-* 契约、宿主边界、主题 Token 与无抖动规约。

## 2. Requirements

### R1：左侧面板信息架构

左侧面板 SHALL 由「面板头（标题 + 数量 + 折叠按钮）+ sticky 分段 Tab（物料/图层）+ 每 Tab 独立
工具栏」构成。物料 Tab 的内容自上而下为：目录状态条、搜索（含清除按钮）、全部/收藏/最近分段筛选、
分类 chips、2 列缩略图卡片网格与空态；图层 Tab 为搜索与图层树。物料工具栏不得出现在图层 Tab。
Tab 切换 SHALL 不改变面板宽度、画布与右面板几何，不产生滚动条跳动。

### R2：组件缩略图卡片网格

物料库 SHALL 以 2 列等宽网格呈现卡片；卡片由预览缩略图（分类图标 + 从分类名确定性派生的色相）、
名称、type 与悬浮收藏星标组成。卡片 hover SHALL 仅使用 box-shadow/border-color/transform，
不得改变几何或引起重排；搜索匹配名称/type/分类与空态语义保持既有行为。

### R3：物料筛选与键盘可达性

「全部/收藏/最近」分段控件 SHALL 保持 `data-material-filter` 契约与 aria-pressed 语义；分类 chips
SHALL 保持 `data-material-category-filter` 契约。搜索框 SHALL 提供清除按钮，Escape SHALL 清空搜索
并保持焦点。卡片网格 SHALL 支持方向键 roving focus（Arrow/Home/End，聚焦可见卡片）；Enter SHALL
在控件级添加组件（先于命令通道，不触发「进入组内」命令）；Space SHALL 保持既有空格抓手语义
（ADR-0006）不劫持。收藏切换 SHALL 保持 `data-material-favorite` 契约。

### R4：折叠图标轨

面板折叠为 48px 轨道时 SHALL 显示垂直图标 Tab（物料/图层，带 tooltip 与 aria-label）；点击折叠态
图标 Tab SHALL 切换对应 Tab 并展开面板。`data-panel-collapse="left"` 契约与 Tab ARIA（role/tablist、
aria-selected）SHALL 保持；折叠/展开仅原子切换面板宽度变量，不引起其它区域几何跳动。

### R5：图层树增强

图层行 SHALL 使用 `--layer-depth` 变量驱动的缩进引导线（无逐级 DOM）；隐藏/锁定/上移/下移 SHALL
改为图标按钮，在 hover/focus-within/选中状态下显示（opacity 过渡，无几何变化）；含子节点的行 SHALL
显示子项计数。`data-layer-toggle`（hidden/locked）、`data-layer-move`（up/down）、`data-layer-select`、
`data-layer-collapse`、`data-layer-search`、`data-layer-show-more` 契约与树键盘导航、拖拽重排/重父级
SHALL 全部保持。

### R6：契约与边界兼容

既有全部 `data-*` 契约语义 SHALL 不变；ScreenDocument、Material Manifest、catalog、SDK 公共 API、
宿主作者桥与 verify-browser-harness 断言 SHALL 零破坏。不新增依赖与 package。全部新增用户可见文案
SHALL 集中于 `designer-ui-text.ts`，browser 树不得内联 CJK 字面量（`check-designer-ui.mjs` 门禁）。

### R7：质量与无抖动

左轨 SHALL 预留稳定滚动条轨道；hover/active/focus 不改变几何；Tab 切换、筛选切换、目录状态条显隐、
折叠/展开不引起布局位移或闪烁；主题切换走既有 Token 单一来源。单元测试、真实浏览器 harness
（几何/样式/键盘/拖拽/折叠轨断言 + 截图）与 `pnpm verify:m0` SHALL 全部通过。

## 3. 非目标

- 右侧检查器与画布工作区重构。
- 物料市场、远程分页、下载、审核与版本 UI。
- 面板宽度/收藏/最近使用的持久化（宿主存储边界）。
- 新增依赖（virtual-core/floating-ui）、package 或 Manifest 缩略图字段（Manifest 可选 `cover` 除外，
  见 [Material Cover Thumbnail](../material-cover-thumbnail/spec.md)）。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部完成，测试矩阵与当前实现一致。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过；基线文档登记本增量。

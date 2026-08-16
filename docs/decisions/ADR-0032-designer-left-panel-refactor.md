# ADR-0032：设计器左侧面板信息架构与交互重构

> 状态：已接受
> 日期：2026-08-13
> 互注：决策 2 的「Manifest 没有缩略图字段且不为此扩展」结论已于 2026-08-16 被
> [ADR-0040](./ADR-0040-material-manifest-cover.md) 部分取代（范围仅限可选 `cover` URL 字段），其余决策不变。
> 关联：[ADR-0031](./ADR-0031-material-library-host-state.md)、[ADR-0024](./ADR-0024-designer-public-style-tokens.md)、
> [ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0021](./ADR-0021-material-library-visibility.md)

## 1. 背景

左侧面板是设计器的高频操作区，现状存在结构性问题：

- 物料库以 40px 缩略图的横排列表呈现，信息密度与扫描效率低；「全部/收藏/最近」与分类 chips 两排筛选
  控件纵向堆叠，占满面板上半部，可浏览面积小。
- 搜索、筛选与分类控件位于 Tab 之上，切换到图层 Tab 时物料工具仍占据面板空间，信息架构混淆。
- 面板折叠后左轨只保留一个展开按钮，无法在折叠态切换物料/图层，小画布场景可用性差。
- 图层行常显全部文字操作按钮（隐藏/锁定/上移/下移），视觉噪音大；深层树缺少缩进引导。
- 物料卡片不支持键盘导航，键盘可达性弱于图层面板。

开源 Light Chaser（图标轨 + 分类列 + 组件缩略图网格）与阿里云 DataV（顶部搜索 + 分类 Tab +
缩略图网格卡片 + 图层树图标操作）已在同类大屏设计器中验证了这些交互范式：缩略图网格显著提升组件
扫描与拖拽效率，图标轨保留折叠态的导航能力，树形图层用图标操作替代常显文字按钮。

## 2. 决策

1. **信息架构**：左侧面板改为「面板头（标题 + 数量 + 折叠）+ sticky 分段 Tab（物料/图层）+ 每 Tab
   独立工具栏」。物料 Tab：目录状态条 → 搜索（带清除按钮）→ 全部/收藏/最近分段 → 分类 chips →
   2 列缩略图卡片网格 → 空态；图层 Tab：搜索 → 树。Tab 切换不改变面板与画布几何。
2. **组件卡片网格**：物料卡片改为 2 列等宽缩略图网格卡片（预览缩略图 + 名称 + type + 悬浮收藏星标）。
   Manifest 没有缩略图字段且不为此扩展（保持 ADR-0031 的 Manifest 稳定边界）：缩略图由分类图标 +
   分类确定性色相生成，深浅主题均可读；hover 仅 box-shadow/border/transform，不改变几何。
3. **折叠图标轨**：折叠为 48px 轨道时显示垂直图标 Tab（物料/图层，带 tooltip 与 aria-label），点击
   切换 Tab 并展开面板；复用同一 Tab DOM 与状态（CSS 隐藏标签文字），折叠/展开仅原子切换
   `--left-panel-width`，不引起画布/右面板几何跳动。
4. **图层树增强**：行缩进引导线（`--layer-depth` CSS 变量 + repeating gradient，零逐级 DOM）；
   隐藏/锁定/上移/下移改为图标按钮，hover/focus-within/选中时显示（opacity 过渡，无几何变化）；
   含子节点的行显示子项计数。既有 `data-layer-toggle` / `data-layer-move` 契约与树键盘导航不变。
5. **键盘可达性补齐**：物料搜索支持清除按钮与 Escape 清空（保持焦点）；卡片网格支持方向键 roving
   focus（Arrow/Home/End），Enter/Space 走原生按钮语义添加组件。
6. **契约稳定**：既有全部 `data-*` 契约（`data-material-card`/`data-material-type`/`data-material-filter`/
   `data-material-category-filter`/`data-material-search`/`data-material-library-status`/`data-material-library-action`/
   `data-panel-tab`/`data-panel-collapse`/`data-layer-*` 等）语义不变；宿主作者桥、verify-browser-harness
   与宿主托管物料包流程零破坏；ScreenDocument、Material Manifest、catalog、SDK 公共 API 不变。
7. **零新依赖**：不引入 `@tanstack/virtual-core` 与 `@floating-ui/dom`（路线图候选）：图层树已有分页 +
   「显示更多」覆盖大树滚动缺口，碰撞感知锚定 overlay 不适用于左侧面板；本次为纯 DOM/CSS/控制器改造。
8. **无抖动规约扩展**：左轨与右面板一致预留稳定滚动条轨道（`scrollbar-gutter: stable`）；hover/active/focus
   不改变几何；Tab 切换、筛选切换、目录状态条显隐不引起布局位移；主题切换走既有 Token 单一来源。

## 3. 非目标

- 不重构右侧检查器与画布工作区。
- 不做物料市场、远程分页目录、下载、审核与版本 UI（ADR-0031 边界不变）。
- 不做面板宽度/收藏/最近使用的持久化（ADR-0027：真实存储归宿主）。
- 不新增依赖、package 或 Manifest 缩略图字段。
- 不改变轻量基座定位与宿主托管物料流程。

## 4. 结果

- 左侧面板的组件库与图层面板达到与 Light Chaser/DataV 同级的扫描效率、键盘可达性与折叠态可用性。
- 全部既有 data-* 契约、宿主边界与质量门禁保持；新增真实浏览器几何/样式/键盘断言与截图覆盖。
- 专项 Spec、单元测试、浏览器 harness 与 `pnpm verify:m0` 验收保护本次改动。

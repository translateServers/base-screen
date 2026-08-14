# Designer Material Library Visual Refinement Spec

> 状态：生效中
> 日期：2026-08-13
> 依据：[ADR-0034](../../decisions/ADR-0034-designer-material-library-visual-hierarchy.md)

## 1. 目标

以项目本地 `ui-ux-pro-max` 的 data-dense dashboard 与 drill-down analytics 准则，优化 Designer 左侧物料库的视觉层级。
实现必须让宿主多级分组、筛选、状态和物料卡片在紧凑侧栏中可快速扫描，同时保持 ADR-0033 的分组契约、现有深浅主题、
无抖动规则、键盘可达性和宿主主题 Token 边界。

## 2. Requirements

### R1：目录、筛选与状态层级

物料库 SHALL 将宿主目录路径渲染为固定高度的上下文轨道，将当前层级子组渲染为紧凑、单行、可横向滚动的标签-计数控件。
筛选 SHALL 保持分段控件语义，当前项 SHALL 通过填充或内嵌状态建立唯一主视觉优先级；非当前项不得与其竞争强边框或
强调色。状态面 SHALL 使用语义 Token 和清晰的标题/描述/动作层级，且不改变既有状态、动作、ARIA 或 data-* 契约。

### R2：物料卡片扫描性

物料网格 SHALL 保持两列稳定轨道与固定缩略图区。卡片 SHALL 使用中性、Token 驱动的表面和边框，名称、type、缩略图、
收藏与草稿/不可用标记 SHALL 有可辨的阅读层次。缩略图图标和现有确定性分类数据可继续存在，但其视觉表现 SHALL 不依赖
高饱和固定色或装饰性渐变；hover、收藏和不可用状态不得遮蔽名称或 type。

### R3：可访问性与稳定性

路径、子组、筛选、卡片、收藏和状态动作 SHALL 保留当前可访问名称、键盘顺序、`aria-pressed`、disabled 行为和既有
`data-material-*` 选择器。可聚焦元素 SHALL 在键盘导航时具有明显的 `:focus-visible` 状态。新增过渡 SHALL 在
`prefers-reduced-motion: reduce` 下停用，并且 hover/focus/pressed 不得改变元素尺寸、边框几何、网格轨道、滚动轨道
或相邻卡片位置。

### R4：主题与兼容边界

新增样式 SHALL 仅使用现有 `--designer-*` Token 和 `color-mix()` 派生值，兼容默认 dark/light 主题和宿主覆盖的公共
Token。实现 SHALL 不修改全局默认 Token、增加网络资源或外部依赖，也不得修改分组解析、catalog/Manifest、文档、历史、
Renderer、Viewer 或 SDK 公共接口。未配置宿主分组时的 category chips 路径 SHALL 继续正常显示。

### R5：验证与交付

聚焦样式测试 SHALL 检查新增层级、Token 使用、稳定几何、焦点和 reduced-motion 保护。真实 browser harness SHALL
继续验证分组导航、卡片网格、键盘添加和 hover 无抖动，并增加视觉结构断言。交付前 SHALL 运行格式化、相关 Engine 测试、
`pnpm verify:browser` 和 `pnpm verify:m0`；ADR/Spec 索引、能力基线和测试矩阵 SHALL 反映已验收状态。

## 3. 非目标

- 新增或修改物料分组公共 API、宿主分组元数据、Material Manifest、catalog、ScreenDocument 或导出物。
- 改造全局 Designer 主题、顶栏、画布、图层或属性面板。
- 新增外部字体、图片、图标库、CSS 框架、异步资源或视觉依赖。
- 引入会占用窄侧栏空间的营销式、装饰性或动画主导界面。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，`test-matrix.md` 与实现及自动化证据一致。
- 深浅主题、分组/非分组路径、键盘焦点、hover 无抖动和状态标记均有覆盖。
- `pnpm verify:m0` 通过，相关 ADR/Spec 索引和能力基线已更新。

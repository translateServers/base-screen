# Designer Material Library Visual Refinement Checklist

> 状态：已完成（2026-08-13，`pnpm verify:browser` 与 `pnpm verify:m0` 通过）
> 依据：ADR-0034

## 目录与状态层级（R1）

- [x] 分组路径、当前层级子组和筛选具备明确、单一的当前状态，固定高度与稳定横向滚动保持不变。
- [x] 状态标题、描述和动作有可扫描的层级，既有状态/动作事件与 data-* 选择器不变。

## 卡片与主题（R2、R4）

- [x] 两列网格、固定缩略图区、名称/type 截断和收藏/草稿/不可用标记在紧凑侧栏中不互相遮挡。
- [x] 缩略图和卡片仅由既有 Designer Token 与 `color-mix()` 驱动，不引入固定调色板、装饰性渐变或外部资源。
- [x] 默认 dark/light 主题与宿主公共 Token 覆盖继续生效；未分组 category chips 路径保持。

## 可访问性与稳定性（R3）

- [x] 路径、子组、筛选、卡片、收藏和状态动作保留可访问名称、ARIA、键盘顺序、disabled 行为和 data-* 契约。
- [x] `:focus-visible`、forced-colors 与 `prefers-reduced-motion` 状态可见且正确。
- [x] hover/focus/pressed 不改变卡片、网格、导航或滚动轨道几何。

## 交付（R5）

- [x] 聚焦样式测试和真实 browser harness 覆盖视觉结构、深浅主题、分组路径与无抖动。
- [x] 格式化、相关 Engine 检查、`pnpm verify:browser` 与 `pnpm verify:m0` 通过。
- [x] ADR/Spec 索引、能力基线、任务、检查表和测试矩阵均已同步完成状态。

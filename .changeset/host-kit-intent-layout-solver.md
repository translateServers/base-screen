---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 新增智能体意图层的布局求解器与区域编译（ADR-0113 S3）：

- `solveLayout(regions)`：纯函数，区域序列 + 每格的内容量（指标个数、每块占几列、是不是数据型）→ 像素矩形，或容量冲突。区域三种：`band`（一排等宽指标卡）、`grid`（四列栅格，行内 span 补齐）、`split`（主区 + 侧栏，比例 `wide-narrow` / `even`，侧栏可在左在右，纵向堆叠）。区域之间从上到下排，指标带固定高度，其余按内容权重分剩余高度。
- 装不下返回 `LAYOUT_CAPACITY_EXCEEDED`（带区域在模型原文里的路径、需要与可用的像素），不硬塞；指标带的卡片不得窄于 240px。
- `compileScreenIntent` 改按区域排版：区域写法的组件 id 带区域序号（`agent-r1-m0-0`），来源表指回模型原文路径（`regions[1].main[0]`）；平铺写法的 id 与几何保持不变。
- 流式骨架改为区域序列（`IntentSkeleton`），平铺写法用 `flatSkeleton(kpis, blocks)` 构造；流式帧按位置路径给内容（`IntentStreamFrame.kpis` / `.blocks`）。
- 区域类型 `IntentBand` / `IntentGrid` / `IntentSplit` 增加 `origin`（区域在模型原文里的路径）。

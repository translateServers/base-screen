# Host Material Library Grouping Test Matrix

> 状态：已完成（2026-08-13，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

| 需求 | 单元/DOM 测试 | 真实浏览器验证 |
| --- | --- | --- |
| R1 严格树契约 | 合法深树、深度冻结、未知字段、非法/重复 id/type、空节点、容量/深度越界 | 不适用 |
| R2 catalog 一致性与原子性 | configure 与 setter 的可见条目覆盖、隐藏/缺失引用、失败零副作用、Renderer 不重建 | 动态更新分组后卡片和导航改变，画布仍保持 |
| R3 多级导航与顺序 | 分组树转卡片顺序、路径与子组 DOM、选中组后代范围、aria/data-* 状态 | 根组、嵌套组、面包屑返回、卡片顺序与选中范围 |
| R4 筛选与兼容 | 搜索/收藏/最近与组范围交集，状态标记，无分组 category 回退 | 分组模式与无分组模式各自可添加/拖拽、空态与不可用物料行为 |
| R5 集成与质量 | Engine/SDK public API、样式与控制器测试 | 无抖动几何断言、截图、`verify-browser-harness` |

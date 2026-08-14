# Designer Left Panel Test Matrix

> 状态：已完成（2026-08-13）

| 需求 | 单元测试 | 真实浏览器验证（verify-browser-harness） |
| --- | --- | --- |
| R1 信息架构 | workspace DOM 结构：Tab 位置、每 Tab 工具栏归属 | 面板头/sticky Tab/画布矩形断言；Tab 切换几何不变 |
| R2 组件卡片网格 | 分类图标/色相映射确定性；卡片 DOM 结构 | 2 列等宽断言；hover 前后几何一致；深/浅主题可读性 |
| R3 筛选与键盘 | panel-controller：清除/Escape、roving focus 定位计算、Enter 添加 | 真实键盘 Arrow/Home/End/Enter；清除按钮与 Escape |
| R4 折叠图标轨 | workbench-controller：折叠态 Tab 点击展开+切换 | 折叠态图标 Tab 可见/点击展开；宽度原子切换、无跳动 |
| R5 图层树增强 | layers-dom：--layer-depth 值、图标按钮契约、子项计数 | 图层 Tab 内树操作（既有流程）+ 引导线/计数断言 |
| R6 契约与边界 | 既有 workspace/layers/panel/workbench 测试保持通过 | 既有 harness 断言（宿主状态、作者流程、图层作者）保持通过 |
| R7 质量与无抖动 | 样式快照测试（designer-style.test） | 滚动条轨道、溢出/重叠断言、截图产物 |

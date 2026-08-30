# Designer Left Panel Test Matrix

> 状态：已完成（2026-08-25）

| 需求 | 单元测试 | 真实浏览器验证（verify-browser-harness） |
| --- | --- | --- |
| R1 信息架构 | workspace DOM 结构：Tab 位置、每 Tab 工具栏归属 | 面板头/sticky Tab/画布矩形断言；Tab 切换几何不变 |
| R2 组件卡片网格 | 分类图标/色相映射确定性；卡片 DOM 结构 | 2 列等宽断言；hover 前后几何一致；深/浅主题可读性 |
| R3 筛选与键盘 | panel-controller：清除/Escape、roving focus 定位计算、Enter 添加 | 真实键盘 Arrow/Home/End/Enter；清除按钮与 Escape |
| R4 折叠图标轨 | workbench-controller：折叠态 Tab 点击展开+切换 | 折叠态图标 Tab 可见/点击展开；宽度原子切换、无跳动 |
| R5 图层树增强 | layers-dom：--layer-depth、六项工具栏、定位/图标/整行 selectable 契约与锁定图层选择语义；layers-controller：整行普通/修饰键选择、操作簇空隙隔离、直接 dblclick、跨重绘双击识别与非指针 click 隔离；layout-operations：前层在上、多选单步重排、锁定/跨父级失败关闭；viewport-controller：组件中心定位 | 图层 Tab 内树操作 + 前层在上顺序、工具栏上移真实事务、定位视口；1024/1366/1440 下从缩进空白和名称选择同一图层，校验 36px 行高、pointer、完整选中底色/描边、操作簇展开无抖动；真实鼠标双击经历首次重绘后出现聚焦输入框并以 Enter 写回名称，输出截图 |
| R6 契约与边界 | 既有 workspace/layers/panel/workbench 测试保持通过 | 既有 harness 断言（宿主状态、作者流程、图层作者）保持通过 |
| R7 质量与无抖动 | 样式快照测试（designer-style.test） | 滚动条轨道、隐藏 Tab 不截获点击、操作簇展开前后几何、截图产物 |

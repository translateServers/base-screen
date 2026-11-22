---
'@base-screen/plugin-materials': minor
---

大屏插件物料按 ADR-0099 收敛作者面（不兼容变更，示例文档已同批改写）：

- 滚动字幕的滚动周期改为毫秒：`speedSeconds`（秒）更名为 `periodMs`（毫秒，3000–120000，默认 20000），与轮播列表的
  `intervalMs` 同单位；检查器改用 `editorDescriptor`，单位经 `unit` 声明而不再写进 label。
- 状态灯阵与产线工序链移除 `emptyText` prop：空态改走 `@base-screen/plugin-sdk` 的状态视图，领域文案
  （「无设备数据」「该产线无工序配置」）由物料固定给出；`data-board-status-empty` / `data-board-pipeline-empty` 钩子保留。
- 轮播列表的等级色板从 props 移到 style：移除 `statusPalette`（json），改为四个语义色键 `criticalColor` /
  `warningColor` / `infoColor` / `unknownColor`（未知等级兜底，对应原 `statusPalette.default`），缺省回落到共用等级色板，
  并可被宿主条件样式与 `theme:` 引用覆盖。等级列 `statusColumn` 保持为 prop，检查器改为数据区的字段选择器；
  检查器整体迁移至 `editorDescriptor`，`intervalMs` 的单位经 `unit` 声明。
- 装饰边框的线宽从 props 移到 style：`lineWidth` 更名为 `strokeWidth`（style，非必填，缺省 2px），可被条件样式覆盖；
  检查器补齐线宽、边框色与背景色入口（此前描述符只含 props 字段，单选检查器里没有颜色入口）。
- 胶囊进度的发光从 props 移到 style：`glow` 更名为 `fillGlow`（style，非必填，缺省发光）。
- 新增物料 `board.status-legend`（状态图例）：读一列状态值，按设备五态计数（运行 / 待机 / 故障 / 离线 / 未知），
  可绑定与状态灯阵相同的数据放在其下方，也可单独使用。状态灯阵移除内建图例（`showLegend` prop 与 `legendColor` 样式）；
  底栏只在容量溢出时显示 `+N`，颜色改用 `labelColor`。灯阵与图例的检查器均迁移至 `editorDescriptor`。
  `data-board-status-legend` / `data-state` / `data-count` 钩子由新物料保留。
- 产线工序链移除无效的必填样式 `legendColor`（本物料不画图例，该键从未被读取）；检查器迁移至 `editorDescriptor`，
  `color` 的 label 统一为「文字色」。

旧文档中残留的 `speedSeconds`、`emptyText`、`statusPalette`、装饰边框的 `lineWidth`、胶囊进度的 `glow`，
状态灯阵的 `showLegend` / `legendColor`，或工序链的 `legendColor` 键会被校验失败关闭，需要改写为新形态。

---
'@base-screen/plugin-materials': minor
---

按大屏组件调研重做设备状态类物料与分片（ADR-0100 §7、ADR-0099 §7）。

- 五态色默认值改为「正常低饱和、只有故障高饱和」：运行 `#3e7b5e`、待机 `#8c7a46`、离线 `#8796a5`、未知 `#4f5d6b`，
  故障不变。键名不变，存量文档里显式写了色值的组件不受影响。
- `board.status-legend` 展示名改为「状态分布」，新增可选开关 `showTotal`（总数）、`showBar`（占比条）与样式键 `valueColor`；
  新插入默认打开，存量文档缺省仍是单行图例。新增纯函数 `statusLegendBarSegments`。
- `board.status-grid`：格子恒为正方形、靠左上排布，不再被拉成细长色柱；格内文字按边长自动降级；新增可选
  `sortAbnormalFirst`（新插入默认打开）；`+N` 底栏写明收起的状态。默认尺寸改为 304×84。新增纯函数
  `computeStatusGridTileSize`、`statusGridTileTextLines`、`sortStatusGridItems`、`summarizeStatusGridOverflow`。
- 两个读数物料共用一份 12 台设备示例数据（`BOARD_DEVICE_SAMPLE_DATA`）。
- 分片拆成「设备状态概览」（新增，`base-screen.board.device-status-overview`）与「设备状态卡」（id 不变），尺寸缩到卡片量级。
- 新增导出 `BOARD_STATUS_PRIORITY`、`isBoardAbnormalStatus`、`PLUGIN_BOARD_DEVICE_FRAGMENTS`、
  `PLUGIN_BOARD_DEVICE_OVERVIEW_FRAGMENT(_ID)`。

---
'@base-screen/plugin-materials': minor
'@base-screen/engine': patch
---

组合分片补齐（ADR-0100 第一阶段 1b 收尾）：

- `plugin-materials` 交付第一份插件分片「设备状态卡」（`PLUGIN_BOARD_DEVICE_STATUS_FRAGMENT`，id
  `base-screen.board.device-status-card`）：`base.container` 底座 + `base.text` 标题 + `board.status-legend` 图例 +
  `board.status-grid` 灯阵。物料库「指标」分类里带「组合」角标，插入即展开为四个普通组件。
- 设计器命令面板（Ctrl/Cmd+K）列出物料库里的组合分片：与物料同属「素材」类（`+` 前缀可筛），说明行显示
  「组合 · <id>」，选中后按物料库同一路径整片插入。

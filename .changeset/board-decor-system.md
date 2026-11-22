---
'@base-screen/plugin-materials': minor
---

大屏容器与装饰体系（ADR-0101）。

- 装饰边框 `board.border-box` 可以容纳子组件（`children: true`），能当卡片外壳；新增可选样式键 `accentColor`：
  角标与发光用强调色、边线用 `borderColor`。存量文档没有 `accentColor` 时渲染与改动前一致。新插入默认暗边线 + 亮角标，
  角标色跟随文档主题主体色。
- 新物料「标题装饰」`board.title-decor`：只画图元（竖条、渐隐下划线、两端括号、双箭头），可容纳标题文本；
  新检查器控件「标题装饰形态选择器」`base-screen.board.title-decor-picker`。
- 新组合「标题栏」`base-screen.board.title-bar`、「设备状态面板」`base-screen.board.device-status-panel`
  （装饰边框外壳 + 标题栏 + 状态分布 + 状态灯阵）。新导出 `PLUGIN_BOARD_FRAGMENTS`。

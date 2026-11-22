---
'@base-screen/engine': minor
'@base-screen/plugin-sdk': minor
'@base-screen/plugin-materials': patch
---

检查器「基础 / 全量」三层规则（base-screen-docs ADR-0102 §7.1）。

- 基础模式只隐藏整段的效果类设置（滤镜、物料的「动效」分区）；层级、多选的编组 / 锁定 / 隐藏 / 旋转改为基础可见。
- 基础模式面板底部显示「已隐藏 N 项 · 显示全量」，点击切到全量。
- 「高级」不再用作名称：右栏页签改名「交互」，数据页「高级设置」改名「处理与刷新」，搜索结果角标改为「仅全量」。
- `auditBaseScreenMaterialEditorForm` 新增 R15：字段不能单独标 `advanced`；物料分区里只有「动效」（`motion`）仅全量可见且必须标 `advanced`。
- `board.pipeline` 的连接线色与粗细移入默认收起的「连接线」分区。

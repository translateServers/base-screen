---
'base-screen': minor
'@base-screen/plugin-core': minor
'@base-screen/plugin-sdk': minor
'@base-screen/engine': minor
'@base-screen/material': minor
'@base-screen/plugin-materials': minor
---

检查器配置表单范式（base-screen-docs ADR-0102 D1–D3）。

- **控件按语义推导**：描述符字段的 `control` 可以省略，解析时按字段语义补齐（新导出
  `inferBaseScreenMaterialEditorControl`）：小整数计数（props、无单位、跨度 ≤ 24）→ 步进器，有界数值 → 滑杆 + 读数
  （有 `unit` 时读数内嵌单位），无界带单位 → 带单位数字，`color` / `xxxColor` 键 → 取色器，left/center/right → 图标分段。
  `parseBaseScreenMaterialEditorDescriptor` 与 `parseBaseScreenMaterialManifest` 返回规范化后的描述符。新增作者输入类型
  `BaseScreenMaterialEditorFieldInput` / `BaseScreenMaterialEditorSectionInput` / `BaseScreenMaterialEditorDescriptorInput`。
- **描述符是唯一表单来源**：检查器只有描述符一条渲染路径；扁平 `propertyPanel` / `stylePanel` 由引擎转换成「内容 / 样式」
  两个描述符分区后渲染。提交门禁、多选批量、条件样式、宿主条件样式都改读同一份外观字段表。扁平面板专用的色板组形态移除。
  仓库内官方物料、大屏物料与图表的扁平面板全部清空。
- **通用配置组**（plugin-sdk）：`createBaseScreenNumberFormatConfig`（前缀、单位、小数位、显示千分位）、
  `createBaseScreenChartTitleConfig`、`createBaseScreenChartLegendConfig`、`mergeBaseScreenMaterialConfigGroups`。
  翻牌器、胶囊进度、水位图与 11 个图表改用配置组。
- **范式审计**（plugin-sdk）：`auditBaseScreenMaterialEditorForm(manifest)` 返回 R9 / R11–R14 违规清单（可见字段预算、
  控件与推导一致、不再写扁平面板、标签文案、配置组键一致）；物料包测试对每个 manifest 断言为空。
- **文档键变更**：`board.digital-flop` 的 `props.suffix` 改名为 `props.unit`。开关标签改为正向表述（「显示图例」
  「显示提示框」「显示千分位」「启用发光」等），「填充」改为「填充色」。

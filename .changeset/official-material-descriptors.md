---
'base-screen': minor
'@base-screen/material': minor
'@base-screen/engine': minor
---

官方物料检查器迁移到 `editorDescriptor`（ADR-0099 §2.4 待决项结案）：

- 文本、矩形、椭圆、容器、分割线、图片、图表、表格的外观区按「结构 → 文字 → 填充与描边 → 阴影」分区；
  矩形与椭圆的阴影四项默认收起，椭圆不出现「结构」（圆角由形状固定）。字段、标签与渐变开关与扁平面板逐项一致，
  扁平 `propertyPanel` / `stylePanel` 继续保留（多选批量、条件样式按它们识别字段）。
- 描述符字段与扁平面板同形：有界 `number`（跨度 ≤ 1000、未声明 `unit`）渲染为滑杆 + 数字读数；三档水平对齐
  （left / center / right）声明为 `select` 或 `segmented` 都画成图标分段；顶层 props/style 字段的值载体同时挂
  `data-prop` / `data-style`，检查器搜索、回车提交与自动化按同一个钩子定位。插件物料里符合条件的描述符字段
  （例如滚动字幕字号）随之恢复迁移前的滑杆形态。
- 描述符写入顶层 props/style 键时沿用扁平面板的提交语义：清空可选数值即删除该键；改边框颜色时自动启用零宽边框。

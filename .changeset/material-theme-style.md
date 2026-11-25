---
'base-screen': minor
'@base-screen/plugin-core': minor
'@base-screen/engine': minor
---

新建组件的颜色可以跟随文档主题（ADR-0101）。

- 物料 manifest 新增可选字段 `themeStyle`（样式键 → 主题色位）。键必须是 `styleSchema` 里的字符串样式键，值必须是
  六个固定色位之一，最多 32 项；校验失败按 `PLUGIN_CORE_MANIFEST_FIELD_INVALID` 拒绝。
- 新导出 `resolveBaseScreenMaterialDefaultStyle(manifest, theme)`：文档带色板时，声明的键取当前色板的颜色，
  其余键用 `defaultStyle`。写入的是解析后的颜色，不是 `theme:<slot>` 引用——检查器读得出颜色，去掉色板也不会让组件失败关闭；
  之后换色板不会连带改已有组件。
- 设计器所有按默认值新建组件的路径（物料库点击 / 拖放、工具绘制、成组外壳、`insertComponent`、组合分片）都改用这个函数。
  组合分片里节点显式写的样式键以分片为准；物料库条目覆盖了的键不再跟随主题。

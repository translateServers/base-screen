# Unified Color Palette Checklist

- [x] 所有 `control: 'color'` 字段使用同一三段式调色板控件，原生 color input 已被替换（普通面板 + Descriptor）。
- [x] 单色/线性渐变/径向渐变三段模式对所有颜色字段无条件可用。
- [x] 渐变参数与 2..8 个色标可编辑（增删、位置、颜色、角度、中心）。
- [x] 值仍为字符串（色值或规范化 CSS 渐变），Material/Manifest/ScreenDocument 契约零变化。
- [x] 非法/乱序/越界值失败关闭，不写入文档。
- [x] 三种模式草稿按字段缓存，重渲染保留；撤销/重做/替换文档时失效重解析。
- [x] 色标增删经 change 派发走既有提交通道；样式仅用既有 Token、无抖动。
- [x] base.text 渲染端支持渐变文字（background-clip: text），单色照旧并清除渐变残留。
- [x] 画布背景保持 ADR-0048 结构化契约，未迁移到本控件。
- [x] palette/面板/文本渐变测试与 `pnpm verify:fast` 通过；文档索引已更新。
- [x] 渐变色标共享同一条位置滑轨，每个色标均有独立手柄，手柄与数字输入同步，且相邻色标范围约束和 change 提交回归通过。

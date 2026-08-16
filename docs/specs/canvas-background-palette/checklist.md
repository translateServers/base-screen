# Canvas Background Palette Checklist

- [x] `background` 是严格的 JSON-safe 判别联合；旧 `backgroundColor` 文档无迁移可解析。
- [x] 颜色、stop 数量与位置、线性角度、径向中心均有确定性范围和失败关闭诊断。
- [x] Core patch/API 有 null 删除和零副作用失败语义。
- [x] Renderer 不接受任意 CSS；图片与渐变分层和清除状态正确。
- [x] Designer 三模式、stop 添加/删除、草稿保留、键盘/可访问性和稳定布局可用。
- [x] contracts/core/renderer/engine 聚焦测试通过，golden schema 已更新。
- [x] `pnpm verify:fast` 通过，baseline、usage、ADR 与 Spec 索引已更新。

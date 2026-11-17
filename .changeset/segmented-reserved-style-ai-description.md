---
'base-screen': minor
'@base-screen/plugin-core': minor
---

检查器作者面与智能体提示词三项增强：

- Manifest Editor Descriptor 新增 `segmented` 控件（2–4 个枚举选项的分段选择，fail-closed 校验），复用既有分段原语与原生 select 值流水线。
- `styleSchema` 校验接受引擎级保留样式键 `opacity` / `flipX` / `flipY`：渲染器几何帧本就统一消费它们，物料无需重复申报；物料自行申报时仍以申报的 schema 为准。
- 新增 `describeBaseScreenMaterialStyleForAi(manifest)`：从 styleSchema + editorDescriptor 确定性派生带注释的 TS 类型签名（含嵌套路径、枚举与范围），供宿主塞进智能体提示词；示例三端与共享后端已接入该签名。
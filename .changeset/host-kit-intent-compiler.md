---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 新增智能体意图层的确定性编译器（ADR-0113 S2），自示例后端 `agent-compose.ts` 行为等价迁入：

- `compileScreenIntent({ intent, catalog, references?, mode?, stream? })`：目录驱动，把 `ScreenIntent` 编成文档草稿。类型一律来自目录，样式起点是物料默认样式、只叠加设计令牌，表格写示例数据标记 + 绑定角色，素材与数据集落成数据源实例。字号不低于 core 的可读下限。
- 来源表：随产物返回「组件 id → 模型原文路径」，供修复回环把文档诊断翻译回模型写的那一处；组件 id 与层级仍按位置分段，流式帧之间不漂移。
- 流式：`stream` 帧按骨架一次算定全部几何，未到的格子画占位框，内容到达后原地填充。
- `formatKpiValue` / `formatKpiDelta`：指标数值与增减量的统一格式（万 / 亿折算、千分位、百分点）。
- `resolveIntentStyle` 与四套风格预设（`INTENT_STYLE_PRESETS`）。
- 依赖：`host-kit` 新增对 `@base-screen/core` 的依赖（仅取可读字号下限），对外发布面不变——单包 `base-screen` 构建期内联。
- 目前只编译「一条指标带 + 一条栅格」；`split` 与其他区域顺序返回 `INTENT_LAYOUT_UNSUPPORTED`，待布局求解器接手。

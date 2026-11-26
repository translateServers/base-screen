---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 新增智能体意图层的类型与解析（ADR-0113 S1）：

- `ScreenIntent`：模型产出的「这屏讲什么、怎么分区、每块用什么」。区域分 `band`（指标条）、`grid`（四列栅格）、`split`（主区 + 侧栏），块的取值归一成 `table / dataset / text / asset / none` 的判别联合。没有版本字段，演进靠加可选键。
- `parseScreenIntent(input, { catalog })`：宽容解析，认区域写法与平铺的 `kpis + blocks` 写法。单项瑕疵只降级该项（裁行、丢未声明的参数、截断文案、丢弃坏块），整份不可用才返回 `intent: undefined`；`panels`、两种写法混用一律拒绝；`pages / facts / variables / interactions / states` 为预留键，出现时只提醒并忽略。
- `parseIntentKpi` / `parseIntentBlock`：单项解析，供流式逐项出帧使用。
- 每个指标与块带 `origin`（它在模型原文里的路径），丢弃坏项之后修复提示仍能指回模型自己写的那一处。
- `IntentCatalog`：意图层看到的纯 JSON 组件目录，`host-kit` 不依赖物料契约。

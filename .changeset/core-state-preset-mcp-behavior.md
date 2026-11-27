---
'@base-screen/core': minor
'@base-screen/engine': minor
'@base-screen/host-kit': minor
'base-screen': minor
---

状态外观预置下沉 `core`，MCP 补行为工具（ADR-0115 D8、D10）。

- `core` 新增 `screenStatePresetStyle(source, tone)` 与 `ScreenStatePresetSource`：给语义色调算出状态要覆盖的样式键（清单声明的 `statePresetKeys` 优先，否则推断主色、描边色与 `danger` 时的发光），规则与原先 engine 的一致。
- `engine`：`designerStatePresetStyle` 改用 core 的规则；新增公开的 `readDesignerStatePresetSource(manifest)`，从外观区读出键表。
- `host-kit`：`IntentCatalogMaterial.statePreset` 可选；阈值状态按它生成外观，与设计器「按分级生成状态」一致，缺省退回只换文字色。三端示例宿主的目录摘要带上键表。
- `tooling/screen-mcp-server`：`compile_screen_intent` 接受 `capabilities` 与数据集样本 `values`，返回编译出的 `behaviors`，说明里写明联动、阈值状态与 `gaps`；新增 `simulate_blueprint`（一个事件及其级联的模拟，返回各层触发的规则与结束时变了的变量、显隐、数据源参数）。冒烟检查更新为 17 个工具。

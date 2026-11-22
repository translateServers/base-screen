---
'@base-screen/plugin-sdk': minor
---

在线作者面（base-screen-docs ADR-0105）：

- 物料规格 `BaseScreenMaterialSpec` 与 `parseBaseScreenMaterialSpec` / `compileBaseScreenMaterialSpec`：字段按分区声明（分区决定 props / style 与检查器分段），控件由推导决定，读数格式走配置组，数据形状为无 / 单值 / 多行（按角色）；派生 `createBaseScreenMaterialSpecDataAdapter`、`normalizeBaseScreenMaterialSpecValue`、`createBaseScreenMaterialSpecSampleDataset`。
- 渲染函数物料：`createBaseScreenRenderedMaterialPresenter`、`createBaseScreenRenderedMaterialElement`、`createBaseScreenSpecMaterialDefinition`、`formatBaseScreenMaterialNumber`。骨架统一四态、重绘与失败隔离，作者只写数据就绪时的绘制。
- 体检：`auditBaseScreenMaterialSpec`（原子判定、门禁规则、表单审计与渲染代码静态检查）、`auditBaseScreenFragment`（组合 F 规则），结论类型 `BaseScreenAuthoringFinding` 与 `sortBaseScreenAuthoringFindings` / `hasBaseScreenAuthoringErrors`。
- 样式键词典运行时副本 `BASE_SCREEN_STYLE_KEY_DICTIONARY` / `BASE_SCREEN_REGISTERED_STYLE_KEYS` / `BASE_SCREEN_DESCRIPTIVE_TEXT_KEYS`；词典新增趋势语义色 `positiveColor` / `negativeColor`。
- 读数格式配置组的 `prefix` / `unit` 接受字符串作为默认值。

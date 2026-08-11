# Primitive 提升评估记录

> 状态：生效
> 日期：2026-08-10
> 归属：[Designer Authoring Extension Spec](../specs/designer-authoring-extension/spec.md) Task 8 / AE-EC-C04

提升规则（来自 [panel-fixture-gap-matrix.md](./panel-fixture-gap-matrix.md) §5）：只有被至少两个独立物料使用并经过 M1-M6 的 primitive 才提升为 Engine 内建控件。

## 当前使用矩阵

| primitive | 使用物料 | 使用数 | 提升判定 |
| --- | --- | --- | --- |
| text / number / boolean / select | 既有 propertyPanel（base.text 等官方物料） | 多物料 | 既有，不新增 |
| color | ECharts 语义面板（`props.title.textStyle.color` 等） | 1 | 暂不提升：等待第二物料用例 |
| unit-number | ECharts 语义面板（grid 边距、轴名称距离等） | 1 | 暂不提升：等待第二物料用例 |
| field-selector | ECharts 语义面板（`dataSource.binding.fields.dimension`） | 1 | 暂不提升：依赖 host dataset 字段角色；等待第二物料用例 |
| repeatable/reorderable array | ECharts 语义面板（`props.series[]`） | 1 | 暂不提升：等待第二物料用例 |
| json（textarea fallback） | 既有 propertyPanel / 数据面板 | 多物料 | 既有，作为无外部编辑器时的 fallback |

## 结论

- 本轮只出现一个 Descriptor 消费物料（ECharts），所有新增 primitives 均未达到"至少两个独立物料"的提升门槛，继续留在 Engine 内建 DOM/操作层，不对外扩大公共 API。
- 既有 scalar primitives 保持兼容，未因本轮扩展改变行为。
- 宿主高级编辑器（完整 option、代码编辑、图形 Blueprint）不属于提升候选，按 ADR-0028 归宿主。

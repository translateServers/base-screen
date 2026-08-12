# Official Data Material Contracts

> 状态：生效中
> 最近更新：2026-08-10
> 依据：[ADR-0022](../../../decisions/ADR-0022-official-data-material-contracts.md)

## 目标

为官方图表和表格物料建立最小、框架无关、与渲染库无关的数据语义契约。

## 边界

- `@base-screen/plugin-core` 拥有公共类型和严格解析器。
- `@base-screen/material` 可以实现官方物料，但不拥有共享类型。
- `@base-screen/renderer` 传递 JSON 数据，不解释图表或表格语义。
- 表格行允许动态业务字段；列定义是稳定的公共字段目录。
- 本 Spec 不定义查询传输、分页、排序执行、筛选状态、选区回写、虚拟化、流式更新、样式或编辑器控件。

## Requirements

### R1：表格数据

表格数据 SHALL 包含非空 `columns` 和 `rows`。列 SHALL 包含唯一 `id`、`label`、`valueType`、`sortable` 和
`filterable`。行 SHALL 是 JSON object，允许包含列定义之外的私有字段。可选 `totalRowCount` SHALL 是非负整数。

### R2：图表数据

图表数据 SHALL 包含非空 `series`。每个 series SHALL 包含唯一 `id`、`label` 和 `points`；每个 point SHALL
包含 JSON `x` 和有限数字 `y`。

### R3：严格边界

解析器 SHALL 拒绝未知字段、重复 id、错误类型、非 JSON 值和超出 JSON 数据预算的输入，并返回稳定诊断。
成功结果 SHALL 与输入 detached。

### R4：职责隔离

契约 SHALL 不包含图表库 option、DOM、回调、网络配置或编辑器实现细节。

### R5：官方图表物料

`@base-screen/material` SHALL provide a `base.chart` material that consumes the official chart data
contract, renders a framework-neutral SVG view, exposes appearance fields through its Manifest, and
emits the allowlisted `pointClick` event only when interactive rendering is enabled.

### R6：官方表格物料

`@base-screen/material` SHALL provide a `base.table` material that consumes the official table data
contract, renders semantic table headers and cells, exposes appearance fields through its Manifest, and
emits the allowlisted `rowClick` and `cellClick` events only when interactive rendering is enabled.

### R7：默认数据

`BaseScreenMaterialManifest` SHALL 提供可选 `defaultData` 字段（任意 JSON 值，与 manifest 一同 detached）。
组件未绑定 `dataSource` 时，Renderer SHALL 将声明了 `defaultData` 的物料以 `ready` 状态呈现该数据；
未声明时保持 `idle`。官方 `base.table` 与 `base.chart` SHALL 声明满足各自数据契约的 `defaultData`
示例数据。`defaultData` 不改变文档契约：它不进 document、不参与静态数据解析，只是无数据源时的
展示回退。

### R8：内容表单与默认数据初始化

官方物料（`base.text`、`base.table`、`base.chart`、`base.image`）SHALL 不通过 `propertyPanel` 暴露
内容字段（文本、标题、图片来源/替代文本）；`propertyPanel` 与 `propsSchema` SHALL 为空。物料内容
SHALL 由数据驱动：`base.text` 渲染 `ready` 字符串数据，`base.image` 渲染 `ready` 字符串数据为
图片来源，`base.table`/`base.chart` 渲染各自数据契约。`base.text` SHALL 声明 `defaultData: '文本'`。

Designer 创建组件时（物料库点击、拖拽、工具创建、编组），若 Manifest 声明了 `defaultData`，SHALL 将
组件 `dataSource` 初始化为 `{ type: 'static', value: defaultData }`，使默认数据显示在数据面板的
静态数据中；未声明时保持 `null`。

## 完成定义

R1-R8 均有自动化测试，公共导出和 Contracts 诊断类型通过 typecheck，Plugin Core 与 Material 聚焦检查通过。

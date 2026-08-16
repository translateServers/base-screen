# Designer Multi Selection Editing Spec

> 状态：生效中
> 日期：2026-08-16
> 依据：[ADR-0053](../../decisions/ADR-0053-designer-multi-selection-editing.md)

## 1. 目标

补上多选检查器的批量编辑能力：批量统一选中组件的宽度/高度/旋转与共有样式字段，一次编辑
一条历史、整批撤销。公共契约零变化。

## 2. Requirements

### R1：批量几何

多选检查器 SHALL 提供宽度、高度、旋转三个字段的批量编辑（复用 `update-components` patch
`size`/`rotation`）。不提供 X/Y 批量。

### R2：批量样式（交集）

多选检查器 SHALL 提供样式批量编辑，字段为所有选中组件 `manifest.stylePanel` 字段的交集
（按 `styleSchema` 校验后的可编辑字段）；交集为空时 SHALL 只显示几何区。样式控件 SHALL
复用既有渲染：非 color 用 `createControl`，color 用 `createDesignerColorPalette`（统一三段式
调色板，ADR-0050/0051 语义不变），草稿 key 使用批量形态。

### R3：值显示与提交

各选中组件同一字段值不一致时，输入框 SHALL 显示焦点组件（`focusedComponentId`）的当前值；
编辑后 SHALL 应用到全部选中组件。一次编辑 SHALL 产生一条事务（每个非锁定选中组件一条
`update-components` 命令，patch 各自过组件 styleSchema 校验），恰一条历史记录，undo/redo
沿用既有语义。

### R4：锁定与可用性

批量编辑 SHALL 跳过锁定成员（与拖拽路径 `mutableSelectionSubtree` 语义一致）；全部选中均
锁定、无选中或组件不可变更时，批量字段 SHALL 禁用。批量控件经 `data-multi-property` 标记
独立分派事务，单选事务通道（`createPropertyTransaction`）零改动。

### R5：质量与验证

- 聚焦单元测试 SHALL 覆盖：样式交集（同类型/混合类型/空交集）、锁定跳过、schema 校验、
  事务形状（每组件一条命令）、焦点值显示、批量颜色（含渐变）提交、undo/redo 往返。
- 真实 browser harness SHALL 验证多选后批量改宽度/字号/颜色生效于全部选中组件且为一条
  撤销记录。
- 交付前 SHALL 通过格式化、相关 engine 聚焦检查与 `pnpm verify:m0`。

## 3. 非目标

- X/Y 批量编辑；props 字段批量编辑。
- 跨类型字段的强制统一（交集为空即不显示）。
- 改变单选检查器、对齐/分布、编组行为与公共契约。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵反映当前 case。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR/Spec 索引与能力基线反映当前状态。

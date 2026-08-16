# ADR-0053：Designer 多选批量属性编辑

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0050](./ADR-0050-unified-color-palette-control.md)、
> [ADR-0051](./ADR-0051-unified-color-palette-replaces-color-input.md)

## 1. 背景

ADR-0027 定位下，画布与检查器是基座自己的本地作者内核。大屏排版的常见操作是"批量统一多个
组件的尺寸与样式"（如把一排标题统一字号、把一组卡片统一圆角/透明度）。当前多选检查器
（`appendMultiSelectionControls`）只有选中摘要与对齐/分布按钮，没有任何批量几何或样式编辑
入口——批量改 N 个组件的字号/宽度需逐个点击，作者体验存在明显断层。

功能自检（2026-08-16）将"多选检查器无批量编辑"列为定位导向功能缺口 #3。

## 2. 决策

1. **批量几何**：多选检查器 SHALL 新增几何编辑区，提供**宽度、高度、旋转**三个字段的批量
   编辑。不提供 X/Y 批量（统一坐标会令组件重叠，Figma 等工具同样不提供）。

2. **批量样式（交集）**：多选检查器 SHALL 新增样式编辑区，字段为**所有选中组件
   manifest.stylePanel 字段的交集**；交集为空（如文本与矩形混合多选）时只显示几何区。

3. **控件复用**：批量样式控件 SHALL 复用既有控件渲染（非 color 用 `createControl`，color 用
   `createDesignerColorPalette` 统一三段式调色板，ADR-0050/0051 语义不变），草稿 key 使用批量
   形态；控件带 `data-multi-property` 标记，经独立事务分派，单选事务通道零改动。

4. **值显示**：各选中组件同一字段值不一致时，输入框 SHALL 显示焦点组件
   （`focusedComponentId`，最后点击者）的当前值；编辑后应用到全部选中组件。

5. **提交通道**：一次编辑 SHALL 产生一条事务（每个非锁定选中组件一条 `update-components`
   命令，patch `style`/`size`/`rotation`，各自过组件 styleSchema 校验）——恰一条历史记录，
   undo/redo 免费获得。Core/Contracts 零改动。

6. **锁定语义**：批量编辑 SHALL 跳过锁定成员（与拖拽路径 `mutableSelectionSubtree` 语义
   一致）；全部选中均锁定或无选中时字段禁用。

7. **公共契约**：ScreenDocument、Material Manifest、Renderer、Viewer、SDK 导出与既有
   data-* 契约 SHALL 零变化。UI 文案走既有 `designer-ui-text.ts`。

## 3. 非目标

- X/Y 批量编辑；props 字段批量编辑（不同物料 props 交集稀薄，v1 不做）。
- 跨类型字段的强制统一（交集为空即不显示，不做合并推断）。
- 改变单选检查器、对齐/分布、编组行为。

## 4. 结果

- 多选检查器补上批量几何与样式编辑，高频排版操作一次完成、整批撤销；公共契约零变化。
- 验收由聚焦单元测试（交集/锁定跳过/schema 校验/空交集）与真实 browser harness 多选
  批量断言覆盖。

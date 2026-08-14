# ADR-0035：物料加载错误控制台

> 状态：已接受
> 日期：2026-08-13
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0031](./ADR-0031-material-library-host-state.md)、[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)、[ADR-0033](./ADR-0033-host-controlled-material-library-grouping.md)、[ADR-0034](./ADR-0034-designer-material-library-visual-hierarchy.md)
> 部分取代：ADR-0031 中“目录状态条位于左侧物料库”的展示位置；`BaseScreenMaterialLibraryState` 与宿主动作边界保持不变

## 1. 背景

`BaseScreenMaterialLibraryState` 当前将目录加载、离线、部分失败、失败和更新状态渲染为左侧物料库顶部的状态条。
当组件或物料加载失败时，错误说明和重试动作会挤占搜索、分组和网格的工作区域，也会在状态切换时改变左栏内
卡片的起点。左栏应优先用于浏览与添加物料；失败追踪和恢复动作属于 Designer 工作区级错误控制台。

现有状态投影、草稿/不可用标记和 composed 宿主动作事件已是稳定能力。调整只能改变内建展示位置和实例内错误记录，
不能让 Engine 获得物料加载、网络或宿主 Shadow DOM 控制职责。

## 2. 决策

1. 在底部状态栏增加带错误计数的控制台按钮。点击后打开可访问的错误控制台弹窗；弹窗包含当前可操作的物料目录状态和
   有界的失败记录。控制台不参与左侧面板或画布的文档流。
2. 保留 `BaseScreenMaterialLibraryState`、`data-material-library-status` 和 `data-material-library-action` 契约，但将状态
   surface 从 `[data-materials]` 移至控制台弹窗。`partial` 与 `error` 以错误级别记录；`offline` 与
   `update-available` 作为当前可操作状态显示；`loading` 与 `ready` 不产生新的控制台记录。
3. `retry`、`reload` 和 `details` 按钮继续发出原有 composed Custom Event，且使用原有 data-* 选择器。草稿和
   不可用卡片标记仍保留在左侧网格；不可用物料仍不可点击或拖拽。
4. 控制台支持关闭、清空实例内错误记录和焦点返回状态栏入口。它使用现有 Designer Token、语义色、焦点样式和
   reduced-motion/forced-colors 保护；显示、隐藏或状态切换不得改变左侧面板、搜索、导航、网格或画布几何。
5. 不新增公共配置、状态字段、宿主回调、网络请求、持久化、超时逻辑或外部 UI 依赖。记录在当前 Designer 实例中有界，
   宿主仍自行决定状态内容、重试策略、错误详情与重新配置时机。

## 3. 非目标

- 将物料加载失败转换为浏览器全局 toast、宿主 dialog、后台队列或网络重试实现。
- 修改 Material Manifest、catalog、ScreenDocument、Renderer、Viewer、SDK 导出或宿主状态 schema。
- 建立跨实例、跨会话或持久化的日志系统，或记录宿主错误对象、URL、凭证和租户信息。
- 隐藏草稿/不可用物料，或把卡片级状态移出左侧物料网格。

## 4. 结果

- 组件加载失败的追踪和恢复动作集中在底部状态栏可达的错误控制台，左侧物料库保持专用于搜索、分组和扫描卡片。
- 所有状态切换不再使左栏网格纵向跳动，既有无抖动约束得到更直接的结构性保证。
- 宿主状态投影、事件与卡片可用性语义保持兼容，验证由专项 Spec 和真实浏览器 harness 保护。

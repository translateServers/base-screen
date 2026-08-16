# ADR-0044：宿主弹出框与贴组件锚定弹窗对接评估结论（不做修改）

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0028](./ADR-0028-host-authoring-bridge-and-material-editor-descriptor.md)、
> [ADR-0035](./ADR-0035-material-library-feedback-workspace-placement.md)、
> [ADR-0038](./ADR-0038-designer-host-preview-handler.md)

## 1. 背景

宿主询问「如果宿主想要做弹出框，本项目需要对接吗」，并进一步询问贴组件锚定弹窗的实现复杂度。
Base Screen 侧对宿主弹出框的四类形态（宿主壳层业务弹窗、点击组件后业务弹窗、宿主弹窗内复杂编辑、
接管引擎内建浮层）以及贴组件锚定弹窗的坐标链路与公共边界影响做了完整评估。

评估确认两处真实缺口：

1. **贴组件锚定弹窗缺少坐标通道**：宿主从 `base-screen-material-event` 只能获得 `componentId`；
   viewport 的 zoom/pan transform 是引擎内部状态，`clientPointToDesignerCanvasPoint` 仅内部可用，
   组件 DOM 位于 Shadow DOM 内，宿主无法自行换算组件→屏幕坐标。
2. **通用内容编辑弹窗缺少专用提交入口**：宿主作者桥（ADR-0028）只有 `component text` 与 `blueprint`
   两个专用 commit 方法，其他 canonical 内容的弹窗编辑没有专用提交路径。

## 2. 决策

本阶段**不做修改**：不为宿主弹出框新增任何 Base Screen 内部实现、公共 API、事件契约或依赖。

1. 宿主弹出框按形态使用既有公开机制即可满足，本项目零改动：
   - 宿主壳层业务弹窗：监听 `base-screen-change` / `base-screen-dirty-change` /
     `base-screen-project-conflict` / `base-screen-diagnostic`，配合 `ScreenProjectAdapter` 与各类端口；
   - 点击组件后业务弹窗：监听 `base-screen-material-event`（designer/viewer 同形冒泡，
     `detail = { componentId, name, payload }`，payload 为 JSON-safe 值），宿主在页面层渲染弹窗；
   - 宿主弹窗内复杂编辑：使用宿主作者桥（`base-screen-authoring-request` + 专用 commit 方法），
     编辑器渲染在 Designer Shadow DOM 之外；
   - 接管引擎内建浮层：仅预览浮层支持 `previewHandler`（ADR-0038），其余内建浮层（帮助对话框、
     物料错误控制台、项目冲突、导入确认、菜单）维持引擎内建，不新增接管回调。
2. **不实现**贴组件锚定弹窗所需的坐标通道：不新增公开坐标转换方法（如
   `getComponentScreenBounds`）、不扩展 `base-screen-material-event` detail 携带 bounds、不新增
   viewport 变换跟随事件。宿主如需弹窗定位，在页面层自行实现；需要画布坐标的精确锚定暂不支持。
3. **不实现**通用内容编辑弹窗专用提交入口：作者桥维持 `component text` 与 `blueprint` 两个专用
   commit 方法；其他内容的弹窗编辑继续走既有宿主端口，不新增 `executeCommand()` 以外的提交路径。
4. **不引入** `@floating-ui/dom` 等锚定/碰撞依赖（roadmap 条件候选触发条件未满足）。
5. 维持 ADR-0035 非目标：物料加载失败不转换为宿主 dialog。
6. 未来若宿主立项贴组件锚定弹窗且确实需要画布坐标，须以新 ADR 取代本决策并配套生效 Spec；
   在此之前，本决策冻结相关公共边界。

## 3. 评估依据（复杂度结论摘要）

- 贴组件锚定弹窗最小可行版（事件 detail 携带 bounds + 公开查询方法）为中低复杂度，约 400–600 行
  改动（契约 + engine + renderer + viewer 转发 + 测试），但涉及 `plugin-core` 公共契约变更，
  必须走 ADR + Spec 全流程。
- 完整版（viewport 跟随事件、碰撞翻转）为中高复杂度，碰撞翻转可归宿主自行承担。
- 零成本替代：宿主点击组件后使用页面层固定位置弹窗（右上角/居中）+ 主题 Token 对齐视觉，
  可满足不要求「贴组件边缘」的绝大多数业务诉求。

## 4. 非目标

- 不在 Engine 内实现弹窗系统、toast、dialog 宿主接管或锚定 overlay 定位器。
- 不改变 `BaseScreenMaterialEvent`、`base-screen-selection-change`、viewport 状态或任何公共契约。
- 不把宿主弹出框需求迁移为 Base Screen 内部工作流或新增 package。

## 5. 结果

- 公共边界零变化，宿主弹出框能力全部落在 ADR-0027 既有宿主边界内。
- roadmap 的「条件候选依赖试点」（`@floating-ui/dom`）触发条件未满足，维持不授权状态。
- 宿主后续若提出锚定弹窗立项，本 ADR 是评估基线，可直接引用坐标链路缺口结论。

## 6. 确认记录

2026-08-16 用户在评估完成后定案：本次评估结果定为不做修改。

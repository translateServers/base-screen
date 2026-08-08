# Designer 编组与右侧面板整改实施计划

> 状态：第二轮已实现
> 日期：2026-08-07
> 范围：`@base-screen/engine` 的编组语义、选中态判定和右侧检查器面板
> 关联规格：[Designer Full Product](../../specs/designer-full-product/spec.md) R3/R5/R9
> 不进入范围：画布吸附、图层树完整改造、Blueprint 图形编辑、物料公共契约扩展

## 1. 目标

当用户选中组时，右侧面板必须显示“组能够操作的内容”，而不是仅把组当成普通组件渲染。

本整改要建立一条完整且可验证的操作链路：

1. 识别当前选择是画布、单组件、单组、多选，还是组内子项。
2. 基于选择上下文生成右侧面板模型。
3. 只呈现当前上下文真实可执行的控件和动作。
4. 每个控件和动作都走现有 operation/transaction/history 语义。
5. 提交后更新选区、诊断、通知和面板刷新，失败时不产生半状态。

## 2. 当前基线

- 组是普通 `ScreenComponentNode`，通过 `parentId` 建立层级；可包含子组件的能力来自物料
  `manifest.designCapabilities.children`。
- `DesignerPanelController.group()` 会创建一个组节点，再把同父级选中组件 reparent 到组下，成功后选中新组。
- `DesignerPanelController.ungroup()` 会把直接子组件移回组父级，移除组，成功后选中原子组件。
- 拖拽、对齐、分布、变换已经按 selection subtree 处理，组移动时子组件跟随。
- `renderDesignerProperties()` 当前只区分画布、单选、多选；单组选中时仍按普通组件显示几何、状态、物料内容和样式。
- `renderDesignerInteractionPanel()` 只把“包含子组件”作为能力文字展示，不承载组操作。

## 3. 边界

### 3.1 本轮负责

- 右侧面板上下文模型：canvas、single-material、single-group、multi-selection。
- 组面板显示内容：组概览、几何、状态、组动作、受限内容/样式、子项摘要。
- 组动作：解组、锁定/解锁、隐藏、重命名、整体几何编辑、必要时的层级动作入口。
- 多选面板显示内容：选择数量、同父级可编组、可对齐/分布、可锁定/隐藏；不显示单物料 props/style。
- 操作可用性：锁定、隐藏、缺少 group material、跨父级、空子项、能力缺失等 fail-closed 状态。
- DOM、controller 和 common operation 的测试证据。

### 3.2 本轮不负责

- 不改变 canonical document 的组结构，不新增 `group` 专用 schema 字段。
- 不新增组隔离编辑模式或面包屑导航；若后续需要“进入组内编辑”，单独开设计。
- 不改图层树拖拽/reparent 的完整交互，只消费其已有能力。
- 不改画布吸附和 resize/rotate 的几何算法，只保证面板提交走同一事务语义。
- 不把 Blueprint、数据源、资产选择面板扩展到组级批量编辑。

## 4. 选择上下文模型

新增一个纯逻辑 selector，建议放在 `engine/common/operations` 或新的 `common/session` 辅助模块：

| 上下文 | 判定 | 面板语义 |
| --- | --- | --- |
| canvas | 无 focused component | 显示画布设置 |
| single-material | 单选且 manifest 不支持 children，或没有子项 | 显示普通组件属性 |
| single-group | 单选，manifest 支持 children，且存在直接或深层子项 | 显示组属性和组动作 |
| multi-selection | 选中数量大于 1 | 显示批量动作，不显示单组件字段 |

注意：是否为组不应只看“有子项”，也不应只看物料类型名称；应以 `designCapabilities.children`
为能力依据，并用子项数量决定是否显示“解组”。

## 5. 右侧面板信息架构

### 5.1 单组选中

建议右侧检查器首屏结构：

1. 概览：组名称、子项数量、是否含锁定/隐藏子项。
2. 几何：名称、X、Y、宽、高、旋转、层级；提交到组节点，移动/变换仍由现有 subtree 规则保证子项跟随。
3. 状态：锁定、隐藏；锁定组应让组边界下的操作 fail closed，隐藏组等同隐藏子树。
4. 组操作：解组；若当前组锁定或无子项则禁用并给出中文可访问原因。
5. 内容/样式：默认折叠或受限显示。只有组物料 manifest 明确暴露的 props/style 才显示，不把子项 props/style 混入组面板。

### 5.2 多选

多选不应只显示“已选择 N 个组件”。至少应呈现：

- 选择概览：数量、同父级/跨父级、是否含锁定或隐藏项。
- 可执行动作：编组、对齐、分布、锁定、隐藏、复制、删除。
- 不可执行原因：例如跨父级不能编组、锁定项不能移动、少于 2 个不能编组。
- 不显示单物料 propertyPanel/stylePanel，避免误导为批量 props 编辑。

> 首轮补验（2026-08-07）：框选多选时隐藏"外观/数据/交互/事件"tab 栏，只保留外观 pane 的选择概览；
> 由 `renderTabs()` 的单选判定驱动，`verify:browser` 的 marquee 流程断言 `.inspector-tabs` 隐藏
> （`BROWSER_HARNESS_MARQUEE_INSPECTOR_TABS_FAILED`），workbench controller 测试同步覆盖。

### 5.3 普通单选

保留现有几何、状态、内容、样式、数据和交互能力路径。唯一调整是复用同一上下文模型，避免面板内部散落
`selectedComponentIds.length` 和 `focusedComponentId` 判断。

## 6. 操作链路

### 6.1 编组

1. 用户多选组件。
2. 上下文模型判定 `multi-selection`，计算 `canGroup` 和不可用原因。
3. 右侧面板、菜单、快捷键都读取同一 operation availability。
4. 用户点击“编组”。
5. `DesignerPanelController.group()` 创建组节点并提交 `createGroupTransaction()`。
6. Core 校验父级、锁定边界、循环边界。
7. 成功后选中新组，右侧面板进入 `single-group`。
8. 失败时保留原选择，发出诊断，不刷新成组面板。

### 6.2 组选中后的属性编辑

1. 用户选中组。
2. 上下文模型判定 `single-group`。
3. 右侧面板渲染组概览、几何、状态、组操作和组 manifest 字段。
4. 用户修改几何或状态。
5. 面板根据字段类型生成事务：名称、层级、锁定、隐藏只更新组节点；位置类字段生成“组位移事务”。
6. 组位移事务必须同时更新组和可变子项，保持和拖拽、对齐、分布一致的子树移动语义。
7. 成功后 history 记录一次事务，面板使用新 document 重渲染。

### 6.3 解组

1. 用户选中组。
2. 面板显示“解组”，并根据锁定、子项数、选择数量决定启用状态。
3. 用户点击“解组”。
4. 提交 `createUngroupTransaction()`：子项 reparent 到组父级，再移除组。
5. 成功后选中被释放的直接子项。
6. 失败时保留组选择，显示诊断。

## 7. 关键设计决策

### 7.1 组几何提交必须保持子项相对位置

现有面板 `createGeometryTransaction()` 对 `x/y` 只更新单个 component。组选中时如果继续用这条路径，组节点会移动，
但子项不会跟随，和拖拽/对齐/分布的组语义冲突。

整改时应新增组几何事务：

- `x/y`：计算 delta，更新组节点及所有未有效锁定的后代位置。
- `width/height/rotation`：只有确认现有 transform transaction 能表达同等语义时才开放；否则先禁用或只读。
- `name/zIndex/locked/hidden`：只更新组节点。

### 7.2 面板展示和操作可用性分离

DOM 渲染只消费一个面板 view model，不直接重复业务判断。建议建立：

- `getDesignerInspectorContext(document, interaction, catalog)`
- `getDesignerGroupSummary(document, groupId)`
- `getDesignerInspectorActions(context, operationRegistry)`

这样右侧面板、菜单、快捷键、测试可以共享判定。

### 7.3 组动作不进入物料 manifest

编组、解组、锁定、隐藏、几何属于设计器操作，不属于某个物料的 propertyPanel/stylePanel。组物料 manifest
只决定它是否能承载子项，以及它自身可编辑的 props/style。

## 8. 实施阶段

### 阶段 1：上下文与事务模型

1. 增加 inspector context 纯逻辑，覆盖 canvas、single-material、single-group、multi-selection。
2. 增加组摘要：直接子项数量、深层子项数量、是否含锁定/隐藏后代。
3. 增加组几何事务，保证位置编辑和拖拽语义一致。
4. 为上下文、组摘要、组位置事务补 common unit tests。

### 阶段 2：右侧面板渲染

1. 将 `renderDesignerProperties()` 改为消费 context。
2. 增加组概览和组操作区，所有新增中文文案进入 `designer-ui-text.ts`。
3. 多选面板从纯文本升级为批量动作摘要。
4. 保持普通单选和画布设置现有行为不回退。

### 阶段 3：控制器接线

1. 面板按钮通过 operation/controller 调用 `group()`、`ungroup()` 和批量状态操作。
2. 属性变更根据 context 选择普通组件事务或组几何事务。
3. 失败诊断复用现有 `emitDiagnostics` 和字段无效提示。
4. 保证成功后 selection 回写符合链路：编组选新组，解组选子项，批量动作保留原选择。

### 阶段 4：证据和质量门

1. DOM 测试：单组选中显示组概览/解组；多选显示可用动作和不可用原因；普通单选不回退。
2. Controller 测试：组位置编辑更新子树；锁定组禁用解组；解组后选择子项。
3. Operation 测试：组位置 delta 跳过有效锁定后代；非法组操作 fail closed。
4. 更新 `designer-full-product/test-matrix.md` 的 R3/R5 证据。
5. 聚焦运行 engine tests/typecheck；合入前按影响范围补跑更高质量门。

## 9. 验收标准

- 选中组时，右侧面板明确显示这是一个组，并展示组可执行动作。
- 组选中后直接编辑 X/Y 不会造成组壳和子项分离。
- 组的 props/style 只来自组物料 manifest，不混入子组件字段。
- 多选时右侧面板能承载编组/对齐/分布/状态类操作，并解释不可用原因。
- 所有新增用户可见中文文案集中在 `designer-ui-text.ts`。
- 不新增公共 document 字段，不扩大 package 边界，不引入外部依赖。

## 10. 风险与停止条件

- 如果发现组 `width/height/rotation` 无法用现有 transform 语义安全表达，首轮将这些字段设为只读或禁用，并在面板说明不可用原因。
- 如果组物料缺失或 catalog 延迟加载，组动作仍可按 document 层级显示，但 manifest props/style 不显示。
- 首轮暂不实现组内编辑；第二轮已在不新增 canonical 字段的前提下复用现有 `editingParentId`，补齐 Enter/Shift+Enter 钻取操作。
- 如果改动触及 canonical document、public API、物料 ABI 或图层完整交互，必须先更新对应 ADR/Spec。

## 11. 第二轮参考与设计决策

本轮参考了以下开源实现：

- [avue-data](https://gitee.com/smallweigit/avue-data)：folder 组通过后代递归并集派生边界；组移动会移动叶子后代；右键菜单和 Ctrl+G 提供组合/解散，多选面板提供对齐入口。
- [DataEase](https://github.com/dataease/dataease)：`compose.ts` 中的 `updateGroupBorder()` 在组内编辑后重新计算组边界；Group 使用公共几何属性；组合时计算旋转后的 AABB，并在解组时恢复子项位置。
- [Figma](https://help.figma.com/hc/en-us/articles/360039958874-Group-layers)：组作为整体移动、缩放，双击或键盘进入组内编辑，退出后回到父级选择上下文。

据此，本轮采用以下决策：

1. 组继续使用现有 `ScreenComponentNode + parentId`，子项保持绝对画布坐标，不引入 DataEase 的额外相对坐标字段。
2. 组壳的 `position/size` 在子项发生几何变化后自动按后代旋转 AABB 派生；若同一事务明确编辑了组壳几何，则尊重该显式变换，避免同步覆盖用户输入。
3. 检查器的组宽度、高度、旋转改为真实事务：宽高按组子树比例缩放，旋转围绕组子树中心旋转；锁定后代仍跳过，既有 fail-closed 语义不变。
4. 组操作保留 Ctrl+G/Ctrl+Shift+G、右键菜单、双击和 Escape，并补充 Enter 进入当前组、Shift+Enter 返回父级；多选检查器增加对齐/分布入口。
5. 边界同步仅作用于配置的 group material type，不改变其他可承载子项的容器物料固定边界语义。

## 12. 第二轮验收项

- [x] 组内子项移动、缩放、旋转、删除和 reparent 后，组壳边界与后代旋转 AABB 一致（`designer-group.test.ts`、统一事务入口）。
- [x] 组检查器宽度、高度、旋转字段可编辑并生成单次 history 事务（`designer-panel-dom.test.ts`、`designer-group.test.ts`）。
- [x] 组宽高/旋转编辑不会破坏子项相对布局；有效锁定后代不被变换（`designer-group.test.ts`）。
- [x] Enter/Shift+Enter 与双击/Escape 共享同一组内编辑上下文（`designer-gesture-controller.test.ts`、operation metadata）。
- [x] 多选检查器提供对齐和分布操作，并复用 operation/controller 事务链路（`designer-panel-controller.test.ts`）。
- [x] 调研来源、测试矩阵和自动化证据保持同步。

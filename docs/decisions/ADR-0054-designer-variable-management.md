# ADR-0054：Designer 变量管理

> 状态：部分已取代（按名称引用、host 变量和公共契约结论由
> [ADR-0068](./ADR-0068-datav-global-variables.md) 取代）
> 日期：2026-08-16
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0023](./ADR-0023-host-dataset-resource-integration.md)

## 1. 背景

ScreenDocument 契约原生支持全局变量（`variables`：`static` 与 `host` 两种，上限 1000，
名称格式 `^[A-Za-z_][A-Za-z0-9_]{0,127}$`），数据绑定面板（数据集参数引用变量）与
Blueprint（`set-variable` 动作、条件表达式变量）都在消费变量。但 Designer 没有任何变量
管理入口——变量清单只能由宿主整体注入 `document`；用户在界面中看不到变量列表、无法
新建/重命名/删除变量或编辑静态值。

ADR-0027 定位下，"当前文档内"的编辑能力（文档编辑、画布、检查器）属于基座自己的作者
内核；变量清单的本地编辑是文档内能力（提交走既有命令通道），运行时求值仍归宿主
（`variablePort` 按 `variableId` 解析 host 变量）。功能自检（2026-08-16）将其列为定位导向
功能缺口 #4。

## 2. 决策

1. **入口**：左侧面板新增「变量」Tab（与「物料」「图层」并列）。列表展示变量行：
   名称、类型徽标（静态/宿主）、static 变量值摘要；`host` 变量标注 `variableId`。

2. **静态变量管理**：提供新建（名称 + JSON-safe 值）、重命名、编辑值、删除；行内编辑，
   值输入复用既有 JSON 草稿解析语义（非法 JSON 拒绝并诊断，不产生事务）。

3. **host 变量只读**：`host` 变量不可新建/编辑/删除（由宿主经 adapter/document 注入管理；
   值经 `variablePort` 运行时解析，归宿主）。

4. **提交通道**：所有变更 SHALL 复用既有 `replace-variables` 命令（整组替换，core 侧
   fail-closed 校验：数量上限、名称格式、字段形状），恰产生一条历史记录，undo/redo 免费
   获得。Core/Contracts 零改动。

5. **引用保护（fail-closed）**：删除或重命名变量前 SHALL 检查文档内引用——组件数据源
   `host-resource` 参数的 `variable` 引用、Blueprint `set-variable` 的 `variableName`、
   条件与动作表达式中的 `variable` 引用。被引用时 SHALL 拒绝操作并返回诊断（不做级联
   清理，避免静默破坏宿主运行时绑定）。

6. **重名保护**：新建/重命名后的变量名 SHALL 与既有变量名互不相同（契约层不强制唯一，
   UI 层 fail-closed 拒绝，避免数据绑定/蓝图按名解析歧义）。

7. **联动**：数据绑定下拉（`variableNames`）与蓝图面板从 `document.variables` 派生，
   替换后自动反映，无需额外同步。

8. **公共契约**：ScreenDocument、Material Manifest、Renderer、Viewer、SDK 导出与既有
   data-* 契约 SHALL 零变化。UI 文案走既有 `designer-ui-text.ts`。

## 3. 非目标

- 变量类型扩展、跨实例共享、运行时求值与持久化（归宿主 `variablePort`）。
- 变量引用追踪的级联清理（删除被引用变量时拒绝而非级联）。
- 修改 `ScreenVariable` 形状、名称格式或数量上限。

## 4. 结果

- 用户可在界面中管理静态变量（新建/重命名/编辑值/删除），host 变量只读展示；
  变更走既有命令通道，一条历史、整批撤销，数据绑定与蓝图引用自动联动。
- 公共契约零变化；验收由聚焦单元测试与真实 browser harness 断言覆盖。

# Designer Variable Management Spec

> 状态：生效中
> 日期：2026-08-16
> 依据：[ADR-0054](../../decisions/ADR-0054-designer-variable-management.md)

## 1. 目标

补上变量管理的本地作者入口：左侧面板「变量」Tab 提供静态变量的新建/重命名/编辑值/删除
与 host 变量的只读展示，全部走既有 `replace-variables` 命令通道。公共契约零变化。

## 2. Requirements

### R1：入口与列表

Designer SHALL 在左侧面板提供「变量」Tab（与「物料」「图层」并列）。列表 SHALL 展示
每个变量一行：名称、类型徽标（静态/宿主）、static 变量值摘要（JSON 简写）、host 变量
的 `variableId`。空列表 SHALL 显示空态文案。

### R2：静态变量管理

- 新建：名称输入 + JSON-safe 值输入；非法 JSON、非法名称格式、与既有变量重名 SHALL 被
  拒绝并给出诊断，不产生事务。
- 重命名：行内编辑名称；重名、名称格式非法 SHALL 被拒绝。
- 编辑值：行内编辑 static 值；非法 JSON SHALL 被拒绝。
- 删除：确认后删除。
- 提交 SHALL 复用 `replace-variables` 命令（整组替换），恰产生一条历史记录；undo/redo
  沿用既有语义。

### R3：host 变量只读

`host` 类型变量 SHALL 只读展示（名称 + `variableId`），不提供新建/编辑/删除入口。

### R4：引用保护（fail-closed）

删除或重命名变量前，Designer SHALL 检查文档内引用：
- 组件 `dataSource`（`host-resource`）参数 `kind: 'variable'` 的 `name`；
- Blueprint `set-variable` 动作的 `variableName`；
- Blueprint 条件/动作表达式中 `kind: 'variable'` 的 `name`。
被引用时 SHALL 拒绝操作并返回诊断；不做级联清理。

### R5：质量与验证

- 聚焦单元测试 SHALL 覆盖：引用收集（参数/蓝图动作/蓝图表达式）、删除/重命名被引用
  变量的拒绝、重名拒绝、命令形状（`replace-variables` 整组替换）、undo/redo 往返。
- 真实 browser harness SHALL 验证：变量 Tab 渲染、新建/编辑/删除静态变量生效且为一条
  撤销记录、host 变量只读、数据绑定下拉反映变量变更。
- 交付前 SHALL 通过格式化、相关 engine 聚焦检查与 `pnpm verify:m0`。

## 3. 非目标

- 变量类型扩展、跨实例共享、运行时求值（归宿主 `variablePort`）。
- 引用级联清理；修改 `ScreenVariable` 契约与公共 API。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 的所有适用项完成，测试矩阵反映当前 case。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR/Spec 索引与能力基线反映当前状态。

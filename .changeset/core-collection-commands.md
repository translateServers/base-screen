---
'@base-screen/core': minor
'@base-screen/engine': minor
'@base-screen/host-kit': minor
'base-screen': minor
---

文档级集合的按 id 局部命令与提案单元分组提示（ADR-0115 D4、D5）。

- `core` 新增六条命令：`add-data-sources`、`update-data-source-params`（合并参数，`null` 删除）、`add-variables`、`remove-variables`、`add-blueprint-elements`、`remove-blueprint-elements`（删节点连带删掉接在它上面的连线与布局位置）。只动点名的项，其余原样保留；新增遇到已有 id、删除 / 更新遇到不存在的 id 都失败；引用完整性仍由文档校验把关。整体替换命令不变。
- `engine`：`DesignerChangeProposalInput.groups` 可选分组提示（`label`、`commandIndexes`、`notes`），按它拆采纳单元；分组须恰好覆盖全部命令、互不重叠、每组能单独成立，否则忽略提示走默认拆分，整屏替换仍不拆。单元新增 `notes`，评审面逐行列出（文档级变化没有组件差异行时靠它说明）。新增 `remainingChangeProposalInput`，采纳 / 忽略一个单元后分组下标随剩余命令重排。
- `host-kit`：`editIntent` 改用上述局部命令写联动（不再整体替换变量、数据源与蓝图），版面与联动都变了时返回 `groups`（「版面与内容」「联动」，联动组带新增 / 去掉的说明）。`IntentEditCommand` 去掉三条整体替换命令，新增六条局部命令；新增 `IntentEditGroup`。

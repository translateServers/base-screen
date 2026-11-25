---
'@base-screen/contracts': minor
'@base-screen/core': minor
'@base-screen/engine': minor
'base-screen': minor
---

智能体提案评审收口（ADR-0111）：

- 契约新增 5 个诊断码 `CHANGE_DOCUMENT_UNAVAILABLE`、`CHANGE_PROPOSAL_EMPTY`、`CHANGE_PROPOSAL_NO_EFFECT`、`CHANGE_DRAFT_PENDING`、`CHANGE_PREVIEW_UNAVAILABLE`；`submitChangeProposal` 拒绝时至少带一条诊断。
- core `diffScreenDocuments` 的组件差异新增 `type`、`parentId`、`status`、`dataBinding`、`canvasId`、`belowSubCanvas` 六个字段；改了这些字段的组件此前不出现在差异里。
- 整屏替换合并为单一不可拆单元，只能整体采纳或放弃；提案区只读列出新增 / 移除 / 画布与数据源，单元徽标为「替换」。
- 草案层不透明：受影响的旧组件（含只读了被改数据源的组件）在草案期间隐藏，被移除的组件原位留虚线轮廓与「将移除」标记；整屏替换不画逐组件轮廓；画布级变化整份预览。
- 草案条「对比旧版 / 退出对比」改为「查看旧版 / 返回草案」两态切换。

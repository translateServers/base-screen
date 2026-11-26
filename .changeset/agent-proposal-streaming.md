---
'@base-screen/contracts': minor
'@base-screen/engine': minor
'base-screen': minor
---

流式落稿的引擎侧（ADR-0112 S5）：

- 设计器新增 `beginChangeProposal` / `extendChangeProposal` / `finishChangeProposal`：骨架命令先挂成「草案 · 生成中」，生成中不可采纳、只能取消；追加命令整批重算，失败时保留上一版草案；追加的命令若改变已出现组件的位置或尺寸，按协议错误拒绝。
- 契约新增诊断码 `CHANGE_STREAM_NOT_ACTIVE`、`CHANGE_STREAM_GEOMETRY_CHANGED`。
- `readPendingChange()` 的摘要在生成中带 `streaming: true`。

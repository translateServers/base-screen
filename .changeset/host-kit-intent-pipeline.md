---
'@base-screen/host-kit': minor
'base-screen': minor
---

`host-kit` 意图层补齐宿主前端整条链（ADR-0113 S5）：

- `prepareIntent({ output, catalog, references?, mode })`：模型原文 → 解析 + 编译，一并给出值得请模型修的诊断（解析丢掉的项、版面放不下的 `LAYOUT_CAPACITY_EXCEEDED`、列满足不了绑定角色的空图，按模型原文路径）、告警，以及「问题只在个别项、其余可用」的 `deliverable`。
- `mapDocumentIssues` 把版面审计 / 引擎拒绝的文档诊断按来源表翻回模型原文路径；`repairKey` 判断同一组诊断是否原地打转。
- `createIntentStreamAssembler(catalog)` 与 `parseIntentSkeleton`：把后端推来的骨架与逐项内容接成编译器吃的流式帧；骨架一经接受不再变，几何从第一帧起不变。
- `parseScreenIntent` 增加 `placeholders` 选项（确定性兜底允许指标值为 `null` 占位）；`parseIntentKpi` 同步。
- 编译期把模型写明的 `substituteFor` 作为 `INTENT_BLOCK_SUBSTITUTED` 告警带出（`IntentDiagnostic.detail` 给出 `wanted` / `used`），不静默降级。
- 文本长度上限按字符宽度算：含中日韩字符按原字数，纯西文放宽一倍，英文标题不再被截在词中间（`clampText`）。
- 多轮迭代的库层（ADR-0113 S6 前半）：`createIntentSession` 持有 IR；`applyIntentOps` 把 `change / swap / delete / add` 依次应用到 IR（要么全部成功要么一个都不应用，`rebind` 暂返回 `INTENT_OP_NOT_SUPPORTED`）；`editIntent` 重编译后与上一次产物做差，只给变化组件的命令——未变组件的 id 与几何不动，删一块后后面的块上移但 id 不漂（`ident` 稳定标识），用户改过的组件不被覆盖并列在 `keptForUser`，新增组件层级抬到现有最高层之上，数据源冲突时换 id 并改写引用。
- 文本长度上限按字符宽度算：含中日韩字符按原字数，纯西文放宽一倍，英文标题不再被截在词中间（`clampText`）。
- 多轮迭代的库层（ADR-0113 S6 前半）：`createIntentSession` 持有 IR；`applyIntentOps` 把 `change / swap / delete / add` 依次应用到 IR（要么全部成功要么一个都不应用，`rebind` 暂返回 `INTENT_OP_NOT_SUPPORTED`）；`editIntent` 重编译后与上一次产物做差，只给变化组件的命令——未变组件的 id 与几何不动，删一块后后面的块上移但 id 不漂（`IntentBlock.ident` / `IntentKpi.ident` 稳定标识），用户改过的组件不被覆盖并在 `keptForUser` 里列出，新增组件层级抬到现有最高层之上，数据源冲突时换 id 并改写引用。

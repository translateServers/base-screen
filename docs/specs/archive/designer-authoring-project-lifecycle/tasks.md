# Designer Authoring And Project Lifecycle Tasks

> 状态：已归档；勾选项记录归档时的历史实施进度，不作为现行 Designer Engine 验收结论
> 现行任务：[Designer Engine Tasks](../../designer-engine/tasks.md)

- [x] Task 1：完成 Project Lifecycle ADR、Nebula parity provenance 与实施授权（R1-R11）。
  - [x] 新增并接受 Project Lifecycle ADR，冻结 publish/signal/conflict/retry/baseline 所有权。
  - [x] 同步 Contracts Foundation、Core Domain 与 Designer Engine Spec。
  - [x] 冻结 `groupMaterialType`、direct-document baseline 和 persistence response 竞态语义。
  - [x] 记录 Nebula 参考 commit/path、许可未知、behavior-only 和 no-copy 结论。
  - [x] 冻结 P0-P2 parity matrix、`toolMaterialTypes`、视觉 token 所有权和 intentional differences。
  - [x] 将本 Spec 状态改为“生效中”，此前保持现有 load/save 公共行为。

- [x] Task 2：扩展 Project Adapter 公共契约（R1-R3）。
  - [x] 为 load/save 增加 `ScreenAbortSignal`，增加 publish request 和 adapter capability。
  - [x] 增加 project-specific diagnostics，并纳入 Contracts 显式 union。
  - [x] 实现 adapter capability/method 一致性和 response envelope canonical parse。
  - [x] 保持 revision opaque，不暴露 Router、Store、credential 或 callback。
  - [x] 更新 public declarations、API export check、tarball consumer 和契约测试。

- [x] Task 3：实现 Engine Project Controller（R1-R3）。
  - [x] 实现 unloaded/loading/ready/saving/publishing/conflict/error/disposed 状态机。
  - [x] 为每个 operation 创建 generation、AbortController 和 submitted snapshot。
  - [x] 新 load 中止旧 load，save/publish mutation 串行化。
  - [x] 在 replace/unload/disconnect/dispose 时中止并清理全部 operation/timer。
  - [x] 以 signal/generation/projectId/revision guard 抑制迟到 response。
  - [x] 实现 cancel 和同 snapshot save single-flight。

- [x] Task 4：实现 baseline、conflict 与 retry（R1-R3）。
  - [x] 为 load/direct replace 建立 canonical baseline，并在每次 document change 后比较 dirty。
  - [x] dirty 布尔值变化时只派发一次事件，undo/redo 回 baseline 时重新 clean。
  - [x] save pending 期间继续编辑时保留 current document，并推进 submitted baseline。
  - [x] publish 只接受 clean revision，不隐式 save、不清理未保存编辑。
  - [x] conflict 保留 document/history/selection/revision/baseline，提供 reload/continue。
  - [x] 实现 load unavailable 两次自动 retry 和 mutation 显式 retry；scheduler 可测试。

- [x] Task 5：接通多选与 marquee（R4、R5）。
  - [x] Engine 所有 selection 只通过 Core interaction reducer。
  - [x] 实现 click、modifier toggle、blank clear 和 focused reconciliation。
  - [x] 实现 intersect/contain marquee 和 selection merge/replace。
  - [x] locked component 只允许 Layers 查看，hidden component 不可选。
  - [x] gesture cancel/document replace 后清理 marquee overlay 和 transient state.

- [x] Task 6：实现 resize/rotate 与多选 transform（R4）。
  - [x] 实现单选 8 resize handles、rotate handle 与多选 bounds handles。
  - [x] 统一检查 Material resize/rotate capability 和 effective locked。
  - [x] 实现 Shift/Alt resize 与 15 度 rotate snap。
  - [x] 保持多选相对几何，并将 pointer preview 与 persistent transaction 分离。
  - [x] pointerup 只提交一个 history entry；所有 cancel path 恢复 baseline。

- [x] Task 7：实现 group/reparent 与布局命令（R6）。
  - [x] 校验显式 `groupMaterialType` 已启用且 children=true。
  - [x] 用一个 transaction 完成 group add + reparent，ungroup 保持画布位置并删除空 group。
  - [x] Layers drag reparent 执行 local/canvas 坐标转换并复用 Core cycle/lock/hidden 校验。
  - [x] 接通六种 alignment 与两种 distribution，复用 Core geometry delta。
  - [x] 为不同 component position 生成独立 command，整个高层操作只提交一次 history。

- [x] Task 8：实现 Layers、Clipboard 与 Property Panel（R5、R7、R8）。
  - [x] Layers 使用 canonical tree/painter-order 规则展示树、selection、rename、hide/lock 和同级 reorder。
  - [x] 实现实例内 clipboard、subtree detached clone、id/parent rewrite 和连续 paste offset。
  - [x] project replace/unload/dispose 清空 clipboard。
  - [x] 从 focused Manifest propertyPanel/propsSchema 生成白名单控件。
  - [x] props command 前验证完整 next props，非法 draft 不改 document/history/Renderer。
  - [x] 多选只编辑兼容通用字段，不猜测异构 Material props。

- [ ] Task 9：整合 Nebula-compatible shell、Designer UI、事务与键盘（R1-R10）。
  - [x] 增加 `executeTransaction()`，Renderer 失败时保持 document/history/selection/DOM 原值。
  - [x] 按 Spec 尺寸装配 48px toolbar、28px status、20px rulers、可调/可折叠左右 panel。
  - [x] 装配 Material/Layers tabs、canvas overlays、四 Property tabs 与 project status panel。
  - [x] 实现独立 Base Screen light/dark token、focus/disabled/busy/conflict/reduced-motion 状态。
  - [x] 对不可用 command 使用 disabled 状态，不在 handler 中静默失败。
  - [x] 实现 copy/paste、undo/redo、select-all、group/ungroup、save 和 Escape 快捷键并排除文本输入；align/publish 快捷键仍待完成。
  - [x] undo/redo 后统一刷新 dirty、selection、Layers、Property 和 active gesture。
  - [x] 实现小于 1024x640 的不可编辑 warning；dialog containment 仍待浏览器验证。
  - [ ] 验证两个 Designer 实例无共享 selection/history/clipboard/project controller/layout state。

- [ ] Task 10：实现 Nebula-compatible viewport、工具与作者辅助（R9、R10）。
  - [x] 实现 Designer 10%-500% zoom、cursor anchor、fit 30px margin、pan 和 100% reset。
  - [ ] 实现 20px rulers、draggable guides、24px grid、grid snap 和 5px smart guides；当前已完成标尺、grid、guide drag 和 guide threshold snap，component smart guides 待完成。
  - [x] 建立 Select/Hand/Text/Rectangle/Ellipse/Image/Zoom 工具 registry 与 scope shortcuts。
  - [x] 通过显式 `toolMaterialTypes` 解析 create tool，缺失 Material 时 disabled。
  - [ ] 实现 Text/shape/image click/drag create、4px threshold、Space Hand、Alt duplicate 和分层 Escape；当前已完成 create threshold、Space Hand、Alt duplicate 和 selection Escape，group enter 待完成。
  - [x] 将 Designer history limit 固定为 50，并排除 viewport/guides/layout/clipboard/runtime state。

- [ ] Task 11：实现 Nebula-compatible integration surfaces（R11）。
  - [x] Data tab 只装配 canonical static/host-resource editor，不增加 API/dataset/credential 字段。
  - [ ] Interaction/Events tabs 提供 mode、rule 摘要和 Open Blueprint 入口。
  - [ ] 在 Runtime Spec 的当前 Blueprint shape 生效后实现 Blueprint full-workspace authoring projection。
  - [ ] Blueprint workspace 提供 search/connect/zoom/minimap/align/config/diagnostics/simulation log/context menu。
  - [ ] layout 未进入 canonical contract 时使用 deterministic auto-layout，不私自持久化节点坐标。
  - [ ] 实现 saved revision preview request、direct document Viewer preview 和 canonical import/export。
  - [ ] 明确排除 Nebula auth/routes/API/dataset/requestApi/Monaco/dynamic variables/snapshot policy。

- [ ] Task 12：完成 parity 测试、质量门与三件套验收（R1-R11）。
  - [ ] 建立 R1-R11 -> Task -> test file/case 和 test -> Requirement 双向映射。
  - [ ] Core 纯函数/transaction 与 Engine project controller 使用 Vitest。
  - [ ] Pointer、Shadow DOM、keyboard、history、project race 和 parity workflow 使用独立 Designer Playwright harness。
  - [ ] 生成三种 desktop geometry、light/dark shell、authoring workflow 和 Blueprint screenshots。
  - [ ] 验证 Spec 的 pixel ratio/geometry threshold 和窄屏 warning/preview 行为。
  - [ ] 只提交 Base Screen 自有 goldens；Nebula reference screenshots 不进入仓库或 tarball。
  - [x] 运行受影响 package format/lint/typecheck/test/build 和 API/tarball/browser 门禁。
  - [x] 运行 `pnpm verify:m0`；其余 `checklist.md` 项随未完成 parity 工作保留。

# Task Dependencies

- Task 1 是 Task 2-11 的共同前置。
- Task 3 depends on Task 2。
- Task 4 depends on Task 3。
- Task 5、Task 6、Task 7 在 Task 1 后可分支推进；Task 6 依赖 Task 5 的 selection 语义。
- Task 8 depends on Task 5 and Task 7。
- Task 9 depends on Task 3-8。
- Task 10 depends on Task 5、Task 6 and Task 9。
- Task 11 depends on Task 9；其中 Blueprint authoring 还 depends on Runtime Spec Blueprint shape。
- Task 12 随 Task 2-11 分阶段推进，最终完成依赖 Task 10 and Task 11。

该任务集不得修改 Remote Sandbox、Host Resource runtime、Blueprint schema/compiler/runtime、plugin
contribution、framework bridge 或 Nebula importer；相关工作仅由配套 Runtime 三件套拥有。

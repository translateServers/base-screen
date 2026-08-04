# Designer Authoring And Project Lifecycle Tasks

- [ ] Task 1：完成 Project Lifecycle ADR 与实施授权（R1-R8）。
  - [ ] 新增并接受 Project Lifecycle ADR，冻结 publish/signal/conflict/retry/baseline 所有权。
  - [ ] 同步 Contracts Foundation、Core Domain 与 Designer Engine Spec。
  - [ ] 冻结 `groupMaterialType`、direct-document baseline 和 persistence response 竞态语义。
  - [ ] 将本 Spec 状态改为“生效中”，此前保持现有 load/save 公共行为。

- [ ] Task 2：扩展 Project Adapter 公共契约（R1-R3）。
  - [ ] 为 load/save 增加 `ScreenAbortSignal`，增加 publish request 和 adapter capability。
  - [ ] 增加 project-specific diagnostics，并纳入 Contracts 显式 union。
  - [ ] 实现 adapter capability/method 一致性和 response envelope canonical parse。
  - [ ] 保持 revision opaque，不暴露 Router、Store、credential 或 callback。
  - [ ] 更新 public declarations、API report、tarball consumer 和契约测试。

- [ ] Task 3：实现 Engine Project Controller（R1-R3）。
  - [ ] 实现 unloaded/loading/ready/saving/publishing/conflict/error/disposed 状态机。
  - [ ] 为每个 operation 创建 generation、AbortController 和 submitted snapshot。
  - [ ] 新 load 中止旧 load，save/publish mutation 串行化。
  - [ ] 在 replace/unload/disconnect/dispose 时中止并清理全部 operation/timer。
  - [ ] 以 signal/generation/projectId/revision guard 抑制迟到 response。
  - [ ] 实现 cancel 和同 snapshot save single-flight。

- [ ] Task 4：实现 baseline、conflict 与 retry（R1-R3）。
  - [ ] 为 load/direct replace 建立 canonical baseline，并在每次 document change 后比较 dirty。
  - [ ] dirty 布尔值变化时只派发一次事件，undo/redo 回 baseline 时重新 clean。
  - [ ] save pending 期间继续编辑时保留 current document，并推进 submitted baseline。
  - [ ] publish 只接受 clean revision，不隐式 save、不清理未保存编辑。
  - [ ] conflict 保留 document/history/selection/revision/baseline，提供 reload/continue。
  - [ ] 实现 load unavailable 两次自动 retry 和 mutation 显式 retry；scheduler 可测试。

- [ ] Task 5：接通多选与 marquee（R4、R5）。
  - [ ] Engine 所有 selection 只通过 Core interaction reducer。
  - [ ] 实现 click、modifier toggle、blank clear 和 focused reconciliation。
  - [ ] 实现 intersect/contain marquee 和 selection merge/replace。
  - [ ] locked component 只允许 Layers 查看，hidden component 不可选。
  - [ ] gesture cancel/document replace 后清理 marquee overlay 和 transient state。

- [ ] Task 6：实现 resize/rotate 与多选 transform（R4）。
  - [ ] 实现单选 8 resize handles、rotate handle 与多选 bounds handles。
  - [ ] 统一检查 Material resize/rotate capability 和 effective locked。
  - [ ] 实现 Shift/Alt resize 与 15 度 rotate snap。
  - [ ] 保持多选相对几何，并将 pointer preview 与 persistent transaction 分离。
  - [ ] pointerup 只提交一个 history entry；所有 cancel path 恢复 baseline。

- [ ] Task 7：实现 group/reparent 与布局命令（R6）。
  - [ ] 校验显式 `groupMaterialType` 已启用且 children=true。
  - [ ] 用一个 transaction 完成 group add + reparent，ungroup 保持画布位置并删除空 group。
  - [ ] Layers drag reparent 执行 local/canvas 坐标转换并复用 Core cycle/lock 校验。
  - [ ] 接通六种 alignment 与两种 distribution，复用 Core geometry delta。
  - [ ] 为不同 component position 生成独立 command，整个高层操作只提交一次 history。

- [ ] Task 8：实现 Layers、Clipboard 与 Property Panel（R5、R7、R8）。
  - [ ] Layers 使用 Core hierarchy/painter order 展示树、selection、rename、hide/lock 和 reorder。
  - [ ] 实现实例内 clipboard、subtree detached clone、id/parent rewrite 和连续 paste offset。
  - [ ] project replace/unload/dispose 清空 clipboard。
  - [ ] 从 focused Manifest propertyPanel/propsSchema 生成白名单控件。
  - [ ] props command 前验证完整 next props，非法 draft 不改 document/history/Renderer。
  - [ ] 多选只编辑兼容通用字段，不猜测异构 Material props。

- [ ] Task 9：整合 Designer UI、事务与键盘（R1-R8）。
  - [ ] 增加 `executeTransaction()`，Renderer 失败时保持 document/history/selection/DOM 原值。
  - [ ] 装配 toolbar、Material/Layers tabs、canvas overlays、Property 与 project status panel。
  - [ ] 对不可用 command 使用 disabled 状态，不在 handler 中静默失败。
  - [ ] 实现 copy/paste/group/align/save/publish 等快捷键，并排除文本输入。
  - [ ] undo/redo 后统一刷新 dirty、selection、Layers、Property 和 active gesture。
  - [ ] 验证两个 Designer 实例无共享 selection/history/clipboard/project controller。

- [ ] Task 10：完成测试、质量门与三件套验收（R1-R8）。
  - [ ] 建立 R1-R8 -> Task -> test file/case 和 test -> Requirement 双向映射。
  - [ ] Core 纯函数/transaction 与 Engine project controller 使用 Vitest。
  - [ ] Pointer、Shadow DOM、keyboard、history 和 project race 使用独立 Designer Playwright harness。
  - [ ] 运行受影响 package format/lint/typecheck/test/build 和 API/tarball/browser 门禁。
  - [ ] 运行 `pnpm verify:m0` 并按 `checklist.md` 逐项验收。

# Task Dependencies

- Task 1 是 Task 2-9 的共同前置。
- Task 3 depends on Task 2。
- Task 4 depends on Task 3。
- Task 5、Task 6、Task 7 在 Task 1 后可分支推进；Task 6 依赖 Task 5 的 selection 语义。
- Task 8 depends on Task 5 and Task 7。
- Task 9 depends on Task 3-8。
- Task 10 随 Task 2-9 分阶段推进，最终完成依赖 Task 9。

该任务集不得修改 Remote Sandbox、Host Resource runtime、Blueprint、plugin contribution、framework
bridge 或 Nebula importer；相关工作仅由配套 Runtime 三件套拥有。

# Tasks

- [x] Task 1：完成实施前契约冻结。
  - [x] 复核 ADR-0001、ADR-0002 与 Contracts Foundation Spec 未改变 Core 的依赖、Document 或诊断边界。
  - [x] 在 Contracts 所有的诊断 code 中增加 Core Spec 冻结的 `CORE_*` code。
  - [x] 为新增 diagnostic code、path、排序和数据最小化规则补充 Contracts 测试。
  - [x] 验证 Contracts public declaration、API report 与真实 tarball consumer。
  - [x] 完成 Core Domain Spec 评审，将状态改为“生效中”并更新规格索引。

- [x] Task 2：建立 Core 领域基础与包边界。
  - [x] 仅在源码实际使用后声明 `@base-screen/contracts` workspace dependency。
  - [x] 实现并导出 `ScreenPoint`、`ScreenVector`、`ScreenRect`、`ScreenBounds` 与 `ScreenAxis`。
  - [x] 建立 finite number、`-0` 归一和 Core-valid Document 的内部前置条件工具。
  - [x] 实现 `ScreenCoreInvariantError`，保证 diagnostics 使用 Contracts envelope。
  - [x] 增加 Node ESM 导入、无 DOM global、无副作用和依赖边界测试。

- [x] Task 3：实现 hierarchy 查询与语义校验。
  - [x] 实现 component id 索引、roots、parent、ancestors、descendants 与 ancestor depth 纯查询。
  - [x] 实现 effective hidden 与 effective locked 的祖先继承计算。
  - [x] 实现 sibling `(zIndex, document order)` 的稳定排序和树形 painter order。
  - [x] 实现 ancestor depth、rotated bounds 与 canvas coordinate invariant 校验。
  - [x] 实现 `validateScreenDocumentSemantics()` 的稳定 diagnostic code、path 和排序。
  - [x] 覆盖深层 hierarchy、相同 zIndex、hidden/locked ancestor 和 Core-invalid Document 测试。

- [x] Task 4：实现 Document command 基础设施。
  - [x] 实现 `ScreenDocumentCommand`、`ScreenComponentPatch` 与 `ScreenCommandResult` 公共类型。
  - [x] 建立 command runtime shape、目标去重、document order 和 no-op 检测。
  - [x] 实现失败返回原 Document 引用、成功 structural sharing 和净 changed ids 计算。
  - [x] 实现 command 候选 Document 的 Core semantic 后置校验。
  - [x] 确保 command、patch、props、style、dataSource 与输入 Document 均不被修改。

- [x] Task 5：实现 Canvas、Variables 与 Component 命令。
  - [x] 实现 `update-canvas` 的 strict runtime key、空 patch、相同值 no-op 和原子校验。
  - [x] 实现 `replace-variables` 的整体替换、Contracts canonical 约束和 no-op。
  - [x] 实现 `add-component` 的 identity、parent、geometry 和数组追加语义。
  - [x] 实现 `update-components` 的多目标原子更新与整体字段替换。
  - [x] 实现 `remove-components` 的 descendant closure、锁定拒绝和稳定 changed ids。
  - [x] 实现 `reparent-components` 的最外层目标归一、环检测、锁定边界和 canvas position 保持。
  - [x] 为每类命令补充成功、no-op、缺失目标、锁定和非法输入测试。

- [x] Task 6：实现原子 Transaction。
  - [x] 实现 `ScreenDocumentTransaction` 与 success/failure result 公共类型。
  - [x] 按顺序应用最多 1,000 个命令，并在首错时回滚到原 Document。
  - [x] 实现 `failedCommandIndex` 和 command diagnostic path 的 transaction 前缀。
  - [x] 实现命令数超限的 `CORE_COMMAND_LIMIT_EXCEEDED` 诊断。
  - [x] 计算相对 transaction 输入的最终净 changed ids，排除 add-remove 与恢复原值。
  - [x] 覆盖空 transaction、全部 no-op、首错/中间错、后置 invariant 失败和上限测试。

- [x] Task 7：实现 Snapshot History。
  - [x] 实现 `ScreenHistoryEntry`、`ScreenHistoryState` 与 `createScreenHistory()`。
  - [x] 实现 commit 的 before/after entry、future 清空和同引用 no-op。
  - [x] 实现 undo/redo 的 past、present、future 迁移与空栈引用语义。
  - [x] 实现默认 100、范围 `1..1000` 的 limit 校验和最旧 past 裁剪。
  - [x] 验证 history 只保存 Core-valid Document，不包含其他状态或副作用。
  - [x] 覆盖 branch、limit 缩减、连续 undo/redo 和 invalid limit 测试。

- [x] Task 8：实现 Viewport 与 Interaction reducer。
  - [x] 实现 Viewport 初始/reset state、zoom 范围与 finite 输入校验。
  - [x] 实现 `viewport = canvas * zoom + offset`、pan-by 与 anchor zoom reducer。
  - [x] 实现 Interaction selection replace、toggle、clear 与 document reconcile。
  - [x] 按 document order 去重 selection，并过滤不存在或 effective hidden id。
  - [x] 实现 focused component 的 selection 约束与 no-op 引用语义。
  - [x] 覆盖非法 viewport action、anchor zoom、hidden ancestor 和 Document 隔离测试。

- [x] Task 9：实现坐标、Bounds 与命中测试。
  - [x] 实现 canvas/viewport 正反转换和容许误差 round-trip 测试。
  - [x] 实现以组件中心旋转的四角与 axis-aligned bounds。
  - [x] 实现 selection bounds union 与空输入行为。
  - [x] 实现树形 pre-order painter list 及其逆序 point hit。
  - [x] 实现旋转矩形 point containment，边界按命中处理。
  - [x] 实现 rect 与旋转矩形的 intersect/contain，边界按命中处理。
  - [x] 覆盖跨 root 子树、相同 zIndex、AABB 空角、hidden 与 locked 测试。

- [x] Task 10：实现 Alignment、Distribution 与 Snap。
  - [x] 实现 rotated AABB 的 start、center、end 轴值计算。
  - [x] 实现 locked reference 优先的 alignment，并只返回未锁定非零 delta。
  - [x] 实现按 bounds start 与 component id 排序的等边缘 distribution。
  - [x] 实现首尾与 locked 固定端点、分段区间和 negative gap 行为。
  - [x] 实现 snap threshold 包含边界与完整 total-order comparator。
  - [x] 对非法 geometry、candidate 或 threshold 抛出 Spec 规定的 `RangeError`。
  - [x] 使用数据驱动测试覆盖乱序输入、多 locked、重叠、等距和重复 candidate。

- [x] Task 11：收敛公共 API 与不可变性。
  - [x] 从根入口只导出 Core Spec 已验收的类型、reducer、command、transaction、history、validation 与 geometry API。
  - [x] 确认根入口只导出 ADR-0010/ADR-0013 冻结的 Blueprint command、compile/evaluate API，不导出 runtime、host action 或 placeholder。
  - [x] 检查 public declaration 不泄漏 DOM、framework、Store、Zod、Nebula 或宿主类型。
  - [x] 验证所有 no-op 引用语义和未变化结构的安全 structural sharing。
  - [x] 验证结果不共享调用方可变 command/patch 容器，输入后续变化不影响结果。
  - [x] 检查实现不读取时间、随机数、locale、环境变量或 global registry。

- [x] Task 12：完成测试矩阵与发布门禁。
  - [x] 将 Spec R1-R13 和全部 public export/失败分支映射到自动化测试。
  - [x] 增加 canary secret，验证 diagnostics、errors 和 snapshots 不泄漏业务数据。
  - [x] 增加真实 tarball consumer，只安装 Contracts 与 Core 并执行类型和运行 smoke test。
  - [x] 运行 package format、lint、typecheck、test 和 build。
  - [x] 运行 workspace boundary、API report、publint、ATTW 与 tarball verification。
  - [x] 运行仓库既有验证命令，确认 Contracts、Plugin Core 与 M0 工程基线无回归。
  - [x] 按 `checklist.md` 逐项验收，只在证据完整后勾选完成。

# Task Dependencies

- Task 2 depends on Task 1。
- Task 3 depends on Task 2。
- Task 4 depends on Task 2 and Task 3。
- Task 5 depends on Task 4。
- Task 6 depends on Task 4 and Task 5。
- Task 7 depends on Task 2 and Task 3；可与 Task 5、Task 6 并行，但最终集成依赖 Core-valid Document 规则稳定。
- Task 8 depends on Task 2 and Task 3；可与 Task 4 至 Task 7 并行。
- Task 9 depends on Task 2 and Task 3。
- Task 10 depends on Task 9。
- Task 11 depends on Task 5、Task 6、Task 7、Task 8、Task 9 and Task 10。
- Task 12 可随 Task 3 至 Task 10 分阶段补充测试，最终完成依赖 Task 11。

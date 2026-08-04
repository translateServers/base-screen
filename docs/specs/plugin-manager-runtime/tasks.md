# Tasks

- [ ] Task 1：完成 P2 实施前契约验收。
  - [ ] 确认 P0 Contracts、P1 Plugin Core 的 Spec、实现、公共声明和真实 tarball 已完成各自退出条件。
  - [ ] 逐项核对 Plugin Core 发布的 Manifest parser、Catalog、runtime、activation context、command port、lifecycle 与 `PLUGIN_CORE_*` diagnostics。
  - [ ] 将本 Spec 的精确公共名称同步到 Plugin Core 最终发布契约，不发布 alias 或占位 API。
  - [ ] 评审并冻结候选输入、Manager 会话状态、失败回滚、registry 查询端口、资源上限和目录提交语义。
  - [ ] 将本 Spec 状态改为“生效中”，并更新规格索引；在此前不得修改 Manager 空入口。

- [ ] Task 2：冻结 Manager 最小公共 API 与包边界。
  - [ ] 定义 create options、readonly session、状态、activate/deactivate/dispose 结果和双 Catalog 成功值。
  - [ ] 保持默认入口无 DOM/global 查询、Custom Element 注册、插件执行、实例创建或 I/O 副作用。
  - [ ] 只允许源码真实使用的 `@base-screen/contracts` 与 `@base-screen/plugin-core` workspace dependency。
  - [ ] 禁止依赖 Core、Renderer、Engine、Plugin SDK、Material、SDK、Testing 和框架包。
  - [ ] 确保 public declaration 不泄漏 Zod、runtime 私有对象、宿主 DTO、Core Command Bus 或 service locator。

- [ ] Task 3：实现候选快照与单份契约预检。
  - [ ] 在 clone、建图、registry 查询或生命周期调用前检查 plugin、standalone material 和 dependency edge 总量。
  - [ ] 对每个 runtime Manifest 调用 Plugin Core parser，并为 diagnostic 增加稳定候选路径前缀。
  - [ ] 验证 runtime `manifest` 与 detached parsed Manifest 内容一致，拒绝 activate 时追加 contribution。
  - [ ] 对 constructor static Manifest 复用 Plugin Core Material Manifest parser，不复制字段 schema 或资源限制。
  - [ ] 保证输入对象、数组和 Manifest 不被修改，且预检阶段不调用 runtime lifecycle hook。
  - [ ] 任一预检失败不调用 plugin hook、不创建可调用 session、不返回部分 plan。

- [ ] Task 4：实现集合冲突与依赖 resolver。
  - [ ] 检测重复 plugin id，并拒绝覆盖、first-wins 或隐式合并。
  - [ ] 检测 material type/tagName/constructor 双向冲突及 standalone/plugin contribution 不一致。
  - [ ] 检测 command、dataResourceType、blueprintCapability 等跨插件 contribution identity 冲突。
  - [ ] 检测依赖缺失、`^major.minor.patch` 不兼容和所有依赖环成员。
  - [ ] 生成依赖先行的稳定拓扑序，并以 plugin id UTF-16 code unit 顺序打破并列。
  - [ ] 验证候选输入排列不影响拓扑序、diagnostics 和最终 Catalog 顺序。

- [ ] Task 5：实现能力授权计划与 activation session。
  - [ ] 对 requested、declared、host-approved、port-compatible capability 执行三重授权检查。
  - [ ] 为未声明、未批准和不兼容能力返回 Plugin Core 冻结的对应 diagnostics。
  - [ ] 构造最小 activation context，只暴露 instance/plugin identity、排序后的 granted capability 与具体限权端口。
  - [ ] 以宿主闭包绑定 plugin/session identity，不接受插件伪造 request identity。
  - [ ] 每次 activate 创建全新 session，旧 session 不得在重试后恢复。
  - [ ] 确保 context 不包含 Store、Router、DOM root、Command Bus、凭证或通用 service locator。

- [ ] Task 6：实现 Custom Element 只读 registry 预检。
  - [ ] 通过宿主显式注入的最小查询端口按 tagName 获取 constructor。
  - [ ] 拒绝缺失 definition、非法 constructor、static Manifest 不一致和 type/tagName/constructor 冲突。
  - [ ] 保持同 tagName/同 constructor 的重复预检幂等，同 tagName/不同 constructor fail closed。
  - [ ] 不调用 `customElements.define()`，不自动导入 `/auto-register`，不枚举或覆盖 registry。
  - [ ] 归一化 registry query 异常，不泄漏 stack、constructor source 或浏览器内部 message。
  - [ ] 使用真实浏览器 harness 验证 Custom Element registry 行为，纯 resolver 测试继续运行在 Node。

- [ ] Task 7：实现 lifecycle coordinator 与失败原子性。
  - [ ] 串行执行 activate，并保证每个依赖在依赖者之前 active。
  - [ ] 拒绝并发/重复 activate、非法 deactivate 和 disposed 后的 lifecycle 调用。
  - [ ] activate 失败时立即撤销失败 session，并逆序 deactivate 已成功插件。
  - [ ] 回滚成功后回到 inactive；回滚或 deactivate 失败后进入仅允许 dispose 的 failed。
  - [ ] deactivate/dispose 开始前撤销当前 snapshot，并立即使相关 session 端口失效。
  - [ ] dispose 至多实际执行一次，重复 dispose 幂等；active 时先执行 deactivate 语义。
  - [ ] 聚合多个 hook failure，保持稳定顺序且不覆盖首个错误或泄漏原始 Error。

- [ ] Task 8：实现双 Catalog 原子构建与多实例隔离。
  - [ ] 从同一 enable plan 构建 Material Catalog 与 Plugin Catalog。
  - [ ] 仅在全部 plugin activate 成功后一次性发布两个 snapshot。
  - [ ] Material list 按 type、Plugin list 按 plugin id 使用 UTF-16 code unit 升序。
  - [ ] Catalog 不暴露 mutation、runtime、context、session、adapter、registry 或可变 collection。
  - [ ] 任一预检、resolve、授权或 lifecycle 失败均不返回或保留部分 entry。
  - [ ] 验证两个 Manager 实例可使用不同候选与授权，单实例失败/deactivate/dispose 不污染另一实例。
  - [ ] 不建立模块级 runtime owner registry；记录宿主应为有实例状态的插件提供独立 runtime，并允许相同 constructor 被不同实例 snapshot 安全引用。

- [ ] Task 9：完成业务约束与安全测试矩阵。
  - [ ] 覆盖候选限制、输入不变、runtime/Manifest 一致性与 parser diagnostic path 前缀。
  - [ ] 覆盖依赖缺失/不兼容/环、稳定拓扑和所有跨候选冲突。
  - [ ] 覆盖 capability 最小授权、context 泄漏检查和 session identity 闭包绑定。
  - [ ] 覆盖 activate 回滚、deactivate/dispose 逆序、failed 状态、重复/并发调用和 session 立即失效。
  - [ ] 覆盖 Catalog 同时提交、失败无部分值、只读接口、稳定 list 与双实例隔离。
  - [ ] 覆盖 canary secret、stack、完整 Manifest、constructor source 和 hook error message 不泄漏。
  - [ ] 不为纯 readonly 字段映射、内置必填或 TypeScript 类型本身编写无价值测试。

- [ ] Task 10：扩展外部 conformance 与发布包验收。
  - [ ] 由 `@base-screen/testing` 通过 Manager 公共 API 提供 P2 registry/plugin lifecycle conformance，不让生产包反向依赖。
  - [ ] 增加真实浏览器 registry、同 constructor 幂等、不同 constructor 冲突和双实例 harness。
  - [ ] 增加空白 Vanilla tarball consumer，验证 Node ESM、类型声明、exports 和依赖解析。
  - [ ] 检查 tarball、`.d.ts` 和 dist graph 不包含框架、应用源码、Nebula 源码或 private deep import。
  - [ ] 将 R1-R10 逐项映射到自动化测试与 checklist。

- [ ] Task 11：运行完整质量门禁并修复问题。
  - [ ] 运行 package format、lint、typecheck、test 和 build。
  - [ ] 运行 workspace dependency/source/declaration/dist boundary checks。
  - [ ] 运行 API report、publint、ATTW 和真实 tarball verification。
  - [ ] 运行适用的 Chromium 关键 E2E 与总仓库既有验证命令。
  - [ ] 确认 Contracts、Plugin Core、M0 和已完成 P1 门禁无回归。
  - [ ] 完成 checklist 逐项验收后，才允许宣布 P2 Plugin Manager 退出。

# Task Dependencies

- Task 2 depends on Task 1。
- Task 3 depends on Task 1 and Task 2。
- Task 4 depends on Task 3。
- Task 5 depends on Task 3 and Task 4。
- Task 6 depends on Task 3 and Task 4。
- Task 7 depends on Task 4, Task 5, and Task 6。
- Task 8 depends on Task 7。
- Task 9 depends on Task 3 through Task 8。
- Task 10 depends on Task 8 and Task 9。
- Task 11 depends on Task 1 through Task 10。

Plugin Manager 与 Plugin SDK 可在 P2 并行，但 Task 2-11 不得依赖 Plugin SDK 实现。P3 原生 Material 与框架 spike 依赖本清单和 Plugin SDK 各自完成，不得提前进入。

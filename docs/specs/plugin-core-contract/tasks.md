# Tasks

- [ ] Task 1：完成 ADR 与实施前契约冻结（R1-R13）。
  - [ ] 创建并接受 ADR-0003，冻结 `lib.dom` 声明、Element ABI、显式 type/tagName 绑定、Manifest schema 与注册所有权。
  - [ ] 创建并接受 ADR-0004，冻结同 realm 信任模型、四类贡献点、生命周期状态机、能力授权与命令端口边界。
  - [ ] 根据 ADR 回填所有 public strict object/discriminated union 的完整 TypeScript 签名、字段必填性、未知字段策略和固定资源上限。

- [ ] Task 2：补齐 Contracts 前置契约（R10、R11）。
  - [ ] 为 Contracts 增加公开、受控的 JSON 资源预算 API，使消费者可指定 byte/depth/container 上限而不 deep import 或复制 parser。
  - [ ] 保持 JSON 安全规则由 Contracts 唯一所有，并允许 Plugin Core 将预算失败映射为 §18 的稳定 code。
  - [ ] 在 Contracts 的 `ScreenDiagnosticCode` 显式 union 中增加 Spec §18 冻结的 `PLUGIN_CORE_*` code。
  - [ ] 为资源预算、code、排序和数据最小化边界编写测试，并验证 Contracts tarball 与 API 门禁。

- [ ] Task 3：确认生效条件并授权实施（R1-R13）。
  - [ ] 确认 Task 1 的契约评审与 Task 2 的 Contracts 前置均已完成。
  - [ ] 将 Spec 状态改为“生效中”，并将规格索引中的条目从“设计中”移动到“生效中”。

- [ ] Task 4：实现 Material 基础协议（R1-R5、R10-R12）。
  - [ ] 实现物料协议版本、readonly Material Manifest、完整 Element Model 与 dataState 判别联合。
  - [ ] 实现显式 type/tagName 绑定校验、有限 props schema 与 Material Manifest parser。
  - [ ] 实现直接扩展 `HTMLElement` / `CustomElementConstructor` 的公共结构类型和 strict 两字段标准事件 detail。
  - [ ] 确保 parser detached、strict、fail closed，且不执行输入函数或访问 DOM global。

- [ ] Task 5：实现只读 Material Catalog 协议（R6）。
  - [ ] 定义 entry、按 type 查询、存在判断和确定性 list 的 readonly 接口。
  - [ ] 保持接口无 register/delete/enable/disable 等 mutation 方法。
  - [ ] 增加 UTF-16 type 排序、缺失 type、不同 major、type/tagName 冲突与双实例隔离的契约测试 fixture。

- [ ] Task 6：实现 Plugin Manifest 与生命周期协议（R7、R8、R10、R11）。
  - [ ] 实现 Plugin API version、完整 Plugin Manifest、dependency、capability 与四类 contribution 判别联合。
  - [ ] 实现 strict Plugin Manifest parser，检测单份 Manifest 内重复 identity、未知 contribution、非法 range 和引用不一致。
  - [ ] 定义由插件实现的 runtime、由 Manager 构造的最小 activation context、固定生命周期状态机与 session 端口失效语义。
  - [ ] 验证 context 不泄漏 Command Bus、Store、Router、DOM root、凭证或 service locator。
  - [ ] 定义 Manager resolver conformance 契约以覆盖依赖缺失/不兼容/环及跨插件 contribution 冲突；具体运行时验收归后续 Manager Spec。

- [ ] Task 7：实现 Plugin Command Port 与 Plugin Catalog 协议（R9、R13）。
  - [ ] 定义 `execute({ commandId, args })` 异步端口、宿主闭包绑定 session/plugin identity 和白名单授权语义。
  - [ ] 校验 command id、args/result JSON、固定资源上限和失效 session，并保证诊断最小披露。
  - [ ] 定义按 plugin id UTF-16 升序的只读 Plugin Catalog snapshot，不暴露生命周期对象或 adapter。
  - [ ] 通过纯 conformance fake 覆盖未授权命令、非 JSON 参数/结果、deactivate/dispose 后失效 session；实际 Core 不执行行为归 Engine/Manager Spec。

- [ ] Task 8：收敛公共 API 与包边界（R1、R12）。
  - [ ] 从根入口仅导出已由 Spec 验收的 API。
  - [ ] 仅在源码实际使用后声明 `@base-screen/contracts` 依赖。
  - [ ] 检查 public declaration 不泄漏 React、Vue、Zod 或上层实现包类型。
  - [ ] 检查默认入口无 Custom Element 注册、插件执行、global mutation 或 I/O。

- [ ] Task 9：完成协议与安全测试矩阵（R1-R13）。
  - [ ] 覆盖 R2-R5 的 identity、Manifest 自定义校验、dataState 判别、strict 事件 detail、allowlist 和 JSON 边界。
  - [ ] 覆盖 R6-R9、R13 的 Catalog、dependency/capability/contribution、生命周期 conformance 和 command allowlist。
  - [ ] 覆盖 R10-R11 的确定性、输入不变、detached output、Model/context/catalog 数据资源边界和 canary secret 不泄漏。
  - [ ] 覆盖 R1、R4、R5、R12 的浏览器结构与真实 tarball consumer 验收。
  - [ ] 建立 R1-R13 → Task → test file/test case 及 test → Requirement 双向映射。

- [ ] Task 10：运行完整质量门禁并修复问题（R1-R13）。
  - [ ] 运行 package format、lint、typecheck、test 和 build。
  - [ ] 运行 workspace boundary、API report、publint、ATTW 与 tarball verification。
  - [ ] 运行仓库既有验证命令，确认 Contracts、Core 和 M0 工程基线无回归。
  - [ ] 完成 checklist 逐项验证。

# Task Dependencies

- Task 1 与 Task 2 可并行；两者均不要求 Spec 已生效。
- Task 3 depends on Task 1 and Task 2。
- Task 4 depends on Task 3。
- Task 5 depends on Task 4。
- Task 6 depends on Task 3；可与 Task 4、Task 5 并行。
- Task 7 depends on Task 6。
- Task 8 depends on Task 4、Task 5、Task 6 and Task 7。
- Task 9 可随 Task 4 至 Task 7 分阶段并行推进，最终完成依赖 Task 8。
- Task 10 depends on Task 8 and Task 9。

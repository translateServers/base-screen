# Runtime And Ecosystem Hardening Tasks

- [x] Task 1：完成生效前 ADR 与上游契约冻结（R1-R7）。
  - [x] 新增并接受 Remote Sandbox successor ADR，解决 opaque origin 与 exact-origin 的冲突（ADR-0009）。
  - [x] 新增并接受 Host Resource deadline/Blueprint runtime successor ADR（ADR-0010）。
  - [x] 使用唯一新编号新增 Nebula importer ADR，并修正决策索引中的重复编号（ADR-0011）。
  - [x] 同步 Contracts Foundation、Host Resource And Blueprint、Remote Plugin Sandbox、Plugin Manager Runtime 与 Nebula Importer Spec。
  - [x] 将本 Spec 状态改为“生效中”，并建立实施计划。

- [ ] Task 2：实现 Remote Sandbox transport 与浏览器协议（R1）。
  - [ ] 将 `moduleUrl` 语义替换为明确的 remote HTML `entryUrl`。
  - [ ] 实现 entry/expected/host origin 预检，拒绝 same-origin entry 和非法 timeout。
  - [ ] 按 successor ADR 设置最小 sandbox token、referrer policy 和 exact `targetOrigin`。
  - [ ] 实现 strict init/ready/emit-event 顺序、消息预算和固定 diagnostics。
  - [ ] 实现 iframe load error、timeout、重复 ready、畸形消息和幂等 dispose。
  - [ ] 验证 sandbox 不获得 Material、Catalog、Document、command/resource port 或凭证。

- [ ] Task 3：实现 Host Resource deadline 与 conformance（R2）。
  - [ ] 为 Renderer options 增加并校验 `resourceTimeoutMs`。
  - [ ] 为每个 resolve 维护 controller、deadline timer 和 generation。
  - [ ] 区分 timeout、host failure、invalid result 与 silent lifecycle cancellation。
  - [ ] 覆盖 Host 忽略 signal 时的迟到结果抑制。
  - [ ] 在 `@base-screen/testing` 增加只消费公共 API 的 conformance helper。
  - [ ] 保持 production package 不依赖 Testing，Renderer 不自动 retry/cache/deduplicate。

- [ ] Task 4：冻结并实现当前 Blueprint Contracts（R3、R4）。
  - [ ] 定义一个严格的 Blueprint shape，不引入判别联合或兼容分支。
  - [ ] 实现 literal/event-payload/variable/array/object value expression schema。
  - [ ] 实现 path 危险键、深度、container 和 byte 预算。
  - [ ] 实现 condition operator 的条件必填和类型兼容校验。
  - [ ] 增加 `requiredCapabilities` 与稳定 capability id grammar。
  - [ ] 更新 canonical parser、serializer、reference validation 和 JSON Schema golden。

- [ ] Task 5：实现 Blueprint compile/evaluate（R3、R4）。
  - [ ] 更新 fixture 以匹配当前 strict shape。
  - [ ] 实现 event payload/variable value resolution 和 detached JSON result。
  - [ ] 实现 condition 单分支、rule/action 文档顺序与失败原子性。
  - [ ] 缺失 path/variable、危险 path、类型不兼容和超限输入返回固定 diagnostics。
  - [ ] 确保 evaluator 不调用 getter、函数、`eval` 或脚本解释器。
  - [ ] 覆盖 host event port rejection，避免 rejected Promise 形成浮动异常。

- [ ] Task 6：接通 Plugin contribution runtime projection（R5）。
  - [ ] 从 active Plugin Catalog 构建实例级 immutable runtime contribution index。
  - [ ] 以 `dataResourceType.id` 校验 Document resourceType 和 source params schema。
  - [ ] 以已声明、宿主支持且获授权的 `blueprintCapability.id` 校验 Blueprint plan。
  - [ ] 未启用、冲突、未知和未授权 contribution 全部 fail closed。
  - [ ] deactivate/dispose 后撤销当前 index，旧 snapshot 不保留 runtime authority。
  - [ ] 验证双 Manager 实例使用不同 contribution 集合且互不污染。

- [ ] Task 7：增加 React/Vue installed-tarball consumer（R6）。
  - [ ] 从实际 pack 产物安装 bridge、SDK 及全部 workspace tarball 依赖。
  - [ ] React consumer 增加本地 `JSX.IntrinsicElements` augmentation。
  - [ ] Vue consumer 增加本地 `GlobalComponents` augmentation 和 custom-element compiler 配置。
  - [ ] 两个 consumer 均运行 TypeScript、Vite production build 和 Chromium Playwright。
  - [ ] 覆盖 model 更新不重建、标准事件、disconnect/reconnect 与最终 unmount。
  - [ ] 检查 lockfile/resolve graph 无 workspace link、源码 alias 和额外 framework peer。

- [ ] Task 8：实现 Nebula importer 两阶段迁移（R7）。
  - [ ] 收集、脱敏并记录至少三类真实 export fixture 的 provenance。
  - [ ] 实现唯一 variant detector，拒绝零匹配和多匹配。
  - [ ] 实现 `--analyze` 字段级 finding report，不写 canonical output。
  - [ ] 实现 map/drop/cancel decision 文件解析和 blocking resolution。
  - [ ] 拒绝 input/output/report/decision 同路径并使用临时文件原子写入。
  - [ ] 成功输出重新 parse/serialize；失败移除 stale success output。

- [ ] Task 9：完成测试映射与独立 harness（R1-R7）。
  - [ ] 建立 R1-R7 -> Task -> test file/case 和 test -> Requirement 双向映射。
  - [ ] 建立独立 Runtime Playwright harness，不向 Designer harness 混入场景。
  - [ ] 覆盖 sandbox、resource、Blueprint、contribution、tarball 和 importer Test Matrix。
  - [ ] 保留 Renderer/Viewer、Plugin Manager、bridge 与 importer success 回归。
  - [ ] 验证 diagnostics 不泄漏 URL、payload、Error、stack、业务数据或凭证。

- [ ] Task 10：运行完整质量门禁并收敛文档（R1-R7）。
  - [ ] 运行受影响 package 的 format、lint、typecheck、test 和 build。
  - [ ] 运行 boundary、API report、publint、ATTW、tarball 和 browser verification。
  - [ ] 运行 `pnpm verify:nebula-import` 与新增 importer variant/decision 验证。
  - [ ] 运行 `pnpm verify:m0`，修复所有由本任务引入的问题。
  - [ ] 按 `checklist.md` 逐项验收并同步现行 Spec/架构状态。

# Task Dependencies

- Task 1 是 Task 2-8 的共同前置。
- Task 2、Task 3、Task 7、Task 8 在 Task 1 后可并行。
- Task 5 depends on Task 4。
- Task 6 depends on Task 4；可与 Task 5 并行，最终集成依赖两者完成。
- Task 9 随 Task 2-8 分阶段推进，最终完成依赖 Task 2-8。
- Task 10 depends on Task 9。

该任务集不得修改 `ScreenProjectAdapter`、Engine project session、Designer Shadow DOM 或 dirty
baseline；相关工作仅由配套 Designer 三件套拥有。

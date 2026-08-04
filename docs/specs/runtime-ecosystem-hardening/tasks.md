# Runtime And Ecosystem Hardening Tasks

- [x] Task 1：完成生效前 ADR 与上游契约冻结（R1-R7）。
  - [x] 新增并接受 Remote Sandbox successor ADR，解决 opaque origin 与 exact-origin 的冲突（ADR-0009）。
  - [x] 新增并接受 Host Resource deadline/Blueprint runtime successor ADR（ADR-0010）。
  - [x] 使用唯一新编号新增 Nebula importer ADR，并修正决策索引中的重复编号（ADR-0011）。
  - [x] 同步 Contracts Foundation、Host Resource And Blueprint、Remote Plugin Sandbox、Plugin Manager Runtime 与 Nebula Importer Spec。
  - [x] 将本 Spec 状态改为“生效中”，并建立实施计划。

- [ ] Task 2：实现 Remote Sandbox transport 与浏览器协议（R1）。
  - [x] 将 `moduleUrl` 语义替换为明确的 remote HTML `entryUrl`。
  - [x] 实现 entry/expected/host origin 预检，拒绝 same-origin entry 和非法 timeout。
  - [x] 按 successor ADR 设置最小 sandbox token、referrer policy 和 exact `targetOrigin`。
  - [x] 实现 strict init/ready/emit-event 顺序、消息预算和固定 diagnostics。
  - [x] 实现 iframe load error、timeout、重复 ready、畸形消息和幂等 dispose。
  - [ ] Runtime harness 仅验证跨 origin remote 无法访问 parent document；尚未逐项验证 Material、Catalog、Document、command/resource port 或凭证全部不可达。

- [x] Task 3：实现 Host Resource deadline 与 conformance（R2）。
  - [x] 为 Renderer options 增加并校验 `resourceTimeoutMs`。
  - [x] 为每个 resolve 维护 controller、deadline timer 和 generation。
  - [x] 区分 timeout、host failure、invalid result 与 silent lifecycle cancellation。
  - [x] 覆盖 Host 忽略 signal 时的迟到结果抑制。
  - [x] 在 `@base-screen/testing` 增加只消费公共 API 的 conformance helper。
  - [x] 保持 production package 不依赖 Testing，Renderer 不自动 retry/cache/deduplicate。

- [x] Task 4：冻结并实现当前 Blueprint Contracts（R3、R4）。
  - [x] 定义一个严格的 Blueprint shape，不引入判别联合或兼容分支。
  - [x] 实现 literal/event-payload/variable/array/object value expression schema。
  - [x] 实现 path 危险键、深度、container 和 byte 预算。
  - [x] 实现 condition operator 的条件必填和类型兼容校验。
  - [x] 增加 `requiredCapabilities` 与稳定 capability id grammar。
  - [x] 更新 canonical parser、serializer、reference validation 和 JSON Schema golden。

- [x] Task 5：实现 Blueprint compile/evaluate（R3、R4）。
  - [x] 更新 fixture 以匹配当前 strict shape。
  - [x] 实现 event payload/variable value resolution 和 detached JSON result。
  - [x] 实现 condition 单分支、rule/action 文档顺序与失败原子性。
  - [x] 缺失 path/variable、危险 path、类型不兼容和超限输入返回固定 diagnostics。
  - [x] 确保 evaluator 不调用 getter、函数、`eval` 或脚本解释器。
  - [x] 覆盖 host event port rejection，避免 rejected Promise 形成浮动异常。

- [x] Task 6：接通 Plugin contribution runtime projection（R5）。
  - [x] 从 active Plugin Catalog 构建实例级 immutable runtime contribution index。
  - [x] 以 `dataResourceType.id` 校验 Document resourceType 和 source params schema。
  - [x] 以已声明、宿主支持且获授权的 `blueprintCapability.id` 校验 Blueprint plan。
  - [x] 未启用、冲突、未知和未授权 contribution 全部 fail closed。
  - [x] deactivate/dispose 后撤销当前 index，旧 snapshot 不保留 runtime authority。
  - [x] 验证双 Manager 实例使用不同 contribution 集合且互不污染。

- [x] Task 7：增加 React/Vue installed-tarball consumer（R6）。
  - [x] 从实际 pack 产物安装 bridge、SDK 及全部 workspace tarball 依赖。
  - [x] React consumer 增加本地 `JSX.IntrinsicElements` augmentation。
  - [x] Vue consumer 增加本地 `GlobalComponents` augmentation 和 custom-element compiler 配置。
  - [x] 两个 consumer 均运行 TypeScript、Vite production build 和 Chromium Playwright。
  - [x] 覆盖 model 更新不重建、标准事件、disconnect/reconnect 与最终 unmount。
  - [x] 检查 lockfile/resolve graph 无 workspace link、源码 alias 和额外 framework peer。

- [x] Task 8：实现 Nebula importer 两阶段迁移（R7）。
  - [x] 收集、脱敏并记录至少三类经授权真实 export fixture 的文件级 provenance。
  - [x] 验证唯一 variant detector，拒绝零匹配和多匹配。
  - [x] 验证 `--analyze` 字段级 finding report，不写 canonical output。
  - [x] 验证 map/drop/cancel decision、malformed/unused decision 与 blocking resolution。
  - [x] 验证 input/output/report/decision 的所有两两同路径拒绝和临时文件原子写入。
  - [x] 验证成功输出 canonical round-trip，以及 write failure 后 stale output cleanup。

- [ ] Task 9：完成测试映射与独立 harness（R1-R7）。
  - [x] 建立 R1-R7 -> Task -> test file/case 和 test -> Requirement 双向映射（[test-matrix.md](./test-matrix.md)）。
  - [x] 建立独立 Runtime Playwright harness，不向 Designer harness 混入场景（`pnpm verify:runtime`）。
  - [ ] 覆盖 sandbox、resource、Blueprint、contribution、tarball 和 importer Test Matrix。R1 尚有未独立验证的浏览器失败路径；R7 缺少经授权脱敏真实 export 的 provenance 证据。
  - [x] 保留 Renderer/Viewer、Plugin Manager、bridge 与 importer success 回归，并在矩阵中列出当前自动化证据。
  - [ ] 验证 diagnostics 不泄漏 URL、payload、Error、stack、业务数据或凭证。

- [ ] Task 10：运行完整质量门禁并收敛文档（R1-R7）。
  - [ ] 运行受影响 package 的 format、lint、typecheck、test 和 build。
  - [ ] 运行 boundary、API report、publint、ATTW、tarball 和 browser verification。
  - [x] 运行 `pnpm verify:nebula-import` 等效 Node verifier 与新增 importer variant/decision 验证。
  - [ ] 运行 `pnpm verify:m0`，修复所有由本任务引入的问题。
  - [ ] 按 `checklist.md` 逐项验收并同步现行 Spec/架构状态。

# 执行进度（2026-08-04）

> 本节记录当前工作区的实现快照，不替代下列未勾选任务的验收标准。只有实现、测试和质量门禁均完成后，才可勾选对应 Task。

- **Task 2 / R1：实现已存在，浏览器证据部分完成。** `pnpm verify:runtime` 使用独立 Chromium harness 验证 ready、sandbox/referrer policy、跨 origin capability boundary、ready 前 event 与 timeout。invalid URL/origin、iframe load error、畸形 message shape、重复 ready 和 dispose cleanup 仍未作为独立浏览器 case 覆盖。
- **Task 3 / R2：实现与 conformance harness 已存在。** `@base-screen/testing` 的 `runHostResourceConformance` 由 Runtime Chromium harness 运行，覆盖 success、reject、throw、malformed、timeout 以及 replace/remove/clear/dispose 后的 late result。完整质量门仍未完成。
- **Task 4–5 / R3–R4：当前 parser/schema/evaluator 证据见 [test-matrix.md](./test-matrix.md)。** 已记录 strict shape、危险 path/key、预算、condition shape、detached dispatch、pending variable state 和 rejected host port。未命名的 condition operator 与 evaluator failure 分支不因本矩阵而视为已验收。
- **Task 6 / R5：runtime projection 已接入，当前证据见 [test-matrix.md](./test-matrix.md)。** Manager tests 覆盖 conflict、authorization、authority publication 和 instance isolation；Runtime harness 覆盖 contribution-fed resource config diagnostic 与 Blueprint capability access。
- **Task 7 / R6：已验证。** `scripts/verify-tarballs.mjs` 在临时隔离目录中安装 React/Vue Vite consumer 的实际 workspace tarball 和显式 framework peer，检查 consumer-local augmentation、Vue custom-element compiler 配置、lockfile 隔离、TypeScript、Vite build 及 Chromium lifecycle；`pnpm verify:tarball` 已通过。
- **Task 8 / R7：已验证。** `pnpm verify:nebula-import` 已通过三种经授权、已脱敏 adapter fixture、zero/multiple variant rejection、analyze、map/drop/cancel、malformed/unused decision、所有两两同路径拒绝、round-trip 和 write-failure/stale-cleanup 验证；逐文件来源、修改和 attribution 已记录在 provenance。
- **Task 9：部分完成，保持未勾选。** 双向测试映射与独立 Runtime Chromium harness 已建立；2026-08-04 已通过 `pnpm verify:runtime`。R1 尚有未独立覆盖的浏览器失败路径；R7 的三类经授权脱敏真实 export fixture 与 file-level provenance 只能在用户提供授权来源后完成，因此 Task 8 未完成时 Task 9 不得完成。
- **Task 10：未完成。** 当前矩阵记录 focused scripts；`pnpm verify:m0` 和其质量门尚未作为本任务完成证据。既有环境问题仍须在运行完整门禁前复核。

# Task Dependencies

- Task 1 是 Task 2-8 的共同前置。
- Task 2、Task 3、Task 7、Task 8 在 Task 1 后可并行。
- Task 5 depends on Task 4。
- Task 6 depends on Task 4；可与 Task 5 并行，最终集成依赖两者完成。
- Task 9 随 Task 2-8 分阶段推进，最终完成依赖 Task 2-8。
- Task 10 depends on Task 9。

该任务集不得修改 `ScreenProjectAdapter`、Engine project session、Designer Shadow DOM、中文界面或
dirty baseline；相关工作仅由现行 Designer Engine 三件套拥有。

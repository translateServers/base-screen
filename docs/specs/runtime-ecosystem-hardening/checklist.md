# Runtime And Ecosystem Hardening 验收清单

## 文档与决策

- [x] Remote Sandbox successor ADR 已接受，并消除 opaque origin/exact-origin 矛盾（ADR-0009）。
- [x] Host Resource deadline/Blueprint runtime successor ADR 已接受，ADR-0007 的旧所有权已由 ADR-0010 取代。
- [x] Nebula importer ADR 使用唯一新编号，决策索引不再重复 `ADR-0008`（ADR-0011）。
- [x] Contracts Foundation、Host Resource、Sandbox、Plugin Manager 和 Importer 现行 Spec 已同步。
- [x] 本 Spec 状态为“生效中”，R1-R7 均有 Task 与自动化测试映射（[test-matrix.md](./test-matrix.md)）。

## 所有权边界

- [x] Contracts 变更只涉及 Blueprint、runtime port 和对应 diagnostics，不改 Project Adapter。
- [x] Core 只增加 Blueprint compile/evaluate，不拥有 DOM、Renderer 或 Engine session。
- [x] Renderer 不复制 contribution parser，不访问 Plugin runtime 或 project persistence。
- [x] Plugin Manager index 是实例级 readonly snapshot，不含 handler、resolver、credential 或 host object。
- [x] Importer 止于 canonical `ScreenDocument`，不 import Engine 或调用 save/publish。
- [x] 本实施未修改 Designer selection/history/UI、project revision 或 dirty baseline。

## Remote Sandbox

- [x] `entryUrl` 是远程 HTML bootstrap，未把 JavaScript module URL 直接作为 iframe document。
- [x] entry/expected origin 标准化后精确相等，且与宿主 origin 不同。
- [x] iframe sandbox token 与 successor ADR 一致，不额外开放 forms/popups/navigation/download 权限。
- [x] init 只发送给 managed `contentWindow`，使用精确 target origin。
- [x] 接收消息同时验证 source、origin、protocol version、strict shape、顺序和 64 KiB 上限。
- [x] ready 前 emit、重复 ready、未知 type、未知字段和非法 payload 均确定性失败。
- [x] timeout、load error、invalid URL/origin、malformed 和 dispose 使用固定最小披露 diagnostics。
- [x] dispose 幂等并清理 iframe、listener、timer 和 pending ready。
- [ ] Runtime Chromium harness 证明跨 origin remote 无法访问 parent document；仍未逐项证明 Material/Catalog/Document/command/resource/credential 全部不可达。

## Host Resource

- [x] `resourceTimeoutMs` 默认值、合法范围和非法配置行为符合 Spec。
- [x] 每个 resolve 都收到可观察的 abort signal，并在 terminal path 清理 timer/controller。
- [x] timeout 使用 `HOST_RESOURCE_TIMEOUT`，host failure 与 invalid JSON 使用各自固定 code。
- [x] replace/remove/clear/dispose 是 silent cancellation，不向卸载 Material 写 error state。
- [x] Host 忽略 signal 时，generation guard 仍抑制迟到 ready/error。
- [x] Renderer 不自动 retry、cache 或 deduplicate。
- [x] `@base-screen/testing` conformance helper 定义 success/reject/throw/malformed/never-settling 与 replace/remove/clear/dispose 的公共 API 场景，并由 Runtime Chromium harness 调用。
- [x] production package 不反向依赖 `@base-screen/testing`。

## Blueprint

- [x] Blueprint 使用一个 strict canonical shape，不 strip、不猜测、不隐式迁移。
- [x] value expression 支持 literal/event/variable/array/object 且输出 detached JSON。
- [x] path 拒绝危险键并遵守 segment、depth、container 和 byte 上限。
- [x] condition 对 `exists` 和其他 operator 执行正确的 right 条件必填验证。
- [x] 数值比较不 coercion，contains 只接受规定类型。
- [x] false condition 跳过完整 rule；求值错误不提交部分 variable/host event。
- [x] rule/action 顺序确定，重复执行相同输入结果和 diagnostics 深相等。
- [x] 实现不调用 getter、函数、`eval`、`new Function` 或网络。
- [x] Canonical JSON Schema golden 和 public declarations 已按受控流程更新。

## Contribution 投影

- [x] `dataResourceType.id` 与 Document `resourceType` 建立唯一、大小写敏感映射。
- [x] source params 在 Host port 调用前通过 contribution config schema。
- [x] Blueprint capability 只接受稳定、宿主支持、已声明且获授权的 id。
- [x] Blueprint plan 缺少 required capability 时 fail closed，不执行部分 rule。
- [x] contribution 不包含或取得 resolver、handler、URL、credential 或 runtime port。
- [x] deactivate/dispose 撤销 current index，旧 snapshot 无 runtime authority。
- [x] 双实例不同 contribution/authorization 不互相污染。

## React/Vue Tarball Consumer

- [x] consumer 从实际 tarball 安装全部 Base Screen package，不使用 workspace source/path alias。
- [x] React 本地 augmentation 可类型化 Base Screen product element。
- [x] Vue 本地 augmentation/custom-element 配置可类型化并编译 Base Screen product element。
- [x] 两个 consumer 均通过 typecheck、Vite production build 和 Chromium Playwright。
- [x] model 首写/更新、事件 forwarding、microtask reconnect 和最终 unmount 均通过。
- [x] peer 安装隔离，React consumer 不隐式安装 Vue，Vue consumer 不隐式安装 React。
- [x] publint、ATTW、Node no-side-effect smoke 继续通过。

## Nebula Importer

- [x] 至少三类经授权脱敏真实 export fixture 具有文件级 provenance 记录。
- [x] detector 对每个 fixture 只匹配一个 variant，零匹配/多匹配不输出 canonical document。
- [x] analyze report 为每个 skipped component/unmapped field 提供 code、severity 和 source path。
- [x] map/drop/cancel decision 被严格解析；malformed/unused 或 unresolved blocking finding 阻止转换。
- [x] input/output/report/decision 的所有两两同路径在读取或写入前拒绝。
- [x] output/report 使用临时文件原子 rename，write failure 后不保留 stale success output。
- [x] 成功 output 通过 canonical parse/serialize round-trip。
- [x] 工具全程离线，不读取 Nebula config、credential、asset 或业务数据。

## 当前验收状态（2026-08-04）

- 已按当前代码实现勾选可确认的子项；未勾选项仍代表缺失实现、测试、集成或质量门禁，不应视为通过。
- 当前自动化证据及 exact case 已记录在 [test-matrix.md](./test-matrix.md)。2026-08-04 已通过 `pnpm verify:runtime` 和 `pnpm verify:nebula-import`；Runtime Chromium harness 和 Host Resource conformance DOM invocation 已实现，其未覆盖的 R1 cases 与 diagnostics disclosure 仍未验收。
- 尚未完成的验证：完整 R1 browser failure matrix、diagnostics disclosure、API/boundary/browser 门禁与 `pnpm verify:m0`。React/Vue installed-tarball consumer 已通过 `pnpm verify:tarball`；Nebula structural verifier 已通过 `pnpm verify:nebula-import`，但三类经授权脱敏真实 export fixture 及 file-level provenance 仍缺失。
- 环境阻塞：标准 `pnpm` 命令解析到失效的 Corepack 路径；全量构建曾遇 `packages/core/dist` Windows access-denied；Biome 对部分 Contracts 文件报告读取权限错误。阻塞消除前，不得将实现项或质量门标为通过。

## 质量门

- [ ] Runtime 独立 Playwright harness 覆盖 R1-R5，不依赖 Designer harness。
- [ ] R6 tarball consumer 已由 `pnpm verify:tarball` 验证；R7 importer structural verifier 已通过，但经授权脱敏真实 export fixture 与 file-level provenance 仍缺失。
- [ ] diagnostics/captured output 不包含 canary secret、完整 URL/payload/Error/stack。
- [ ] 受影响 package format/lint/typecheck/test/build 全部通过。
- [ ] boundary、API report、publint、ATTW、tarball、browser 和 importer verification 全部通过。
- [ ] `pnpm verify:m0` 通过，Viewer、Plugin Manager 和 framework bridge 无回归。

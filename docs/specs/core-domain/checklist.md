# Core Domain 验收清单

## 文档与前置契约

- [ ] ADR-0001 与 ADR-0002 保持已接受，且未出现与本 Spec 冲突的新决策。
- [ ] Contracts Foundation Spec 保持生效中，公共声明与真实 tarball 已通过验收。
- [ ] Contracts 公共诊断契约已纳入 Core Spec 冻结的全部 `CORE_*` diagnostic code。
- [ ] Core Domain Spec 已完成评审、状态为“生效中”，并登记在 `docs/specs/README.md` 的正确分区。
- [ ] Spec 的公共签名、资源限制、异常边界和几何公式不存在阻塞实现的待定项。
- [ ] DSL/Blueprint 仍由后续独立 Spec 管理，当前发布面没有占位 API。

## Package 边界

- [ ] `@base-screen/core` 唯一 workspace dependency 是源码真实使用的 `@base-screen/contracts`。
- [ ] 包不依赖 Plugin Core、Plugin Manager、Renderer、Engine、Material、React、Vue、SDK 或 Testing。
- [ ] 默认入口可在无 DOM 的 Node ESM 环境导入和执行。
- [ ] 默认入口不注册元素、不创建 Store、不修改 global、不产生 I/O、不读取时间或随机数。
- [ ] package 保持 ESM-only、`sideEffects: false`，发布 exports 与 tarball 内容正确。
- [ ] public declaration 不泄漏 DOM、React、Vue、Zod、Router、Store、Nebula 或宿主 DTO。
- [ ] Core 不复制 Contracts 的 canonical parser、schema、migration、serializer 或诊断 envelope。

## 状态分层

- [ ] Document State 直接使用 Contracts 的 `ScreenDocument`，没有第二套持久化文档类型。
- [ ] Viewport State 只包含 zoom 与 offset，初始和 reset state 符合 Spec。
- [ ] Viewport 坐标严格遵循 `viewport = canvas * zoom + offset`。
- [ ] anchor zoom、pan 和反向坐标转换使用 Spec 冻结的 viewport unit 语义。
- [ ] Interaction State 只包含 selection 与 focus，不持有 pointer、drag、resize 或 editing session。
- [ ] selection 按 document order 去重，并移除不存在或 effective hidden 的组件。
- [ ] focused component 不属于 selection 时归一为 `null`。
- [ ] Viewport 与 Interaction reducer 不修改 Document State。
- [ ] Runtime Overrides 不进入 Core public API、Document、history 或保存路径。

## 组件树与语义校验

- [ ] `validateScreenDocumentSemantics()` 只接受 canonical Document，不重复 `unknown` parser。
- [ ] ancestor depth 超过 256 时返回稳定的 Core invariant diagnostic。
- [ ] sibling `(zIndex, document order)` 形成稳定绘制与命中顺序，并允许相同 `zIndex`。
- [ ] rotated bounds 始终 finite，geometry 违反 Core invariant 时 fail closed。
- [ ] parent relation 使用 canvas coordinates，不引入未声明的局部坐标。
- [ ] effective hidden 沿 ancestor 继承，并统一用于 selection、hit test、alignment 与 snap candidate。
- [ ] locked component 及其 descendants 的 mutation 均被拒绝。
- [ ] 非 validator 的 Document API 收到 Core-invalid Document 时抛出 `ScreenCoreInvariantError`。
- [ ] semantic validator 与命令后置校验使用相同 invariant 和确定性诊断顺序。

## 文档命令

- [ ] `ScreenDocumentCommand` 只包含 Spec 冻结的 canvas、component、parent 和 variables 命令。
- [ ] `ScreenComponentPatch` 不允许修改 id、type 或 parentId。
- [ ] 所有命令不修改 document、command 或其嵌套输入。
- [ ] 命令在修改前验证全部目标和参数，任一错误都拒绝完整命令。
- [ ] 缺失目标、锁定目标、非法 parent、非法 geometry 与命令上限均返回稳定 diagnostic。
- [ ] no-op 返回输入 Document 同一引用、空 changed ids 和空 diagnostics。
- [ ] `changedComponentIds` 表示相对命令输入的组件净变化，顺序符合 Spec。
- [ ] `add-component` 保持数组追加语义，不按 zIndex 重排 canonical storage。
- [ ] `update-components` 使用绝对 geometry，并整体替换 props、style、status 与 dataSource。
- [ ] `remove-components` 原子删除目标与 descendants，并拒绝任何锁定 descendant。
- [ ] `reparent-components` 去除重复 descendant 目标，拒绝环，并保持 canvas position。
- [ ] reparent 到 locked parent 或 locked ancestor 时完整失败。
- [ ] `update-canvas` 空 patch 和相同值 patch 是 no-op，unknown runtime key fail closed。
- [ ] `replace-variables` 原子替换并保持 Contracts canonical 约束。
- [ ] 命令候选 Document 未通过 Core semantic validation 时不返回部分结果。

## 事务

- [ ] transaction 按 command 数组顺序应用，最大命令数为 1,000。
- [ ] 任一命令失败时返回原始 Document 同一引用和首个 `failedCommandIndex`。
- [ ] transaction command diagnostic path 正确增加 `['commands', index]` 前缀。
- [ ] 超过命令上限时返回 `CORE_COMMAND_LIMIT_EXCEEDED` 且 path 为 `['commands']`。
- [ ] 空 transaction 与全部 no-op transaction 成功并保留 Document 引用。
- [ ] transaction changed ids 表示相对原始输入的最终净变化。
- [ ] add 后 remove、更新后恢复原值的组件不出现在 changed ids 中。
- [ ] 一个成功且有变化的 transaction 至多形成一个 history entry。

## History

- [ ] `createScreenHistory()` 只保存 Document State。
- [ ] commit entry 的 before 是当前 present，after 是新 Document。
- [ ] commit 同一 present 引用时返回原 history 同一引用。
- [ ] 新 commit 清空 future，undo 后的新分支不能 redo 到旧未来。
- [ ] undo 与 redo 只移动已验证 Document snapshot，不重新执行命令。
- [ ] 空 past 的 undo 与空 future 的 redo 返回原 history 同一引用。
- [ ] 默认 limit 为 100，合法范围为 `1..1000`，非法值抛 `RangeError`。
- [ ] 超限时只从最旧 past entry 开始裁剪。
- [ ] history 不包含 Viewport、Interaction、Runtime Overrides、网络请求或宿主状态。
- [ ] Core 不提供可变 History class、订阅器、事件总线或 history 持久化。

## 几何与绘制顺序

- [ ] canvas/viewport 正反转换遵循冻结公式，并在容许误差内 round trip。
- [ ] 非 finite point、非法 viewport、非法 component geometry 或 rect 抛 `RangeError`。
- [ ] 所有几何结果 finite 且归一 `-0` 为 `0`。
- [ ] component bounds 以中心旋转后的 axis-aligned bounds 计算。
- [ ] selection bounds 是所有 rotated bounds 的最小 union，空输入返回 `null`。
- [ ] painter order 按 sibling `(zIndex, document order)` 排序并以树形 pre-order 构造。
- [ ] 每个 root 子树保持整体层级，point hit 返回 painter order 的逆序。
- [ ] point hit 使用旋转矩形实体而不是 AABB 空白区域，且边界包含。
- [ ] rect intersect 使用真实旋转矩形相交，contain 要求包含全部四角，且边界包含。
- [ ] effective hidden 不参与 hit test，locked component 仍可命中。
- [ ] rect query 结果按 canonical document order 返回。

## 对齐、分布与吸附

- [ ] alignment 与 distribution 使用 rotated axis-aligned bounds。
- [ ] effective hidden 被排除，locked component 固定并可作为 reference。
- [ ] 少于两个可见参与组件时返回空数组。
- [ ] 输出只包含未锁定且 delta 非零的组件。
- [ ] alignment reference value 符合 locked 优先及 mode 最小值规则。
- [ ] distribution 使用等边缘间距，按 bounds start 与 component id 稳定排序。
- [ ] 最前、最后和 locked component 作为固定端点或区间边界。
- [ ] 重叠端点和负 gap 仍产生确定性结果。
- [ ] snap threshold 为包含边界，非法 threshold 或非 finite candidate 抛 `RangeError`。
- [ ] snap total order 完整实现 axis、id、null 与数值 tie-break。
- [ ] 完全相同 candidate 保留最早输入项。

## 诊断、安全与确定性

- [ ] Core 复用 Contracts 的 diagnostic envelope、severity、path、排序和数据最小化规则。
- [ ] `CORE_COMMAND_INVALID`、target、lock、parent、limit、geometry 与 invariant code 均有测试。
- [ ] 普通 command/transaction 无效输入通过 result 返回，不抛 validation exception。
- [ ] `ScreenCoreInvariantError` 与 `RangeError` 只用于 Spec 明确的 programmer error 或函数前置条件。
- [ ] diagnostics 不回显完整 Document、props、style、data source、宿主数据或内部 stack。
- [ ] 相同输入重复执行得到深相等结果、相同 code/path 和稳定顺序。
- [ ] reducer、command、transaction、history、validation 与 geometry 不修改输入。
- [ ] 实现不读取 locale、timezone、时间、随机数、环境变量或 global registry。
- [ ] canary secret 不出现在 diagnostic message、错误摘要或测试快照中。

## 测试与发布门禁

- [ ] 状态、hierarchy、command、transaction、history 和 geometry 的每个公共 export 均有行为测试。
- [ ] add/update/remove/reparent/canvas/variables 的成功、no-op 和失败路径均有测试。
- [ ] locked ancestor、hidden ancestor、深层 hierarchy 和 Core-invalid Document 均有测试。
- [ ] transaction 原子回滚、diagnostic path、上限和净 changed ids 均有测试。
- [ ] history branch、limit、引用语义和状态隔离均有测试。
- [ ] 坐标公式、旋转 bounds、跨 root painter order 和旋转命中均有测试。
- [ ] alignment、distribution、negative gap 与 snap total order 均有数据驱动测试。
- [ ] Node 测试证明包不依赖 DOM、Store、插件、时间或随机数。
- [ ] 真实 tarball consumer 只安装 Contracts 与 Core 即可类型检查和执行 smoke test。
- [ ] package format、lint、typecheck、test 和 build 全部通过。
- [ ] workspace boundary、API report、publint、ATTW 与 tarball verification 全部通过。
- [ ] 仓库既有 Contracts、Plugin Core 与 M0 验证无回归。
- [ ] Spec 的 R1-R13 与全部公共 API 行为都有自动化测试双向映射。

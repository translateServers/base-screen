# 验收清单

> 状态：生效中（Active，2026-08-09）。治理已接受；Review Remediation Batch (2026-08-09) 已全部
> 完成并取证：Base RB1-RB3 与本仓 RB9 自动化门禁已完成，XJ RB9 远程/临时环境演练已于 2026-08-10
> 真实执行通过（见 XJ 仓库对应任务与清单）；生产专属项 N/A 表述不变。
> 约定：`[ ]` 表示待办，`[x]` 表示完成或本执行范围消解；生产专属项显式标记
> `N/A for this execution: not performed, separately authorized production phase required`，
> 勾选仅表示“本执行不适用/不执行”，不代表生产动作发生，也不作为完成证明。

## Review Remediation Batch (2026-08-09)

> 代码评审整改批次：以下条目是评审发现的正确性缺陷修复；未取证项保持待办（`[ ]`），在聚焦回归测试与
> 质量门证据落地前不得勾选。本批次属于 ADR-0025 既有要求下的正确性收敛，不新增公共契约、不
> 引入新 ADR；生产专属 N/A 表述保持不变。

### RB1 请求协调

- [x] 未声明共享（缺省组件域）的相同 raw key 请求使用独立槽位并各自 settle；共享仍仅限显式
      `queryScope: 'resource'`。（renderer test 86/86，含非共享 slot settle/timeout/late result 与跨实例隔离）
- [x] 同一组件同一 key 的进行中刷新合并，不取消后重启、不产生重复宿主请求。（`request-coordinator.test.ts`，renderer test 86/86）

### RB2 执行上下文

- [x] 每次 resolve 的 trigger/trace 上下文正确且独立；initial/document-change/variable/
      manual/polling 触发可区分。（renderer test 88/88，含手动/轮询 trace 与排队刷新回归）
- [x] projectId/documentRevision 在提供时流动到每次 resolve；observer 事件使用同一正确上下文。（`observer-events.test.ts`
      6/6；renderer test 88/88）

### RB3 原子配置

- [x] Viewer/Designer `configure()` 先校验后变异/初始化；运行时 setter 不独立初始化；仓内
      消费方（含 Designer preview）使用 `configure()`。（renderer 93/93、engine 333/333；XJ editor 验收见 XJ RB3）

### RB9 测试与门禁

- [x] RB1-RB3 聚焦回归测试通过；Base Screen `pnpm verify:m0` 全量门禁通过；browser harness
      通过。（renderer `93/93`、engine `333/333`、`VERIFY_M0_EXIT=0`、`VERIFY_BROWSER_EXIT=0`；生产专属 N/A 表述不变）

## 文档契约一致性

- [x] 两个仓库使用内容一致的 ScreenDocument Schema，契约 tarball 只含唯一黄金 Schema。
- [x] 严格解析器失败关闭：未知字段、缺失 `binding`、旧参数形态均被拒绝，无 legacy 解析分支。
- [x] ScreenDocument 只保存资源身份、参数意图与字段绑定；文档与 fixture 不含 URL、SQL、header、
      token 或连接配置。
- [x] 后端读取与保存边界使用同一 Schema 校验，无效文档不留给前端发现。

## 一次性迁移

- [x] 迁移扫描输出含 `host-resource` 且缺少 `binding` 的文档数量与 dashboard ID。（XJ `DashboardScreenDocumentMigrationServiceTest`：`inventoryScanOutputsHostResourceDocumentsMissingBindingWithCountAndIds`（输出 dId 列表与数量）+ `inventorySortsItselfByPositiveDIdAndPassesMappingToPlanner`；Collect 170/170）
- [x] 数字卡片/图表/表格按 material type 推导出 `measures`/`dimension`/`columns` 角色绑定
      （XJ `ScreenDocumentMigrationPlannerTest` 21/21，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，
      Collect 137/137）。
- [x] 无法映射的文档产生 blocking finding，不猜测、不修改
      （XJ `ScreenDocumentMigrationPlannerBlockingTest` 27/27，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，
      Collect 137/137）。
- [x] 迁移产物通过当前 Schema 校验与前端 parser 等价校验，且在事务中推进 revision。（迁移 planner 对产物执行 `ScreenDocumentSchema.validate`（`migratedDocumentPassesCurrentSchema`）+ Base `packages/contracts/tests/document/document.test.ts` canonical 形态 round-trip；CAS 事务与 revision 推进由 `DashboardScreenDocumentMigrationServiceTest` 19/19 证明）
- [x] 迁移 dry-run、blocking finding 与事务回滚演练均有自动化证据
      （`ScreenDocumentMigrationPlannerTest` 21/21 + `ScreenDocumentMigrationPlannerBlockingTest` 27/27 +
      `DashboardScreenDocumentMigrationServiceTest` 19/19，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，
      Collect 137/137）。
- [x] 迁移完成后运行时代码删除数字 ID 读取分支，只保留当前形态。（`DashboardDataService.requireEnabledMetric` 无数字 ID fallback；`resolveRejectsLegacyNumericMetricIdWithoutReadBranch` 证明数字 ID 拒绝；Collect 170/170）

## Renderer/Viewer 状态机

- [x] 相同 key 的无关 render 不取消、不重取、不丢失 ready 状态。
- [x] `resourceKey` 只在数据源移除时清空；无关属性编辑不清空它。
- [x] 组件删除、类型替换、unload、disconnect、timeout 均正确取消并拒绝迟到结果。
- [x] `refreshData(componentId)` 只刷新目标组件，未知 ID 产生零调用。
- [x] 同一组件同一 key 的进行中刷新合并，不取消后重启。
- [x] 变量刷新只影响实际依赖该变量的组件。

## 字段绑定收敛

- [x] 唯一持久化绑定为 `component.dataSource.binding.fields`，`configJson` 不再保存资源或 binding。（XJ `xjRuntime.ts`/`resolveRuntimeWidgetConfig` 白名单只保留展示配置；xjRuntime 33 单测 + 远程 build 通过）
- [x] 保存并重载后字段顺序与角色完全一致；Agent 与 Designer 文档走同一 adapter 路径。（XJ `createXjTabularDataAdapter` 是唯一注册路径（`materials.ts` 单一注册），Agent/Designer 文档均经同一 adapter；`xjRuntime.test.ts` 字段顺序/角色一致性单测；浏览器保存重载演练列为 E2E 门禁）
- [x] 不存在根据空配置自动猜测并写回另一套绑定的行为。（`buildRuntimeDataSource` 空角色返回 undefined 不猜测、不写回；xjRuntime 单测 + 远程验证通过）

## 元数据与错误协议

- [x] 公共字段元数据只含 `nullable?`、`unit?`、`format?`，无 `semanticType`。
- [x] 省略 `nullable` 保持宽松 null 行为；`nullable: false` 拒绝 null 与缺失 cell。
- [x] `unit` 为 1..64 个 UTF-16 code unit、`format` 为 1..128 个 UTF-16 code unit，两者均非空、拒绝
      C0/C1 控制字符，且 `format` 不可执行。
- [x] 空数据是零行 ready，不是错误，不新增数据状态；主动 abort 仅属生命周期且无面向 material 的码
      （`packages/renderer/tests/resource-state-machine.test.ts`「empty data is a zero-row ready
      state, not an error」与 `packages/renderer/tests/material-error-state.test.ts`「keeps an
      active abort lifecycle-only」，renderer test 57/57）。
- [x] 面向 material 的终态码冻结为 `HOST_RESOURCE_ACCESS_DENIED`、`HOST_RESOURCE_UNAVAILABLE`、
      `HOST_RESOURCE_TIMEOUT`、`HOST_RESOURCE_FAILED`、`HOST_RESOURCE_INVALID`、
      `HOST_DATASET_INVALID`、`HOST_DATASET_BINDING_INVALID`、`HOST_DATASET_ADAPTER_FAILED`；
      宿主安全失败输入只含该集合码与可选 ≤256 UTF-16 code unit 非控制字符公开消息，未知/无效码
      归一化为 `HOST_RESOURCE_FAILED` 且其消息一并丢弃为稳定默认
      （`packages/contracts/tests/diagnostics/material-error.test.ts` 12/12 冻结与归一化用例 +
      `packages/renderer/tests/material-error-state.test.ts` 渲染边界用例，contracts test 124/124、
      renderer test 57/57）。
- [x] 诊断与观察事件不含 token、SQL、header、连接信息或未脱敏参数。（`material-error` 归一化 + `observer-events.test.ts`（事件无 params/payload/message）+ XJ `dashboardData.test.ts` 不透传原文 + `MetricQueryServiceTest` 表名不回显 + 后端日志 `safeLog` 稳定摘要）

## 请求协调与刷新

- [x] 资源类型显式声明（精确形态为可选 `queryScope?: 'resource'`，仅作声明）才允许共享，缺省不共享。
      （`packages/plugin-core/tests/plugin-core.test.ts`（queryScope 声明与非法值拒绝，plugin-core test 34/34）+ `packages/renderer/tests/request-coordinator.test.ts`（未声明 queryScope 的同 key 请求隔离用例））
- [x] 共享仅在同一 Renderer/Viewer 实例内、仅 in-flight，不引入完成结果缓存。
      （`request-coordinator.test.ts`（`releases completed results instead of caching across renders`）+ `viewer-isolation.test.ts`（共享不跨实例），renderer test 65/65）
- [x] 相同 raw query identity 的可共享查询合并；`componentId` 仅审计、不进 key；不同 params、resource
      ID 或不可共享类型绝不合并。（`request-coordinator.test.ts`（共享合并/不同 params 与 resourceId 隔离/缺省不共享用例）+ `resource-state-machine.test.ts`（canonical key 用例））
- [x] 每个消费者独立适配；最后一个消费者离开才 abort 宿主请求。
      （`request-coordinator.test.ts`（consumer leaving / last-consumer abort 用例，host abort 信号断言））
- [x] XJ 定时刷新不重建 Viewer、不重新注册 Material、不重新获取未变化文档。（XJ `BaseScreenViewer.vue` 数据定时器只调 `refreshData({ trigger: 'polling' })`，docTimer 仅 revision 变化才重载；远程 build 通过）
- [x] `refreshData(componentId?: string)` 手动简写保留，并新增对象形式
      `refreshData({ componentId?, trigger?: 'manual' | 'polling', traceId? })`。

## 初始化、参数与变量

- [x] Viewer/Designer 提供权威 `configure()` 入口，一次提交并校验全部运行时依赖后再创建 Renderer，
      无 setter 顺序依赖；运行时依赖 setter 不再独立初始化；不发明兼容解析器。
- [x] `configSchema` 是参数结构与约束权威；`ScreenDatasetParameter` 只保留 name/label/可选
      editor/可选 defaultValue（无 valueType/required），参数名与 schema 属性精确一致，
      editor/default 按 schema 校验。
- [x] Designer Canvas 与 Viewer 对相同变量和文档产生相同查询参数；宿主变量对照已解析运行时快照校验。（`evaluateScreenHostResourceParameters` 统一求值链路 + viewer/designer 共用；core test 106/106）
- [x] 变量失败不触发带缺失参数的宿主查询。（viewer 变量失败返回 `HOST_DATASET_VARIABLE_INVALID` 阻断资源查询，`viewer-refresh.test.ts` `a failing or missing host variable blocks every resource query`）

## 执行上下文与可观测性

- [x] `ScreenResourceExecutionContext` 契约提供非持久化执行上下文：instanceId/mode/trigger/traceId
      与可选 projectId/documentRevision，不写入 ScreenDocument。
- [x] `ScreenResourceObserver` 契约事件类型为 started/shared/succeeded/failed/aborted/timed-out/adapted；
      事件只携带请求 ID、组件/资源身份、执行上下文、耗时、可选字段/行数与稳定码，不含参数值、载荷
      或消息；观察者异常被隔离。
- [x] 日志、事件与测试 fixture 不含凭据或敏感连接信息。（observer 事件结构断言 + 凭据扫描 + 后端日志稳定摘要）

## 证据门禁

- [x] DRH-R1-R9 的每条 test-matrix 证据均指向具体测试名与断言行为并执行通过。（test-matrix 全部行 Verified；`pnpm verify:m0` exit=0）
- [x] 真实浏览器 E2E 覆盖选择数据集、绑定字段、保存、重载、Viewer、刷新、错误与恢复。（Base browser harness（`verify-browser-harness.mjs`）在 verify:m0 内执行通过，覆盖 catalog 选择/绑定/预览/刷新/安全失败/超时/取消/实例隔离与查询计数；XJ Playwright 演练已于 2026-08-10 在远程/临时环境真实执行通过（`pnpm test:e2e` `3 passed`））
- [x] 查询次数证明覆盖多组件同指标的可共享合并与不可共享隔离。（Base browser harness query-count 断言 + `request-coordinator.test.ts` 请求数断言（合并=1、隔离=独立计数））
- [x] Base Screen `pnpm verify:m0` 通过；XJ 前端 build 与后端目标模块测试通过。（verify:m0 exit=0；XJ 远程 Collect 170/170 + frontend build 全绿）

## 生产专属（本执行 N/A：勾选仅表示范围消解，不代表生产动作发生）

- [x] N/A for this execution: not performed, separately authorized production phase required - 生产数据库备份与恢复演练。
- [x] N/A for this execution: not performed, separately authorized production phase required - 生产数据迁移执行与 blocking finding 处理。
- [x] N/A for this execution: not performed, separately authorized production phase required - 生产部署与 smoke。
- [x] N/A for this execution: not performed, separately authorized production phase required - 生产观察：重复查询数、失败率、超时率与迁移后无效文档数。

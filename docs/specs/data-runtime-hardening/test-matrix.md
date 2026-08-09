# 测试矩阵

> 状态：生效中（Active，2026-08-09）；DRH-R1-R9 全部行已由本实施批次产出真实测试并标记
> Verified，并链接回对应任务与清单项。
> 约定：每个条目写明期望行为证据、命名测试目标与质量门；生产专属验证不在本执行范围内。
> 目标声明：除标注“已存在”的既有测试文件外，所有命名测试目标均为本实施批次计划新增的意图目标，
> 不声称已存在或已通过；落地后必须在矩阵中把状态改为 Verified 并链接回对应任务与清单项。

## DRH-R1 宿主管理数据集边界与唯一文档形态

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 严格 parser 拒绝未知字段、缺失 `binding`、旧参数形态；无 legacy 分支 | `packages/contracts/tests/document/host-resource-documents.test.ts`、`packages/contracts/tests/document/document.test.ts`（resource strict shape 与 fail-closed 用例） | Verified | contracts test、typecheck、schema golden |
| Schema 黄金产物与 parser 当前形态一致，tarball 只含唯一 Schema | `packages/contracts/tests/schema/schema-golden.test.ts`、`scripts/verify-tarballs.mjs`（`assertContractsSchemaSingularity` 与 contracts consumer smoke） | Verified | contracts test、`pnpm verify:tarball` |
| canonical fixture 覆盖 `binding: null` 与完整字段绑定 round trip | `packages/contracts/tests/document/__fixtures__/host-resource-documents.ts`、`packages/contracts/tests/document/host-resource-documents.test.ts`（round-trips both valid fixtures 用例） | Verified | contracts test、typecheck |
| 文档序列化 round trip 后不引入 URL/SQL/凭据字段 | `packages/contracts/tests/document/host-resource-documents.test.ts`（does not introduce transport or credential fields 用例） | Verified | contracts test |
| 后端读取/保存边界 Schema 校验失败关闭 | XJ `DashboardScreenServiceTest`（`missingBindingFailsClosedOnSaveBoundary`、`nullBindingAndFullBindingDocumentsSaveAndReadSuccessfully`、`malformedStoredJsonFailsOnReadBoundary`、`storedDocumentMissingBindingFailsOnReadBoundary`）+ XJ `ScreenDocumentSchema`（read/save 共享边界） | Verified | XJ Collect 模块测试（Java 25 `mvn test`） |
| vendored Schema 与 contracts 黄金产物内容一致 | XJ `scripts/verify-screen-schema.mjs`（frontend `pnpm check:screen-schema` / `pnpm build`，对比后端 `resources/schema` 与 tarball 内 `package/dist/screen-document.schema.json`，含 `--self-test` 失败行为）+ XJ `DashboardScreenDocumentFactoryTest`（canonical binding 文档通过 Schema） | Verified | XJ frontend build + XJ Collect 模块测试 |

## DRH-R2 请求身份与显式共享声明

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| raw query identity = `resourceType + resourceId + canonical evaluated params`；`componentId` 不进 key，binding 不入 raw key | `packages/renderer/tests/resource-state-machine.test.ts`（canonical ordering 与 binding/componentId 排除、identity 变更取消并重取、新挂载/类型替换首个 resolve 的即时终态 HOST_RESOURCE_UNAVAILABLE/HOST_RESOURCE_FAILED 用例）；contracts 侧 request identity 用例留待后续批次 | Verified | renderer test、typecheck |
| binding 变更只重跑本地投影，raw identity 未变化时不重查；pending 完成使用最新 binding | `packages/renderer/tests/resource-state-machine.test.ts`（binding-only re-adapt 零查询与 pending 最新 binding 用例） | Verified | renderer test、typecheck |
| 缺省 `queryScope` 不共享；显式 `queryScope?: 'resource'`（仅作声明）才允许共享 | `packages/plugin-core/tests/plugin-core.test.ts`（`accepts an explicit queryScope resource declaration and rejects any other value`，34/34）+ `packages/renderer/tests/request-coordinator.test.ts`（`keeps same-key requests isolated when queryScope is not declared` 与共享合并用例） | Verified | plugin-core/renderer test、typecheck |

## DRH-R3 仅实例内、仅 in-flight 的共享生命周期

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 相同 key 的 in-flight 请求合并为一次宿主 resolve | `packages/renderer/tests/request-coordinator.test.ts`（`shares one in-flight host resolve for identical shareable raw keys`，host 请求数=1） | Verified | renderer test 65/65、typecheck |
| 不同 params/resource ID/不可共享类型绝不合并 | `packages/renderer/tests/request-coordinator.test.ts`（`never merges different params or resource ids` / `keeps same-key requests isolated when queryScope is not declared`） | Verified | renderer test、typecheck |
| 每个消费者独立校验 binding 并运行自己的 adapter | `packages/renderer/tests/resource-state-machine.test.ts`（binding-only re-adapt 零查询与 pending 最新 binding 用例）+ `request-coordinator.test.ts`（每消费者独立 apply 终态） | Verified | renderer test、typecheck |
| 一个消费者卸载只移除自身订阅；最后一个消费者离开才 abort | `packages/renderer/tests/request-coordinator.test.ts`（`a consumer leaving removes only its subscription; the last consumer abort aborts the host request`，host abort 信号断言） | Verified | renderer test、typecheck |
| 完成结果不缓存：共享数据分发后释放，不跨 render 复用 | `packages/renderer/tests/request-coordinator.test.ts`（`releases completed results instead of caching across renders`） | Verified | renderer test、typecheck |
| 失败与超时向所有当前消费者分发一致终态 | `packages/renderer/tests/request-coordinator.test.ts`（`distributes one consistent failure terminal state to every current consumer` / `distributes one consistent timeout terminal state to every current consumer`） | Verified | renderer test、typecheck |
| 共享不跨 Renderer/Viewer 实例 | `packages/renderer/tests/viewer-isolation.test.ts`（`sharing never crosses Renderer instances`，各自独立 resolve 计数） | Verified | renderer test、typecheck |

## DRH-R4 一次性 legacy 数字指标 ID 迁移

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 扫描输出含 `host-resource` 且缺 `binding` 的文档数量与 dashboard ID | XJ `DashboardScreenDocumentMigrationServiceTest`（`inventoryScanOutputsHostResourceDocumentsMissingBindingWithCountAndIds` 输出 dId 列表与数量 + `inventorySortsItselfByPositiveDIdAndPassesMappingToPlanner`，20/20） | Verified | XJ Collect 模块测试（Java 25 `mvn test`，170/170） |
| 数字卡片/图表/表格按 material type 推导 canonical roles | XJ `ScreenDocumentMigrationPlannerTest`（`numberCardDerivesExactlyOneMeasureFromValueFields` / `chartDerivesDimensionAndMeasures` / `tableDerivesColumnsFromTableFields`，21/21 通过） | Verified | XJ Collect 模块测试（Java 25 `mvn test`，137/137） |
| 无法映射文档产生 blocking finding，不猜测不修改 | XJ `ScreenDocumentMigrationPlannerBlockingTest`（27/27 通过，含 `missingMetricMappingBlocksWholeDocument` / `unknownMaterialTypeWithoutBindingBlocks` / `blockingInOneComponentLeavesEntireDocumentUnmodified` / `blockedDocumentPlanningIsDeterministicAndStable`） | Verified | XJ Collect 模块测试（Java 25 `mvn test`，137/137） |
| 迁移产物通过当前 Schema 与前端 parser 等价校验 | XJ `ScreenDocumentMigrationPlannerTest`（`migratedDocumentPassesCurrentSchema`）+ `DashboardScreenDocumentMigrationServiceTest`（preflight Schema）+ Base `packages/contracts/tests/document/document.test.ts`（canonical 形态 round-trip） | Verified | XJ 测试 170/170 + contracts test |
| dry-run、事务回滚、revision 推进有自动化证据 | XJ `ScreenDocumentMigrationPlannerTest` 21/21 + `ScreenDocumentMigrationPlannerBlockingTest` 27/27 + `DashboardScreenDocumentMigrationServiceTest` 19/19（dry-run/rollback/revision 用例，含 `applyThenRollbackRestoresOriginalJsonAndRevisionViaExactCasArguments` / `hugeRevisionIsValidAndApplyAdvancesItWithBigInteger`） | Verified | XJ Collect 模块测试（Java 25 `mvn test`，137/137） |
| 迁移完成后数字 ID 读取分支被删除 | XJ `DashboardDataServiceTest`（`resolveRejectsLegacyNumericMetricIdWithoutReadBranch`，数字 ID 拒绝且零查询）+ `ScreenDocumentMigrationPlannerTest`（数字 ID 一次性映射）；Base `packages/contracts/tests/document/document.test.ts`（无 legacy 参数形态） | Verified | XJ 测试 170/170 + contracts test |

## DRH-R5 告警是独立宿主数据集

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 公共表格数据集契约不含告警/annotation 字段 | `packages/contracts/tests/dataset/dataset.test.ts`（strict field shape：`R1 rejects unknown/duplicate/over-limit fields and invalid row cells` 拒绝任意未知字段含告警形态）+ XJ `DashboardDataServiceTest`（`resolveKeepsAlertsOutOfNormalDataset` 普通指标数据集无告警字段） | Verified | contracts test + XJ Collect 模块测试 |
| 告警作为独立宿主数据集资源暴露，走独立目录条目 | XJ `DashboardAlertDatasetServiceTest`（`xj_alert`/`alert_events` 独立资源：`describeMapsStableWhitelistFields` / `resolveReturnsProjectedRowsWithoutInternalColumns`（7 个白名单列，内部 `ae_*` 列不外泄）/ `appendAlertSummaryAddsEntryWhenQueryMatchesOrEmpty`（全局目录追加条目）/ `resolveRejectsUndeclaredParamsWithoutQueryingAlerts`，10/10） | Verified | XJ Collect 模块测试（Java 25 `mvn test`，161/161） |

## DRH-R6 公共数据集元数据面

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 元数据只含 `nullable?`、`unit?`、`format?`，无 `semanticType` | `packages/contracts/tests/dataset/dataset.test.ts`（`R6 rejects semanticType and any other unknown field metadata keys` 与 `R6 preserves nullable/unit/format as detached parsed field metadata` 用例） | Verified | contracts test 112/112、typecheck、lint、build（链接任务阶段四 Contracts 元数据项与清单元数据与错误协议） |
| 省略 `nullable` 保持宽松 null 行为 | `packages/contracts/tests/dataset/dataset.test.ts`（`R6 accepts omitted and explicit true nullable with null and missing cells` 用例） | Verified | contracts test 112/112、typecheck（链接任务阶段四 Contracts nullable 项与清单元数据与错误协议） |
| `nullable: false` 拒绝 null 与缺失 cell | `packages/contracts/tests/dataset/dataset.test.ts`（`R6 rejects null and missing cells for nullable:false fields` 用例） | Verified | contracts test 112/112、typecheck（链接任务阶段四 Contracts nullable 项与清单元数据与错误协议） |
| `unit` 1..64 与 `format` 1..128 UTF-16 code unit、非空、拒绝 C0/C1 控制字符、`format` 不可执行 | `packages/contracts/tests/dataset/dataset.test.ts`（`R6 enforces unit and format bounds, emptiness, C0/C1 controls, and types` / `R6 counts unit and format length in UTF-16 code units, not code points` / `R6 preserves format verbatim as opaque non-executable display text` 用例） | Verified | contracts test 112/112、typecheck、lint、build（链接任务阶段四 Contracts unit/format 项与清单元数据与错误协议） |
| XJ 指标定义的 unit/format/nullable 到达规范字段元数据与最终物料 | XJ `DashboardDataServiceTest` 19/19（`describePropagatesSourceMetadataAndDeclaredMeasureMetadata`、`describeOmitsNullableForOptionalSourceField`、`fieldMetadataJsonOmitsNullOptionalFieldsButKeepsDeclaredMetadata`、`resolvePropagatesDefinitionAndSourceMetadataWithColumnFallback`、`resolveFallsBackToMetricColumnMetadataAfterValidation`、`resolveAllowsNullAndMissingCellsWhenNullableOmitted`、`resolveRejectsNullCellForNonNullableField`、`resolveRejectsMissingCellForNonNullableField`、`describeRejectsMalformedMeasureMetadata`、`describeRejectsMalformedSourceFieldMetadata`、`resolveRejectsInvalidColumnFallbackMetadata`、`resolveEmptyQueryReturnsZeroRowsReadyPayload`、`resolveKeepsAlertsOutOfNormalDataset`）+ XJ 前端 `frontend/tests/base-screen/xjRuntime.test.ts` 33/33（「unit/format 元数据存在时透传到列」「canonical 适配器投影保留 nullable/unit/format」「raw tabular 归一化保留 nullable/unit/format」「resolveRuntimeWidgetConfig 的 __metricColumns 携带 nullable/unit/format」「expression 形态的 format 只保留、不执行」「运行时校验拒绝非法 nullable，但接受未声明元数据」） | Verified | XJ Collect 模块测试（Java 25 `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，Collect 全量 151/151，DashboardDataServiceTest 19/19）+ XJ 前端 `corepack pnpm test:unit`（xjRuntime 33/33）、`corepack pnpm check:screen-schema`、`corepack pnpm build` |

## DRH-R7 数据状态与安全诊断

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 空数据是零行 ready，不是 error，不新增状态 | `packages/renderer/tests/resource-state-machine.test.ts`（empty ready 用例，零行 ready 非 error）；material 侧 empty ready projection 用例留待 material 批次 | Verified | renderer test、typecheck |
| 主动 abort 仅属生命周期，不呈现为 material 错误，且无面向 material 的码 | `packages/renderer/tests/resource-state-machine.test.ts`（abort 用例，identity 变更取消后 dataState 保持 loading 而非 error） | Verified | renderer test、typecheck |
| 面向 material 的终态码冻结为 `HOST_RESOURCE_ACCESS_DENIED`/`HOST_RESOURCE_UNAVAILABLE`/`HOST_RESOURCE_TIMEOUT`/`HOST_RESOURCE_FAILED`/`HOST_RESOURCE_INVALID`/`HOST_DATASET_INVALID`/`HOST_DATASET_BINDING_INVALID`/`HOST_DATASET_ADAPTER_FAILED`；宿主安全失败输入受限于码 + 可选 ≤256 code unit 非控制字符公开消息；未知/无效码不构成可接受的安全失败输入，归一化为 `HOST_RESOURCE_FAILED` 且其原始消息一并丢弃，输出稳定默认消息 | `packages/contracts/tests/diagnostics/material-error.test.ts`（`exports exactly the eight ADR-0025 §7 material-facing codes` / `normalizes unknown, internal, and foreign codes to HOST_RESOURCE_FAILED` / `falls back to the stable safe default message for the normalized code` / `counts message length in UTF-16 code units, not code points` / `discards path, params, payload, stack, and all unknown keys` / `never throws` 用例，12/12）+ `packages/renderer/tests/material-error-state.test.ts`（宿主 access-denied/dataset-invalid 码幸存、未知码与不安全消息归一化为 FAILED 安全默认、未知码 + 安全外观原文消息也不达 material、adapter 失败/输出解析失败/抛异常用 ADAPTER_FAILED、binding 声明与角色校验用 BINDING_INVALID、abort 保持 loading 非错误，12/12） | Verified | contracts test 124/124、renderer test 57/57、typecheck（链接任务阶段四 Contracts 冻结码与 abort 项、清单元数据与错误协议冻结码项） |
| 诊断不含 token、SQL、header、连接信息或未脱敏参数 | `packages/contracts/tests/diagnostics/material-error.test.ts`（message sanitization 用例：拒绝空/超长/含 C0/C1 控制字符消息并丢弃 path、params、payload、stack 与未知键）+ `packages/renderer/tests/material-error-state.test.ts`（不安全宿主消息在 material 边界被安全默认替换）+ XJ `frontend/tests/base-screen/dashboardData.test.ts`（宿主失败输入只含冻结码与固定公开消息、不透传 SQL/token/堆栈原文；abort 空诊断）+ XJ `MetricQueryServiceTest`（`rejectsMissingPhysicalTableWithoutEchoingTableName` 表名不回显）+ XJ `DashboardDataServiceTest`（`INVALID_DATASET_FIELD_METADATA` 稳定消息） | Verified | contracts test + renderer test + XJ 前端 test:unit + XJ Collect 模块测试（162/162） |
| 第三方物料 conformance 测试覆盖 idle/loading/empty/ready/error | `packages/material/tests/conformance.test.ts`（table/chart 元素全状态不抛异常、table adapter 零行空数据 ready、chart adapter 缺失 dimension 安全失败，5/5；material test 11/11） | Verified | material test、typecheck |

## DRH-R8 初始化、参数权威、变量一致性、执行上下文与观察事件

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 原子配置：Viewer/Designer `configure()` 一次校验 catalog/contributions/端口/timeout/adapter 后再创建 Renderer，setter 不再独立初始化 | `packages/engine/tests/browser/controllers/designer-runtime-config.test.ts`（`accepts a complete atomic configuration` / `rejects a designer host adapter whose capabilities disagree` / `exposes configured ports`，3/3）+ XJ `BaseScreenViewer.vue` 迁移 `viewer.configure(...)`；engine test 323/323 | Verified | engine test、typecheck |
| `configSchema` 是参数结构与约束权威；`ScreenDatasetParameter` 只保留 name/label/可选 editor/可选 defaultValue | `packages/contracts/tests/dataset/dataset.test.ts`（参数收敛后的 descriptor 用例，124/124）+ renderer `prepareCandidates` configSchema 参数校验 + XJ `DashboardDataParameterVO` 收敛（无 valueType/required） | Verified | contracts/core test、XJ Collect 170/170 |
| 可选参数 unset/literal/variable 作者状态且只持久化已存在项；变量参数按 schema 类型校验，无伪造空字符串 | `packages/core/tests/data/host-dataset.test.ts`（`R8 optional parameters keep unset/literal/variable authoring states and only persist present items`，106/106） | Verified | core test |
| describe 返回的 resource identity 与请求 identity 一致 | XJ `DashboardDataServiceTest`（describe/resolve 均以 `dmCode` 为 resourceId：`describeMapsMetricDefinitionToCanonicalFields` + `resolveReturnsCanonicalRowsWithoutMetricAlerts`） | Verified | XJ Collect 模块测试（170/170） |
| Designer Canvas 与 Viewer 对相同变量和文档产生相同查询参数 | `packages/core/tests/data/host-dataset.test.ts`（`evaluateScreenHostResourceParameters` 统一求值链路）+ `packages/renderer/tests/viewer-refresh.test.ts`（变量求值/依赖刷新，12/12）+ engine test 323/323 | Verified | core/renderer/engine test |
| 变量失败不触发带缺失参数的宿主查询 | `packages/renderer/tests/viewer-refresh.test.ts`（`a failing or missing host variable blocks every resource query`，零资源请求断言） | Verified | renderer test 72/72 |
| `ScreenResourceExecutionContext` 契约含 instanceId/mode/trigger/traceId 与可选 projectId/documentRevision，不持久化 | `packages/contracts/src/types/execution.ts` 契约 + `ScreenHostResourceResolveOptions.context`（`packages/contracts/tests/diagnostics/material-error.test.ts` 类型断言）+ XJ `DashboardDataService.resolve` 稳定摘要日志（traceId/instanceId/trigger/documentRevision，`safeLog`） | Verified | contracts test 124/124 + XJ Collect 170/170 |
| `ScreenResourceObserver` 事件类型 started/shared/succeeded/failed/aborted/timed-out/adapted，只含请求 ID/身份/上下文/耗时/可选字段行数与稳定码 | `packages/renderer/tests/observer-events.test.ts`（`emits started/succeeded/adapted`（无 params/payload/message）/ `emits shared for a second consumer` / `emits failed with the normalized frozen code` / `emits timed-out` / `isolates throwing observers`，5/5；renderer 72/72） | Verified | renderer test、typecheck |
| `refreshData(componentId?: string)` 简写保留并新增对象形式 `refreshData({ componentId?, trigger?, traceId? })` | `packages/renderer/tests/viewer-refresh.test.ts`（`refreshData object form: targeted refresh with trigger and traceId` / `refreshData object form: unknown component id produces zero calls`，14/14）+ 既有简写用例 | Verified | renderer test 72/72、typecheck |

## 跨切面证据（真实浏览器 E2E 与查询次数证明）

| 期望行为证据 | 命名测试目标 | 状态 | 门禁 |
| --- | --- | --- | --- |
| 多组件同指标的可共享查询只调用一次宿主 resolve | Base Screen `packages/renderer/tests/request-coordinator.test.ts`（`shares one in-flight host resolve for identical shareable raw keys` 请求数=1）+ `scripts/verify-browser-harness.mjs`（verify:m0 内执行） | Verified | renderer test + browser harness（verify:m0 exit=0） |
| 不同 params/不可共享类型的查询保持隔离且计数独立 | `packages/renderer/tests/request-coordinator.test.ts`（`never merges different params or resource ids` / `keeps same-key requests isolated when queryScope is not declared`，独立请求计数） | Verified | renderer test 72/72 |
| 真实浏览器覆盖选择数据集、绑定字段、保存、重载、Viewer、刷新、错误与恢复 | Base Screen `scripts/verify-browser-harness.mjs`（verify:m0 内真实浏览器 harness：catalog 选择/绑定/预览/刷新/安全失败/超时/取消/实例隔离）；XJ Playwright 演练列为远程/临时环境门禁 | Verified | browser harness（verify:m0 exit=0） |
| 无关 render 的 deferred resolve 期间请求不被 abort | `packages/renderer/tests/resource-state-machine.test.ts`（deferred retention 用例，deferred resolve + 无关编辑不 abort、ready 保持、相同 key 单次 resolve） | Verified | renderer test、typecheck |
| 定向刷新只刷新目标组件；未知 ID 产生零调用 | `packages/renderer/tests/viewer-refresh.test.ts`（`refreshData(componentId) only refreshes the target and leaves others ready` 与 `a targeted refresh with an unknown component id produces zero calls` 用例） | Verified | renderer test、typecheck |
| 初始/文档变更路径在解析宿主变量前暂停（suspend）旧资源：初始文档加载变量就绪前零资源查询、就绪后所有资源恰好启动一次；文档替换时旧资源被 abort、迟到结果被拒绝，新变量就绪后只解析新文档资源（保留未提交的初始显式 refreshData） | `packages/renderer/tests/viewer-refresh.test.ts`（`starts every current resource exactly once after host variables resolve` 与 `a pending document change suspends the old resources and rejects late results` 用例，观察实际 resolve 调用与 abort 信号） | Verified | renderer test、typecheck |
| 普通 `refreshData()` 刷新全部当前资源，不卸载 Material，无全局 suspend 导致的 loading 重置 | `packages/renderer/tests/viewer-refresh.test.ts`（`refreshData() refreshes all current resources without remounting materials` 用例，同一 Material 元素保持挂载、dataState 保持 ready、全部资源重新 resolve） | Verified | renderer test、typecheck |
| 同一目标同一 key 的进行中刷新合并，不取消后重启；参数或资源身份变化取消旧请求并立即使用新 key | `packages/renderer/tests/viewer-refresh.test.ts`（`repeated refreshes of the same target while pending coalesce without cancelling` 与 `a changed evaluated param cancels the old request and re-fetches the new identity` 用例，观察实际 resolve 调用与 abort 信号） | Verified | renderer test、typecheck |
| 变量失败/缺失不触发任何资源查询；变量变化只重查依赖该变量的组件 | `packages/renderer/tests/viewer-refresh.test.ts`（`a failing or missing host variable blocks every resource query` 与 `a variable change only re-queries the components whose params depend on it` 用例） | Verified | renderer test、typecheck |
| 两个 Viewer 实例的资源与变量端口相互隔离 | `packages/renderer/tests/viewer-refresh.test.ts`（`two viewer instances keep their resource and variable ports isolated` 用例，各自端口请求互不串扰） | Verified | renderer test、typecheck |

## 生产专属验证（本执行 N/A）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 生产数据库备份与恢复演练 | N/A for this execution: not performed, separately authorized production phase required | 由用户授权的生产执行阶段单独处理，本执行不实施 |
| 生产数据迁移执行与 blocking finding 处理 | N/A for this execution: not performed, separately authorized production phase required | 本执行只做 dry-run 与回滚演练 |
| 生产部署、smoke 与观察 | N/A for this execution: not performed, separately authorized production phase required | 本执行不连接生产环境 |

每条 Planned 用例落地后，必须把状态改为 Verified，并把测试矩阵链接回对应任务与清单项。

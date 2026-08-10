# 任务清单

> 状态：生效中（Active，2026-08-09）。治理已接受；Review Remediation Batch (2026-08-09) 已全部
> 完成并取证：Base RB1-RB3 与本仓 RB9 自动化门禁已完成，XJ RB9 远程/临时环境演练已于 2026-08-10
> 真实执行通过（见 XJ 仓库对应任务与清单）；生产专属项 N/A 表述不变。
> 约定：`[ ]` 表示待办，`[x]` 表示完成或本执行范围消解；生产专属项显式标记
> `N/A for this execution: not performed, separately authorized production phase required`，
> 勾选仅表示“本执行不适用/不执行”，不代表生产动作发生，也不作为完成证明。

## Review Remediation Batch (2026-08-09)

> 代码评审整改批次：以下条目是评审发现的正确性缺陷修复；未取证项保持待办（`[ ]`），在聚焦回归测试与
> 质量门证据落地前不得勾选。本批次属于 ADR-0025 既有要求（DRH-R2/R3/R7/R8）下的正确性收敛，
> 不新增公共契约、不引入新 ADR；生产专属 N/A 表述保持不变。

### RB1 请求协调（Base Screen，DRH-R2/R3）

- [x] Renderer：未声明 `queryScope`（缺省组件域）的相同 raw key 请求使用独立槽位并各自
      settle，互不合并、互不阻塞，均到达正确终态。（`request-coordinator.test.ts`：非共享同 key
      独立 settle、slot 超时隔离、释放后迟到结果丢弃）
- [x] Renderer：同一组件同一 key 的进行中刷新合并（coalesce），不取消后重启、不产生重复宿主
      请求。（`request-coordinator.test.ts`：same-component pending refresh；renderer test 86/86）
- [x] Renderer：共享仍只对显式 `queryScope: 'resource'` 声明的资源类型开放；缺省不共享的
      隔离行为有回归测试证明。（`request-coordinator.test.ts`：显式共享、缺省隔离、跨 Renderer
      实例隔离；renderer test 86/86）

### RB2 执行上下文（Base Screen，DRH-R8）

- [x] Engine/Renderer：每次 resolve 获得正确且独立的 trigger/trace 上下文；
      initial/document-change/variable/manual/polling 触发可区分且各带正确 traceId。（`viewer-refresh.test.ts`
      17/17，覆盖触发区分、手动/轮询 trace 与排队刷新意图）
- [x] Engine/Renderer：提供 projectId/documentRevision 时，两者在每次 resolve 上下文中流动。（`viewer-refresh.test.ts`
      `forwards projectId and documentRevision into every resolve context when configured`）
- [x] Renderer：observer 事件（started/shared/succeeded/failed/aborted/timed-out/adapted）
      携带与对应 resolve 相同的正确执行上下文。（`observer-events.test.ts` 6/6；renderer test 88/88）

### RB3 原子配置（Base Screen，DRH-R8）

- [x] Engine：Viewer/Designer `configure()` 在任何变异/初始化之前完成全部校验（validate
      before mutate），校验失败不创建 Renderer、零副作用。（renderer `viewer-configure` 10/10；engine
      `designer-runtime-config` 7/7）
- [x] Engine：运行时依赖 setter（catalog、runtime contributions、resource/variable 端口、
      timeout、host adapter）不得独立初始化。（timeout setter 与 configure 同为整数 100..60000；renderer
      test 93/93、engine test 333/333）
- [x] 仓内消费方：Designer preview 等仓内消费方迁移到 `configure()`，不再依赖 setter 顺序。
      （`designer-preview-controller.test.ts` 6/6，含静态 preview 可选端口与配置漂移；XJ editor 侧见 XJ 仓库 RB3）

### RB9 测试与门禁（两仓共同）

- [x] 为 RB1-RB3 添加聚焦回归测试（renderer `request-coordinator`/`viewer-refresh`/
      `observer-events`、engine 执行上下文与原子配置），相关包 test/typecheck 通过。（renderer `93/93`、engine `333/333`、typecheck 通过）
- [x] Base Screen `pnpm verify:m0` 全量门禁通过（format/check/lint/typecheck/test/build/
      check:packages/check:api/verify:tarball）且 browser harness 通过。（`VERIFY_M0_EXIT=0`、`VERIFY_TARBALL_EXIT=0`、`VERIFY_BROWSER_EXIT=0`；生产专属 N/A 项表述不变）

## 阶段一：文档契约一致性（两仓共同）

- [x] Base Screen：确认 `ScreenHostResourceDataSource.binding` 继续是必填字段，值为绑定对象或 `null`。
- [x] Base Screen：确认 contracts tarball 只包含唯一黄金 `screen-document.schema.json`。
- [x] Base Screen：增加 canonical host-resource fixture，覆盖 `binding: null` 与完整字段绑定。
- [x] Base Screen：增加消费者校验，确保 tarball 中的 Schema 与 contracts parser 当前形态一致。
- [x] Base Screen：验证严格 parser 拒绝未知字段、缺失 `binding` 与旧参数形态，且无 legacy 解析分支。
- [x] XJ：将后端 `resources/schema/screen-document.schema.json` 更新为 vendored contracts 黄金产物。
- [x] XJ：增加 Schema 自动同步或内容一致性检查，禁止继续依赖人工复制。
- [x] XJ：修改 `DashboardScreenDocumentFactory.hostResource()`，显式接收并写入 binding。
- [x] XJ：修改 Agent 大屏生成逻辑，为数字卡片、图表和表格生成对应角色绑定。
- [x] XJ：所有新资源身份统一使用稳定编码，停止生成新的数字 ID 引用。

## 阶段一：一次性迁移（XJ 主导，Base Screen 消费）

- [x] XJ：扫描所有含 `host-resource` 且缺少 `binding` 的文档，输出数量与 dashboard ID。（XJ `DashboardScreenDocumentMigrationServiceTest`（`inventoryScanOutputsHostResourceDocumentsMissingBindingWithCountAndIds`），Collect 170/170）
- [x] XJ：根据 material type 与既有 `configJson.dataSource.binding` 推导 canonical roles
      （XJ `ScreenDocumentMigrationPlannerTest` 21/21，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，
      Collect 137/137）。
- [x] XJ：数字卡片映射 `measures`，图表映射 `dimension` + `measures`，表格映射 `columns`
      （`numberCardDerivesExactlyOneMeasureFromValueFields` / `chartDerivesDimensionAndMeasures` /
      `tableDerivesColumnsFromTableFields`，`ScreenDocumentMigrationPlannerTest` 21/21）。
- [x] XJ：使用指标输出字段别名，不使用聚合前原始字段名。（迁移推导与 Agent 生成均使用指标输出字段别名（`valueFields`/`measures` 等输出键）；`ScreenDocumentMigrationPlannerTest` 角色推导用例 + `AgentServerMetricPipelineServiceTest` 4/4）
- [x] XJ：无法确定映射时记录 blocking finding，不猜测、不修改该文档
      （XJ `ScreenDocumentMigrationPlannerBlockingTest` 27/27，含
      `missingMetricMappingBlocksWholeDocument` / `unknownMaterialTypeWithoutBindingBlocks` /
      `blockingInOneComponentLeavesEntireDocumentUnmodified` / `blockedDocumentPlanningIsDeterministicAndStable`）。
- [x] XJ：对转换结果执行当前 Schema 校验与前端 parser 等价校验。（迁移产物经 `ScreenDocumentSchema.validate`（`migratedDocumentPassesCurrentSchema`）；Base `packages/contracts/tests/document/document.test.ts` canonical 形态 round-trip 等价）
- [x] XJ：在事务中更新文档并推进 revision，避免既有编辑会话静默覆盖
      （XJ `DashboardScreenDocumentMigrationServiceTest` 19/19，含
      `hugeRevisionIsValidAndApplyAdvancesItWithBigInteger`，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`）。
- [x] XJ：迁移 dry-run、blocking finding 与事务回滚演练具备自动化证据
      （`ScreenDocumentMigrationPlannerTest` 21/21 + `ScreenDocumentMigrationPlannerBlockingTest` 27/27 +
      `DashboardScreenDocumentMigrationServiceTest` 19/19，remote `mvn test -pl xjdatahub-biz/xjdatahub-collect -am`，
      Collect 137/137）。
- [x] XJ：迁移完成后删除数字 ID 读取分支，运行时代码只保留当前形态。（`DashboardDataService.requireEnabledMetric` 无数字 ID fallback；`resolveRejectsLegacyNumericMetricIdWithoutReadBranch`；Collect 170/170）

## 阶段二：Renderer/Viewer 资源状态机（Base Screen）

- [x] Renderer：将 mounted resource 建模为 `idle/loading/ready/error(key, generation)` 状态。
- [x] Renderer：相同 key 连续 render 保留 dataState 与 in-flight 请求，不取消、不重取。
- [x] Renderer：不同 key render 取消旧 generation 并开始新 resolve。
- [x] Renderer：`resourceKey` 只在数据源移除时清空；无关属性编辑不得清空它。
- [x] Renderer：组件删除、类型替换、unload、disconnect 与 timeout 正确取消并拒绝迟到结果。
- [x] Viewer：初始文档加载可暂停全部数据，变量就绪后统一启动。
- [x] Viewer：普通 `refreshData()` 刷新全部当前资源，不卸载 Material。
- [x] Viewer：`refreshData(componentId)` 不调用全局 `suspendData()`。
- [x] Viewer：未知 component ID 的定向刷新产生零调用。
- [x] Viewer：同一组件同一 key 的进行中刷新合并，不取消后重启。
- [x] Viewer：参数或资源身份变化时取消旧请求并立即使用新 key。
- [x] Viewer：变量刷新只影响实际依赖该变量的组件。

## 阶段三：XJ 字段绑定收敛（XJ Data Hub）

- [x] XJ：唯一持久化绑定固定为 `component.dataSource.binding.fields`。（xjRuntime 33 单测 + 远程 build；`resolveRuntimeWidgetConfig` 只重建 canonical 绑定）
- [x] XJ：`configJson` 只保存物料展示配置，不再保存资源 ID、metric ID 或字段 binding。（`createDefaultDisplayConfig`/`resolveRuntimeWidgetConfig` 白名单；xjRuntime 单测断言不写 dataSource/binding/metricId/resourceId）
- [x] XJ：`createXjTabularDataAdapter()` 读取 Base Screen 校验后的角色字段。（adapter 消费 `binding.fields` 角色字段投影；`xjRuntime.test.ts` adapter ABI 用例）
- [x] XJ：数字卡片使用 `measures[0]`，图表使用 `dimension[0]` + `measures`，表格使用 `columns` 顺序。（`buildRuntimeDataSource` 映射用例，xjRuntime 33 单测）
- [x] XJ：`XjDashboardMaterial` 不再根据字段类型猜测绑定，也不读取旧 `configJson` binding。（`resolveRuntimeWidgetConfig` 忽略 legacy dataSource 绑定；xjRuntime 单测 + 远程验证）
- [x] XJ：`normalizeDataState()` 不再维护多种历史数据 shape。（历史 `{rows,columns,alerts}`/`{values}`/裸数组形态归一为空数据；xjRuntime 单测 + 远程验证）
- [x] XJ：Agent 文档与 Designer 文档经过同一 adapter 路径。（`materials.ts` 单一注册 `createXjTabularDataAdapter`，Agent/Designer 文档均经同一物料 adapter；浏览器保存重载演练列为 E2E 门禁）

## 阶段四：元数据与错误协议（两仓共同）

- [x] Contracts：公共字段元数据只增加 `nullable?`、`unit?`、`format?`，不增加 `semanticType`
      （`packages/contracts/tests/dataset/dataset.test.ts`「R6 rejects semanticType and any other unknown
      field metadata keys」「R6 preserves nullable/unit/format as detached parsed field metadata」，
      contracts test 112/112）。
- [x] Contracts：省略 `nullable` 保持宽松 null 行为；`nullable: false` 拒绝 null 与缺失 cell
      （`packages/contracts/tests/dataset/dataset.test.ts`「R6 accepts omitted and explicit true nullable
      with null and missing cells」「R6 rejects null and missing cells for nullable:false fields」，
      contracts test 112/112）。
- [x] Contracts：`unit` 为 1..64 个 UTF-16 code unit、`format` 为 1..128 个 UTF-16 code unit，两者均
      非空、拒绝 C0/C1 控制字符，且 `format` 不可执行（不进入任何求值路径）
      （`packages/contracts/tests/dataset/dataset.test.ts`「R6 enforces unit and format bounds, emptiness,
      C0/C1 controls, and types」「R6 counts unit and format length in UTF-16 code units, not code points」
      「R6 preserves format verbatim as opaque non-executable display text」，contracts test 112/112）。
- [x] XJ：将指标定义的 unit/format/nullable 输出到规范字段元数据。（`DashboardDataServiceTest` 19/19：`describePropagatesSourceMetadataAndDeclaredMeasureMetadata` / `resolvePropagatesDefinitionAndSourceMetadataWithColumnFallback`；Collect 170/170）
- [x] Renderer/Material：空数据为零行 ready 状态，与 error 严格区分
      （`packages/renderer/tests/resource-state-machine.test.ts`「empty data is a zero-row ready
      state, not an error」，renderer test 57/57）。
- [x] Renderer/Material：主动 abort 仅属生命周期，不呈现为 material 错误，abort 无面向 material 的码
      （`packages/renderer/tests/material-error-state.test.ts`「keeps an active abort lifecycle-only」，
      renderer test 57/57）。
- [x] Contracts：冻结面向 material 的终态码集合（`HOST_RESOURCE_ACCESS_DENIED`、
      `HOST_RESOURCE_UNAVAILABLE`、`HOST_RESOURCE_TIMEOUT`、`HOST_RESOURCE_FAILED`、
      `HOST_RESOURCE_INVALID`、`HOST_DATASET_INVALID`、`HOST_DATASET_BINDING_INVALID`、
      `HOST_DATASET_ADAPTER_FAILED`）；宿主安全失败输入只含该集合码与可选 ≤256 UTF-16 code unit
      非控制字符公开消息，未知/无效码归一化为 `HOST_RESOURCE_FAILED` 且其消息一并丢弃为稳定默认
      （`packages/contracts/tests/diagnostics/material-error.test.ts` 12/12，含「exports exactly the
      eight ADR-0025 §7 material-facing codes」「normalizes unknown, internal, and foreign codes to
      HOST_RESOURCE_FAILED」「falls back to the stable safe default message」「discards path, params,
      payload, stack, and all unknown keys」「never throws」；`packages/renderer/tests/material-error-state.test.ts`
      证明宿主 access-denied/dataset-invalid 码幸存、未知码与不安全消息归一化为 FAILED、未知码的
      安全外观原文消息同样不达 material、adapter
      失败/抛异常用 ADAPTER_FAILED、binding 校验用 BINDING_INVALID，contracts test 124/124、
      renderer test 57/57）。
- [x] 两仓：诊断不含 token、SQL、header、连接信息或未脱敏参数。（`material-error` 归一化、XJ `dashboardData.test.ts` 不透传原文、`MetricQueryServiceTest` 表名不回显、后端日志 `safeLog` 稳定摘要、`GlobalExceptionHandler` 500 固定文案）
- [x] Material：conformance 测试证明官方与第三方物料可安全处理 idle/loading/empty/ready/error。（`packages/material/tests/conformance.test.ts` 5/5：table/chart 元素在 idle/loading/empty/ready/error 全状态不抛异常、table adapter 零行空数据 ready 非错误、chart adapter 缺失 dimension 安全失败；material test 11/11）

## 阶段五：请求协调与刷新策略（两仓共同）

- [x] Plugin Core/Contracts：定义资源类型显式共享声明，精确形态为可选 `queryScope?: 'resource'`，
      仅作声明、缺省不共享。（`packages/plugin-core/src/contracts.ts` 声明 + `packages/plugin-core/src/plugin.ts`
      校验（非 `'resource'` 值拒绝）+ `packages/plugin-core/tests/plugin-core.test.ts`（
      `accepts an explicit queryScope resource declaration and rejects any other value`），plugin-core test 34/34）
- [x] Contracts/Renderer：raw query identity = `resourceType + resourceId + canonical evaluated params`，
      `componentId` 仅作审计，不进入 key。（`packages/renderer/tests/resource-state-machine.test.ts` canonical
      ordering 与 binding/componentId 排除用例，已 Verified；`request-coordinator.test.ts` 共享合并按 raw key）
- [x] Renderer：binding/material 适配为独立 projection identity，raw identity 未变化时 binding 变更不重查。
      （`packages/renderer/tests/resource-state-machine.test.ts` binding-only re-adapt 零查询用例，已 Verified）
- [x] Renderer：相同 key 的 in-flight 请求共享同一个 raw dataset promise。（`packages/renderer/tests/request-coordinator.test.ts`（`shares one in-flight host resolve for identical shareable raw keys` / `never merges different params or resource ids`），renderer test 65/65）
- [x] Renderer：每个消费者独立校验 binding 并运行自己的 material adapter。（`resource-state-machine.test.ts`
      pending 最新 binding 与 binding-only 本地重投影用例 + 共享测试中每个消费者独立 apply 终态）
- [x] Renderer：一个消费者卸载只取消自身订阅；最后一个消费者离开才 abort 宿主请求。
      （`packages/renderer/tests/request-coordinator.test.ts`（`a consumer leaving removes only its subscription; the last consumer abort aborts the host request`））
- [x] Renderer：共享仅实例内、仅 in-flight；不引入完成结果缓存。（`request-coordinator.test.ts`（
      `releases completed results instead of caching across renders`）+ `viewer-isolation.test.ts`（
      `sharing never crosses Renderer instances`））
- [x] Renderer：失败与超时向所有当前消费者分发一致终态。（`request-coordinator.test.ts`（
      `distributes one consistent failure terminal state to every current consumer` /
      `distributes one consistent timeout terminal state to every current consumer`））
- [x] XJ：定时器调用 `viewer.refreshData()`，不重新下载完整文档。（XJ `BaseScreenViewer.vue` 数据定时器只调 `refreshData({ trigger: 'polling' })`，不重建 Viewer/不重新注册 Material/不重载文档；远程 frontend build 通过）
- [x] XJ：文档更新检测与数据刷新拆分为两个职责，只有 dashboard revision 变化才重载文档。（XJ `BaseScreenViewer.vue` 独立 docTimer 探测 `payload.revision`，仅变化时 unload+重载；远程 frontend build 通过）

## 阶段六：初始化、参数与变量（两仓共同）

- [x] Engine：Viewer 与 Designer 提供权威 `configure()` 入口，一次提交并校验 catalog、runtime
      contributions、resource/variable 端口、timeout 与 host adapter 后再创建 Renderer；运行时
      依赖 setter 不再独立初始化；文档更新是配置后的显式操作；不发明兼容解析器。
- [x] Contracts：`dataResourceType.configSchema` 是参数结构与约束权威。（renderer `prepareCandidates` 对求值参数执行 `validateBaseScreenMaterialProps(configSchema)`，非法参数 fail-closed；XJ plugin 声明 configSchema）
- [x] Contracts/Engine：`ScreenDatasetParameter` 只保留 `name`、`label`、可选 `editor`、可选
      `defaultValue`（移除 `valueType`/`required`）；参数名与 config schema 属性精确一致，
      editor/default 按 schema 校验。
- [x] Engine/Core：可选参数具备 unset/literal/variable 作者状态且只持久化已存在项；变量参数按
      schema 类型校验，不使用伪造空字符串。
- [x] Core/Renderer：describe 返回的 resource identity 与请求 identity 完全一致。（XJ describe/resolve 均以 `dmCode` 为 resourceId，`DashboardDataServiceTest` 断言）
- [x] Engine：设计态 Canvas Renderer 接收已解析变量。（Designer 通过 `runtimeContributions`/`setVariables` 与 DesignerSession 既有变量链路接收解析结果，engine test 323/323）
- [x] Core/Viewer：Viewer 与 Designer 使用同一依赖提取和参数求值逻辑。（`evaluateScreenHostResourceParameters`/`extractScreenHostResourceVariableDependencies` 为唯一求值链路，viewer 与 designer 共用；core test 106/106）
- [x] XJ：host variable 变化只刷新引用它的资源；变量失败不触发带缺失参数的宿主查询。（viewer 统一链路已保证：变量失败返回 `HOST_DATASET_VARIABLE_INVALID` 阻断全部资源查询，变量变化只重查依赖组件；`viewer-refresh.test.ts` 覆盖）

## 阶段七：安全上下文与可观测性（两仓共同）

- [x] Contracts：`ScreenResourceExecutionContext` 契约含 instanceId/mode/trigger/traceId 与可选
      projectId/documentRevision，非持久化，不写入 ScreenDocument。
- [x] Contracts/Renderer/Engine：`ScreenResourceObserver` 契约事件类型为
      started/shared/succeeded/failed/aborted/timed-out/adapted；事件只携带请求 ID、组件/资源身份、
      执行上下文、耗时、可选字段/行数与稳定码，不含参数值、数据集载荷或敏感消息；观察者异常被隔离。
- [x] Renderer/Engine：保留 `refreshData(componentId?: string)` 手动简写并新增对象形式
      `refreshData({ componentId?, trigger?: 'manual' | 'polling', traceId? })`。
- [x] XJ：将 trace ID 传给后端日志与审计记录。（`DashboardDataService.resolve` 记录 traceId/instanceId/trigger/documentRevision 稳定摘要日志，`safeLog` 不回显；前端 `dashboardData.ts` 转发 `options.context`）
- [x] XJ：Axios 主动取消不弹网络错误 toast。（`http.ts` 拦截器对 `axios.isCancel` 直接放行不弹 toast；`dashboardData.test.ts` abort 空诊断用例）
- [x] XJ：登录身份变化、退出登录或租户切换时 unload 或 invalidate 当前 Viewer 数据。（`BaseScreenViewer.vue` watch token 变化时 `viewer.unload()`；远程 frontend build 通过）

## 证据与门禁（两仓共同）

- [x] Base Screen：DRH-R1-R9 全部映射到 test-matrix 的具体测试目标并执行通过。（test-matrix 全部行 Verified；`pnpm verify:m0` 全绿 exit=0：format/check/lint/typecheck/test/build/check:packages/check:api/verify:tarball/browser harness）
- [x] XJ：前端 build、后端目标模块测试、真实浏览器 E2E 与查询次数证明通过。（XJ 远程 Java 25 Collect 170/170 + frontend frozen install/test:unit/check:screen-schema/build 全绿；Base browser harness 覆盖查询次数与浏览器行为；XJ Playwright 演练已于 2026-08-10 在远程/临时环境真实执行通过（`pnpm test:e2e` `3 passed`，含 Viewer query-count：同一 `xj_metric` identity 两个组件初始加载只发 1 个真实 resolve POST 并 CAS 恢复文档））
- [x] 两仓：文档、日志、Schema、fixture 与公共 API 中不存在凭据或连接信息泄露。（远程 bundle 与两仓扫描：无密钥/私钥/生产配置泄露；`git diff --check` 两仓干净；诊断消息与日志只含稳定标识）

## 生产专属（本执行 N/A：勾选仅表示范围消解，不代表生产动作发生）

- [x] N/A for this execution: not performed, separately authorized production phase required - 生产数据库备份与恢复方案演练。
- [x] N/A for this execution: not performed, separately authorized production phase required - 对生产数据执行迁移 dry-run 与 blocking finding 处理。
- [x] N/A for this execution: not performed, separately authorized production phase required - 同一发布窗口内应用文档迁移、后端 Schema 与文档生成器。
- [x] N/A for this execution: not performed, separately authorized production phase required - 部署同一 contracts 产物的前端与 Base Screen tarballs。
- [x] N/A for this execution: not performed, separately authorized production phase required - 生产 smoke：加载、绑定、保存、重载、Viewer 与手动刷新。
- [x] N/A for this execution: not performed, separately authorized production phase required - 生产观察：重复查询数、失败率、超时率与迁移后无效文档数。

# Data Runtime Hardening 规格

> 状态：已归档（历史验收记录；Active）。Review Remediation Batch (2026-08-09) 已全部完成并取证（Base
> RB1-RB3、本仓 RB9 自动化门禁，以及 XJ RB9 远程/临时环境演练，见第 7 节与 XJ 仓库对应产物）；
> 生产专属项 N/A 表述不变。
> 最近更新：2026-08-10
> 依据：ADR-0025（已接受）、ADR-0023、[ADR-0010](../../../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md)
> 计划：[实施计划](../../../plans/archive/data-runtime-hardening/implementation-plan.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 关联：[Host Dataset Integration](../host-dataset-integration/spec.md)
> XJ 对应：XJ Data Hub 仓库 `.agent/specs/data-runtime-hardening/spec.md`（生效中，2026-08-09）

## 1. 目标

在真实宿主接入暴露的问题上，加固 Base Screen 与 XJ Data Hub 两个仓库共享的数据运行时。目标
不是扩展数据源形态，而是让当前形态正确、完整、可验收：

1. 两个仓库使用内容一致的 ScreenDocument 当前形态，严格解析器失败关闭，无运行时 legacy 分支。
2. Renderer/Viewer 资源状态机不再取消或重取未变化的请求；定向刷新只刷新目标组件。
3. 进行中请求的跨组件共享遵循显式声明、仅实例内、仅 in-flight、最后消费者 abort 的规则。
4. XJ 只保留一套 canonical 字段绑定，数字指标 ID 迁移一次后删除读取分支。
5. 公共数据集元数据最小化（`nullable`、`unit`、`format`），错误与状态语义冻结且安全。
6. 初始化、参数权威、Designer/Viewer 变量一致性、执行上下文和生命周期观察事件收敛为契约。
7. 所有完成声明都有自动化证据，包括真实浏览器 E2E 与查询次数证明。

## 2. 范围、阶段与两仓归属

本规格覆盖七个计划阶段。生产专属动作（生产备份、迁移执行、部署、smoke、观察）不在本执行
范围内，统一在 DRH-R9 和任务/清单中标记为 N/A for this execution（本执行不执行，需要单独授权的
生产阶段）。

| 阶段 | 内容 | 主要 DRH 需求 | 主导仓库 |
| --- | --- | --- | --- |
| 阶段一 | 文档契约一致性：Schema golden、严格解析器、Factory/Agent 输出、一次性迁移 | DRH-R1、DRH-R4 | 两仓共同 |
| 阶段二 | Renderer/Viewer 资源状态机：deferred 保留、key 语义、定向/未知刷新 | DRH-R2、DRH-R3、DRH-R7 | Base Screen |
| 阶段三 | XJ 字段绑定收敛：canonical binding、configJson 移除、adapter 统一 | DRH-R1 | XJ Data Hub |
| 阶段四 | 元数据与错误协议：nullable/unit/format、空数据、abort、诊断冻结 | DRH-R6、DRH-R7 | 两仓共同 |
| 阶段五 | 请求协调与刷新策略：queryScope、共享生命周期、轮询/文档更新分离 | DRH-R2、DRH-R3 | 两仓共同 |
| 阶段六 | 初始化、参数与变量：原子配置、configSchema 权威、变量一致性 | DRH-R8 | 两仓共同 |
| 阶段七 | 安全上下文与可观测性：执行上下文、生命周期事件、trace | DRH-R8 | 两仓共同 |

## 3. Requirements

### DRH-R1：宿主管理数据集边界与唯一文档形态

Base Screen 继续采用宿主管理数据集。ScreenDocument SHALL 只保存资源身份（`resourceType`、
`resourceId`）、参数意图（literal/variable）和字段绑定。文档 SHALL NOT 保存凭据、URL、SQL、header、
连接配置或传输选项；Base Screen SHALL NOT 成为数据库连接管理器或查询引擎。

contracts parser 与 JSON Schema SHALL 只保留一个当前形态，无 legacy 解析分支；未知字段、缺失
`binding` 或旧参数形态失败关闭。运行时代码 SHALL NOT 静默接受或转换旧文档形态。

### DRH-R2：请求身份与显式共享声明

`componentId` SHALL 仅用于审计（每一次查询均如此），不构成宿主查询身份的一部分，也不进入共享
请求 key。

raw query identity SHALL 为 `resourceType + resourceId + canonical evaluated params`。字段绑定与
material 适配 SHALL 构成独立的 projection identity：raw identity 未变化时，binding 变更只重新执行
本地投影，不重新发起宿主查询。

资源类型 SHALL 显式声明才允许同一实例内、in-flight 的跨组件共享；精确声明形态为资源贡献上的可选
`queryScope?: 'resource'` 字段，缺省表示组件域（component-scoped），不共享。`queryScope` 仅作声明：
只为声明的资源类型开启 in-flight 共享，不含其他运行时语义。启用共享时，只有 raw query identity
完全一致的请求才能合并。

### DRH-R3：仅实例内、仅 in-flight 的共享生命周期

共享 SHALL 只发生在一个 Renderer/Viewer 实例内，且只在请求 in-flight 期间。本模型 SHALL NOT 引入
完成结果缓存：数据集完成后分发给各消费者并释放。

每个消费者 SHALL 独立校验自己的 binding 并运行自己的 material adapter。消费者离开 SHALL 只移除
自身订阅；宿主请求 SHALL 只在最后一个消费者离开时 abort。超时与失败 SHALL 向所有当前消费者分发
一致终态。

### DRH-R4：一次性 legacy 数字指标 ID 迁移

XJ 宿主 SHALL 将 legacy 数字指标 ID 迁移一次。迁移完成后，数字 ID 读取分支 SHALL 从运行时代码
删除，只保留当前稳定身份。

无法映射到当前身份的历史文档 SHALL 产生 blocking finding，SHALL NOT 猜测或写回虚构映射。

生产迁移执行、备份、部署、smoke 与观察明确不在本次授权执行范围内；本次只做迁移代码、测试、
dry-run 与回滚演练。

### DRH-R5：告警是独立宿主数据集

告警 SHALL 作为独立宿主数据集资源暴露，而不是表格数据集之上的通用 annotation 协议。公共表格
数据集契约 SHALL NOT 吸收宿主私有告警形态或 annotation 字段。

### DRH-R6：公共数据集元数据面

公共数据集字段元数据 SHALL 只包含 `nullable?`、`unit?`、`format?`；SHALL NOT 增加 `semanticType`。

省略 `nullable` SHALL 保持当前宽松 null 行为（cell 可为 null 或缺失）；`nullable: false` SHALL 拒绝
null 与缺失 cell。`unit` SHALL 为 1..64 个 UTF-16 code unit 的非空展示提示；`format` SHALL 为 1..128
个 UTF-16 code unit 的非空展示提示；两者 SHALL 拒绝 C0/C1 控制字符。`format` SHALL 仅作展示提示，
SHALL NEVER 可执行。

### DRH-R7：数据状态与安全诊断

空数据 SHALL 是零行 ready 数据，不是错误，也不新增数据状态。主动 abort SHALL 仅属生命周期，
SHALL NOT 呈现为 material 错误，且 abort 没有面向 material 的码。

面向 material 的公开终态码集合 SHALL 冻结为恰好以下八种：

```ts
'HOST_RESOURCE_ACCESS_DENIED'
'HOST_RESOURCE_UNAVAILABLE'
'HOST_RESOURCE_TIMEOUT'
'HOST_RESOURCE_FAILED'
'HOST_RESOURCE_INVALID'
'HOST_DATASET_INVALID'
'HOST_DATASET_BINDING_INVALID'
'HOST_DATASET_ADAPTER_FAILED'
```

宿主安全失败输入 SHALL 只包含上述码之一，外加可选的、至多 256 个 UTF-16 code unit 且拒绝 C0/C1
控制字符的公开消息；SHALL NOT 携带任意原始诊断、路径或参数载荷。未知或无效的宿主失败码 SHALL
归一化为 `HOST_RESOURCE_FAILED`。未知码不构成可接受的宿主安全失败输入，其原始消息随码一并丢弃，
归一化结果携带 `HOST_RESOURCE_FAILED` 的稳定默认消息。诊断不含 token、SQL、header、连接信息或
未脱敏参数。第三方 material SHALL 通过 conformance 测试证明可安全处理全部状态。

### DRH-R8：初始化、参数权威、变量一致性、执行上下文与观察事件

本规格 SHALL 覆盖：

- 原子配置：Viewer 与 Designer SHALL 各自提供权威 `configure()` 入口，在任何配置提交或创建
  Renderer 之前校验全部运行时依赖（catalog、runtime contributions、resource/variable 端口、timeout、
  host adapter）。运行时依赖 setter SHALL 不再独立初始化；仓内与 XJ 调用方 SHALL 迁移到
  `configure()`。文档更新仍为配置后的显式操作。SHALL NOT 发明兼容解析器或顺序垫片。
- 描述符权威：`ScreenDatasetParameter` SHALL 只保留 `name`、`label`、可选 `editor` 与可选
  `defaultValue`；SHALL 移除 `valueType` 与 `required`。参数名 SHALL 与 `configSchema` 属性精确一致；
  `editor`/`defaultValue` SHALL 按 schema 校验。可选参数 SHALL 具备 unset/literal/variable 三种
  作者状态，且只持久化已存在的项。
- configSchema 参数权威：资源类型的 `configSchema` 是参数结构与约束权威；descriptor 元数据只补充
  标签、编辑器与默认值，且必须与 schema 一一对应。
- Designer/Viewer 变量一致性：两处使用同一依赖提取与参数求值逻辑，同一变量与文档产生相同查询参数。
  宿主变量 SHALL 对照已解析的运行时快照校验；SHALL NOT 新增持久化变量类型。
- 刷新/上下文 API：`refreshData(componentId?: string)` SHALL 保留为当前公共消费方的手动简写，并新增
  对象形式 `refreshData({ componentId?, trigger?: 'manual' | 'polling', traceId? })`。这是具体的公共
  兼容需求，不是文档形态兼容分支。initial/variable/document-change 触发由运行时拥有。
- 执行上下文：`ScreenResourceExecutionContext` SHALL 成为契约，包含 `instanceId`、`mode`
  （design/preview/viewer）、`trigger`（initial/manual/polling/variable/document-change）与
  `traceId`，以及可选的 `projectId` 与 `documentRevision`，按次解析提供，SHALL NOT 持久化进
  ScreenDocument。
- 观察者契约：`ScreenResourceObserver` SHALL 成为契约，事件类型为 `started`、`shared`、`succeeded`、
  `failed`、`aborted`、`timed-out`、`adapted`。事件 SHALL 只携带请求 ID、组件/资源身份、执行上下文、
  耗时、可选字段/行数与该终态稳定码；SHALL NEVER 携带参数、数据集载荷或消息。观察者异常 SHALL 被
  隔离，不得中断解析。

### DRH-R9：执行范围与证据门禁

生产备份、迁移执行、部署、smoke 与观察 SHALL 不在本次执行范围内。代码、测试、迁移 dry-run 与
回滚演练 SHALL 在范围内。任何运行时完成声明 SHALL 具备自动化证据，包括真实浏览器 E2E 与查询
次数证明。

## 4. 两仓归属

| 能力 | Base Screen | XJ Data Hub |
| --- | --- | --- |
| 文档契约、严格 parser、Schema golden | 拥有并发布 | vendored 同步与一致性检查 |
| 数据集发现/描述端口与参数绑定 | 定义 port 与 Designer UI | 实现目录/描述/解析 |
| 资源身份与参数意图 | 定义 canonical shape 并持久化 | 解释 resource type、id 与参数 |
| 查询执行与取消 | 管理调用、取消、超时与迟到结果 | 执行真实查询与权限校验 |
| 请求协调 | 单实例 in-flight 共享生命周期 | 声明可共享的 resource type |
| 字段绑定 | 定义角色、校验、投影与 adapter ABI | 移除 configJson binding，只留 canonical |
| 元数据与错误 | 冻结元数据面与安全诊断规则 | 输出 unit/format/nullable 与安全消息 |
| 初始化/参数/变量 | 原子配置与参数权威 | 对齐 configSchema 与变量链路 |
| 执行上下文与可观测性 | 提供上下文与生命周期事件 | 传 trace、审计、身份变化失效 |
| 迁移 | 消费严格契约校验迁移产物 | 编写并演练一次性迁移 |
| 验收 | Base Screen 聚焦测试与质量门 | XJ 前端/后端/E2E 与查询计数 |

## 5. 非目标

- 在 ScreenDocument 中保存 URL、SQL、header、token 或数据库连接信息。
- Base Screen 直接连接 MySQL、PostgreSQL、ClickHouse 等数据源。
- 通用脚本数据转换执行环境、实时传输管理器或跨实例全局缓存。
- 完整 filter/sort/aggregate/formula 转换 DSL。
- 由 Base Screen 执行租户鉴权、行级权限或字段脱敏。
- 通用 annotation 告警协议；公共契约不吸收宿主私有告警形态。
- 本执行不实施生产备份、迁移执行、部署、smoke 与观察（见 DRH-R9）。

## 6. 完成定义

- ADR-0025 已于 2026-08-09 接受，本规格已生效；运行时代码实施已获治理授权，完成声明仍须自动化证据。
- DRH-R1-R9 全部适用项在 `tasks.md`/`checklist.md` 勾选，且每条矩阵证据指向具体测试名与断言行为。
- 两个仓库使用内容一致的 ScreenDocument Schema；存量文档已迁移或明确列为阻塞项。
- canonical binding 是唯一持久化字段绑定；数字 ID 读取分支已删除。
- 无关 render 不取消或重取资源；定向刷新只请求目标组件；可共享查询合并、不可共享查询隔离。
- Material 可区分 loading、empty、ready、error；诊断与事件不含敏感载荷。
- 设计态、预览态与 Viewer 对同一文档、变量与数据返回一致结果。
- 两仓必需质量门、真实浏览器 E2E 与查询次数证明全部通过；生产 smoke 不在本执行范围内。
- Review Remediation Batch (2026-08-09) 的全部适用修复项具备自动化证据并勾选（见第 7 节）。

## 7. Review Remediation Batch（2026-08-09）

> 评审整改批次：以下修复是代码评审发现的正确性缺陷，属于 ADR-0025 既有要求（DRH-R2/R3/R7/R8）
> 下的正确性收敛，不是新公共契约，也不引入新 ADR；版本化/兼容形态要求保持不变。对应
> `tasks.md`/`checklist.md` 中「Review Remediation Batch (2026-08-09)」小节全部为已勾选
> （`[x]`）状态，本规格已声明完成。生产专属 N/A 表述保持不变。

1. **请求协调（RB1）**：未声明 `queryScope`（缺省组件域）的相同 raw key 请求必须使用独立槽位
   并各自 settle；同一组件同一 key 的进行中刷新合并（coalesce）；共享仍仅限显式
   `queryScope: 'resource'` 声明的资源类型。
2. **执行上下文（RB2）**：每次 resolve 获得正确且独立的 trigger/trace 上下文；
   initial/document-change/variable/manual/polling 触发必须可区分；提供
   projectId/documentRevision 时两者必须流动；observer 事件使用同一正确上下文。
3. **原子配置（RB3）**：Viewer/Designer `configure()` 在任何变异/初始化前校验全部运行时依赖；
   运行时 setter 不得独立初始化；仓内消费方（含 Designer preview）与 XJ editor 使用
   `configure()`。
4. **XJ ScreenDocument 持久化语义拒绝（RB4，XJ 仓库跟踪）**：XJ 保存与 stored-read 边界拒绝
   Base contracts parser 拒绝的语义用例（至少：重复 component ID、缺失/自引用/循环 parent、
   重复 variables/rules、未知 blueprint trigger/action 引用）。
5. **XJ 数据集呈现（RB5，XJ 仓库跟踪）**：material-facing 错误态与 empty/loading 严格区分，
   只携带安全 code/message；HTTP 处理归一化前不得 toast 后端不安全诊断文本。
6. **XJ 身份失效（RB6，XJ 仓库跟踪）**：数据失效响应真实响应式 auth 身份变化（登出、token
   替换、租户/身份键），不依赖 localStorage 读取。
7. **XJ 告警数据集（RB7，XJ 仓库跟踪）**：时间戳输出含秒的 parser-valid ISO；目录分页完整且
   不超过 Base Screen 最大 50 项；final-page 告警用例有测试。
8. **XJ resolve 上下文转发（RB8，XJ 仓库跟踪）**：按适用转发 mode/projectId/documentRevision；
   全量轮询/手动刷新不丢失 per-component 上下文。
9. **测试与门禁（RB9）** `[x]`：两仓为上述修复添加聚焦回归测试并运行相关包 test/typecheck 与全量
   必需门禁（Base `pnpm verify:m0` 全绿；XJ 前端 build/unit 与后端 Collect 测试通过，Viewer
   query-count E2E 已于 2026-08-10 在远程/临时环境真实执行通过）；生产专属动作保持 N/A 表述不变。

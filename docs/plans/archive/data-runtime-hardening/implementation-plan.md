# Data Runtime Hardening 实施计划

> 状态：已完成（治理已接受；Review Remediation Batch 于 2026-08-09 闭环）
> 完成记录：代码评审发现的正确性缺陷与整改证据见第 18 节。
> 研究输入：[数据模块设计原则深度研究](../研究报告.md)
> 现有决策：[ADR-0023 Host Dataset Resource Integration](../../../decisions/ADR-0023-host-dataset-resource-integration.md)
> 新增决策：[ADR-0025 Data Runtime Hardening](../../../decisions/ADR-0025-data-runtime-hardening.md)（已接受，2026-08-09）
> 活动规格：[Data Runtime Hardening Spec](../../../specs/archive/data-runtime-hardening/spec.md)（生效中，2026-08-09）
> 真实宿主：`C:\worker\xjdatahub`

## 1. 背景

Base Screen 已经具备一条窄而明确的数据链路：

```text
host dataset catalog
  -> descriptor
  -> parameter authoring
  -> field binding
  -> host resource resolve
  -> material adapter
  -> material render
```

`xjdatahub` 使用这条链路将已启用的自定义指标暴露为 `xj_metric` 数据集。实际接入证明
host-managed dataset 的方向可行，但也暴露出以下问题：

1. Base Screen 当前文档契约与 `xjdatahub` 后端 Schema、自动文档工厂不一致。
2. Renderer 对相同资源的 reconciliation 会取消未变化的请求。
3. Viewer 的定向刷新会先暂停全部资源，实际产生全量刷新。
4. Base Screen canonical binding 与 `xjdatahub` 的 `configJson` binding 同时存在。
5. 多个组件引用同一指标时缺少请求协调，宿主可能执行多次相同查询。
6. tabular dataset 缺少单位、格式、可空性和业务注解等真实所需元数据。
7. 宿主查询诊断被泛化，最终物料无法区分失败与真实空数据。
8. 初始化顺序、参数 Schema 权威和设计态变量链路仍不完整。

本计划先恢复现有链路的正确性，再扩展协议和运行时能力。它不把研究报告中的所有理想能力
一次性纳入实现。

## 2. 目标

### 2.1 必须达成

1. 当前形态的 ScreenDocument 在 Base Screen、`xjdatahub` 前端和后端使用同一严格契约。
2. 数据集绑定可以完成选择、保存、重载、Viewer 展示和刷新闭环。
3. 相同资源的无关重渲染不取消、不重取、不丢失 ready 状态。
4. `refreshData(componentId)` 只刷新目标组件；重复请求具有明确的合并语义。
5. `xjdatahub` 只保留一套 canonical 字段绑定。
6. 查询失败、超时、取消、真实空数据和成功数据具有不同状态。
7. 同一 Viewer 内可安全共享的相同查询能够合并进行中的请求。
8. 数据字段能够携带 `xjdatahub` 已经真实使用的展示元数据。
9. 所有完成声明都有自动化证据，不再由测试矩阵代替真实测试。

### 2.2 非目标

本轮不实现以下能力：

- 在 ScreenDocument 中保存 URL、SQL、header、token 或数据库连接信息。
- Base Screen 直接连接 MySQL、PostgreSQL、ClickHouse 等数据源。
- 通用 JavaScript、Groovy 或 Python 数据转换执行环境。
- WebSocket、SSE、MQTT 等实时传输管理器。
- 跨浏览器标签页、跨 Viewer 实例或跨租户的全局缓存。
- 完整的 filter、sort、aggregate、formula 转换 DSL。
- 由 Base Screen 执行租户鉴权、行级权限或字段脱敏。

## 3. 责任边界

| 能力 | Base Screen | 宿主，例如 xjdatahub |
| --- | --- | --- |
| 数据集发现与描述协议 | 定义 port、严格 parser 和 Designer UI | 返回当前用户可见的数据集 |
| 资源身份与参数意图 | 定义 canonical shape 并持久化 | 解释 resource type、id 和参数 |
| 字段绑定 | 定义角色、校验、投影和 adapter ABI | 提供字段并实现业务物料 adapter |
| 查询执行 | 管理调用、取消、超时和迟到结果 | 执行 SQL、API 或其他真实查询 |
| 请求协调 | 管理单实例内进行中请求 | 声明哪些请求结果可以共享 |
| 缓存 | 可提供实例内短生命周期策略 | 负责服务端缓存和租户隔离 |
| 刷新 | 提供正确的手动和定向刷新原语 | 决定业务刷新周期并调用原语 |
| 认证与授权 | 不保存凭证，提供非持久化上下文 | 校验身份、租户、资源和数据权限 |
| 审计与可观测性 | 提供生命周期事件和 trace context | 落日志、指标、告警和审计记录 |
| 错误状态 | 保留安全诊断并传递标准状态 | 返回适合终端用户展示的安全信息 |

## 4. 规格与决策准备

在修改公共契约前，先建立一个活动 Spec：

```text
docs/specs/data-runtime-hardening/
  spec.md
  tasks.md
  checklist.md
  test-matrix.md
```

同时新增一份延伸 ADR-0023 的决策记录，ADR-0025（已接受，2026-08-09）冻结以下事项：

1. Base Screen 继续采用 host-managed dataset，不成为数据库连接管理器。
2. canonical document 只保存资源身份、参数意图和字段绑定。
3. `componentId` 仅作审计，不进入宿主查询身份或共享请求 key。
4. 进行中请求共享采用宿主显式声明：可选 `queryScope?: 'resource'`，缺省组件域不共享。
5. dataset metadata 的最小字段集合和严格校验规则。
6. 告警采用通用 annotation 还是独立数据集。
7. 错误信息如何在安全、可诊断和用户可见之间分层。

现有 `host-dataset-integration` Spec 不直接改写历史目标，但必须修正测试矩阵中没有真实证据的
声明，并从新的 hardening Spec 链接到纠正用例。

## 5. 阶段一：恢复文档契约一致性

### 5.1 Base Screen 工作

1. 确认 `ScreenHostResourceDataSource.binding` 继续是必填字段，值为绑定对象或 `null`。
2. 确认 contracts tarball 包含唯一黄金 `screen-document.schema.json`。
3. 增加 canonical host-resource fixture，覆盖 `binding: null` 和完整字段绑定。
4. 增加消费者校验，确保 tarball 中的 Schema 与 contracts parser 当前形态一致。

这一阶段不增加兼容 parser，也不接受缺少 `binding` 的文档。

### 5.2 xjdatahub 工作

1. 将后端 `resources/schema/screen-document.schema.json` 更新为 vendored contracts 黄金产物。
2. 增加自动同步或内容一致性检查，禁止继续依赖人工复制。
3. 修改 `DashboardScreenDocumentFactory.hostResource()`，显式接收并写入 binding。
4. 修改 Agent 大屏生成逻辑，为数字卡片、图表和表格生成对应角色绑定。
5. 所有资源身份统一使用稳定的 `dmCode`，停止生成新的数字 ID 引用。
6. 在后端读取和保存边界使用同一 Schema 校验，不把无效文档留给前端发现。

### 5.3 一次性数据迁移

迁移按以下顺序执行：

1. 扫描所有含 `host-resource` 且缺少 `binding` 的文档，输出数量和 dashboard ID。
2. 根据组件 material type 和既有 `configJson.dataSource.binding` 推导 canonical roles。
3. 数字卡片映射到 `measures`；图表映射到 `dimension` 和 `measures`；表格映射到 `columns`。
4. 使用指标输出字段别名，不使用聚合前的原始字段名。
5. 无法确定映射时记录 blocking finding，不猜测、不修改该文档。
6. 对转换结果执行当前 Schema 校验和前端 parser 等价校验。
7. 在事务中更新文档并推进 revision，避免已有编辑会话静默覆盖。

不在应用运行时保留旧文档转换分支。迁移完成后系统只接受一个当前形态。

### 5.4 测试与退出条件

- 后端测试证明缺少 binding 的文档失败关闭。
- 后端测试证明 `binding: null` 和合法角色绑定可以保存及读取。
- Factory 和 Agent 流水线生成的完整文档通过当前 Schema。
- 前端测试证明后端生成文档可被 `parseScreenDocument()` 接受。
- 迁移提供 dry-run、blocking finding 和事务回滚证据。
- 历史样本、Agent 新文档和设计器文档都能完成 load-save-load。

## 6. 阶段二：修复 Renderer 和 Viewer 资源状态机

### 6.1 Renderer reconciliation

将 mounted resource 明确建模为以下状态：

```text
idle
loading(key, generation, controller, timer)
ready(key, value)
error(key, code, message)
```

每次 `render(document)` 遵循以下规则：

| 当前状态 | 新资源 | 行为 |
| --- | --- | --- |
| 任意 | 无资源 | 取消旧请求，清理 key，应用 idle/static 状态 |
| 无资源 | 有 key | 保存 key，进入 loading，开始 resolve |
| 有资源 | 相同 key | 保留当前 dataState 和进行中的请求，不重取 |
| 有资源 | 不同 key | 取消旧 generation，保存新 key，开始 resolve |
| 任意 | 组件删除或类型替换 | 取消、卸载并拒绝迟到结果 |

`resourceKey` 只有在数据源被移除时清空；无关属性编辑不得清空它。

### 6.2 Viewer 刷新

1. 初始文档加载可以暂停全部数据，等待变量准备完成后统一启动。
2. 普通 `refreshData()` 刷新全部当前资源，但不卸载 Material。
3. `refreshData(componentId)` 不调用全局 `suspendData()`。
4. 未知 component ID 不触发任何资源请求。
5. 同一组件、同一 key 的进行中刷新被合并，不取消后重新开始。
6. 参数或资源身份变化时取消旧请求并立即使用新 key。
7. 变量刷新只影响实际依赖该变量的组件。

### 6.3 必需测试

- deferred resolve 期间发生无关文档编辑，请求不被 abort。
- ready 组件发生无关编辑，dataState 仍为 ready。
- 相同 key 连续 render 不增加 resolve 次数。
- 只刷新 A 时，B 和 C 不进入 loading 且不调用宿主。
- 未知 ID 的定向刷新产生零调用。
- 同一 ID 连续刷新只保留一个进行中调用。
- resourceId、resourceType、params 任一变化都取消并重取。
- binding 变化只重新执行本地 adapter；若 raw query identity 未变化，不重复查询。
- 删除、类型替换、unload、disconnect 和 timeout 都正确取消。
- abort 后的 resolve 或 reject 不覆盖新 generation。

## 7. 阶段三：统一 xjdatahub 字段绑定

### 7.1 目标模型

唯一持久化绑定为：

```text
component.dataSource.binding.fields
```

`configJson` 只保存物料展示配置，不再保存数据资源 ID、metric ID 或字段 binding。

### 7.2 Adapter 调整

1. `createXjTabularDataAdapter()` 读取 Base Screen 校验后的角色字段。
2. Adapter 输出 XJ 物料真正需要的 rows、columns 和运行时 role mapping。
3. 数字卡片直接使用 `measures[0]`。
4. 图表直接使用 `dimension[0]` 和 `measures`。
5. 表格直接使用 `columns` 的顺序。
6. `XjDashboardMaterial` 不再根据字段类型猜测绑定，也不读取旧 `configJson` binding。
7. `normalizeDataState()` 不再维护多种历史数据 shape。

### 7.3 Agent 生成调整

1. 卡片绑定使用指标 measure 输出 key。
2. 趋势图绑定使用 dimension 输出 key 和 measure 输出 key。
3. 普通表格绑定使用当前指标声明的字段顺序。
4. 告警表格等待阶段四的 annotation 决策，不再把普通聚合行伪装为告警数据。

### 7.4 退出条件

- Designer 字段勾选后，保存文档只出现 canonical binding。
- 保存并重载后，字段顺序和角色完全一致。
- Agent 文档与 Designer 文档经过同一 adapter 路径。
- 不存在根据空配置自动猜测并写回另一套绑定的行为。
- 前端 E2E 覆盖数字卡片、图表和表格各一个真实绑定。

## 8. 阶段四：扩展数据元数据和错误协议

### 8.1 字段元数据候选

公共契约优先评估以下最小字段：

```ts
interface ScreenDatasetField {
  readonly id: string;
  readonly label: string;
  readonly valueType: 'string' | 'number' | 'boolean' | 'date';
  readonly nullable?: boolean;
  readonly unit?: string;
  readonly format?: string;
}
```

公共契约最终只增加 `nullable?`、`unit?`、`format?`，不增加 `semanticType`。`unit` 为 1..64 个
UTF-16 code unit、`format` 为 1..128 个 UTF-16 code unit，两者非空并拒绝 C0/C1 控制字符。
`format` 是展示提示，不允许携带可执行表达式。

### 8.2 告警决策

需要在 ADR 中比较两种候选：

1. 通用 annotation：引用 row index、field ID、level、message 和安全扩展数据。
2. 独立告警数据集：宿主将告警作为单独 resource 暴露，普通指标数据不携带告警。

选择标准包括通用性、数据量限制、分页、刷新频率、表格与图表消费方式。未完成该决策前不把
`xjdatahub` 私有 alert shape 直接加入公共 contracts。

### 8.3 错误链路

1. Renderer 保留宿主返回的安全 diagnostics，而不是全部替换为通用消息。
2. 宿主 diagnostics 增加组件和 dataSource 路径前缀后上报。
3. Material dataState 至少区分 idle、loading、ready、error。
4. ready 状态允许零行，并与 error 状态严格区分。
5. timeout 使用稳定错误码；主动 abort 不显示为查询失败。
6. 第三方 Material 必须通过 conformance 测试证明能够安全处理全部状态。

### 8.4 退出条件

- 单位和格式可以从 XJ 指标定义到达最终数字卡片与表格。
- 空结果展示为空状态，查询失败展示错误状态。
- 权限失败、超时、无效数据和 adapter 失败具有不同诊断码。
- 诊断中不包含 token、SQL、header 或未脱敏参数。

## 9. 阶段五：请求协调和刷新策略

### 9.1 请求共享语义

默认只在同一 Viewer/Renderer 实例内协调请求。共享 key 候选为：

```text
resourceType + resourceId + canonical evaluated params
```

binding 不进入 raw query key，因为 binding 是查询完成后的本地投影。componentId 仅作审计、不进入
raw query key（ADR-0025 已冻结）；跨组件共享需要宿主在 resource type 上显式声明
`queryScope?: 'resource'`。

### 9.2 Coordinator 行为

1. 相同 key 的进行中请求共享同一个 raw dataset promise。
2. 每个组件独立执行 binding 校验和 Material adapter。
3. 一个消费者卸载只取消自身订阅；最后一个消费者离开才 abort 宿主请求。
4. 失败和超时向所有当前消费者分发一致终态。
5. 默认不缓存完成结果；短 TTL 或 stale-while-revalidate 另行决策。
6. 不跨实例共享，避免不同用户、租户或宿主配置之间串数据。

### 9.3 xjdatahub 刷新调整

1. 定时器调用 `viewer.refreshData()`，不再重新下载完整文档。
2. 文档更新检测与数据刷新拆分为两个职责。
3. 只有 dashboard revision 变化时才重新加载文档。
4. 页面隐藏时是否暂停轮询由宿主策略决定，Base Screen 提供可调用的刷新原语。

### 9.4 退出条件

- 同一指标被多个组件引用时，可共享查询只调用一次宿主 resolve。
- 不同 params、resource ID 或不可共享 resource type 绝不合并。
- 各组件仍按自己的 binding 得到不同投影。
- XJ 定时刷新不重建 Viewer、不重复注册 Material、不重新获取未变化文档。

## 10. 阶段六：收敛初始化、参数和变量链路

### 10.1 原子配置

Viewer 与 Designer 提供权威 `configure()` 入口，一次提交并校验全部运行时依赖：

```text
material catalog
runtime contributions
resource/variable 端口（host adapter）
resource timeout
host adapter
```

所有依赖通过校验后才提交配置并创建 Renderer；运行时依赖 setter 不再独立初始化。文档更新是配置后
的显式操作，不发明兼容解析器或顺序垫片。

### 10.2 参数权威

1. `dataResourceType.configSchema` 是运行参数结构和约束权威。
2. `ScreenDatasetParameter` 只保留 `name`、`label`、可选 `editor`、可选 `defaultValue`（移除
   `valueType`/`required`）。
3. 参数名与 config schema 属性精确一致；`editor` 与 `defaultValue` 按 schema 校验。
4. 可选参数具备 unset/literal/variable 作者状态，只持久化已存在的项。
5. 变量参数在设计态按 schema 类型校验，不使用伪造空字符串 placeholder。
6. describe 返回的 resource identity 必须与请求 identity 完全一致。

### 10.3 变量一致性

1. 设计态 Canvas Renderer 接收已解析变量。
2. Viewer 与 Designer 使用同一依赖提取和参数求值逻辑。
3. host variable 变化只刷新引用它的资源。
4. 变量失败不得触发带缺失参数的宿主查询。

### 10.4 退出条件

- 宿主不需要依赖 setter 顺序注释才能完成初始化。
- 必填、可选、默认值、literal 和 variable 参数均有测试。
- Designer Canvas 与 Viewer 对相同变量和文档产生相同查询参数。

## 11. 阶段七：安全上下文和可观测性

### 11.1 非持久化执行上下文

`ScreenResourceExecutionContext` 契约在 resolve options 中提供以下上下文：

```text
instanceId
mode: design | preview | viewer
trigger: initial | manual | polling | variable | document-change
traceId
projectId?（可选）
documentRevision?（可选）
```

这些值只用于本次运行，不进入 ScreenDocument。身份、租户和权限仍由宿主的认证上下文确定。

### 11.2 观察者事件

`ScreenResourceObserver` 契约提供结构化 hook，事件类型为：

```text
started
shared
succeeded
failed
aborted
timed-out
adapted
```

事件只包含请求 ID、组件/资源身份、执行上下文、耗时、可选字段数/行数和稳定码，绝不携带参数值、
数据集载荷或消息；观察者异常被隔离，不中断解析。

### 11.3 刷新 API

保留 `refreshData(componentId?: string)` 作为手动简写，并新增对象形式
`refreshData({ componentId?, trigger?: 'manual' | 'polling', traceId? })`。initial/variable/
document-change 触发由运行时拥有。

### 11.4 xjdatahub 对接

1. 将 trace ID 传给后端日志和审计记录。
2. Axios 主动取消不弹网络错误 toast。
3. 登录身份变化、退出登录或租户切换时 unload 或 invalidate 当前 Viewer 数据。
4. 后端继续在每次 resolve 时校验资源可见性和数据权限。

### 11.5 退出条件

- 可以追踪一次刷新从组件到宿主查询再到 adapter 的完整耗时。
- 可以区分共享命中、宿主查询、主动取消和真实失败。
- 文档、日志、事件和测试 fixture 不包含凭证或敏感连接信息。

## 12. 测试策略

### 12.1 Base Screen 聚焦测试

| 层 | 必需证据 |
| --- | --- |
| Contracts | host-resource strict shape、Schema golden、metadata、错误限制、round trip |
| Core | 参数求值、可选参数、变量依赖、binding roles、request identity |
| Plugin Core | resource contribution、adapter ABI、metadata projection、异常隔离 |
| Renderer | reconciliation、共享、取消、超时、迟到结果、错误状态 |
| Viewer | 初始加载、全量刷新、定向刷新、变量刷新、实例隔离 |
| Engine | catalog、describe、参数、binding、设计态数据状态、原子配置 |
| Material | loading、empty、ready、error、单位、格式和选定告警方案 |

### 12.2 xjdatahub 测试

| 层 | 必需证据 |
| --- | --- |
| Backend unit | catalog、describe、resolve、Schema、Factory、Agent 文档、权限失败 |
| Migration | dry-run、合法转换、blocking finding、事务回滚、revision 推进 |
| Frontend unit | ports、adapter、role mapping、error props、refresh timer |
| Browser E2E | 选择数据集、绑定字段、保存、重载、Viewer、刷新、错误和恢复 |
| Query evidence | 多组件同指标时的真实 resolve 次数和仓库查询次数 |

现有 Java 测试使用已有 CI、容器或远程环境，不要求在本机安装 Java。

## 13. 质量门

Base Screen 在交付公共契约或运行时改动前必须通过：

```text
pnpm --filter @base-screen/contracts test
pnpm --filter @base-screen/core test
pnpm --filter @base-screen/plugin-core test
pnpm --filter @base-screen/renderer test
pnpm --filter @base-screen/engine test
pnpm --filter @base-screen/material test
pnpm verify:m0
```

`xjdatahub` 必须通过当前仓库已有的 frontend format、lint、typecheck、test、build、Playwright E2E，
以及后端 Maven 聚焦测试和完整 CI。实际命令在实施前从两个仓库当前脚本中确认，不在计划中猜测。

## 14. 发布与迁移顺序

1. 冻结写入窗口或确认没有长时间运行的 Designer 会话。
2. 备份大屏文档表及当前 revision。
3. 对生产数据执行迁移 dry-run，处理全部 blocking finding。
4. 在同一发布窗口应用文档迁移、后端 Schema 和文档生成器。
5. 部署使用同一 contracts 产物的前端和 Base Screen tarballs。
6. 运行生产 smoke：加载、绑定、保存、重载、Viewer 和手动刷新。
7. 检查重复查询数、失败率、超时率和迁移后无效文档数。
8. 恢复写入并观察至少一个正常刷新周期。

由于迁移后只保留当前文档形态，应用回滚必须同时恢复迁移前数据库快照。不能只回滚前端或后端
构件后继续使用已经迁移并产生新 revision 的文档。

## 15. 阶段依赖与并行安排

| 阶段 | 依赖 | 可并行项 |
| --- | --- | --- |
| 规格与决策准备 | 无 | 两个仓库现状 fixture 收集 |
| 文档契约一致性 | 规格基线 | Renderer 状态机修复 |
| Renderer/Viewer 状态机 | 规格基线 | 文档迁移开发 |
| XJ binding 收敛 | 文档契约一致性 | E2E fixture 准备 |
| metadata 与错误协议 | ADR 接受 | XJ 错误 UI 原型 |
| 请求协调 | Renderer 状态机 | XJ 定时刷新拆分 |
| 初始化、参数和变量 | 公共边界决策 | observability 事件设计 |
| 安全与可观测性 | 请求生命周期稳定 | XJ 后端审计接线 |
| 发布 | 所有适用 checklist 完成 | 无 |

## 16. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 历史 configJson 无法可靠推导 binding | dry-run + blocking finding，不猜测写入 |
| 请求共享造成跨身份数据泄露 | 仅实例内、宿主显式声明、身份变化立即失效 |
| metadata 扩张形成任意 JSON 通道 | 只增加有真实消费者的严格字段 |
| 错误透传泄露后端细节 | 区分内部 diagnostics 与安全 public message |
| 改刷新状态机引入 loading 闪烁 | deferred tests + ready state 保留断言 |
| 前后端无法原子部署 | 维护窗口、数据库快照、同一 contracts 产物门禁 |
| 测试矩阵继续高估证据 | 每条矩阵必须指向具体测试名和断言行为 |

## 17. 完成定义

只有同时满足以下条件，data runtime hardening 才可声明完成：

1. 活动 Spec 的所有适用 Task、子项和 checklist 均有证据并勾选。
2. Base Screen 与 `xjdatahub` 使用内容一致的 ScreenDocument Schema。
3. 所有存量文档均已迁移或被明确列为阻塞项，不存在静默兼容分支。
4. canonical binding 是唯一持久化字段绑定。
5. 无关 render 不取消或重取资源，定向刷新只请求目标组件。
6. 可共享的多组件相同查询被合并，不能共享的查询保持隔离。
7. Material 可以区分 loading、empty、ready 和 error。
8. XJ 的单位、格式及最终选定的告警表达能够到达实际组件。
9. 设计态、预览态和 Viewer 对同一文档、变量和数据返回一致结果。
10. 两个仓库的必需质量门、browser E2E 和迁移演练全部通过。
11. 生产 smoke 未发现无效文档、静默空数据或重复查询风暴。
12. 文档、日志、Schema、fixture 和公共 API 中不存在凭证或连接信息泄露。
13. Review Remediation Batch (2026-08-09) 的全部适用修复项具备证据并勾选（见第 18 节）。

## 18. Review Remediation Batch（2026-08-09）

> 代码评审整改批次：在首批实施证据之外补充评审发现的正确性修复。以下修复属于 ADR-0025 既有
> 要求（DRH-R2/R3/R7/R8）下的正确性收敛，不是新公共契约，也不引入新 ADR；版本化/兼容形态
> 要求保持不变。对应待办项见 Spec 第 7 节与 `tasks.md`/`checklist.md` 的「Review Remediation
> Batch (2026-08-09)」小节，全部为未勾选状态；生产专属动作保持 N/A 表述不变。

1. **请求协调（RB1）**：未声明共享的相同 raw key 请求使用独立槽位并各自 settle；同一组件同一
   key 的进行中刷新合并；共享仅限显式 `queryScope: 'resource'`。
2. **执行上下文（RB2）**：每次 resolve 的 trigger/trace 上下文正确独立且可区分
   （initial/document-change/variable/manual/polling）；projectId/documentRevision 在提供时
   流动；observer 事件使用同一正确上下文。
3. **原子配置（RB3）**：Viewer/Designer `configure()` 先校验后生效，运行时 setter 不独立
   初始化；仓内消费方（含 Designer preview）与 XJ editor 迁移到 `configure()`。
4. **测试与门禁（RB9）**：为 RB1-RB3 添加聚焦回归测试并运行相关包 test/typecheck 与
   `pnpm verify:m0` 全量门禁；XJ 侧修复（RB4-RB8）见 XJ 仓库批次小节，XJ 前端/后端测试与
   远程/临时环境 E2E 门禁由 XJ 仓库跟踪。

本批次完成条件：全部待办项具备自动化证据并勾选，`pnpm verify:m0` 与 XJ 对应门禁通过。

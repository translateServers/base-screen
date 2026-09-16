# ADR-0082: 数据集消费契约

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0023（宿主数据集目录与字段绑定、运行时取数、物料角色声明）、ADR-0025（请求身份与跨组件共享、元数据与错误协议、初始化/变量/上下文、一次性迁移）、ADR-0069（数据集从 host-resource 独立、统一端口、参数权威下移）；被吸收记录已随本次合并移除，内容只在 git 历史中保留
> 关联：[ADR-0022](./ADR-0022-official-data-material-contracts.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md)、[独立数据集消费规格](../specs/independent-dataset-consumption/spec.md)、[Data Runtime Hardening Spec（归档）](../specs/archive/data-runtime-hardening/spec.md)

## 背景

Base Screen 需要一条窄的数据通路：宿主数据集目录 → 参数作者面 → 字段绑定 → Designer 预览 → Viewer 解析。API、数据库、全局状态等来源是宿主的实现选择；让 Designer 分别持有 URL、SQL、连接信息或宿主状态路径会把宿主架构泄露进 Screen Document，并让每种来源重复实现发现、参数与字段映射界面。因此数据集是宿主对这些来源的统一管理视图，不是 Base Screen 新增的传输协议。

ADR-0023 建立了宿主管理数据集、严格 host-resource 数据源与 canonical 表格契约；ADR-0025 补齐了真实集成暴露的正确性缺口（请求身份、共享、元数据、错误协议、初始化、迁移）；ADR-0069 进一步把数据集从 host-resource 中独立出来，以单一端口统一分组、目录、描述与查询，并把参数权威从资源类型下移到具体数据集描述。本文件把这三份已接受记录收敛成一份现行表述。

## 决策

### 1. 宿主拥有数据集目录，组件经字段角色绑定消费

宿主拥有数据集目录；组件通过物料字段角色绑定消费数据集。Designer 的数据入口只有 `none`、`static` 与宿主管理的数据集三种；数据集背后的来源类型不进入 canonical document，也不成为 Designer 的传输配置表单。`ScreenDesignerHostAdapter` 增加 `datasets` capability 与端口，只有该 capability 有效时才能选择数据集；Designer 预览仍额外需要 `resources` capability。宿主持有认证、真实查询、授权、审计、缓存与传输细节。

### 2. 单一数据集端口 `ScreenHostDatasetPort`

分组、目录、描述与查询统一由 `ScreenHostDatasetPort` 承载，取代了旧的目录/查询分离契约与宿主特定资源分类：

```ts
interface ScreenHostDatasetPort {
  readonly queryScope?: 'dataset';
  groups?(request: { signal }): Promise<ScreenParseResult<readonly ScreenDatasetGroup[]>>;
  list(request: ScreenDatasetListRequest): Promise<ScreenParseResult<ScreenDatasetEntries>>;
  describe(request: ScreenDatasetDescribeRequest): Promise<ScreenParseResult<ScreenDatasetDefinition>>;
  query(request: ScreenDatasetQueryRequest, options: ScreenHostResourceResolveOptions): Promise<ScreenParseResult<ScreenTabularDataset>>;
}
```

- `ScreenDatasetGroup` 为 `{ id, name }`；`groups` 为可选方法。
- `list` 请求含 `query`、可选 `groupId`、可选 `cursor`、`limit` 与 `signal`；游标对基座不透明。`ScreenDatasetEntries` 为 `{ items, nextCursor? }`，`ScreenDatasetEntry` 为 `{ datasetId, name, description, groupId? }`；`items` 与 `groups` 每次响应上限均为 50。
- `describe` 请求含 `datasetId` 与 `signal`，返回 `ScreenDatasetDefinition extends ScreenDatasetEntry { fields, parameters }`；`query` 请求含 `datasetId`、`componentId` 与 `params`。
- 所有响应严格失败关闭：拒绝未知字段、重复 `datasetId`、重复 group `id` 与超限内容；`fields` 上限 256、`parameters` 上限 64。现行名称是 `ScreenHostDatasetPort` / `datasets`，`ScreenHostDatasetCatalogPort` / `datasetCatalog` 不再有效。

### 3. canonical 数据源只保存发布标识、参数意图与字段绑定

```ts
interface ScreenDatasetDataSource {
  readonly type: 'dataset';
  readonly datasetId: string;
  readonly params: Readonly<Record<string, ScreenHostResourceParameter>>;
  readonly binding: ScreenDataBinding | null;
}
```

`host-resource` 继续表达非表格宿主资源。文档不保存凭据、URL、SQL、请求头、连接配置或传输选项，Base Screen 不成为数据库连接管理器。解析器与 JSON Schema 只有当前一种形态，无遗留解析分支：未知字段、缺失 `binding` 与遗留参数形态一律失败关闭，运行时不静默接受或转换遗留形态。`ScreenHostResourceParameter` 为 `literal`（`value`）或 `variable`（`variableId`）；`ScreenDataBinding.fields` 是角色到字段 id 列表的映射。绑定声明与变量引用绝不跨越宿主端口，`ScreenHostResourceRequest` 只含 `componentId`、`resourceType`、`resourceId` 与已求值的普通 JSON 参数。

### 4. 参数权威在具体数据集描述

数据集参数由具体、不可变的 `ScreenDatasetDefinition.parameters` 拥有，不再由资源类型 `configSchema` 拥有，也不再保留类型级参数权威。`ScreenDatasetParameterDefinition` 的字段为：`name`、`label`、`valueType`（`string | number | boolean | date`）、`required`、可选 `defaultValue`，以及可选有限约束 `minimum`、`maximum`、`maxLength`、`allowedValues`（至多 128 项）。参数求值从不做类型强制转换；非法定义或非法值失败关闭（`HOST_DATASET_PARAMETER_INVALID`），非法描述失败关闭（`HOST_DATASET_DESCRIPTOR_INVALID`）。不同数据集的参数彼此独立。

### 5. 请求身份与跨组件共享

`componentId` 对所有查询仅为审计用途，宿主查询身份不携带其语义，也不进入共享请求键。原始查询身份为「数据集标识 + canonical 已求值参数」；字段绑定与物料适配构成独立的投影身份——只要原始身份未变，绑定变更只重跑本地投影，不重新发起宿主查询。

跨组件共享不默认成立：资源类型必须显式选择加入，声明式字段为 `queryScope`，`ScreenHostDatasetPort.queryScope` 取 `'dataset'`，缺省即组件作用域、不共享；仅原始查询身份完全相同的请求可以共享。共享只发生在单个 Renderer/Viewer 实例内且请求在途期间，不引入完成结果缓存，完成的数据集交付给每个消费者后即释放。每个消费者独立校验自己的绑定并运行自己的物料适配；消费者离开只移除自己的订阅，仅当最后一个消费者离开才中止宿主请求；超时与失败向所有当前消费者分发同一终态。跨组件缓存与服务端去重仍归宿主。

### 6. 元数据、数据状态与错误协议

`ScreenDatasetField` 为 `{ id, label, valueType }` 加可选 `nullable`、`unit`、`format`，不新增 `semanticType`。省略 `nullable` 保持宽松空值行为（单元格可为 null 或缺失），`nullable: false` 拒绝 null 与缺失。`unit` 为 1..64 UTF-16 的非空显示提示，`format` 为 1..128 UTF-16 的非空显示提示，二者均拒绝 C0/C1 控制字符；`format` 仅为显示提示，永不执行。

`ScreenTabularDataset` 为 `{ fields, rows, totalRowCount? }`，上限 256 字段、10,000 行、1 MiB；字段 ID 唯一，行只能包含已声明字段，单元格为匹配标量或 `null`，数值有限，日期为 ISO 字符串；`totalRowCount` 仅为元数据，不启用分页。

空数据是零行的就绪数据，不是错误也不是新数据状态。主动取消只属生命周期，不作为物料错误暴露，取消没有面向物料的代码。面向物料的终态代码集固定为 `HOST_RESOURCE_ACCESS_DENIED`、`HOST_RESOURCE_UNAVAILABLE`、`HOST_RESOURCE_TIMEOUT`、`HOST_RESOURCE_FAILED`、`HOST_RESOURCE_INVALID`、`HOST_DATASET_INVALID`、`HOST_DATASET_BINDING_INVALID`、`HOST_DATASET_ADAPTER_FAILED`。宿主安全失败输入必须恰为其中之一，加可选、至多 256 UTF-16 且拒绝 C0/C1 的公开消息，不得携带任意原始诊断、路径或参数载荷；未知或非法宿主代码归一化为 `HOST_RESOURCE_FAILED`，其原始消息与代码一并丢弃。第三方物料必须通过一致性测试证明安全处理每个状态。

### 7. 职责划分

Contracts 定义严格参数与结果；Core 进行纯参数求值、依赖提取、分离式 JSON 克隆与物料角色绑定校验——缺失变量、宿主变量失败、未知字段与角色/类型违规在发起请求前失败关闭；Engine 提供作者面；Renderer 负责有界调用、实例内请求合并、取消与安全投影。Renderer/Viewer 拥有实例内变量状态、宿主变量解析、请求取消、默认 15 秒 deadline、generation guard 与迟到结果抑制，在初次加载、被引用变量变化与显式刷新时取数。Designer 与 Viewer 使用相同的依赖提取与参数求值，相同变量与文档产生相同查询参数；宿主变量对照已解析的运行时快照校验，不新增持久化变量类型。元数据与查询共用一次执行预算；失败、取消与迟到响应不写入文档。

### 8. 物料绑定声明

Plugin Core 拥有行/列绑定角色的可序列化 Manifest 声明，以及目录项上受信、仅运行时的数据适配器；函数绝不进入 Manifest 或 Screen Document。官方表格物料声明一个 `columns` 角色，接受 1..256 字段；官方图表物料声明一个 `dimension` 与 1..8 个数值 `measures`，null measure 跳过，类型不匹配失败关闭。未声明绑定的物料保留既有的 static 与原始 host-resource 行为。

### 9. 初始化、刷新、执行上下文与观察者

- 原子配置：Viewer 与 Designer 各自暴露权威的 `configure()`，在提交配置或创建 Renderer 前校验全部运行时依赖（catalog、运行时贡献、resource/variable 端口、timeout、宿主适配器）；运行时依赖 setter 不再各自初始化；文档更新仍是配置后的显式操作；不引入兼容解析器或顺序垫片。
- `refreshData(componentId?)` 保留为手动简写，并新增对象形式 `refreshData({ componentId?, trigger?: 'manual' | 'polling', traceId? })`；initial、variable 与 document-change 触发由运行时拥有。同一实例内对同一组件的重复刷新被合并。
- `ScreenResourceExecutionContext` 为契约，含 `instanceId`、`mode`（design/preview/viewer）、`trigger`（initial/manual/polling/variable/document-change）、`traceId`，以及可选 `projectId`、`documentRevision`；按每次解析提供，绝不持久化。
- `ScreenResourceObserver` 为契约，事件类型为 `started`、`shared`、`succeeded`、`failed`、`aborted`、`timed-out`、`adapted`；事件只携带请求 ID、组件/资源身份、执行上下文、时长、可选字段/行数与稳定代码，绝不携带参数、数据集载荷或消息；观察者异常被隔离，不中断解析。

### 10. 一次性迁移与联合切换

旧 numeric metric ID 由宿主一次性迁移；迁移完成后从运行时代码移除 numeric-ID 读取分支，只保留当前稳定标识；无法映射的历史文档产生阻塞性发现，不猜测、不以伪造映射回写。旧数据集端口与表格 host-resource 路径在联合切换时退出，不增加兼容解析分支；宿主负责旧配置盘点、备份、重建与恢复。生产备份、迁移执行、部署、smoke 与观察不在授权执行范围内，代码、测试、迁移 dry-run 与回滚演练在范围内；没有自动化证据（含真实浏览器 E2E 与查询计数证明）不得声明运行时行为完成。

## 后果

- 宿主可在不泄露 URL、SQL、请求头、令牌或请求选项的前提下暴露数据集；canonical 文档完整描述参数意图与字段投影且保持宿主中立。
- 数据集响应只有一道校验边界，先于物料专属投影；Designer 与 Viewer 无需全局 store 即可共享确定性的变量依赖行为。
- 数据结构收敛为单一端口与单一数据源形态，代价是旧接入必须一次性切换：未声明的宿主资源分类、遗留 numeric ID 与旧目录/查询分离契约不再被接受。
- 明确推迟/非目标：轮询、分页、运行时排序与过滤、跨组件完成结果缓存；告警作为独立数据集资源而非通用注解协议；元数据不新增 `semanticType`；Base Screen 不做连接管理器、查询引擎或传输运行时；生产迁移执行与部署不在授权范围。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0023 | 宿主拥有数据集目录、组件经字段角色绑定消费；严格单一数据源形态与失败关闭解析；`ScreenTabularDataset` 与元数据上限；物料角色声明与运行时适配器 ABI；Core/Renderer 职责划分 | 部分取代（数据集端口统一为 `ScreenHostDatasetPort`；目录/查询分离契约、类型级参数权威与宿主特定资源分类失效；跨组件去重归属由 ADR-0025 改写） |
| ADR-0025 | `componentId` 仅审计；原始身份与投影身份分离；`queryScope` 选择加入的实例内在途共享生命周期；`nullable`/`unit`/`format` 与冻结错误代码集；`configure()`、`refreshData` 对象形式、执行上下文与观察者契约；告警独立数据集；一次性 numeric-ID 迁移 | 部分取代（描述符参数权威与资源类型 `configSchema` 参数权威由 ADR-0069 取代并下移到数据集描述；其余保留） |
| ADR-0069 | 数据集从 host-resource 独立；`ScreenHostDatasetPort` 统一分组/目录/描述/查询；参数权威下移到具体数据集描述；元数据与查询共用执行预算；字段绑定变更只触发本地投影 | 现行且仍生效（本文件为其主线收敛表述） |

# 公共大屏设计器底座项目 — 数据模块设计原则深度研究

> **研究视角**：开发者 / 平台架构师
> **项目定位**：公共大屏设计器底座（Platform Base），即为上层业务提供通用的、可复用的大屏搭建能力的基础设施

---

## 一、研究背景与问题域

公共大屏设计器底座不同于"做一个大屏"，它的核心使命是：

> **让任意开发者/业务方，通过标准化的数据接入和组件绑定能力，快速搭建出可交互、可实时更新的可视化大屏。**

因此，数据模块不是"某个大屏的数据层"，而是**整个设计器生态的数据基础设施**。它需要回答的核心问题包括：

| 问题域 | 关键问题 |
| -------- | ---------- |
| 数据从哪来？ | 多源异构数据如何统一接入？ |
| 数据怎么描述？ | 组件如何知道自己需要什么数据？ |
| 数据怎么流？ | 从数据源到组件渲染的完整链路是什么？ |
| 数据怎么更新？ | 实时/定时/手动刷新的策略如何设计？ |
| 数据怎么扩展？ | 第三方开发者如何自定义数据源？ |
| 数据怎么安全？ | 多租户、权限、敏感数据如何管控？ |

---

## 二、核心设计原则（共 8 大原则）

### 原则一：数据与视图严格解耦（Separation of Data & View）

**核心思想**：数据模块不应感知任何具体的可视化组件实现。

```
┌─────────────────────────────────────────────────┐
│                  视图层 (View)                    │
│   ECharts组件 / 地图组件 / 表格组件 / 自定义组件    │
└────────────────────┬────────────────────────────┘
                     │  标准化数据协议 (DataProtocol)
┌────────────────────▼────────────────────────────┐
│              数据抽象层 (Data Layer)              │
│   DataSource → DataSet → DataBinding → DataFlow  │
└────────────────────┬────────────────────────────┘
                     │  适配器接口 (Adapter Interface)
┌────────────────────▼────────────────────────────┐
│              数据源层 (Data Source)               │
│   MySQL / HTTP API / WebSocket / CSV / 脚本       │
└─────────────────────────────────────────────────┘
```

**具体要求**：

- **组件不直接请求数据**，而是通过声明式的 `dataSourceId` + `fieldMapping` 获取数据
- **数据模块不关心组件类型**，只输出标准化数据结构
- 组件通过 **DataBinding 描述文件** 声明自己需要哪些字段、什么类型

```typescript
// 组件声明数据需求（而非直接请求）
interface ComponentDataRequirement {
  componentId: string;
  dataSourceId: string;
  fieldMapping: Record<string, string>; // 组件字段 → 数据字段
  refreshStrategy: RefreshStrategy;
}
```

**为什么重要**：作为公共底座，组件生态会不断扩展。如果数据层和视图层耦合，每新增一个组件类型都可能需要修改数据层，这违背了**开闭原则（OCP）**。

---

### 原则二：统一数据协议（Unified Data Protocol / Schema）

**核心思想**：所有数据源输出必须经过标准化转换，形成统一的数据协议格式。

#### 2.1 数据协议结构定义

```typescript
interface DataResult {
  status: 'success' | 'error' | 'loading';
  data: DataPayload;
  meta: DataMeta;
  timestamp: number;
  error?: ErrorInfo;
}

interface DataPayload {
  type: 'table' | 'series' | 'tree' | 'graph' | 'scalar' | 'geo' | 'custom';
  fields: FieldDescriptor[];   // 字段描述（名称、类型、单位）
  rows: Record<string, any>[]; // 行数据
  dimensions?: string[];       // 维度字段
  measures?: string[];         // 度量字段
}

interface FieldDescriptor {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'geo' | 'enum';
  unit?: string;
  nullable?: boolean;
}

interface DataMeta {
  totalCount: number;
  pageSize?: number;
  currentPage?: number;
  sourceType: string;
  cacheHit: boolean;
}
```

#### 2.2 设计要点

| 要点 | 说明 |
| ------ | ------ |
| **类型枚举可扩展** | `DataPayload.type` 应支持 `custom` 类型，允许第三方定义私有数据格式 |
| **字段自描述** | 每个字段携带 `type`、`unit`、`nullable` 等元信息，组件可据此自动选择渲染方式 |
| **维度/度量分离** | 明确标注 `dimensions` 和 `measures`，方便图表组件自动映射到 x/y/series |
| **错误标准化** | 统一的 `ErrorInfo` 结构，包含 `code`、`message`、`suggestion`，便于前端统一处理 |

**为什么重要**：公共底座面对的是 N 种数据源 × M 种组件的笛卡尔积。如果没有统一协议，就需要 N×M 个适配器；有了统一协议，只需要 N+M 个适配器。

---

### 原则三：数据源插件化与适配器模式（Pluggable DataSource Adapter）

**核心思想**：数据源接入必须是插件化的，底座只提供适配器接口，不内置具体数据源实现（或仅内置最小集）。

#### 3.1 适配器接口设计

```typescript
interface IDataSourceAdapter {
  // 适配器唯一标识
  type: string;
  
  // 连接测试
  testConnection(config: DataSourceConfig): Promise<ConnectionTestResult>;
  
  // 执行查询
  query(params: QueryParams): Promise<DataResult>;
  
  // 获取元数据（表结构、字段列表等）
  getSchema?(config: DataSourceConfig): Promise<SchemaInfo>;
  
  // 是否支持实时推送
  supportRealtime?: boolean;
  
  // 实时订阅（可选）
  subscribe?(params: QueryParams, callback: (data: DataResult) => void): Unsubscribe;
  
  // 生命周期
  destroy?(): void;
}
```

#### 3.2 内置 vs 扩展数据源

```
底座内置（最小集）          插件扩展（按需安装）
├── StaticJSON             ├── MySQL Adapter
├── HTTP API               ├── PostgreSQL Adapter
├── JavaScript 表达式       ├── ClickHouse Adapter
└── WebSocket              ├── ElasticSearch Adapter
                           ├── GraphQL Adapter
                           ├── MQTT Adapter（IoT场景）
                           ├── Groovy/Python 脚本
                           └── 自定义 Adapter（SDK）
```

#### 3.3 注册机制

```typescript
// 插件注册
DataSourceRegistry.register('mysql', new MySQLAdapter());
DataSourceRegistry.register('es', new ElasticSearchAdapter());

// 设计器运行时根据配置动态获取适配器
const adapter = DataSourceRegistry.get(dataSource.type);
const result = await adapter.query(params);
```

**为什么重要**：

- 公共底座不可能穷举所有数据源，**必须开放扩展点**
- 不同企业的数据栈差异巨大（有的用 ClickHouse，有的用 Hive，有的用 IoT 协议）
- 插件化使得核心底座保持轻量，同时生态可以无限扩展

---

### 原则四：数据绑定与映射的声明式设计（Declarative Data Binding）

**核心思想**：组件与数据之间的关系应通过**声明式配置**描述，而非命令式代码。

#### 4.1 数据绑定描述结构

```typescript
interface DataBinding {
  // 绑定的数据源
  dataSourceId: string;
  
  // 查询参数（支持变量插值）
  queryParams: Record<string, string | ParamExpression>;
  
  // 字段映射：组件视觉通道 → 数据字段
  fieldMapping: {
    x?: string;       // x轴
    y?: string;       // y轴
    series?: string;  // 系列
    value?: string;   // 数值
    label?: string;   // 标签
    color?: string;   // 颜色分组
    [key: string]: string | undefined;
  };
  
  // 数据转换管道
  transforms?: DataTransform[];
  
  // 刷新策略
  refresh: RefreshConfig;
}

interface DataTransform {
  type: 'filter' | 'sort' | 'limit' | 'aggregate' | 'formula' | 'custom';
  config: Record<string, any>;
}
```

#### 4.2 设计要点

| 要点 | 说明 |
| ------ | ------ |
| **变量插值** | 查询参数支持 `{{global.dateRange}}`、`{{component.selectedRegion}}` 等动态变量 |
| **转换管道** | 数据从源到组件之间可插入 filter/sort/aggregate 等转换步骤，避免修改数据源 |
| **映射可视化** | 设计器 UI 应提供拖拽式的字段映射面板，降低使用门槛 |
| **默认映射推断** | 根据数据字段类型自动推荐映射关系（如 date 类型自动推荐为 x 轴） |

**为什么重要**：声明式设计使得数据绑定关系可以被**序列化、存储、复制、导入导出**，这是设计器"保存/加载"能力的基础。

---

### 原则五：多策略数据更新与实时通信（Multi-Strategy Data Refresh）

**核心思想**：不同数据场景需要不同的更新策略，底座应提供统一的刷新调度器。

#### 5.1 刷新策略枚举

```typescript
type RefreshStrategy = 
  | { type: 'static' }                           // 静态数据，不刷新
  | { type: 'polling'; interval: number }        // 定时轮询
  | { type: 'websocket'; url: string }           // WebSocket 推送
  | { type: 'sse'; url: string }                 // SSE 推送
  | { type: 'event'; eventName: string }         // 事件驱动（组件交互触发）
  | { type: 'manual' };                          // 手动触发
```

#### 5.2 刷新调度器设计

```
┌──────────────────────────────────────────────┐
│              RefreshScheduler                 │
│                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │Timer Pool│  │WS Manager│  │Event Bus│     │
│  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │            │            │            │
│       ▼            ▼            ▼            │
│  ┌──────────────────────────────────────┐    │
│  │        Unified Data Dispatcher       │    │
│  │  (去重、节流、批量合并、优先级队列)     │    │
│  └──────────────────┬───────────────────┘    │
│                     │                        │
│                     ▼                        │
│  ┌──────────────────────────────────────┐    │
│  │     Component Data Update Queue      │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

#### 5.3 关键设计要点

| 要点 | 说明 |
| ------ | ------ |
| **请求去重与合并** | 多个组件引用同一数据源时，只发一次请求，结果共享 |
| **节流与防抖** | 高频事件触发的刷新需节流，避免请求风暴 |
| **优先级队列** | 核心 KPI 指标优先刷新，次要图表可延迟 |
| **断线重连** | WebSocket/SSE 断线后自动重连，支持指数退避 |
| **降级策略** | 实时通道不可用时自动降级为轮询模式 |
| **页面可见性感知** | 页面切到后台时暂停轮询，切回时恢复 |

**为什么重要**：大屏场景下可能有 20~50 个组件同时刷新，如果每个组件独立管理自己的刷新逻辑，会导致请求风暴、内存泄漏、性能崩塌。统一调度器是**公共底座的核心价值之一**。

---

### 原则六：数据缓存与性能优化（Caching & Performance）

**核心思想**：数据模块必须内建多级缓存机制，减少对数据源的直接压力。

#### 6.1 多级缓存架构

```
L1: 组件级缓存（内存）
    ↓ miss
L2: 数据源级缓存（内存 + 时间窗口）
    ↓ miss
L3: 服务端缓存（Redis / 本地缓存）
    ↓ miss
L4: 数据源原始查询
```

#### 6.2 缓存策略配置

```typescript
interface CacheConfig {
  enabled: boolean;
  ttl: number;              // 缓存有效期（秒）
  strategy: 'lru' | 'ttl' | 'stale-while-revalidate';
  maxSize?: number;         // 最大缓存条数
  cacheKey?: string;        // 自定义缓存键
  invalidateOn?: string[];  // 触发失效的事件
}
```

#### 6.3 性能优化要点

| 策略 | 说明 |
| ------ | ------ |
| **Stale-While-Revalidate** | 先返回旧数据渲染，后台异步刷新，避免白屏 |
| **增量更新** | WebSocket 推送 delta 数据而非全量，减少传输量 |
| **数据压缩** | 大数据量场景启用 gzip/protobuf 序列化 |
| **分页/采样** | 超过阈值的数据集自动分页或采样展示 |
| **Web Worker** | 数据解析、转换等 CPU 密集操作放入 Worker 线程 |
| **请求取消** | 组件卸载或参数变更时，取消进行中的请求（AbortController） |

---

### 原则七：数据安全与多租户隔离（Security & Multi-Tenancy）

**核心思想**：作为公共底座，数据模块必须从架构层面保障安全性。

#### 7.1 安全分层

```
┌─────────────────────────────────────────┐
│           认证层 (Authentication)        │
│     Token / OAuth2 / API Key 验证       │
├─────────────────────────────────────────┤
│           授权层 (Authorization)         │
│   数据源访问权限 / 行级过滤 / 字段脱敏    │
├─────────────────────────────────────────┤
│           传输层 (Transport)             │
│     HTTPS / WSS / 数据加密传输           │
├─────────────────────────────────────────┤
│           存储层 (Storage)               │
│   连接凭证加密存储 / 审计日志             │
├─────────────────────────────────────────┤
│           隔离层 (Isolation)             │
│   多租户数据隔离 / 沙箱执行              │
└─────────────────────────────────────────┘
```

#### 7.2 关键安全要求

| 要求 | 实现方式 |
| ------ | ---------- |
| **凭证不落前端** | 数据库连接串、API Secret 等只存服务端，前端通过 dataSourceId 引用 |
| **SQL 注入防护** | 参数化查询，禁止拼接 SQL；脚本类数据源需沙箱隔离 |
| **行级数据权限** | 支持根据用户角色自动注入 WHERE 条件 |
| **字段级脱敏** | 敏感字段（手机号、身份证）支持配置脱敏规则 |
| **请求频率限制** | 防止恶意高频查询，按租户/用户限流 |
| **审计日志** | 记录谁在什么时间查了什么数据源、返回了多少条数据 |
| **脚本沙箱** | JS/Groovy 脚本数据源必须在沙箱中执行，禁止访问系统资源 |

**为什么重要**：公共底座意味着**多团队、多项目共用**。一个安全漏洞可能导致跨租户数据泄露，这是不可接受的。

---

### 原则八：数据链路的可观测性与容错（Observability & Fault Tolerance）

**核心思想**：数据从源到渲染的全链路必须可追踪、可诊断、可降级。

#### 8.1 全链路追踪

```
DataSource.query()
  ├── [LOG] 请求发起 {sourceId, params, timestamp}
  ├── [LOG] 适配器选择 {adapterType}
  ├── [LOG] 缓存查询 {cacheHit: true/false}
  ├── [LOG] 原始请求 {url/sql, duration: 230ms}
  ├── [LOG] 数据转换 {transforms: [filter, sort], inputRows: 1000, outputRows: 50}
  ├── [LOG] 协议标准化 {payloadType: 'series', fieldCount: 5}
  └── [LOG] 数据投递 {componentId, renderTime: 12ms}
```

#### 8.2 容错与降级策略

| 异常场景 | 降级策略 |
| ---------- | ---------- |
| 数据源连接失败 | 显示缓存数据 + "数据源离线"提示 |
| 查询超时 | 返回上次成功数据 + 超时警告 |
| 数据格式异常 | 字段级容错，缺失字段显示默认值，不导致整个组件崩溃 |
| 数据为空 | 显示"暂无数据"占位，可配置自定义空状态 |
| 部分组件失败 | 单组件隔离，不影响其他组件渲染（Error Boundary） |
| 网络中断 | 自动重连 + 恢复后增量刷新 |

#### 8.3 设计器态 vs 运行态的数据诊断

| 阶段 | 能力 |
|------|------|
| **设计态** | 数据源连接测试、查询预览、字段映射校验、数据量预估 |
| **运行态** | 实时请求监控面板、错误率统计、刷新延迟指标、慢查询告警 |

---

## 三、数据模块整体架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        大屏设计器底座                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    设计器画布 (Canvas)                     │   │
│  │   Component A    Component B    Component C    ...       │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │ DataBinding (声明式)                   │
│  ┌──────────────────────▼───────────────────────────────────┐   │
│  │                  Data Binding Engine                       │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐  │   │
│  │  │Field    │ │Transform │ │Refresh    │ │Cache      │  │   │
│  │  │Mapping  │ │Pipeline  │ │Scheduler  │ │Manager    │  │   │
│  │  └─────────┘ └──────────┘ └───────────┘ └───────────┘  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │ Unified DataProtocol                   │
│  ┌──────────────────────▼───────────────────────────────────┐   │
│  │                  DataSource Registry                       │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────────┐  │   │
│  │  │HTTP  │ │JSON  │ │WS    │ │MySQL │ │Custom Plugin │  │   │
│  │  │Adapter│ │Adapter│ │Adapter│ │Adapter│ │  Adapter    │  │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────────────┘  │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼───────────────────────────────────┐   │
│  │              Security / Auth / Audit / Sandbox             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Observability (Logging / Metrics / Tracing)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、数据模块 DSL 设计（序列化 Schema）

作为设计器底座，数据配置最终需要被**序列化为 JSON**存储。以下是推荐的数据配置 DSL 结构：

```json
{
  "dataSources": [
    {
      "id": "ds_001",
      "name": "销售数据接口",
      "type": "http",
      "config": {
        "url": "https://api.example.com/sales",
        "method": "GET",
        "headers": { "Authorization": "Bearer ${token}" },
        "params": { "date": "{{global.dateRange}}" }
      },
      "cache": { "enabled": true, "ttl": 60 },
      "refresh": { "type": "polling", "interval": 30000 }
    }
  ],
  "bindings": [
    {
      "componentId": "chart_001",
      "dataSourceId": "ds_001",
      "fieldMapping": {
        "x": "month",
        "y": "revenue",
        "series": "region"
      },
      "transforms": [
        { "type": "filter", "config": { "field": "revenue", "op": ">", "value": 0 } },
        { "type": "sort", "config": { "field": "month", "order": "asc" } }
      ],
      "refresh": { "type": "polling", "interval": 30000 }
    }
  ],
  "globalParams": {
    "dateRange": { "type": "dateRange", "default": ["2026-01-01", "2026-08-09"] },
    "region": { "type": "select", "options": ["华东", "华南", "华北"] }
  }
}
```

---

## 五、原则优先级与实施建议

| 优先级 | 原则 | 理由 |
| -------- | ------ | ------ |
| 🔴 P0 | 数据与视图解耦 | 架构根基，后期改动成本极高 |
| 🔴 P0 | 统一数据协议 | 组件生态扩展的前提 |
| 🔴 P0 | 数据源插件化 | 公共底座的核心开放能力 |
| 🟡 P1 | 声明式数据绑定 | 设计器保存/加载/复制的基础 |
| 🟡 P1 | 多策略刷新调度 | 大屏实时性的核心保障 |
| 🟡 P1 | 数据安全与隔离 | 公共平台的底线要求 |
| 🟢 P2 | 多级缓存与性能优化 | 随组件规模增长逐步完善 |
| 🟢 P2 | 可观测性与容错 | 生产环境稳定运行的保障 |

---

## 六、总结

公共大屏设计器底座的数据模块，本质上是在构建一个 **"数据中间件"**——它向上为无限扩展的组件生态提供标准化的数据供给，向下为无限多样的数据源提供统一的接入抽象。

其设计应始终围绕一个核心理念：

> **让数据流动变得可预测、可配置、可扩展、可观测。**

具体而言：

- **可预测**：统一协议 + 标准化错误处理，开发者能预期任何数据源的行为
- **可配置**：声明式绑定 + DSL 序列化，数据关系可通过 UI 配置而非硬编码
- **可扩展**：插件化适配器 + 开放 SDK，新数据源接入无需修改核心代码
- **可观测**：全链路日志 + 性能指标 + 容错降级，生产环境可运维

这四大特性，是区分"一个大屏项目"和"一个大屏设计器底座"的根本分水岭。

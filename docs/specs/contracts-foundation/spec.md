# Contracts Foundation Spec

> 状态：生效中
> 最近更新：2026-08-03
> 定位：冻结 `@base-screen/contracts` 首个 canonical document、JSON boundary、parser、诊断、序列化和 JSON Schema 的可验收契约
> 依据：[ADR-0002](../../decisions/ADR-0002-canonical-screen-document-and-migrations.md)（已接受，2026-08-03）

## 1. 依据与授权

本 Spec 由已接受的 ADR-0002 授权，自 2026-08-03 起生效，作为 P0 Contracts 实现和验收的唯一行为依据。

实现已开始后，任何改变 `schemaVersion`、文档范围、JSON boundary、迁移策略或序列化规则的修改，必须先更新 ADR 与本 Spec，不允许实现自行选择另一套行为。

## 实施状态

2026-08-03 在 Node 22.20.0 完成 P0 实现并通过 `pnpm verify:m0`（format、lint、typecheck、test、build、package/boundary/api check、tarball consumer 与 artifact subpath smoke）。Node 24 验证由 CI matrix 执行。实施中遇到的工具链与验证问题（vitest DOM lib、Zod toJSONSchema、tarball workspace 依赖解析等）见[门禁排障记录](../../troubleshooting/verify-m0-troubleshooting.md)。

## 2. 目标

本阶段建立后续 Core、Plugin、Renderer、Engine、SDK 和宿主共同消费的最小持久化根契约。完成后必须具备：

- 唯一的 `ScreenDocument` TypeScript 类型和 runtime parser。
- 可复用的有限、无环、无危险键 JSON value parser。
- strict canonical shape、资源上限和跨引用校验。
- 稳定 diagnostic code、path 和确定性排序。
- RFC 8785 语义的 canonical document serialization。
- 与 runtime parser 同源且可从发布 tarball 获取的 JSON Schema。
- 不依赖 DOM、插件目录、宿主状态或其他 workspace package 的 Node 测试闭环。

## 3. 非目标

本阶段不包含：

- Canvas 命令、组件增删改、历史、undo/redo 或 Store。
- Material Manifest、props schema、Custom Element tagName 或物料可用性校验。
- Blueprint、DSL、动态变量或 host-resource intent。
- URL、Header、Token、Cookie、SQL、脚本或连接配置。
- Nebula importer 或其他外部格式识别。
- 项目 load/save/publish Adapter 方法。
- React、Vue、Renderer、Designer 或 Viewer 运行时。
- 对 `schemaVersion: 0` 或任何未发布历史版本的生产迁移。
- 可由消费者注入或替换的 migration registry。
- JSON text parser、网络 payload 解压限制或传输层鉴权。
- 对 Envelope `metadata` 中任意 string 做启发式 secret 分类或 DLP 扫描。

不得用空字段、占位 API 或 `unknown` 扩展槽提前保留这些能力。

## 4. Package 边界

`@base-screen/contracts` 必须继续满足：

- 无 workspace dependency。
- 运行时代码只使用 `ES2022`，不引用 DOM 或 Node global。
- Zod 4 仅作为内部 runtime schema 实现，不从 public entry 导出。
- 默认根入口无注册、global mutation、I/O、时间或随机数副作用。
- public `.d.ts` 不出现 `zod`、React、Vue、DOM、Router、Store、Nebula 或宿主 DTO 类型。
- production dependency 只声明源码真实使用的 schema dependency。
- package 继续是 ESM-only、`sideEffects: false`，并可由真实 tarball consumer 导入。

本阶段只增加根入口和一个 JSON artifact 子路径，不增加 `/auto-register` 或框架入口。

## 5. Public API

### 5.1 JSON 类型

根入口必须导出：

```ts
export type ScreenJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ScreenJsonValue[]
  | { readonly [key: string]: ScreenJsonValue };

export type ScreenJsonObject = Readonly<Record<string, ScreenJsonValue>>;
```

`readonly` 是公共类型约束。实现必须返回 detached plain JSON，但本阶段不承诺结果经过 `Object.freeze()`。

### 5.2 Document 类型

根入口必须导出：

```ts
export const SCREEN_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type ScreenDocumentSchemaVersion =
  typeof SCREEN_DOCUMENT_SCHEMA_VERSION;

export interface ScreenDocument {
  readonly schemaVersion: ScreenDocumentSchemaVersion;
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenStaticVariable[];
}

export interface ScreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
}

export interface ScreenPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

export interface ScreenComponentStatus {
  readonly locked: boolean;
  readonly hidden: boolean;
}

export interface ScreenComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position: ScreenPosition;
  readonly size: ScreenSize;
  readonly rotation: number;
  readonly zIndex: number;
  readonly status: ScreenComponentStatus;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly dataSource: ScreenStaticDataSource | null;
}

export interface ScreenStaticDataSource {
  readonly type: 'static';
  readonly value: ScreenJsonValue;
}

export interface ScreenStaticVariable {
  readonly type: 'static';
  readonly name: string;
  readonly value: ScreenJsonValue;
}
```

所有字段必填。Parser 不补默认值，不接受 alias，不 coercion，不 trim 字符串，也不 strip 未知字段。

### 5.3 Project Envelope 类型

根入口必须导出：

```ts
export interface ScreenProjectEnvelope {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly description: string | null;
  readonly document: ScreenDocument;
  readonly metadata: ScreenJsonObject;
}
```

Envelope 是宿主项目元数据与 canonical document 的边界，不属于 Document，不参与 document schemaVersion 或后续 undo/redo。

### 5.4 Diagnostics

根入口必须导出：

```ts
export type ScreenDiagnosticSeverity = 'error' | 'warning';

export type ScreenDiagnosticPath = readonly (string | number)[];

export type ScreenDiagnosticCode =
  | 'DOCUMENT_NOT_OBJECT'
  | 'DOCUMENT_VERSION_MISSING'
  | 'DOCUMENT_VERSION_UNSUPPORTED'
  | 'DOCUMENT_VERSION_FUTURE'
  | 'DOCUMENT_UNKNOWN_FIELD'
  | 'DOCUMENT_FIELD_INVALID'
  | 'DOCUMENT_LIMIT_EXCEEDED'
  | 'JSON_VALUE_INVALID'
  | 'JSON_LIMIT_EXCEEDED'
  | 'JSON_NUMBER_NON_FINITE'
  | 'JSON_CYCLE'
  | 'JSON_PROTOTYPE_INVALID'
  | 'JSON_DANGEROUS_KEY'
  | 'COMPONENT_ID_DUPLICATE'
  | 'COMPONENT_PARENT_MISSING'
  | 'COMPONENT_PARENT_SELF'
  | 'COMPONENT_PARENT_CYCLE'
  | 'COMPONENT_TYPE_INVALID'
  | 'COMPONENT_GEOMETRY_INVALID'
  | 'VARIABLE_NAME_INVALID'
  | 'VARIABLE_NAME_DUPLICATE'
  | 'MIGRATION_STEP_MISSING'
  | 'MIGRATION_FAILED'
  | 'ENVELOPE_INVALID'
  | 'ENVELOPE_UNKNOWN_FIELD'
  | 'DIAGNOSTIC_LIMIT_REACHED';

export interface ScreenDiagnostic {
  readonly severity: ScreenDiagnosticSeverity;
  readonly code: ScreenDiagnosticCode;
  readonly path: ScreenDiagnosticPath;
  readonly message: string;
}

export type ScreenParseResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ScreenDiagnostic[];
    };
```

本阶段 direct current-version parse 成功时 `diagnostics` 必须为空。Result 保留成功 warning 能力，供未来迁移或 importer 的独立 API 使用。

### 5.5 Functions 与 serializer error

根入口必须导出：

```ts
export function parseScreenJsonValue(
  input: unknown,
  options?: ScreenJsonParseOptions,
): ScreenParseResult<ScreenJsonValue>;

export interface ScreenJsonParseOptions {
  readonly maxBytes?: number;
}

export function parseScreenDocument(
  input: unknown,
): ScreenParseResult<ScreenDocument>;

export function isScreenMaterialType(value: unknown): value is string;

export function parseScreenProjectEnvelope(
  input: unknown,
): ScreenParseResult<ScreenProjectEnvelope>;

export class ScreenSerializationError extends Error {
  readonly name: 'ScreenSerializationError';
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export function serializeScreenDocument(document: ScreenDocument): string;

export const SCREEN_DOCUMENT_JSON_SCHEMA: ScreenJsonObject;
```

公共 API 不导出 Zod schema、preflight helper、clone helper、graph helper、migration step map 或可变 limits object。

`parseScreenJsonValue()` 默认使用 §8 的 10 MiB 独立 JSON budget。跨包协议可传入 `maxBytes` 将预算收紧到 `1..10 MiB` 的整数；该选项只允许收紧，不能扩大 Contracts 的全局 JSON 限制。预算超限仍返回 `JSON_LIMIT_EXCEEDED`，上层协议可以在保留 path、顺序和其他 JSON diagnostics 的前提下映射到自身已冻结的 limit code。非法 option 是调用方错误，抛出 `RangeError`，不读取输入或执行 clone。

## 6. Canonical Shape

### 6.1 Root 与嵌套 object

以下 object 都是 strict canonical object：

- Document root。
- `canvas`。
- component node。
- `position`、`size` 和 `status`。
- static `dataSource`。
- static variable。
- Project Envelope root。

这些 object 出现任何未声明 own key 时解析失败。`props`、`style`、`value` 和 `metadata` 是开放 JSON 数据，但仍受统一 JSON boundary、危险键和资源上限约束。

### 6.2 Canvas

Canvas 字段规则：

| 字段 | 规则 |
| --- | --- |
| `width` | integer，`1..100000` |
| `height` | integer，`1..100000` |
| `backgroundColor` | `1..128` Unicode code points，不含 C0 或 DEL control character |

Contracts 不解析 CSS color，不根据 viewport 修正尺寸。

### 6.3 Component

Component 字段规则：

| 字段 | 规则 |
| --- | --- |
| `id` | `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` |
| `type` | §6.4 的 material identity |
| `name` | `1..256` Unicode code points，至少一个非空白字符，不含 C0 或 DEL |
| `parentId` | `null` 或合法 component id |
| `position.x/y` | finite number，`-1000000..1000000` |
| `size.width/height` | finite number，`> 0` 且 `<= 1000000` |
| `rotation` | finite number，`-180 <= value < 180` |
| `zIndex` | integer，`0..1000000` |
| `status.locked/hidden` | boolean |
| `props/style` | JSON object |
| `dataSource` | `null` 或 strict static data source |

Parser 不归一 rotation、不截断坐标、不把 numeric string 转 number。

### 6.4 Material identity

`type` 必须：

- 是 ASCII string，长度 `1..128`。
- 匹配 `^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*/v[1-9][0-9]*$`。
- 表达 namespaced material identity 和独立 major，例如 `acme.kpi-card/v1`。

Contracts 不验证该 type 是否已安装或启用，也不从 type 推导 package version、tagName 或 implementationVersion。

### 6.5 Static data 与 variables

Static data source 只接受精确字段：

```ts
{ type: 'static', value: ScreenJsonValue }
```

Variable 只接受精确字段：

```ts
{ type: 'static', name: string, value: ScreenJsonValue }
```

Variable name 必须匹配 `^[A-Za-z_][A-Za-z0-9_]{0,127}$`。名称比较大小写敏感，Document 内不得重复。

### 6.6 Project Envelope

Envelope 字段规则：

| 字段 | 规则 |
| --- | --- |
| `projectId` | opaque non-empty string，最大 256 UTF-8 bytes，不含 C0 或 DEL |
| `revision` | opaque non-empty string，最大 512 UTF-8 bytes，不含 C0 或 DEL |
| `name` | `1..256` Unicode code points，至少一个非空白字符，不含 C0 或 DEL |
| `description` | `null` 或最大 4096 Unicode code points 的 string |
| `document` | 通过 `parseScreenDocument()` |
| `metadata` | JSON object |

Parser 不解释 projectId/revision 格式，不从 Envelope 字段写入 Document，也不把 metadata 传给物料。

`metadata` 只用于宿主认可的非执行性展示、索引或审计信息。Contracts 能校验其 JSON 结构和资源限制，但不能从任意 key/value 可靠判断一个 string 是否为 Token、Cookie、Header、URL、SQL 或连接配置；写入 Envelope 前的分类、脱敏和权限规则由 Host Adapter Spec 冻结并由宿主执行。Base Screen 的任何 runtime 都不得把 metadata 解释为请求或代码，宿主也不得把不适合持久化和导出的敏感值放入该字段。

## 7. JSON Boundary

### 7.1 接受的 JavaScript 值

JSON parser 只接受：

- `null`、boolean、string 和 finite number。
- dense Array，且除标准 `length` 和连续 index 外没有额外 own property。
- prototype 为 `Object.prototype` 或 `null` 的普通 object。
- own enumerable data property，key 为合法 Unicode string。

Frozen/sealed object、只读数组和普通共享引用可以输入。共享引用按每个出现路径复制，输出不保留引用身份。

### 7.2 拒绝的 JavaScript 值

JSON parser 必须拒绝：

- `undefined`、bigint、symbol 和 function。
- `NaN`、`Infinity` 和 `-Infinity`。
- Date、Map、Set、RegExp、Error、Promise、DOM Node 和 class instance。
- custom prototype object。
- sparse Array、Array 的额外 own property、symbol-keyed property、accessor property，或除 Array 内建 `length` 外的 non-enumerable data property。
- 当前递归路径中的循环引用。
- 任意层级精确名为 `__proto__`、`prototype` 或 `constructor` 的 object key。
- 包含 unpaired UTF-16 surrogate 的 string value 或 object key。

实现不得通过读取 getter 完成校验。Proxy trap 已经是调用方 realm 中运行的代码，本 parser 不被定义为隔离恶意 JavaScript Proxy 的安全沙箱。

### 7.3 Detached output

成功结果必须：

- 与 input 没有 object/array identity 共享。
- 只包含标准 Array、`Object.prototype` plain object 和 primitive。
- 不保留 input prototype、property descriptor、symbol、accessor 或共享引用身份。
- 保留数组顺序、object key/value、string 和 number 的语义值。
- 将 `-0` 保留到内存结果；只在 serialization 时输出为 `0`。

Parser 不 mutate input。失败也不得删除字段、写默认值或部分转换原对象。

## 8. 资源上限

### 8.1 固定 limits

| 限制 | 值 |
| --- | --- |
| canonical serialized Document | 10 MiB UTF-8，`10 * 1024 * 1024` bytes |
| parsed Project Envelope | 10 MiB canonical UTF-8 bytes |
| standalone `parseScreenJsonValue` input | 10 MiB canonical UTF-8 bytes |
| JSON container nesting depth | 64 |
| components | 10,000 |
| variables | 1,000 |
| 单个 static data source `value` | 1 MiB canonical UTF-8 bytes |
| 通用 string value 或 object key | 65,536 UTF-8 bytes |
| object own keys | 10,000 per object |
| array items | 100,000 per array |
| returned diagnostics | 100 |

字段专用限制优先于通用 string 限制。

### 8.2 计数语义

- Root object 是 container depth 1；每进入一个 object 或 array 增加 1。
- Shared object 每次出现都按序列化后的独立树计入 byte、depth 和 item budget。
- Canonical byte 数使用 UTF-8，包含 JSON punctuation、escaped string 和 canonical number 表示。
- Object key 排序不改变 byte budget；preflight 必须在任何 schema deep clone 前算出最终精确值。
- 输入超过可确定的 count/depth/string 上限时必须立即停止该 preflight，不先创建 detached clone。
- 传输层仍须在 `JSON.parse()` 前限制原始 payload；本 API 接收 `unknown`，不能替代压缩包或网络 body 上限。

Document 上下文的 resource failure 返回 `DOCUMENT_LIMIT_EXCEEDED`，standalone JSON boundary 使用 `JSON_LIMIT_EXCEEDED`，Envelope 自身总量使用 `ENVELOPE_INVALID`。Path 指向首次确定超限的容器或字段。

## 9. Parse Pipeline

### 9.1 Document 顺序

`parseScreenDocument()` 固定执行：

```text
unknown input
    -> root object check
    -> JSON boundary and exact resource preflight
    -> schemaVersion inspection
    -> supported old version migration chain
    -> current strict shape validation
    -> component and variable cross-reference validation
    -> detached canonical output
```

任何阶段失败后，不运行依赖该阶段成立的后续检查。普通无效输入只返回 `ok: false`，不得抛异常。

`parseScreenProjectEnvelope()` 先对整个 Envelope 执行 JSON boundary 和 10 MiB exact byte preflight，再验证 Envelope shape，最后调用 Document pipeline。Envelope 总量超限时只返回 root `ENVELOPE_INVALID`，不继续解析内嵌 Document；因此同一输入不会同时返回 Envelope total limit 和 nested Document size diagnostic。

### 9.2 Version dispatch

Marker 行为：

| Input | Diagnostic |
| --- | --- |
| 无 own `schemaVersion` | `DOCUMENT_VERSION_MISSING` at `['schemaVersion']` |
| integer `> 1` | `DOCUMENT_VERSION_FUTURE` at `['schemaVersion']` |
| 非 integer、非 number、`<= 0` 或当前不支持的旧 marker | `DOCUMENT_VERSION_UNSUPPORTED` at `['schemaVersion']` |
| `1` | 进入 current strict parser |

Future version 不按 current shape 尝试解析，不 strip 字段，不 fallback。

### 9.3 No normalization

Parser 明确不执行：

- optional field defaulting。
- legacy alias mapping。
- string trim 或 case conversion。
- coordinate、rotation、zIndex clamp。
- unknown field strip。
- material availability lookup。
- external format detection。

创建命令和 importer 必须先产出完整 candidate，再调用 canonical parser。

## 10. Cross-Reference Validation

### 10.1 Component IDs

- ID 按 code unit 精确、大小写敏感比较。
- 第一次出现建立 identity；每个后续重复项在其 `id` path 返回 `COMPONENT_ID_DUPLICATE`。
- `parentId` 可以引用数组中更早或更晚的 component。
- 非 `null` parentId 不存在时返回 `COMPONENT_PARENT_MISSING`。
- `parentId === id` 返回 `COMPONENT_PARENT_SELF`。

### 10.2 Parent cycles

Parent graph 在所有 ID 唯一且 parent reference 存在后检查。

- Graph traversal 必须是 deterministic、非递归或受 depth guard 保护，不因 10,000 节点耗尽 call stack。
- 每个 cycle 只返回一个 `COMPONENT_PARENT_CYCLE`。
- Diagnostic path 指向该 cycle 中 input index 最小节点的 `parentId`。
- 多个独立 cycle 按最小 input index 排序。

Contracts 不要求只能有一个 `parentId: null` root，也不判断容器物料是否允许 children；这些属于 Core 和 Material 语义。

### 10.3 Variables

- Variable name 按 code unit 精确、大小写敏感比较。
- 每个重复项在其 `name` path 返回 `VARIABLE_NAME_DUPLICATE`。
- 本阶段 props/style 中的 string 不被解释为 variable reference。

## 11. Diagnostics Contract

### 11.1 Path

Path 从传入值 root 开始，使用 string 表示 object key，number 表示 array index。例如：

```ts
['components', 3, 'position', 'x']
['variables', 1, 'name']
['document', 'canvas', 'width']
```

Envelope 内嵌 Document diagnostic 必须加 `document` 前缀，包括内嵌 parser 的 diagnostic limit sentinel。Parser 自身 root 的问题使用空 path `[]`；因此独立 Document 的 sentinel path 是 `[]`，嵌入 Envelope 后是 `['document']`。

### 11.2 Code 使用

- `DOCUMENT_FIELD_INVALID` 用于 canvas、component 非 geometry 字段、status、static data shape 等 current schema 错误。
- `COMPONENT_GEOMETRY_INVALID` 只用于 position、size、rotation 和 zIndex。
- `COMPONENT_TYPE_INVALID` 只用于 material identity。
- `VARIABLE_NAME_INVALID` 只用于 variable name 格式。
- `JSON_VALUE_INVALID` 用于不属于 JSON data model 的值、descriptor、array shape 或 invalid Unicode。
- `JSON_LIMIT_EXCEEDED` 只用于 standalone JSON value 的 depth、byte、string 或 container limit。
- `JSON_PROTOTYPE_INVALID` 用于非标准 object prototype。
- `ENVELOPE_INVALID` 用于已知 Envelope 字段的缺失、类型或限制错误。
- Unknown strict Document key 使用 `DOCUMENT_UNKNOWN_FIELD`；unknown Envelope root key 使用 `ENVELOPE_UNKNOWN_FIELD`。

### 11.3 Ordering 与上限

Diagnostics 必须 deterministic。实现完成一个 validation phase 后，按 path segment 排序，再按 code 排序；number segment 在 string segment 前，segment 类型相同时按 numeric 或 UTF-16 code unit 顺序比较。

达到 100 条时：

- 保留排序后的前 99 条。
- 第 100 条是 `DIAGNOSTIC_LIMIT_REACHED`，path 为 `[]`。
- 不再继续收集可能泄漏或放大输入的数据。

消费者不得依赖 message 文案或 diagnostic ordinal 判断错误类别，应使用 code 和 path。

### 11.4 Data minimization

Diagnostic message：

- 可以包含 limit 名、预期类型或安全截断后的 field name。
- 不得包含完整 props、style、data source value、metadata、Document 或原始 input dump。
- 不得包含 token-like value、stack trace 或宿主上下文。
- field name 截断后不得超过 128 Unicode code points。

Parser 内部 invariant 失败可以抛异常，但 message 同样不得携带原始 input；普通 schema、版本、资源和引用失败不得进入该异常路径。

## 12. Canonical Serialization

`serializeScreenDocument()` 必须先以等价于 current parser 的完整规则重新校验 runtime input。TypeScript 类型不能替代 runtime validation。

有效输入输出：

- RFC 8785 JSON Canonicalization Scheme 语义。
- Object property name 按 UTF-16 code unit lexicographic order 排序。
- 不输出 insignificant whitespace 或 trailing newline。
- String 使用 JSON escaping，拒绝 unpaired surrogate。
- Number 使用 ECMAScript JSON number serialization；`-0` 输出为 `0`。
- 相同 canonical value 产生完全相同 string 和 UTF-8 bytes。

无效 runtime input 必须抛 `ScreenSerializationError`：

- `name` 固定为 `ScreenSerializationError`。
- `diagnostics` 使用与 parser 相同 code/path/message 规则。
- Error message 是固定摘要，不包含 document 内容。
- 不返回部分 string，不尝试修复输入。

必须满足：

```text
parse(document) -> serialize -> JSON.parse -> parse
```

第二次 parse 的 value 与第一次语义深相等，serialization bytes 重复执行完全一致。

## 13. JSON Schema Artifact

实现必须提供：

- 根入口常量 `SCREEN_DOCUMENT_JSON_SCHEMA`。
- package export `@base-screen/contracts/screen-document.schema.json`。
- tarball 内 `dist/screen-document.schema.json`。
- JSON Schema Draft 2020-12 标记。
- `$id: "urn:base-screen:schema:screen-document:1"`。
- 对 strict object 使用 `additionalProperties: false`。
- 可表达的 required、type、const、pattern、min/max、array 和 string 限制。

生成规则：

- Runtime schema 与 artifact 必须来自同一权威 source definition；不得手写第二套 canonical JSON Schema。
- Artifact 必须 deterministic；重复 build 不改变内容。
- Root constant 是 detached JSON-compatible object，默认 import 不读取文件系统。
- Zod instance 和 Zod-specific metadata 不进入 root constant 或 `.d.ts`。
- Drift test 必须证明 root constant 和 emitted artifact 都是该 source definition 的一致产物。

JSON Schema 不能完整表达 JavaScript prototype、cycle、canonical byte size、component parent graph 和跨数组 uniqueness。Parser 是规范实现；artifact 不得宣称单独验证即可替代 `parseScreenDocument()`。

## 14. Migration Foundation

本阶段 current version 为 1，没有生产旧版本输入。

实现要求：

- Parser 内部 version dispatch 为未来一步迁移保留单一受控入口。
- 不发布 migration registration、arbitrary transform hook 或 fake version type。
- `schemaVersion: 0` 返回 `DOCUMENT_VERSION_UNSUPPORTED`，不执行 synthetic migration。
- Synthetic migration harness 只在 package test 内验证连续 step、缺 step、失败、纯输入和确定性。
- Harness 使用测试专用 marker，不写入 public JSON Schema、fixture 或 declaration。
- Migration function 不得读取时间、随机数、DOM、网络、环境变量、Host Adapter 或 plugin registry。

直到真实 schema upgrade 的 ADR/Spec 被接受，不导出 `migrateScreenDocument()`，也不承诺 migration warning 的具体公共 API。

## 15. Implementation Shape

实现按职责至少分离：

- 公共 data types 和 diagnostics。
- JSON boundary preflight 与 detached clone。
- Document runtime schema 和 cross-reference validation。
- Project Envelope validation。
- Canonical serialization。
- JSON Schema generation/artifact。
- Internal version dispatch 和 migration harness。

可以根据 cohesion 合并小模块，但不得形成另一套 canonical parser。单个 hand-written contract schema/declaration/migration 文件以 400 行为 review threshold，超过 600 行必须按 contract 或责任拆分。

Zod 负责适合其表达的 strict shape 和 primitive constraint；prototype、descriptor、cycle、byte budget、graph 和 canonical serialization 使用显式实现。不得通过 stringify/parse 代替 preflight，因为该做法会执行 getter、静默转换 non-finite number、丢失 `undefined` 或把 sparse slot 转成 `null`。

## 16. Test Matrix

### 16.1 Positive fixtures

至少覆盖：

- 最小空 Document：空 components、空 variables、完整 canvas。
- 多 root 和 parent 指向后出现节点的合法 Document。
- props/style/static value 中的深层 JSON。
- `Object.create(null)` 输入转换为标准 detached object。
- frozen input、共享引用和 `-0`。
- 合法 Project Envelope 与 metadata。
- Unicode display name、description、value 和 key。

### 16.2 Negative fixtures

至少覆盖：

- 根非 object、缺 marker、marker 类型错误、0 和 future marker。
- 每一级 strict object 的 unknown field。
- 缺 required field，不允许 optional/default/coercion。
- 非 finite number、function、symbol、bigint、class instance 和 custom prototype。
- getter 未被调用、symbol key、non-enumerable property、sparse array 和 extra array property。
- 三个 dangerous key 在任意开放 JSON 层级出现。
- direct cycle、间接 cycle、共享非 cycle 引用。
- unpaired high/low surrogate in value 和 key。
- 每项资源上限的 boundary value 与 `limit + 1`。
- duplicate component id、missing parent、self parent、single/multiple parent cycle。
- invalid material type、geometry 和 variable name；duplicate variable name。
- Envelope unknown field、invalid opaque field 和 prefixed document diagnostic。
- serializer 收到伪造的 invalid typed object。

### 16.3 Determinism 与 mutation

至少验证：

- 相同 input 重复 parse 的 value 和 diagnostics 深相等。
- 不同 insertion order 的等价 Document 得到相同 serialization bytes。
- parse、failed parse、serialize 和 migration harness 都不修改 input。
- Parser 输出与所有 input object/array reference 不同。
- Shared input reference 在输出中成为两个独立 subtree。
- Diagnostic message 不包含 fixture 中的 canary secret。
- Diagnostic truncation 固定为 99 条具体错误加一个 limit diagnostic。

### 16.4 Artifact 与 package

至少验证：

- JSON Schema root constant 与 emitted artifact 深相等。
- Artifact required/strict/const/limit 与 runtime schema 的可表达部分一致。
- Public declaration 不包含 `zod` 或 DOM 类型。
- Node ESM consumer 能 parse、serialize 并 import JSON artifact。
- Tarball 包含 LICENSE、JS、declaration、source map 和 schema artifact。
- Root import 没有 global side effect。
- `contracts` 没有 workspace dependency，其他生产包尚不需要为 P0 改 API。

`@base-screen/testing` 可以增加公开 Document fixture 与 parser conformance helper，但只能从外部消费 `@base-screen/contracts`；production package 不得 import testing。

## 17. Requirements

### R1：唯一 current document

系统 SHALL 只输出 `ScreenDocument` current canonical shape，公共类型不使用 `V1` 后缀，也不公开历史 shape union。

场景：解析合法 version 1 Document

- GIVEN 输入满足所有 shape、JSON 和引用规则
- WHEN 调用 `parseScreenDocument()`
- THEN 返回 `ok: true`
- AND value 是 detached `ScreenDocument`
- AND diagnostics 为空

### R2：Strict schema

系统 SHALL 拒绝所有 canonical object 的 unknown field，不静默 strip。

场景：component 包含拼写错误的 `postion`

- WHEN 调用 parser
- THEN 返回 `DOCUMENT_UNKNOWN_FIELD`
- AND path 指向该 component 的 `postion`
- AND input 保持不变

### R3：JSON fail closed

系统 SHALL 拒绝非 JSON value、危险键、非法 prototype 和 cycle。

场景：props 包含 `constructor` key

- WHEN 调用 parser
- THEN 返回 `JSON_DANGEROUS_KEY`
- AND 不返回部分 Document

### R4：Resource limits

系统 SHALL 在无界 detached clone 前执行 depth、count、string 和 container limit。

场景：components 数量为 10,001

- WHEN 调用 parser
- THEN 返回 `DOCUMENT_LIMIT_EXCEEDED`
- AND path 为 `['components']`

### R5：Detached output

系统 SHALL 不向调用方返回 input reference。

场景：两个 props key 指向同一个 object

- WHEN parse 成功
- THEN 两个输出 subtree 语义相等
- AND 彼此及与 input 的 reference 都不同

### R6：Reference integrity

系统 SHALL 稳定拒绝重复 ID、悬空 parent、自指和 parent cycle。

场景：三个 components 形成 parent cycle

- WHEN 调用 parser
- THEN 返回一个 `COMPONENT_PARENT_CYCLE`
- AND path 指向 cycle 中 input index 最小节点的 `parentId`

### R7：Version dispatch

系统 SHALL 在 current shape parse 前拒绝 future marker。

场景：`schemaVersion` 为 2

- WHEN 调用 parser
- THEN 返回 `DOCUMENT_VERSION_FUTURE`
- AND 不尝试按 version 1 strip 或解析字段

### R8：Canonical bytes

系统 SHALL 对语义相同的 canonical Document 产生相同 UTF-8 bytes。

场景：object insertion order 不同

- WHEN 分别调用 `serializeScreenDocument()`
- THEN string 完全相同
- AND `-0` 位置输出 `0`

### R9：Envelope separation

系统 SHALL 分离项目元数据和 Document。

场景：解析 Project Envelope

- THEN projectId/revision/metadata 不进入 `value.document`
- AND nested Document 错误 path 以 `document` 开头

### R10：Schema parity

系统 SHALL 从发布包提供与 runtime parser 同源的 current JSON Schema。

场景：真实 tarball consumer

- WHEN import root constant 和 schema artifact
- THEN 两者深相等
- AND artifact 的 schemaVersion const 为 1

### R11：Pure package boundary

系统 SHALL 可在无 DOM 的 Node 环境独立运行。

场景：Node ESM import contracts

- THEN import 不访问 window/document/customElements
- AND public declaration 不引用其他 workspace package 或 framework type

### R12：Migration restraint

系统 SHALL 不把 synthetic migration 变成公开历史契约。

场景：输入 `schemaVersion: 0`

- THEN 返回 `DOCUMENT_VERSION_UNSUPPORTED`
- AND public exports 不存在 consumer-configurable migration registry

## 18. 实施顺序

1. ADR-0002 接受，本 Spec 转为“生效中”。
2. 增加 Zod 4 production dependency，并建立 JSON、diagnostic 和 public type 模块。
3. 实现无 clone 的 JSON preflight、限制计数和 detached clone。
4. 实现 current Document strict schema、version dispatch 和 cross-reference checks。
5. 实现 Project Envelope parser。
6. 实现 canonical serializer 和 `ScreenSerializationError`。
7. 生成 JSON Schema root constant、artifact 和 package subpath export。
8. 增加 positive、negative、determinism、migration harness 和 artifact drift tests。
9. 扩展 `@base-screen/testing` fixtures/conformance，并验证 production package 不反向依赖。
10. 运行 package format、lint、typecheck、test、build、API、tarball 和 M0 regression gates。

## 19. 完成定义

Contracts Foundation 仅在以下条件全部满足后完成：

- ADR-0002 与本 Spec 均已接受/生效，代码无未记录偏离。
- §5 public API 和 declaration 已实现，且不存在版本后缀类型或 Zod 泄漏。
- §16 test matrix 自动化通过，invalid input 不抛普通 validation exception。
- Parser、serializer、artifact 和 tarball consumer 行为一致。
- JSON Schema artifact deterministic，build 后 worktree 不产生 drift。
- `@base-screen/contracts` 仍无 workspace dependency、DOM dependency 或默认副作用。
- `@base-screen/testing` 的 P0 fixture/conformance 只消费公开 API。
- package API report、publint、ATTW 和真实 `.tgz` consumer 通过。
- 总仓库既有 M0 verification 无回归。

本完成定义不代表 Document schema 永久稳定；首次 schema upgrade 必须另立 ADR/Spec、增加真实一步迁移和兼容 fixture。

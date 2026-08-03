# ADR-0002: Canonical Screen Document 与迁移策略

> 状态：评审中
> 日期：2026-08-03
> 定位：确定 Base Screen 唯一持久化文档、JSON 边界、版本解析、迁移和外部导入边界
> 关联：[Base Screen 长期演进总纲](../architecture/base-screen-evolution.md)

## 1. 背景

Base Screen 的 `contracts` 是十二包依赖图的根。若 Document、版本或 JSON 边界在不同包重复实现，后续 Core、Renderer、Engine、SDK、Plugin 和宿主将产生不同的输入解释。

Nebula 建设期曾同时出现 shared document、Core V1/V2、Dynamic V3、legacy parser 和应用 Adapter 转换。它们提供了迁移经验，也证明多套 canonical schema 会带来以下问题：

- 保存路径与 SDK parser 对同一项目得出不同 shape。
- 新能力被迫同时修改多套 schema、fixture 和 Adapter。
- 版本 marker 被误用于数据来源、运行时能力或 package 版本选择。
- 宽松 normalization 会静默删除未知字段并覆盖原始项目。
- 应用 DTO、认证、数据集和传输配置进入可移植文档。

Base Screen 是独立的新底座，没有已发布的旧文档兼容义务，但首个稳定版本发布后必须提供明确迁移承诺。

## 2. 决策驱动因素

Canonical Document 必须：

- 在 Vanilla、React、Vue 和非框架宿主之间保持相同 wire shape。
- 可由 Node 环境独立解析，不依赖 DOM 或 CustomElementRegistry。
- 对未知字段、未来版本、非 JSON 值和危险原型键 fail closed。
- 与项目 ID、revision、租户、权限和发布状态分离。
- 文档 type 不绑定 JavaScript 模块或 Custom Element tagName。
- 支持确定性的逐版本迁移和 canonical serialization。
- 为 Core 和 Plugin Manager 留出独立语义校验阶段。
- 在能力尚未设计时拒绝字段，不通过空占位永久冻结错误结构。

## 3. 决策摘要

本 ADR 提议：

1. `@base-screen/contracts` 是 Screen Document wire schema、公共类型、parser、版本、迁移、JSON Schema 和跨边界诊断的唯一所有者。
2. 首个 canonical marker 为 `schemaVersion: 1`。
3. V1 只包含 canvas、component tree、static variables 和可选 static data source。
4. Blueprint、host-resource、动态变量、脚本、URL、Header、Token、SQL 和插件模块位置不进入 V1。
5. 所有 canonical object 使用 strict schema；开放 props/style/data 仍必须满足统一 JSON boundary。
6. Parser 输出当前 V1 的 detached plain JSON，不返回 Zod 对象、class instance 或 input 引用。
7. Canonical serialization 采用 RFC 8785 JSON Canonicalization Scheme 语义，递归稳定 object key 顺序。
8. 未来旧版本通过确定性的 `vN -> vN+1` 一步迁移链进入当前 parser；未知未来版本直接拒绝。
9. Nebula 等外部格式通过独立 importer 转换，不占用 Base Screen schemaVersion，不进入 canonical parser。
10. Runtime schema 使用 Zod 4 实现，但 Zod 类型不进入公共声明；公共面只暴露 TypeScript 数据类型、parser result 和 JSON Schema。

## 4. V1 文档范围

概念 shape 如下，精确类型和限制由 Contracts Foundation Spec 冻结：

```ts
interface ScreenDocument {
  readonly schemaVersion: 1;
  readonly canvas: ScreenCanvas;
  readonly components: readonly ScreenComponentNode[];
  readonly variables: readonly ScreenStaticVariable[];
}

interface ScreenCanvas {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
}

interface ScreenComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: number;
  readonly zIndex: number;
  readonly status: {
    readonly locked: boolean;
    readonly hidden: boolean;
  };
  readonly props: Readonly<Record<string, ScreenJsonValue>>;
  readonly style: Readonly<Record<string, ScreenJsonValue>>;
  readonly dataSource: ScreenStaticDataSource | null;
}

interface ScreenStaticDataSource {
  readonly type: 'static';
  readonly value: ScreenJsonValue;
}

interface ScreenStaticVariable {
  readonly type: 'static';
  readonly name: string;
  readonly value: ScreenJsonValue;
}
```

### 4.1 必填 canonical shape

V1 canonical output 不依赖 optional field 默认值：

- 根字段全部必填。
- `variables` 无值时是空数组。
- 根组件 `parentId` 为 `null`。
- 无数据源时 `dataSource` 为 `null`。
- `props`、`style` 无值时是空 object。
- `status`、`rotation` 和 `zIndex` 必须显式存在。

Parser 不接受省略后补默认值。默认值属于创建命令、Material Manifest 或 importer，不属于 canonical parser。

### 4.2 Document 与物料实现分离

`type` 保存稳定物料身份，例如：

```text
acme.kpi-card/v1
```

Document 不保存：

- `tagName`。
- JavaScript constructor。
- npm package name。
- module URL 或动态 import specifier。
- React/Vue component。
- Material implementationVersion。

Plugin Manager 在 Document parser 通过后，使用实例 Material Catalog 将 `type` 解析到 Manifest 和 versioned tagName。

## 5. JSON Boundary

### 5.1 合法值

`ScreenJsonValue` 只允许：

```ts
type ScreenJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ScreenJsonValue[]
  | { readonly [key: string]: ScreenJsonValue };
```

Number 必须是 finite。`-0` 在 canonical serialization 时归一为 `0`。

### 5.2 非法值

所有跨边界输入拒绝：

- `undefined`。
- `NaN`、`Infinity`、`-Infinity`。
- `bigint`、`symbol`、function。
- Date、Map、Set、RegExp、Error、Promise、DOM Node。
- class instance 或自定义 prototype object。
- 循环引用。
- object key `__proto__`、`prototype`、`constructor`，大小写敏感按精确键拒绝。

普通共享引用可以输入，但 parser 输出会复制为独立 plain JSON tree，不保留引用身份。只有当前递归路径形成的环被视为 cycle。

### 5.3 资源限制

V1 设置硬上限：

| 限制 | 值 |
| --- | --- |
| Canonical serialized document | 10 MiB UTF-8 |
| JSON nesting depth | 64 |
| Components | 10,000 |
| Static variables | 1,000 |
| 单个 static data source value | 1 MiB UTF-8 |
| 通用 string | 65,536 UTF-8 bytes |
| id/type/variable name | 128 Unicode code points |
| component display name | 256 Unicode code points |
| object keys per object | 10,000 |
| array items per array | 100,000 |

限制在 parser 完成 detached clone 前执行，避免恶意输入先触发无界复制。

## 6. 结构与语义校验分层

### 6.1 Contracts 结构校验

Contracts 负责：

- marker、字段和 primitive 类型。
- JSON boundary 和资源上限。
- id、type、变量名和数值范围。
- component id 唯一。
- parentId 存在、非 self-reference、parent graph 无环。
- static variable name 唯一。
- canonical object strict unknown-field rejection。

### 6.2 Core 语义校验

Core 后续负责：

- 组件树领域规则。
- 分组、容器、层级和命令语义。
- canvas 与 component geometry 的业务约束。
- Document mutation 后的不变量。

### 6.3 Plugin/Renderer 语义校验

Plugin Manager 和 Renderer 后续负责：

- Material type 是否在当前实例目录启用。
- props 是否满足 Material Manifest schema。
- style 和 data source 是否满足物料能力。
- design/preview/viewer mode 的运行时能力。

Contracts 不 import plugin-core，也不根据 registry 改变 wire parser 结果。

## 7. 数值与标识规则

### 7.1 Canvas

- width/height 是整数，范围 `1..100000`。
- backgroundColor 是长度 `1..128` 的字符串。
- Contracts 不解析 CSS color；Renderer 只在经过自己的展示策略后使用。
- Canvas 不保存 grid、zoom、offset、selection 或 editor preference。

### 7.2 Component geometry

- position x/y 是 finite number，范围 `-1000000..1000000`。
- size width/height 是 finite number，范围 `(0..1000000]`。
- rotation 使用度数，canonical 范围 `[-180, 180)`。
- zIndex 是整数，范围 `0..1000000`。

Parser 不归一 rotation，不截断坐标；超出范围直接拒绝。Core 创建/命令负责生成 canonical 数值。

### 7.3 标识

- component id 长度 `1..128`，允许 ASCII alphanumeric、`.`、`_`、`:`、`-`，首字符必须 alphanumeric。
- Material type 使用 namespaced + major 格式，例如 `acme.kpi-card/v1`。
- variable name 使用 `[A-Za-z_][A-Za-z0-9_]{0,127}`。
- component display name 长度 `1..256`，允许 Unicode，但拒绝控制字符。

## 8. Project Envelope

Document 与宿主项目元数据分离：

```ts
interface ScreenProjectEnvelope {
  readonly projectId: string;
  readonly revision: string;
  readonly name: string;
  readonly description: string | null;
  readonly document: ScreenDocument;
  readonly metadata: Readonly<Record<string, ScreenJsonValue>>;
}
```

规则：

- projectId、revision 对 SDK 是 opaque string。
- revision 不进入 Document，不进入 undo/redo。
- Envelope metadata 不传给物料，不保存 Token、Cookie、Header 或连接配置。
- load/save Adapter 方法签名不在本 ADR 冻结；它们在 Viewer/Designer Host Adapter Spec 中定义。
- Envelope parser 复用相同 JSON boundary 和总大小上限，但不占用 Document schemaVersion。

## 9. Parser API

候选公共语义：

```ts
type ScreenParseResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ScreenDiagnostic[];
    };

function parseScreenDocument(input: unknown): ScreenParseResult<ScreenDocument>;
function parseScreenProjectEnvelope(input: unknown): ScreenParseResult<ScreenProjectEnvelope>;
function serializeScreenDocument(document: ScreenDocument): string;
```

行为：

- Parser 不因普通无效输入抛异常，返回 `ok: false`。
- Programmer error 或内部 invariant 失败可以抛异常，但不得把原始敏感 input 放入 message。
- 成功 value 是 detached plain JSON。
- `diagnostics` 的 code 和 path 是稳定接口；人类 message 可以改进措辞。
- Parser 不 mutate input。

## 10. Canonical Serialization

`serializeScreenDocument()` 使用 RFC 8785 JCS 语义：

- object key 按 Unicode code point/规范要求稳定排序。
- 无 insignificant whitespace。
- string 使用标准 JSON escaping。
- finite number 使用确定性 JSON number 表示。
- `-0` 输出为 `0`。
- 相同语义 canonical Document 必须产生相同 UTF-8 bytes。

Serializer 只接受已经通过当前 parser 的 Document。无效对象返回稳定 diagnostic 或抛出明确 programmer error，不能静默修复。

## 11. 版本与迁移

### 11.1 当前版本

```ts
const SCREEN_DOCUMENT_SCHEMA_VERSION = 1 as const;
```

`schemaVersion` 只标识 wire shape，不表达：

- npm package version。
- Material API version。
- Material implementationVersion。
- static/dynamic runtime。
- Nebula 或其他来源。

### 11.2 解析顺序

```text
unknown input
    │
    ├── JSON boundary preflight
    ├── marker inspection
    ├── old supported version -> one-step migration chain
    ├── current strict parser
    ├── cross-reference checks
    └── detached canonical output
```

未来 marker 直接返回 `DOCUMENT_VERSION_FUTURE`。不尝试用当前 parser 读取，不 strip 字段，不 fallback。

### 11.3 一步迁移链

未来迁移必须：

- 每个函数只处理一个已知源版本并输出下一个版本。
- 是 pure、deterministic、registry-independent。
- 不读取时间、随机数、DOM、网络、Host Adapter 或插件。
- 不 mutate input。
- 对无法无损转换的输入返回 error diagnostic，不猜测。
- 每一步有 fixture、canonical output 和重复执行行为说明。
- 所有支持旧版本最终只由 current parser 输出当前 shape。

M1 初始实现没有 V0 migration。测试通过一个测试专用 synthetic migration harness 验证链算法，不发布虚构历史版本。

## 12. 外部 Importer

Nebula importer 和其他外部格式转换遵循：

- 位于 canonical parser 之外。
- 输入 marker、来源识别和兼容报告使用 importer 自己的命名空间。
- 输出必须再经过 `parseScreenDocument()`。
- 有损字段产生结构化 diagnostic 并要求调用方显式确认。
- 不 mutate 或覆盖原始输入。
- 不把外部版本号映射为 Base Screen schemaVersion。

Canonical parser 不能根据字段形状猜测“这可能是 Nebula 文档”。

## 13. Runtime Schema 实现

选择 Zod 4 作为 `contracts` 内部 runtime schema 实现，并生成 JSON Schema artifact。

公共边界：

- 导出数据 TypeScript types。
- 导出 parser/serializer/migration result。
- 导出稳定 JSON Schema object 和 `.schema.json` artifact。
- 不导出 Zod schema instance。
- 公共 `.d.ts` 不出现 `zod` 类型。

这样可以复用 Zod strict object 和 JSON Schema 能力，同时保留未来替换内部 schema library 的可能。

## 14. Diagnostics

最小结构：

```ts
interface ScreenDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: ScreenDiagnosticCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
}
```

V1 至少定义：

```text
DOCUMENT_NOT_OBJECT
DOCUMENT_VERSION_MISSING
DOCUMENT_VERSION_UNSUPPORTED
DOCUMENT_VERSION_FUTURE
DOCUMENT_UNKNOWN_FIELD
DOCUMENT_LIMIT_EXCEEDED
JSON_VALUE_INVALID
JSON_NUMBER_NON_FINITE
JSON_CYCLE
JSON_PROTOTYPE_INVALID
JSON_DANGEROUS_KEY
COMPONENT_ID_DUPLICATE
COMPONENT_PARENT_MISSING
COMPONENT_PARENT_SELF
COMPONENT_PARENT_CYCLE
COMPONENT_TYPE_INVALID
COMPONENT_GEOMETRY_INVALID
VARIABLE_NAME_DUPLICATE
MIGRATION_STEP_MISSING
MIGRATION_FAILED
ENVELOPE_INVALID
```

Diagnostic 不记录完整 props、static data、metadata 或原始 input。

## 15. 考虑的方案

### 15.1 Contracts 唯一 Schema + 当前版本输出

优点：

- 所有消费者共享同一 wire 解释。
- Core/Plugin 只追加语义，不复制 parser。
- 迁移和 JSON Schema 有单一归属。

缺点：

- Contracts 需要谨慎控制公共面和资源限制。
- Schema 变更必须经过正式迁移。

结论：接受。

### 15.2 Schema 归 Core

优点：减少一个包的初期实现。

缺点：Host Adapter、Plugin 和 SDK 被迫依赖 Core，破坏依赖方向。

结论：不接受。

### 15.3 V1 预先加入 Blueprint、host-resource 和动态变量

优点：短期减少未来 schemaVersion 升级。

缺点：在安全、执行和能力模型未评审时冻结字段，容易重复 Nebula 建设期多分支问题。

结论：不接受。未来通过新版本和显式迁移加入。

### 15.4 宽松 parser + unknown field strip

优点：对输入“更兼容”。

缺点：会造成 load-save 数据丢失，无法区分拼写错误和未来字段。

结论：不接受。

### 15.5 长期公开 V1/V2/V3 union

优点：旧消费者可以直接处理历史 shape。

缺点：所有下游永久承担版本分支，迁移职责扩散。

结论：不接受。公共 parser 只输出当前 shape。

### 15.6 公开 Zod Schema

优点：消费者可以直接 `.extend()` 或组合。

缺点：把 schema library 和可扩展语义变成公共 ABI，允许消费者创建不被 canonical parser 接受的分支。

结论：不接受。公开 framework-neutral parser 和 JSON Schema。

## 16. 影响

正面影响：

- Contracts 可以独立实现和发布，不需要 DOM 或 plugin registry。
- V1 范围小，足够支撑静态物料、Viewer 和 Designer MVP。
- 未来动态数据和 DSL 必须以显式版本升级进入，不会偷渡字段。
- Canonical bytes 可用于 hash、snapshot、缓存和 revision 诊断。
- 外部 importer 与内部 migration 不混淆。

负面影响：

- Blueprint 和 host-resource 进入正式文档时需要 schemaVersion 升级。
- 必填 canonical 字段提高创建端责任，parser 不再替调用方补默认值。
- JCS、资源 preflight、cycle detection 和 detached clone 增加实现工作量。
- Zod 只能作为内部实现，需额外 facade 防止类型泄漏。

## 17. 实施前置

本 ADR 接受后，由 Contracts Foundation Spec 冻结：

1. 精确 TypeScript 类型和 Zod 内部 schema。
2. JSON boundary、preflight、clone 和 canonical serializer API。
3. V1 JSON Schema artifact 与 exports。
4. Parser result、diagnostic path 和 code。
5. parent graph、变量唯一性和资源限制算法。
6. synthetic migration harness。
7. fixtures、tarball consumer 和负向测试。

ADR 未接受前不得修改 `@base-screen/contracts` 空入口或添加 Zod production dependency。

## 18. 参考

- [Base Screen 长期演进总纲](../architecture/base-screen-evolution.md)
- [包开发与文档优先级](../architecture/package-development-order.md)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- Nebula `ADR-0003-screen-unified-contract-framework-bridges.md`
- Nebula canonical `screen.schema.ts`，仅作为边界经验来源，不作为 Base Screen wire schema

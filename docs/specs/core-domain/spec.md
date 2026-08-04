# Core Domain Spec

> 状态：生效中
> 最近更新：2026-08-04
> 定位：冻结 `@base-screen/core` 首个文档状态、命令、事务、历史、组件树语义和几何纯算法的可验收契约
> 依据：[ADR-0001](../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)（已接受）、[ADR-0002](../../decisions/ADR-0002-canonical-screen-document.md)（已接受）、[ADR-0010](../../decisions/ADR-0010-host-resource-deadline-and-blueprint-runtime.md)（已接受）、[ADR-0013](../../decisions/ADR-0013-core-canonical-blueprint-mutation.md)（已接受）

## 1. 生效条件

本 Spec 是 P1 Core 的实施草案。只有同时满足以下条件，状态才可改为“生效中”，随后才允许修改 `@base-screen/core` 空入口：

- ADR-0002 保持“已接受”。
- [Contracts Foundation Spec](../contracts-foundation/spec.md) 保持“生效中”，且其公共声明和真实 tarball 已通过验收。
- Contracts 公共诊断契约已包含本 Spec 所需的 Core diagnostic code，或提供由 Contracts 所有的等价可扩展机制。
- 本 Spec 完成评审，所有 Requirement 均可映射到自动化测试。

若 ADR-0002 或 Contracts Foundation Spec 在接受前改变 `ScreenDocument`、JSON boundary、诊断、数值范围或组件树基础约束，本 Spec 必须先同步，不允许 Core 自行复制、放宽或替代 Contracts 行为。

## 2. 目标

本阶段建立设计器和 Viewer 都可消费的最小纯领域能力。完成后必须具备：

- 以 canonical `ScreenDocument` 为唯一持久化 Document State 的不可变转换。
- 文档命令与事务的原子应用、稳定结果和确定性诊断。
- 只恢复 Document State 的纯 history、undo 和 redo 算法。
- 不依赖物料目录的组件树、祖先锁定、层级和删除语义校验。
- Viewport State 与 Interaction State 的最小类型和纯 reducer。
- 坐标变换、包围盒、选择命中、对齐、分布和吸附等纯几何算法。
- mutation 后基于 Contracts 前置条件执行 Core 语义校验。
- 不依赖 DOM、Store、插件、时间或随机数的 Node 测试闭环。

## 3. 非目标

本阶段不包含：

- 运行中的 Store、设计会话、Command Dispatcher、History 实例或全局单例。
- DOM 测量、Custom Element、Renderer、Viewer、Designer 或设计辅助层。
- Material Manifest、props schema、物料能力、type 可用性或插件生命周期校验。
- React、Vue、Router、Query Client、宿主 Store 或应用 Context。
- 项目 load、save、publish、资源执行、认证、权限或网络副作用。
- Runtime Overrides、数据加载结果、可见性覆盖或运行时错误状态。
- canonical parser、serializer、JSON Schema 或 JSON boundary 的重复实现。
- 剪贴板、快捷键、标尺、网格绘制、空间索引或可见区域裁剪。
- Blueprint 的 parser、serializer、schema、runtime side effect 或 host action。
- 不可撤销的宿主副作用或插件命令。

Contracts 已按 ADR-0010 冻结 canonical Blueprint、host-resource data source、capability index 和
diagnostics。Core 可在其纯 command 与 compile/evaluate 边界内消费这些类型；不得创建占位 API、
`unknown` 扩展槽、兼容分支或 host runtime facade。

## 4. Package 边界

`@base-screen/core` 必须满足：

- 唯一允许的 workspace dependency 是 `@base-screen/contracts`。
- 运行时代码只使用 `ES2022`，不引用 DOM 或 Node global。
- 不依赖 plugin、renderer、engine、material、framework bridge、sdk 或 testing。
- 默认根入口无注册、global mutation、I/O、时间或随机数副作用。
- public `.d.ts` 不出现 DOM、React、Vue、Zod、Router、Store、Nebula 或宿主 DTO 类型。
- 所有公共输入和输出由有限、无环的 readonly JSON 数据、数字、字符串和 discriminated union 组成。
- package 保持 ESM-only、`sideEffects: false`，并可由真实 tarball consumer 导入。
- Core 不从 `@base-screen/sdk` 反向获取任何类型，也不访问其他 workspace package 的源码路径。

Core 可以信任由 `parseScreenDocument()` 成功返回的 canonical `ScreenDocument` 已满足 Contracts 结构约束。所有接受 `ScreenDocument` 的公共函数均要求 canonical 输入；Core 不负责把任意 `unknown` 解析为文档。

## 5. 状态分层

### 5.1 Document State

Document State 就是 `ScreenDocument`，不再定义第二套可持久化文档类型。

只有 Document State：

- 可以由 document command 或 transaction 修改。
- 可以进入 history、undo、redo 和保存。
- 可以作为 Core semantic validation 的输入。

Core 不在 Document 上附加 selection、zoom、offset、guides、drag baseline、diagnostics、dirty flag、runtime data 或宿主 metadata。

### 5.2 Viewport State

根入口必须导出：

```ts
export interface ScreenViewportState {
  readonly zoom: number;
  readonly offset: ScreenPoint;
}

export type ScreenViewportAction =
  | {
      readonly type: 'set-zoom';
      readonly zoom: number;
      readonly anchor: ScreenPoint;
    }
  | {
      readonly type: 'pan-by';
      readonly delta: ScreenVector;
    }
  | {
      readonly type: 'set-offset';
      readonly offset: ScreenPoint;
    }
  | { readonly type: 'reset' };

export function reduceScreenViewport(
  state: ScreenViewportState,
  action: ScreenViewportAction,
): ScreenViewportState;
```

Viewport zoom 的合法范围是 `0.05..64`。初始与 reset state 是 `{ zoom: 1, offset: { x: 0, y: 0 } }`。坐标公式为 `viewport = canvas * zoom + offset`，offset 和 `pan-by.delta` 都使用 viewport unit。`set-zoom` 的 anchor 也是 viewport point，并调整 offset，使 anchor 反算出的 canvas point 在缩放后仍映射到同一 anchor。非法或非 finite state/action 输入返回原 state，不抛出异常。

### 5.3 Interaction State

根入口必须导出：

```ts
export interface ScreenInteractionState {
  readonly selectedComponentIds: readonly string[];
  readonly focusedComponentId: string | null;
}

export type ScreenInteractionAction =
  | {
      readonly type: 'replace-selection';
      readonly componentIds: readonly string[];
      readonly focusedComponentId: string | null;
    }
  | {
      readonly type: 'toggle-selection';
      readonly componentId: string;
    }
  | { readonly type: 'clear-selection' }
  | { readonly type: 'reconcile-document' };

export function reduceScreenInteraction(
  state: ScreenInteractionState,
  action: ScreenInteractionAction,
  document: ScreenDocument,
): ScreenInteractionState;
```

selection 按传入 document 的 component 顺序 canonicalize，去重并移除不存在或 hidden 的 component id。focused component 必须属于 selection，否则为 `null`。锁定组件可以被选中，但不能被 mutation command 直接或通过祖先间接修改。

Interaction State 只描述稳定选择结果。pointer、drag、resize、rotate、marquee 和 editing session 的运行状态由 Engine 拥有，并在其 Spec 中基于 Core 几何与命令 API 定义。项目 operation、dirty baseline、adapter revision、conflict 和 retry 也属于 Engine 项目控制器，详见 [ADR-0012](../../decisions/ADR-0012-designer-project-lifecycle.md)；它们不得进入 Core。

### 5.4 Runtime Overrides

Runtime Overrides 不属于 Core。Core public API 不接受或返回 runtime data、loading、error、visibility override 或 resource execution result，也不得提供把这些值写回 Document 的 helper。

## 6. 公共领域类型

根入口必须从 `@base-screen/contracts` 直接使用并按需重导出稳定类型，不得复制声明。Core 自有几何类型为：

```ts
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenVector {
  readonly x: number;
  readonly y: number;
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type ScreenAxis = 'x' | 'y';
```

所有 Core 数字输入必须 finite。返回值不得包含 `NaN`、Infinity 或 `-0`；结果中的 `-0` 必须归一为 `0`。几何函数不得修改输入对象或数组。

## 7. 文档命令

### 7.1 Command union

根入口必须导出首期命令 union：

```ts
export type ScreenDocumentCommand =
  | {
      readonly type: 'update-canvas';
      readonly patch: Partial<ScreenCanvas>;
    }
  | {
      readonly type: 'add-component';
      readonly component: ScreenComponentNode;
    }
  | {
      readonly type: 'update-components';
      readonly componentIds: readonly string[];
      readonly patch: ScreenComponentPatch;
    }
  | {
      readonly type: 'remove-components';
      readonly componentIds: readonly string[];
    }
  | {
      readonly type: 'reparent-components';
      readonly componentIds: readonly string[];
      readonly parentId: string | null;
    }
  | {
      readonly type: 'replace-blueprint';
      readonly blueprint: ScreenBlueprint;
    }
  | {
      readonly type: 'replace-variables';
      readonly variables: readonly ScreenStaticVariable[];
    };

export interface ScreenComponentPatch {
  readonly name?: string;
  readonly position?: ScreenPosition;
  readonly size?: ScreenSize;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly status?: ScreenComponentStatus;
  readonly props?: ScreenJsonObject;
  readonly style?: ScreenJsonObject;
  readonly dataSource?: ScreenComponentDataSource | null;
}
```

`ScreenComponentPatch` 不包含 `id`、`type` 或 `parentId`。身份创建只通过 `add-component`，父关系修改只通过 `reparent-components`；首期不支持修改既有组件的 material type。
`replace-blueprint` 只接受 Contracts 已冻结的 canonical shape，并和其他命令一样在 candidate
Document 通过后置校验前不提交。`host-resource` 仅是 data source 描述，不把 host transport、credential
或 resource resolution 引入 Core。

### 7.2 Apply result

```ts
export type ScreenCommandResult =
  | {
      readonly ok: true;
      readonly document: ScreenDocument;
      readonly changedComponentIds: readonly string[];
      readonly diagnostics: readonly ScreenDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly document: ScreenDocument;
      readonly diagnostics: readonly ScreenDiagnostic[];
    };

export function applyScreenDocumentCommand(
  document: ScreenDocument,
  command: ScreenDocumentCommand,
): ScreenCommandResult;
```

成功结果中的 diagnostics 必须为空。失败结果的 document 必须与输入保持同一引用，且不得包含部分修改。成功但没有语义变化的命令返回输入 document 同一引用、空 `changedComponentIds` 和空 diagnostics。

### 7.3 通用命令规则

所有命令必须：

- 不修改 document、command 或其嵌套值。
- 在产生结果前验证全部目标和参数。
- 对 `componentIds` 去重，并按 document 顺序处理和返回。
- 对不存在的目标 fail closed，不静默跳过。
- 对 hidden 目标允许文档 mutation；hidden 只影响选择和命中测试。
- 对 locked 目标或其 locked ancestor 拒绝 mutation。
- 生成符合 Contracts canonical 数值范围和 JSON boundary 的新值。
- 应用后重新验证 Core component tree 和 geometry invariant。
- 不读取物料目录，不判断 props、style 或 dataSource 是否适合某个 material type。

### 7.4 命令特定语义

`add-component`：

- component id 必须尚不存在。
- parent 必须存在或为 `null`，且不能形成环。
- 新组件不能附带非 canonical JSON 或超出 Contracts 范围的 geometry。
- 插入 components 数组末尾，不根据 zIndex 重排存储顺序。

`update-components`：

- patch 至少包含一个字段。
- 相同 patch 原子应用到全部目标。
- position、size 和 rotation 是绝对值，不是 delta。
- props、style、status 和 dataSource 整体替换，不执行 deep merge。

`remove-components`：

- 删除每个目标及其全部 descendants。
- 若任一目标或 descendant 被锁定，则整个命令失败。
- `changedComponentIds` 按原 document 顺序包含所有实际删除 id。

`reparent-components`：

- 只接受去除 descendants 后的最外层目标集合，若输入同时包含 ancestor 与 descendant 则 descendant 被 canonicalize 移除。
- 新 parent 不能是任一目标或其 descendant。
- 组件 position 保持 canvas coordinates 不变。
- 目标本身或其 locked ancestor 均使命令失败。
- 新 parent 本身或其任一 locked ancestor 均使命令失败；`parentId: null` 不受该规则限制。

`update-canvas` 的空 patch 或只包含相同值的 patch 是 no-op；runtime unknown key 使用 `CORE_COMMAND_INVALID`。`replace-variables` 与有变化的 canvas patch 必须整体原子通过 Contracts 范围与 Core invariant；失败时不产生部分结果。

## 8. 事务

根入口必须导出：

```ts
export interface ScreenDocumentTransaction {
  readonly commands: readonly ScreenDocumentCommand[];
}

export interface ScreenTransactionSuccess {
  readonly ok: true;
  readonly document: ScreenDocument;
  readonly changedComponentIds: readonly string[];
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export interface ScreenTransactionFailure {
  readonly ok: false;
  readonly document: ScreenDocument;
  readonly failedCommandIndex: number;
  readonly diagnostics: readonly ScreenDiagnostic[];
}

export type ScreenTransactionResult =
  | ScreenTransactionSuccess
  | ScreenTransactionFailure;

export function applyScreenDocumentTransaction(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
): ScreenTransactionResult;
```

事务按数组顺序应用，最多包含 1,000 个命令。任一命令失败时，整个事务失败并返回原始 document 同一引用；`failedCommandIndex` 指向首个失败命令。空事务和全部 no-op 的事务成功并返回输入 document 同一引用。

成功事务的 `changedComponentIds` 去重并按最终 document 顺序排列；已删除组件按原始 document 顺序追加在现存 id 之后。一个事务对应至多一个 history entry。

## 9. History

### 9.1 数据模型

根入口必须导出：

```ts
export interface ScreenHistoryEntry {
  readonly before: ScreenDocument;
  readonly after: ScreenDocument;
}

export interface ScreenHistoryState {
  readonly past: readonly ScreenHistoryEntry[];
  readonly present: ScreenDocument;
  readonly future: readonly ScreenHistoryEntry[];
}

export function createScreenHistory(
  document: ScreenDocument,
): ScreenHistoryState;

export function commitScreenHistory(
  history: ScreenHistoryState,
  document: ScreenDocument,
  limit?: number,
): ScreenHistoryState;

export function undoScreenHistory(
  history: ScreenHistoryState,
): ScreenHistoryState;

export function redoScreenHistory(
  history: ScreenHistoryState,
): ScreenHistoryState;
```

### 9.2 History 语义

- History 只保存 Document State，不保存 Viewport、Interaction 或 Runtime Overrides。
- `commit` 收到与 present 同一引用的 document 时返回原 history 同一引用。
- 新 commit 清空 future。
- 默认 limit 是 100，合法范围是 `1..1000`；超出范围或非整数时抛出 `RangeError`。
- 超出 limit 时从最旧 past entry 开始裁剪。
- 空 past 的 undo 和空 future 的 redo 返回原 history 同一引用。
- undo 和 redo 不重新执行命令，不访问外部状态，只移动已经验证的 document snapshot。
- Core 不创建可变 History class、订阅器、事件总线或持久化 history。

连续拖拽、缩放和旋转的 baseline、preview 与 gesture 合并属于 Engine。Engine 只在手势提交时把一个最终 Document State commit 为一个 history entry。

## 10. Core 语义校验

根入口必须导出：

```ts
export function validateScreenDocumentSemantics(
  document: ScreenDocument,
): readonly ScreenDiagnostic[];

export class ScreenCoreInvariantError extends Error {
  readonly name: 'ScreenCoreInvariantError';
  readonly diagnostics: readonly ScreenDiagnostic[];
}
```

Contracts 已负责字段、primitive、JSON boundary、资源上限、id 唯一、parent 存在、self-reference、parent cycle 和 canonical 数值范围。Core 不重复 parser，也不接受 `unknown`。

Core 首期额外验证：

- 任一 component 的 ancestor depth 不得超过 256。
- 每个 sibling 集合内 `(zIndex, document order)` 必须形成稳定绘制与命中顺序，相同 `zIndex` 合法。
- component rotated bounds 必须 finite，且 width、height 均大于零。
- 根节点与子节点都使用 canvas coordinates；parent relation 不引入局部坐标解释。

除 validator 外，Document API 的输入必须已通过该校验；输入违反 Core invariant 属 programmer error，并抛出 `ScreenCoreInvariantError`。命令产生候选文档后再次校验，任何语义诊断都会使 command 或 transaction 原子失败。no-op 仍要求输入是 Core-valid Document。语义校验不得依赖 material type 是否存在、组件是否可作为视觉容器、props schema 或 DOM layout。首期 parent relation 是独立于物料实现的逻辑层级。

## 11. Diagnostics Contract

Core 使用 Contracts 所有的 `ScreenDiagnostic`、severity、path 和排序规则，不定义第二套跨边界 diagnostic envelope。

Contracts 在本 Spec 生效前必须拥有以下 code：

```ts
| 'CORE_COMMAND_INVALID'
| 'CORE_COMMAND_TARGET_MISSING'
| 'CORE_COMMAND_TARGET_LOCKED'
| 'CORE_COMMAND_PARENT_INVALID'
| 'CORE_COMMAND_LIMIT_EXCEEDED'
| 'CORE_GEOMETRY_INVALID'
| 'CORE_INVARIANT_VIOLATION'
```

约束：

- 可预期的用户输入错误以 result 返回，不抛异常。
- `path` 指向 command、transaction command index 或 document field。
- diagnostics 按 path、code、message 的稳定顺序返回。
- consumer 只能依赖 code 和 path，不得依赖 message 文案分类。
- diagnostics 不回显完整 Document、props、style、data source 或宿主数据。
- `CORE_INVARIANT_VIOLATION` 表示 canonical 输入或 command 候选结果违反 Core invariant。
- transaction 中普通命令失败时保留原 diagnostic code，并在 path 前加 `['commands', failedCommandIndex]`；不额外增加 transaction wrapper code。
- transaction 命令数超过上限时返回 `CORE_COMMAND_LIMIT_EXCEEDED`，path 为 `['commands']`。

`ScreenCoreInvariantError` 仅用于调用方把未通过 Core validator 的 Document 传给要求 Core-valid Document 的 API。非法 history limit、违反几何函数前置条件或非法 snap threshold 抛 `RangeError`；可预期的 command 或 transaction 输入错误均以 result 返回。

## 12. 几何与命中测试

### 12.1 坐标变换

根入口必须导出：

```ts
export function canvasPointToViewport(
  point: ScreenPoint,
  viewport: ScreenViewportState,
): ScreenPoint;

export function viewportPointToCanvas(
  point: ScreenPoint,
  viewport: ScreenViewportState,
): ScreenPoint;

export function getScreenComponentBounds(
  component: ScreenComponentNode,
): ScreenBounds;

export function getScreenSelectionBounds(
  components: readonly ScreenComponentNode[],
): ScreenBounds | null;
```

坐标变换严格使用 `viewport = canvas * zoom + offset` 与其反函数。输入 point 必须 finite，viewport 必须满足合法 zoom 和 finite offset；违反这些前置条件抛出 `RangeError`。浮点 round trip 使用 `Number.EPSILON` 放大到输入量级后的误差比较，不承诺 bitwise equality。

组件 rotation 围绕组件中心计算 axis-aligned bounds。selection bounds 是全部输入组件 rotated bounds 的最小 axis-aligned union；空输入返回 `null`。独立 component 和 rect 参数必须满足 Contracts geometry 范围，否则抛出 `RangeError`。

### 12.2 绘制顺序与命中测试

```ts
export function hitTestScreenComponents(
  document: ScreenDocument,
  point: ScreenPoint,
): readonly string[];

export function queryScreenComponentsInRect(
  document: ScreenDocument,
  rect: ScreenRect,
  mode: 'intersect' | 'contain',
): readonly string[];
```

Core painter order 通过树形 pre-order 构造：每个 sibling 集合先按 `(zIndex ascending, document order ascending)` 排序，先放 parent，再递归放入其 children；每个 root 视为一个完整子树，因此较后的 root 子树整体绘制在较早 root 子树之上。point hit test 返回该 painter list 的逆序。

命中测试忽略 effective hidden component，但包含 locked component。point hit 使用旋转后的矩形实体，边界视为命中；不使用 AABB 四角的空白区域。rect `intersect` 在查询 rect 与旋转矩形存在任意公共点时命中，rect `contain` 仅在查询 rect 包含旋转矩形全部四个角点时命中，边界均包含。矩形查询按 document order 返回。

### 12.3 对齐、分布与吸附

根入口必须提供纯计算 API，返回建议 delta，不直接修改 Document：

```ts
export interface ScreenAlignmentDelta {
  readonly componentId: string;
  readonly delta: ScreenVector;
}

export function calculateScreenAlignment(
  components: readonly ScreenComponentNode[],
  axis: ScreenAxis,
  mode: 'start' | 'center' | 'end',
): readonly ScreenAlignmentDelta[];

export function calculateScreenDistribution(
  components: readonly ScreenComponentNode[],
  axis: ScreenAxis,
): readonly ScreenAlignmentDelta[];

export interface ScreenSnapCandidate {
  readonly axis: ScreenAxis;
  readonly movingValue: number;
  readonly targetValue: number;
  readonly sourceComponentId: string;
  readonly targetComponentId: string | null;
}

export function chooseScreenSnapCandidate(
  candidates: readonly ScreenSnapCandidate[],
  threshold: number,
): ScreenSnapCandidate | null;
```

对齐与分布均使用 rotated axis-aligned bounds，忽略 effective hidden component，并按几何位置后以 component id 作为稳定 tie-break。少于两个可见参与组件时返回空数组。输出只包含未锁定组件且只包含非零 delta；locked component 固定不动并可作为 reference。

对齐规则：若存在 locked component，reference value 是 locked bounds 在指定 mode 上的最小值；否则 reference 是全部参与 bounds 在该 mode 上的最小值。每个未锁定组件移动到该 reference。

分布规则：沿 axis 按 bounds start 排序，使用等边缘间距，不使用等中心距。最前和最后组件是固定端点；locked component 也固定，并把序列切分为独立区间。每个区间只移动两个固定端点之间的未锁定组件；端点重叠导致负 gap 时仍按公式确定性分布。

吸附接受 finite candidates 和 `threshold >= 0`，距离等于 threshold 时可命中；非法输入抛 `RangeError`。候选 total order 依次比较 `abs(targetValue - movingValue)`、axis（`x` 先于 `y`）、source id、target id（`null` 先于 string）、movingValue、targetValue；字段全等时保留最早输入项。

Core 不读取 grid、guide DOM 或浏览器 layout。Engine 负责构造候选，并把最终 delta 转换为 document command。

## 13. 确定性与不可变性

所有 reducer、command、transaction、history、validation 和 geometry API 必须满足：

- 相同结构输入产生深相等输出和相同 diagnostics 顺序。
- 不读取当前时间、locale、timezone、random、environment variable 或全局 registry。
- 不修改调用方输入，不返回输入中的可变数组或临时工作数组。
- no-op 在本 Spec 明确要求时保留顶层引用，便于 Engine 避免无效通知和 history entry。
- 不以 object key insertion order 决定领域结果；document order 仅指 canonical components 数组顺序。
- 不执行 JSON stringify/parse 克隆，不通过序列化掩盖非法输入。

## 14. Implementation Shape

实现按职责拆分，推荐形态为：

```text
src/
├── state/
├── commands/
├── history/
├── hierarchy/
├── geometry/
├── validation/
└── index.ts
```

目录名不是公共契约，但必须保持以下所有权：

- `state` 只包含 Viewport 与 Interaction 的类型和 reducer。
- `commands` 负责 document mutation 与 transaction 原子性。
- `history` 只包含 snapshot history 纯算法。
- `hierarchy` 负责 parent、ancestor、descendant、锁定和稳定顺序查询。
- `geometry` 不 import DOM，也不读取 document 之外的运行状态。
- `validation` 追加 Core 语义诊断，不复制 Contracts parser。
- `index.ts` 只导出已由本 Spec 验收的公共 API。

纯领域模块目标不超过 300 行；超过 500 行必须按独立职责拆分，不创建只转发实现的文件。

## 15. Test Matrix

至少覆盖：

| 领域 | 必测行为 |
| --- | --- |
| Package | Node ESM import、仅依赖 Contracts、无默认副作用、public declaration 无禁止类型 |
| Document | command 不修改输入、no-op 保留引用、失败返回原 document |
| Command | add/update/remove/reparent/canvas/variables 成功与拒绝路径 |
| Locking | 直接锁定、locked ancestor、删除锁定 descendant、锁定 reference |
| Transaction | 顺序应用、首错索引、原子回滚、空事务、1,001 commands |
| History | commit、undo、redo、future 清空、limit 裁剪、空栈、no-op commit |
| State | viewport anchor zoom、selection 去重、hidden 移除、document reconcile |
| Hierarchy | roots、deep descendants、ancestor+descendant target canonicalization |
| Geometry | rotation bounds、负坐标、零向量、坐标 round trip、`-0` 归一 |
| Hit test | hidden、locked、重叠 zIndex、相同 zIndex 的稳定顺序 |
| Alignment | locked reference、hidden 排除、两项与多项分布、稳定 delta |
| Snap | threshold 边界、等距候选、稳定 tie-break |
| Validation | Core invariant code、path 和 deterministic order |
| Purity | 不访问 DOM、时间、随机数、环境变量或 global registry |
| Tarball | 真实 consumer 只从 public exports 导入并完成类型检查与 Node 执行 |

测试 fixture 必须由公开 Contracts 类型构造。Core 测试不得 import `@base-screen/testing`、Engine、Renderer 或 workspace 源码路径。

## 16. Requirements

### R1：唯一 Document State

系统 SHALL 直接使用 Contracts 的 `ScreenDocument` 作为唯一持久化 Document State。

场景：创建 Core history

- GIVEN 一个由 Contracts parser 成功返回的 Document
- WHEN 调用 `createScreenHistory()`
- THEN `present` 是该 Document
- AND history 不包含 viewport、selection、runtime override 或 project metadata

### R2：不可变命令应用

系统 SHALL 在不修改输入的情况下原子应用文档命令。

场景：更新两个组件的位置

- GIVEN 两个未锁定组件和合法绝对位置 patch
- WHEN 应用 `update-components`
- THEN 返回新的 Document
- AND 两个目标都更新
- AND 原 Document 与 command 保持不变
- AND diagnostics 为空

### R3：Fail-closed 目标处理

系统 SHALL 在任一目标不存在或不可修改时拒绝完整命令。

场景：批量更新包含一个不存在 id

- GIVEN 一个合法 id 和一个不存在 id
- WHEN 应用同一 `update-components`
- THEN 结果失败
- AND 返回原 Document 同一引用
- AND 合法目标也不发生变化
- AND diagnostics 包含稳定 code 与目标 path

### R4：锁定继承

系统 SHALL 禁止修改 locked component 及其 descendants。

场景：移动锁定分组下的子组件

- GIVEN parent 为 locked 且 child 自身未锁定
- WHEN 对 child 应用位置更新
- THEN 命令失败
- AND diagnostic code 为 `CORE_COMMAND_TARGET_LOCKED`

### R5：事务原子性

系统 SHALL 将 transaction 作为一个原子文档转换。

场景：第三个命令失败

- GIVEN 一个包含四个命令的 transaction
- WHEN 前两个成功且第三个失败
- THEN transaction 返回原 Document 同一引用
- AND `failedCommandIndex` 为 2
- AND 第四个命令不执行

### R6：History 只恢复文档

系统 SHALL 通过纯 snapshot 算法执行 undo 和 redo。

场景：提交后 undo

- GIVEN history present 为 A 且 commit B
- WHEN undo
- THEN present 恢复为 A
- AND B 进入 future
- AND 不涉及 viewport、interaction 或外部副作用

### R7：新提交清空 redo

系统 SHALL 在 undo 后的新 commit 上丢弃旧 future 分支。

场景：A 提交 B、undo、再提交 C

- GIVEN present 已从 B undo 到 A
- WHEN commit C
- THEN present 为 C
- AND future 为空
- AND redo 返回原 history 同一引用

### R8：状态隔离

系统 SHALL 使 Viewport 与 Interaction reducer 无法修改 Document。

场景：缩放并替换选择

- GIVEN 一个 Document、Viewport State 和 Interaction State
- WHEN 分别 reduce viewport 与 interaction
- THEN 只有对应 state 返回新值
- AND Document 保持同一引用和内容

### R9：确定性几何

系统 SHALL 对相同几何输入返回相同 finite 结果。

场景：计算旋转组件 bounds

- GIVEN 一个 rotation 为 45 度的 canonical component
- WHEN 重复计算 bounds
- THEN 两次结果深相等
- AND 所有数字 finite
- AND 不包含 `-0`

### R10：稳定命中顺序

系统 SHALL 在重叠组件之间产生确定性命中顺序。

场景：两个 sibling 具有相同 zIndex

- GIVEN 两个可见 sibling 覆盖同一点且 zIndex 相同
- WHEN 执行 point hit test
- THEN 后出现于 canonical components 数组的 sibling 排在前面

### R11：Contracts 与 Core 校验分层

系统 SHALL 只对 canonical Document 执行领域语义校验。

场景：调用 Core semantic validator

- GIVEN Contracts parser 已接受的 Document
- WHEN Core 校验 hierarchy 与 geometry invariant
- THEN 不重新解析 unknown fields 或 JSON boundary
- AND 不查询 material catalog
- AND 只返回 Contracts 所有的 diagnostic envelope

### R12：纯包边界

系统 SHALL 在无 DOM 的 Node 环境独立运行。

场景：真实 tarball consumer

- GIVEN 只安装 `@base-screen/contracts` 与 `@base-screen/core` 的空白 Node ESM consumer
- WHEN 导入 public API 并执行 command、history 和 geometry smoke test
- THEN 类型检查和运行成功
- AND 无 Custom Element 注册、global mutation、I/O 或 framework runtime

### R13：Blueprint 纯边界

系统 SHALL 只公开由 ADR-0010 与 ADR-0013 冻结的 Blueprint command 和纯 compile/evaluate API，且不得
暴露 runtime、host action、兼容 placeholder 或未冻结 DSL surface。

场景：检查 public declaration

- GIVEN `@base-screen/core` 的发布 tarball
- WHEN 检查根入口声明
- THEN 仅存在当前 Spec 明确的 Blueprint command 与纯 compile/evaluate export
- AND 不存在 runtime、host action 或 compatibility placeholder export

## 17. 实施顺序

1. 确认 Contracts tarball、类型和 Core diagnostic code 前置条件。
2. 实现公共几何类型、hierarchy query 与 Core semantic validator。
3. 实现 Document command 与 no-op/失败引用语义。
4. 实现 transaction 原子应用与资源上限。
5. 实现 snapshot history 算法。
6. 实现 Viewport 与 Interaction reducer。
7. 实现 bounds、coordinate transform 与 hit test。
8. 实现 alignment、distribution 与 snap candidate 选择。
9. 收敛根 exports、API report 和真实 tarball consumer。
10. 完成 Requirements 到测试用例的双向映射。

实施不得先创建 facade 再等待后续补行为。每个 export 进入根入口时必须同时具备本 Spec 对应测试。

## 18. 完成定义

Core Domain 阶段完成必须同时满足：

- 本 Spec 状态为“生效中”，且依赖的 ADR 与 Contracts Spec 已满足生效条件。
- `@base-screen/core` 只依赖 `@base-screen/contracts`，不依赖任何其他 workspace package。
- Document、Viewport、Interaction 和 Runtime Overrides 边界在类型与测试中保持分离。
- 所有 Document 写入只通过 command 或 transaction 纯函数完成。
- command 和 transaction 对失败、no-op、锁定、目标缺失和资源上限具有稳定行为。
- history 只恢复 Document State，并通过 undo、redo、branch 和 limit 测试。
- hierarchy、geometry、hit test、alignment、distribution 和 snap 结果 deterministic 且 finite。
- Core 不复制 canonical parser、schema、serializer 或 diagnostic envelope。
- public declaration 不泄漏 DOM、framework、Store、Zod、Nebula 或宿主类型。
- Node 单元测试、类型检查、边界检查、API report、package 检查和真实 tarball consumer 全部通过。
- 每个 Requirement 都有自动化测试映射，且不存在仅靠文档声明通过的验收项。
- Blueprint 只以 ADR-0010 与 ADR-0013 冻结的纯 API 进入发布面。

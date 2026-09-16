# ADR-0080: 条件样式的作者与渲染归属

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0058、ADR-0059、ADR-0066（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0002](./ADR-0002-canonical-screen-document.md)、[ADR-0005](./ADR-0005-renderer-dom-shadow-dom-and-product-elements.md)、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)、ADR-0023、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)

## 背景

宿主有大屏预警诉求：组件绑定的数值超过阈值时，字体颜色等样式自动变化。既有位置都不适合承载它——Viewer 是纯展示、没有事务入口；Designer 的事务改样式会污染历史与脏标记，且预警逻辑要求每次数据刷新后重评估；Blueprint action 是一次性事件分发，trigger 是组件事件而非数据变化，不能表达「数据投影后持续求值」。按 ADR-0027 的所有权划分，「数据 → 样式的投影」是渲染职责，属 Base Screen 渲染内核，条件样式因而落在 Renderer 的同一投影点上。

这条主线围绕同一问题做了三次收紧，每次都保留上一阶段的 canonical 契约与渲染能力，只移动「谁提供作者界面」：

1. **ADR-0058** 确立文档内声明式条件样式 `styleRules`，由 Renderer 在数据投影点求值；同时（决策 6）提供 Designer 内建规则编辑器作为作者入口。
2. **ADR-0059** 新增宿主条件样式端口 `conditionalStylePort`，覆盖「判定与视觉映射都归宿主、屏幕只消费结果」的场景。它是与文档规则并行的第三层，**不移除** ADR-0058 的任何决策。
3. **ADR-0066** 反转作者面：生产告警的阈值、优先级、确认与屏蔽规则来自宿主接口或统一告警平台，内建编辑器会造成第二个作者入口与配置漂移，因此收回该界面。它只取代 ADR-0058 决策 6 的内建编辑器部分，保留文档契约、解析序列化、`update-components` 事务能力与 Renderer 求值。

## 决策

### 1. canonical 文档保留 `styleRules`

`ScreenComponentNode` 的可选 `styleRules?: readonly ScreenComponentStyleRule[]` 随组件存储、复制与序列化。每条规则是严格 JSON-safe 对象：

```ts
interface ScreenComponentStyleRule {
  readonly id: string; // 组件内唯一，1..64 码点
  readonly when: {
    readonly path: readonly string[]; // 指向组件 dataState.value 内的路径，0..8 段、每段 1..64 码点；空数组表示值本身
    readonly operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
    readonly value?: ScreenJsonValue; // 字面量右操作数，受既有 JSON budget 约束；exists 不带 value
  };
  readonly style: ScreenJsonObject; // 命中时合并的样式键值
}
```

单组件最多 8 条，operator 集合与 Blueprint condition 对齐。Contracts 解析 fail-closed：未知键、超限、重复 id、非法字面量均拒绝，不做剥离、默认值或强制转换。

### 2. 文档规则只锚定组件自身的投影值

求值锚点是组件自身的 `model.dataState.value`，即物料已经接收的投影值：静态数据源为静态值，`host-resource` 为绑定投影后的适配值。`dataState` 非 `ready`（idle/loading/error）时全部规则不命中。`gt` 等序比较仅对有限数生效，`contains` 仅对字符串与数组生效，类型不匹配视为不命中而非错误。规则不引用变量、其他组件数据或宿主对象。

### 3. Renderer 求值点与固定三层合并顺序

Renderer 在构造物料 model 前求值，effective style 合并顺序固定为 `base style → 命中的文档 styleRules → conditionalStylePort 覆盖`（同键后写覆盖先写）。求值点不变：初次挂载、reconcile 与 `dataState` 更新（含数据刷新）各一次。数据刷新经既有 `resourcePort` / `refreshData` 产生新 `dataState` 后规则自动重评估，宿主零命令式样式修改；设计态走同一 Renderer 路径。

每条规则的 `style` 键必须是该物料 Manifest `styleSchema` 声明的顶层键，合并结果经 `styleSchema` 校验（与 ADR-0016 决策 6 同一路径）；非法规则样式与该组件现有非法 style 同路径 fail-closed。effective style 只存在于运行时 model，不回写文档、不产生历史记录。

### 4. `conditionalStylePort` 是渲染期同步纯函数覆盖

plugin-core 新增宿主条件样式端口类型（与 `BaseScreenMaterialCatalog` 同层：请求引用 `BaseScreenMaterialDataState`，不能下沉 contracts）：

```ts
interface BaseScreenConditionalStyleRequest {
  readonly componentId: string;
  readonly dataState: BaseScreenMaterialDataState;
}
interface BaseScreenConditionalStylePort {
  resolve(request: BaseScreenConditionalStyleRequest): ScreenJsonObject | undefined;
}
```

`resolve` 是同步纯函数：相同 `(componentId, dataState)` 必须返回相同结果，不得产生副作用、不得异步（异步数据必须走 `resourcePort`/`refreshData` 产生新 `dataState` 后自然重求值）。返回值是样式覆盖键值（merge 语义，同 `styleRules` 的 `style`），`undefined` 表示无覆盖，宿主只声明差异而不必复述物料全部样式键。

Viewer `configure` 与 Designer `configure` 新增可选 `conditionalStylePort`（权威原子入口，形状校验与 `resourcePort` 同族：非对象或无 `resolve` 函数即整体失败、零副作用），并提供同形的守卫 setter 与只读 getter：Renderer 创建后拒绝变更并上报生命周期诊断，避免「看似生效实则未生效」。端口对每个组件都会被调用，请求携带完整 `dataState`（含 idle/loading/error）——与 `styleRules` 的「非 ready 不命中」不同，端口可自行决定对 loading/error 施加样式。Designer 配置后设计态画布经同一 Renderer 路径预览宿主告警样式。

### 5. 端口结果与异常 fail-closed

端口覆盖与 base + 命中规则合并后必须过该物料 Manifest `styleSchema` 校验。非法覆盖不抵达物料：本次求值忽略端口覆盖、保留 base + 规则结果，经既有诊断通道上报一条错误（path 指向该组件）。`resolve` 抛异常同路径隔离：忽略覆盖 + 诊断，不中断整次渲染、不影响其他组件。

### 6. 端口不进文档、不序列化、不进 JSON Schema

无端口的实例行为与该能力存在前逐像素一致；离线打开无端口实例退回文档规则路径。

### 7. 事务能力保留

Core `update-components` 的 `ScreenComponentPatch` 支持 `styleRules`（整体替换语义，同 `style`）；锁定组件及其后代的既有拦截规则不变（非 status-only patch）。历史、脏标记、`base-screen-change` 经既有事务通道生效，不新增命令类型。宿主需要维护文档规则时，通过 canonical 文档或公开事务通道提交；不新增专用宿主 API。

### 8. 作者面归宿主，Designer 不再内建条件样式编辑器

Designer 不再渲染「条件样式」规则编辑区，也不处理规则增删、条件编辑或样式覆盖编辑事件。运行期告警视觉优先使用 `conditionalStylePort`；接口加载与异步业务处理仍在宿主完成，端口 `resolve` 保持同步纯函数。Event Blueprint 继续负责离散交互与动作，不新增样式动作，也不作为持续条件样式的替代通道。删除仅供内建编辑器使用的 DOM、事务适配、文案、样式与测试辅助代码，并保留面板回归测试，确保含有 `styleRules` 的组件不会重新暴露内建编辑控件。

## 后果

- 宿主告警体系成为判定与视觉映射的单一事实源：屏幕文档零告警知识，调阈值或换配色零文档变更；仅需文档内轻量规则（静态数据、原型）的场景仍可在文档中表达视觉映射。
- 三层顺序确定且语义无歧义：文档保留静态基线与轻量规则，端口表达宿主动态策略。effective style 始终是 `(document, dataState, port)` 的纯函数，自动回退、快照与重放安全。
- 既有文档零迁移：无 `styleRules` 的文档渲染结果不变，含 `styleRules` 的文档继续正常打开与渲染，只是不再有内建编辑入口。
- 规则校验复用 Manifest `styleSchema` 与既有 fail-closed 渲染通道，不引入第二套样式校验语言。

明确推迟或非目标：

- 告警判定、阈值计算、滞回、优先级、确认/屏蔽、通知与告警中心等业务逻辑（归宿主端口内部，端口只收结果）。
- 以变量、其他组件数据、表达式语言或任意函数作为条件源；不接 CSS 字符串、`calc`、DOM 或宿主服务对象。
- 条件 props、条件几何/显隐、动画或过渡编排；端口只覆盖 `styleSchema` 内的样式键。
- Blueprint 的 `set-style` / `apply-style` action 及 trigger/action 集合变更（脉冲语义、恢复需重放、污染历史）。
- 异步 `resolve`、Promise 结果、缓存协议或端口生命周期管理。
- 把端口类型放进 contracts（裁决为 plugin-core，避免 contracts 反向依赖物料运行时类型）。
- 删除或迁移 `styleRules` 公共文档契约：需另行获得兼容策略批准，本主线不授权该变更。
- 新增依赖或 package。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0058 | `styleRules` 文档形态与上限、求值锚点与非 ready 不命中、合并顺序与 `styleSchema` 校验、数据刷新自动重评估、`update-components` 整体替换、fail-closed 排除方案 | 除决策 6 的内建编辑器外全部生效；该编辑器由 ADR-0066 取代 |
| ADR-0059 | `BaseScreenConditionalStylePort` 同步纯函数语义、Viewer/Designer `configure` 的 `conditionalStylePort` 与守卫 setter、三层合并顺序、fail-closed 与异常隔离、端口不进文档 | 全部生效，作为现行合并顺序第三层与端口归属（plugin-core）的来源 |
| ADR-0066 | Designer 移除条件样式作者界面、作者入口归宿主、文档契约与渲染求值保留、Blueprint 不新增样式动作、删除内建编辑器专属代码 | 全部生效；仅取代 ADR-0058 决策 6，不触及 ADR-0058 其余决策与 ADR-0059 |

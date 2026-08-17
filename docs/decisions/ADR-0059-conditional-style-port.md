# ADR-0059：宿主条件样式端口（渲染期纯函数覆盖）

> 状态：已接受
> 日期：2026-08-17
> 关联：[ADR-0058](./ADR-0058-component-conditional-style-rules.md)、[ADR-0023](./ADR-0023-host-dataset-resource-integration.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)

## 1. 背景

ADR-0058 落地了文档内声明式条件样式（`styleRules`）。实际集成反馈暴露出所有权问题：生产环境中
告警判定规则（阈值、滞回、优先级、确认/屏蔽）由宿主告警体系统一维护。当判定规则归宿主时：

- 把 `value > 80` 写进文档意味着把宿主判定复制进屏幕文档，两处维护必然漂移；宿主调阈值需要改文档并重新发布。
- 宿主已在 `resourcePort` 投影中携带判定结果（如 `{ value: 85, level: 'warn' }`），文档只需保留
  纯视觉映射（`level eq 'warn' → 红`）。这条路径 ADR-0058 已支持，但要求至少把「视觉映射」留在文档里。
- 部分宿主连视觉映射也不希望进文档：映射本身由告警体系配置派生，随告警策略版本化而非随屏幕文档版本化；
  或同一屏幕被多租户复用、每租户一套告警视觉策略。

因此需要一个「判定与映射都归宿主、屏幕只消费结果」的通道，同时不破坏 ADR-0058 建立的
声明式求值语义（纯投影、自动回退、快照/重放安全）。

## 2. 决策

1. plugin-core 新增宿主条件样式端口类型（与 `BaseScreenMaterialCatalog` 同层：端口请求引用
   `BaseScreenMaterialDataState`，不能下沉 contracts）：

   ```ts
   interface BaseScreenConditionalStyleRequest {
     readonly componentId: string;
     readonly dataState: BaseScreenMaterialDataState;
   }

   interface BaseScreenConditionalStylePort {
     resolve(request: BaseScreenConditionalStyleRequest): ScreenJsonObject | undefined;
   }
   ```

   `resolve` 是同步纯函数：相同 `(componentId, dataState)` 必须返回相同结果，不得产生副作用、
   不得异步（异步数据必须走 `resourcePort`/`refreshData` 产生新 `dataState` 后自然重求值）。
   返回值是样式覆盖键值（merge 语义，同 `styleRules` 的 `style`），`undefined` 表示无覆盖。

2. Viewer `configure` 与 Designer `configure` 新增可选 `conditionalStylePort`（权威原子入口，
   形状校验与 `resourcePort` 等同族：非对象或无 `resolve` 函数即整体失败、零副作用），
   并提供与 `resourcePort` 同形的守卫 setter 与只读 getter：Renderer 创建后拒绝变更并上报
   生命周期诊断，避免「看似生效实则未生效」陷阱。Designer 配置后设计态画布经同一 Renderer
   路径预览宿主告警样式。

3. Renderer 在 ADR-0058 的 effective style 求值点上按固定顺序合并三层：
   `base style → 命中的文档 styleRules → 端口覆盖`（同键后写覆盖先写）。求值点不变：初次挂载、
   reconcile、`dataState` 更新（含数据刷新）各一次。端口对每个组件都会被调用，请求携带完整
   `dataState`（含 idle/loading/error）——与 `styleRules` 的「非 ready 不命中」不同，端口可
   自行决定对 loading/error 施加样式（如降灰），这是宿主级视觉策略的合理表达。

4. 端口结果 fail-closed：覆盖与 base + 命中规则合并后必须过该物料 Manifest `styleSchema`
   校验（与 ADR-0016 决策 6、ADR-0058 决策 3 同一路径）。非法覆盖不抵达物料：本次求值忽略
   端口覆盖、保留 base + 规则结果，经既有诊断通道上报一条错误（path 指向该组件）。`resolve`
   抛异常同路径隔离：忽略覆盖 + 诊断，不中断整次渲染、不影响其他组件。effective style 仍只存在于
   运行时 model，不回写文档、不产生历史记录。

5. 端口不进文档、不序列化、不进 JSON Schema；无端口的实例行为与现状逐字节一致。

## 3. 非目标

- 告警判定、阈值计算、滞回、通知等业务逻辑（宿主端口内部的事，本端口只收结果）。
- 异步 resolve、Promise 结果、缓存协议或端口生命周期管理。
- 条件 props、条件几何/显隐；端口只覆盖 `styleSchema` 内的样式键。
- Blueprint trigger/action 变更；文档 `styleRules` 契约变更（两者保持 ADR-0058 原样）。
- 新增依赖或 package。

## 4. 排除方案

- **宿主把全部映射写进文档 `styleRules`（ADR-0058 现状唯一路径）**：判定归宿主时文档被迫复制
  判定结果或映射，随告警策略变动的配置要改屏重发；多租户同屏不同告警视觉无法表达。保留为无
  宿主告警体系的轻量场景（静态数据、原型）。
- **Blueprint `apply-style` action**：ADR-0058 已拒绝，理由不变（脉冲语义、恢复需重放、污染历史）。
- **`resourcePort` 投影里直接改样式**：数据通道被滥用为样式通道，物料收到的 `value` 不再是业务数据，
  破坏数据绑定与调试可见性。
- **端口返回完整 style 而非覆盖**：要求宿主了解并复述物料全部样式键，base style 一变即漂移；
  覆盖语义与 `styleRules` 一致且宿主只声明差异。
- **端口放 contracts**：请求需要 `BaseScreenMaterialDataState`（plugin-core 类型），contracts 不能
  反向依赖 plugin-core；`BaseScreenMaterialCatalog`/`BaseScreenRuntimeContributionIndex` 已确立
  「引用物料运行时类型的宿主配置类型归宿 plugin-core」的先例。

## 5. 结果

- 宿主告警体系成为判定与视觉映射的唯一事实源：屏幕文档零告警知识，调阈值/换配色零文档变更。
- 同一组件三层顺序确定：文档保留静态基线与轻量规则，端口表达宿主动态策略，语义无歧义。
- 声明式核心不变：effective style 仍是 `(document, dataState, port)` 的纯函数，自动回退、
  快照安全；离线打开无端口实例退回文档规则路径。

# ADR-0090：宿主在线物料包与 catalog 热刷新

> 状态：已接受  
> 日期：2026-10-25  
> 关联：ADR-0003（Web Component 物料 ABI 与注册）、ADR-0027（轻量基座与宿主处理）、
> ADR-0029（宿主托管可信物料包分发）、ADR-0074（外围插件区与依赖分区）、
> ADR-0075（外围插件兼容策略）、ADR-0084（插件贡献词汇与信任）、
> [ADR-0089](./ADR-0089-host-owned-image-assets-and-unified-resource-selection.md)（图片资产与统一选择桥）。
> 历史 ADR 正文只存在于 git 历史（docs 树已退役），此处只引用编号与主题。

> 2026-10-25 评审通过，本 ADR 生效。实施按“实施切片”分批提交；公共 API、changeset 与验证随实现批次更新。
> 2026-10-25 基座侧 diff / `refreshCatalog` / renderer 热交换与宿主示例「在线物料」管理面板均已落地；
> browser harness 的专项 case 仍可后续补充。

## 背景

宿主需要在自己的在线平台生成物料代码包（React / Vue / 原生 Web Component 构建为 ESM），审核后加载到
Base Screen。既有约束：

- 在线包是宿主管理员审核后的**同 realm 受信代码**；Base Screen 不 fetch、不动态 import、不发现、
  不验签（ADR-0029）。远程性只存在于宿主的构建、分发与加载阶段。
- 物料 ABI 是 Custom Element constructor + 实例级不可变 catalog（ADR-0003）。`createMaterialPackage()`
  在 `define()` 前完成全部 Manifest 校验；浏览器无法撤销已注册的 Custom Element 定义。
- Designer 的 catalog 在 `configure()` 后不可更换；当前唯一更新方式是 `unload()` 后重建实例。
- Renderer 创建时捕获 catalog；重新渲染时只要 `existing.type === candidate.type` 就复用已挂载元素。
- 文档只持久化物料的 `type`；Manifest 不允许 URL、来源、版本字段。

产品要求：在线物料发布后，设计器**不刷新页面**即可完成四类变更：新增物料、替换已有物料代码、更新已有
物料 Manifest、下架/移除物料。在线包只带物料，不带插件贡献；只允许宿主研发/管理员创建。

## 决策

### 1. 公共 API

```ts
export interface BaseScreenMaterialCatalogRefreshResult {
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

// <base-screen-designer>
refreshCatalog(catalog: BaseScreenMaterialCatalog):
  ScreenParseResult<BaseScreenMaterialCatalogRefreshResult>;
```

- 只在 `configure()` 成功后可用；未配置或已销毁返回 `PLUGIN_CORE_LIFECYCLE_INVALID`。
- 未加载文档：只交换 catalog、重建 material library items/grouping、返回 diff。
- 已加载文档：先做全量预检，再交换 catalog、重渲染；保留 session、history、selection 与
  `DataSourceRuntime`。
- 全有或全无：任何不兼容都拒绝；catalog、文档、DOM、历史与数据源状态保持原样。
- `catalog` setter 的“初始化后拒绝变更”语义保留；`refreshCatalog` 是唯一的初始化后入口。
- 返回的 `added` / `changed` / `removed` 按 type 排序；无变化时三者均为空数组。
- `unload()` 之后 renderer 不存在，但仍可调用 `refreshCatalog` 更新 catalog，供下一次加载使用。

### 2. 差异与不变判据

在 `@base-screen/plugin-core` 增加纯函数 `diffBaseScreenMaterialCatalogs(before, after)`，engine 与
renderer 共用同一份比较口径（复用 `@base-screen/contracts` 的 `screenJsonEquals`）：

- **unchanged**：同 type，Manifest 结构相等，且 `constructor`、`tagName`、`tabularDataAdapter` 引用相同。
  宿主周期性重建 catalog 不应导致无关物料重挂载或重新取数。
- **changed**：同 type，但上述任一项不同。
- **implementationChanged**：changed 的子集，仅 constructor / tagName / `tabularDataAdapter` 引用变化；
  只有这些类型需要重挂载，Manifest-only 变化只重算 model 与面板。
- **added**：新 type。
- **removed**：旧 type 在新 catalog 中不存在。

移除的类型只要有组件引用，整次刷新拒绝。Material library items/grouping 引用被移除类型时同样拒绝，
复用既有 `validateBaseScreenMaterialLibraryGroupingForCatalog` 与
`resolveBaseScreenMaterialLibraryItems`。

### 3. 兼容矩阵

| Manifest 变化 | 文档兼容校验 | 是否重挂载 |
| --- | --- | --- |
| name / category / keywords / cover / libraryVisible / panel descriptors | 无 | 否（若宿主用新 tag 发布则随 tag 重挂载） |
| defaultSize / defaultProps / defaultStyle / defaultData | 无；只影响新插入 | 否 |
| propsSchema / styleSchema | 校验所有同型组件的 props / style / styleRules | 否 |
| dataCapabilities / dataBinding / staticData / tabularDataAdapter | 校验现有取值引用、binding 与 tab 适配器 | 否 |
| events | 校验 blueprint 中引用该物料事件的 action 仍有效 | 否 |
| designCapabilities.children 变为 false | 该类型仍有子组件则拒绝 | 否 |
| constructor / tagName | 代码身份变化 | 是 |
| 移除类型 | 有组件引用则拒绝；无引用才允许 | — |

校验复用 `prepareCandidates` 的既有路径（临时 validation cache + 现有 `DataSourceRuntime`），只读、
不发请求、不改 mounted。blueprint 事件校验与 `designCapabilities.children` 校验在 Engine 侧补足。
诊断复用既有码，不新增：

- 缺失/移除被引用：`PLUGIN_CORE_IDENTITY_INVALID`
- 结构能力收回：`PLUGIN_CORE_CAPABILITY_INCOMPATIBLE`
- 事件被移除：`PLUGIN_CORE_EVENT_PAYLOAD_INVALID`
- 生命周期：`PLUGIN_CORE_LIFECYCLE_INVALID`
- props/style schema 违例：沿用 `prepareCandidates` 输出的 `PLUGIN_CORE_MANIFEST_FIELD_INVALID` 等。

### 4. Renderer：`setCatalog`，不销毁重建

- `RendererState` 持有可变 `catalog`；`render()` 与 `prepareCandidates` 读 state，不再读只读 options。
- 新增 `validateCatalog(document, catalog)`：用临时 validation cache 与现有运行时预检，返回诊断；
  不改 catalog、不挂载、不发请求。
- 新增 `setCatalog(catalog)`：用 diff 标记 `implementationChanged` 与 removed types，清 validation cache，
  更新 state.catalog；下一次 render 只对 implementationChanged / removed 类型移除旧元素并用
  `new entry.constructor()` 重建。Manifest-only changed 类型保留元素，下一次 render 重算 model 与面板，
  满足兼容矩阵中「不重挂载」的语义。
- 未变类型在 catalog 重建后 entry 引用会变。为避免 model 守卫失效导致整屏重写 `element.model`，
  `setCatalog` 只把未变类型的 `applied.entry` 更新为新 entry，保留 `appliedModel`；Manifest-only changed
  类型刻意保留旧 applied，让下一次 render 重算 model。这样未变类型不重挂载、不重取数、不闪烁。
- Validation cache 以 `component + entry` 为键，新 entry 自动失效；清空缓存只影响 CPU，不影响视觉。
- 不选择 engine `dispose` / 重建 renderer：会丢失 `DataSourceRuntime` 结果、已挂载元素、选择/滚动/几何
  状态，并强制重新取数与闪烁。`setCatalog` 保留会话与数据源实例。

### 5. Tag 策略（平台限制）

`customElements.define()` 注册后不能覆盖同一 tag。热替换已有物料代码的规则：

1. 物料 `type` 跨构建稳定；文档只存 `type`。
2. 每次构建发布**新 tagName + 新 constructor**。tag 使用构建 token / 内容哈希后缀，例如
   `base-screen-online-chart-a1b2c3d4`。
3. 禁止 `v2`、`-vN`、`apiVersion`、`schemaVersion` 等版本标记；不使用按版本区分的分支或公共名称。
4. 旧 Custom Element 定义保留在 registry；Engine 把该 type 视为 changed 并重挂载。
5. 宿主要限制每页成功热更次数（建议 32 次），达到上限后提示整页刷新。Engine 不检查全局 registry，
   该上限由宿主自律。
6. 拒绝稳定 wrapper element / 第二 ABI：那会让 renderer 不再只 `new entry.constructor()`，把生命周期、
   事件与动态实现转发引入 Engine，且 tag 不再标识实际代码。

这条决策细化了 ADR-0029 中“稳定 `type`/`tagName`”的表述：**文档身份只要求 `type` 稳定；`tagName`
是构建产物的一部分，可以随热更新变化。** 物料不允许通过重命名 `type` 来“更新”，那等于删除旧类型
并新增类型。

### 6. 下架与移除

- 推荐先做**软退**：发布一个 `libraryVisible: false` 的 Manifest。它从物料库隐藏、禁止新插入，但 catalog
  仍能解析该 type，旧文档继续渲染。`libraryVisible` 变化不需要文档兼容校验。
- 硬移除只在没有组件引用时允许。被引用时整次刷新拒绝，宿主必须先迁移/替换文档中的组件，或保留软退。
- 后续打开含已移除类型的文档：Designer 的 `prepareCandidates` 报 `PLUGIN_CORE_IDENTITY_INVALID` 并
  fail closed；Viewer 的 `componentFailurePolicy: 'skip'` 跳过该组件并上报诊断，不让整屏空白。

### 7. 失败、回滚与诊断

- 预检失败：零副作用；宿主保留旧 catalog，向用户展示返回的诊断。
- 交换后渲染失败：恢复旧 catalog 并重渲染旧文档；文档、历史、选择与数据源状态不变。
- 宿主 import / define 失败：根本不调用 `refreshCatalog`；旧 catalog 继续工作。
- 多实例：宿主对每个 Designer 实例分别调用 `refreshCatalog`；Base Screen 不建立全局广播或跨实例
  catalog 同步。
- 不新增诊断码；如果需要更细的失败归因，先在现有 `PLUGIN_CORE_*` / `AUTHORING_*` 码内表达。

### 8. 信任、安全与宿主流程

- 在线包是宿主管理员审核后的同 realm 受信代码；Shadow DOM、Manifest 校验与 catalog 不是安全沙箱。
- 审核、完整性校验、签名、缓存、CSP、CORS、更新与回滚全部归宿主；Base Screen 不承担网络与部署。
- Manifest、editor descriptor、Screen Document 与宿主快照继续保持零凭证：不写 URL、SQL、header、
  token、DOM 引用、函数或框架实例。
- 在线包只带物料；检查器控件、面板、命令等插件贡献不在本轮范围，需要时走既有插件通道，不混入
  物料包刷新。
- 终端租户自助创建物料必须先有独立威胁模型 ADR 与不可信执行模型；本轮明确不做。

宿主推荐流程：

1. 构建 ESM + Manifest，生成内容哈希。
2. 发布到制品库/CDN，走审核与激活。
3. 按哈希 cache-bust `import()` 新包。
4. `customElements.define` 新 tag；用 `createMaterialPackage().define()` 完成 Manifest 一致性与重复
   身份校验。
5. 用全部激活物料重建完整 catalog（不是增量拼接）。
6. 调用 `refreshCatalog(catalog)`；失败时保留旧 catalog 并展示诊断。
7. 用宿主自己的 `materialLibraryState` 展示“有新版本/加载失败”等状态；Base Screen 不比较版本、不
   轮询远端。

## 后果

- `@base-screen/plugin-core` 新增 catalog diff 纯函数；`@base-screen/renderer` 新增 `validateCatalog` /
  `setCatalog`；`@base-screen/engine` 新增 `refreshCatalog` 并更新 API 报告与 changeset。
- Designer 的 catalog 生命周期从“configure-only”变为“configure + 显式热刷新”，但 setter 仍拒绝
  初始化后的隐式变更。
- 热更新代码会产生新的 Custom Element 定义；registry 随发布次数增长，宿主必须有上限与整页刷新策略。
- 文档身份保持稳定：Screen Document 仍只存物料 `type`；不新增版本字段、不新增渲染 ABI。
- 在线包只覆盖物料；插件贡献的运行时刷新是另一个问题，不在此 ADR 内。
- 需要 browser harness 覆盖新增、代码替换、Manifest 更新、下架与拒绝回滚五类场景。

## 被拒方案

- **Engine 内置 fetch / dynamic import / 远端发现 / 验签**：违反 ADR-0027 与 ADR-0029；会把网络、
  缓存、部署与信任策略拉进基座。
- **由文档、URL 或包名驱动模块加载**：文档不得选择可执行代码。
- **iframe 沙箱渲染受信在线物料**：现有远程沙箱只有 `ready` / `emit-event`，且不接入物料渲染；引入
  渲染协议需要独立威胁模型 ADR，本轮不做。
- **稳定 wrapper element / 第二渲染 ABI**：违反“renderer 只 `new entry.constructor()`”的授权面。
- **Manifest 版本字段 / `apiVersion` / `schemaVersion`**：违反探索期命名规则与 ADR-0075。
- **自动迁移文档以适配破坏性 Manifest 变更**：会把宿主数据迁移策略拉进 Engine；本轮要求宿主先迁移
  或发布新 type。
- **整实例 `unload()` + 重建实现热更新**：会丢失会话、历史、选择与数据源结果，并闪烁；只作为宿主在
  破坏性变更时的兜底。

## 开放问题

1. `events` 变更是否一律纳入 blueprint 校验？推荐纳入；实现成本过高时改为要求新 type。
2. Viewer 是否也需要公开 `setCatalog`？本轮只设计 Designer；Viewer 热刷新作为后续切片。
3. 热更次数上限由 Engine 警告还是宿主自律？推荐宿主自律（建议 32 次/页），Engine 不扫描全局 registry。
4. 元数据-only 变更是否允许不换 tag、直接覆盖 catalog Manifest？需要明确“catalog 是展示权威”还是
   “constructor 静态 Manifest 是唯一权威”；推荐生产包统一换 tag，避免双权威。
5. 破坏性 Manifest 变更是否需要宿主侧文档迁移工具？推荐先保持“拒绝热更”，迁移工具另立项目。
6. 多实例刷新顺序与失败隔离：推荐宿主逐个调用并独立处理诊断，不做跨实例事务。

## 实施切片

1. **plugin-core diff（已完成）**：`diffBaseScreenMaterialCatalogs` 与单元测试；覆盖 unchanged /
   changed / added / removed 与 adapter 身份。
2. **engine `refreshCatalog`（已完成）**：catalog 预检、library items/grouping 校验、单事务式交换、
   诊断返回；更新 `engine.api.md`、changeset、公共 API 测试。
3. **renderer `validateCatalog` / `setCatalog`（已完成）**：changed types 重挂载、未变类型保留
   applied key、失败回滚；更新 `renderer.api.md` 与测试。
4. **宿主示例在线物料管理（已完成）**：`examples/shared-backend` 新增 `MaterialPackage` 模型与
   CRUD/上下架/引用保护接口；三端共享 `online-materials.ts` 面板，按模板生成 ESM + Manifest，
   发布代码 / 仅更新清单 / 上下架 / 删除保护；发布后经 `refreshCatalog` 热刷新，刷新页面后重新加载。
5. **harness（待补充）**：`?designer&case=catalog-refresh-add|update|remove|code`；断言新增可用、
   代码替换重挂载、Manifest 不兼容拒绝、被引用移除拒绝、软退后旧文档仍渲染。
6. **文档与宿主治理（已完成）**：更新 AGENTS.md、CONTEXT.md、integration-capabilities、示例
   README 与宿主 Skill 的 build-token tag 规则。

## 验证

- 单元测试：diff 判据、兼容矩阵每一行、全有或全无、removal 拒绝、library items/grouping 拒绝。
- renderer 测试：未变类型不重挂载/不重取数；changed type 只重挂载自身；失败回滚后 DOM 与 catalog
  不变。
- harness：新增、代码替换、Manifest 更新、下架、拒绝回滚五类场景。
- 交付前运行 `pnpm test:scope --since <ref>`；影响包/公共契约时运行 `pnpm verify:m0` 与
  `pnpm check:api-changesets`。

## 确认记录

2026-10-25 用户评审通过 ADR-0089 与 ADR-0090。本 ADR 自即日接受；在线物料包、catalog 热刷新与
tag 策略按上述决策执行。基座侧能力与宿主示例管理面板已落地；剩余 harness 专项 case 按切片 5 补充。

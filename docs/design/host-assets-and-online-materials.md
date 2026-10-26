# 宿主图片资产与在线物料：端到端设计

> 状态：已评审（ADR-0089 / ADR-0090 于 2026-10-25 接受）；统一选择桥、catalog 热刷新、
> 宿主示例素材库与在线物料管理面板均已实现  
> 关联：[ADR-0089：宿主拥有图片资产与统一资源选择桥](../decisions/ADR-0089-host-owned-image-assets-and-unified-resource-selection.md)、
> [ADR-0090：宿主在线物料包与 catalog 热刷新](../decisions/ADR-0090-online-material-packages-and-catalog-hot-refresh.md)  
> 页面视觉：[宿主素材库与图片选择器 · OpenDesign Brief](./host-asset-library-opendesign-brief.md)

本文把两个 ADR 的决策放进同一条宿主接入链路，说明谁拥有什么、用户走哪条路径、失败时停在哪、
后续按什么顺序实现。规范结论以两份 ADR 为准；本文不重复全部契约细节。

## 目标与非目标

**目标**

- 宿主可以在自己的素材库中上传、浏览、选择和替换图片，设计器只保存资源身份。
- 组件检查器与画布背景可以打开宿主的同一个图片选择器，不需要两套协议。
- 宿主可以在线生成物料代码包，审核后加载；设计器不刷新即可新增、替换代码、更新 Manifest、下架。
- Base Screen 不新增资产目录、Store、网络客户端、后端或任务队列。

**非目标**

- 不让终端租户自助上传可执行物料代码。
- 不在 Base Screen 内实现图片上传、存储、转码、CDN、删除保护或素材搜索。
- 不给 `base.image` 增加 `src` prop，不把图片地址从“数据值”改成“物料属性”。
- 不给画布背景增加资源身份字段（本轮保持 URL 例外）。
- 不在本轮刷新插件贡献（检查器控件、面板、命令）；在线包只带物料。
- 不在本轮做 Viewer 热刷新；先完成 Designer。

## 所有权矩阵

| 能力 | 宿主 | Base Screen | 权威落点 |
| --- | --- | --- | --- |
| 图片上传、存储、转码、缩略图、CDN | 拥有 | 不实现 | 宿主后端 |
| 素材列表、搜索、分页、权限 | 拥有 | 不实现 | 宿主后端/前端 |
| 素材库面板 UI | 拥有 | `leftPanelGroups` slot | 宿主前端 |
| 图片选择器 UI | 拥有 | 统一 request/commit 桥 | 宿主前端 + ADR-0089 |
| 组件图片身份 | 解析 `resourceId` | 只存 `host-resource` | Screen Document |
| 图片失败回退 | 提供可解析 URL | 有界校验 + 占位 | `base.image` |
| 删除保护 | 扫描引用、软删除/拒绝 | 不跟踪引用 | 宿主后端 + ADR-0089 |
| 在线物料构建、发布、审核、完整性 | 拥有 | 不实现 | 宿主平台 |
| 在线物料加载与注册 | `import()` + `define()` | 只接收 catalog | 宿主 + ADR-0029 |
| 在线物料热刷新 | 重建 catalog 并调用 | `refreshCatalog` + renderer `setCatalog` | ADR-0090 |
| Manifest/文档凭证约束 | 双方遵守 | 校验与失败关闭 | 契约 + ADR-0029/0084 |

## 图片资产：端到端

### 1. 上传与入库

1. 宿主管理员在宿主素材库上传图片；宿主完成鉴权、MIME/尺寸限制、解码/转码、缩略图与内容寻址存储。
2. 宿主返回一个素材身份（`resourceType` + `resourceId`）和一个可预览 URL；URL 只用于宿主自己的列表，
   不写入 Screen Document。
3. 宿主维护引用扫描与删除保护；被屏幕引用的素材默认不可硬删除，或软删除后 `resolve` 返回
   `HOST_RESOURCE_UNAVAILABLE`。
4. 示例宿主另提供设计器内**临时上传**：素材仍由宿主存储，绑定当前大屏，仅该屏设计器可见；
   公共素材上传/删除在后台 `#/assets`。临时素材默认 7 天，保存续期、删屏/过期清理；文档仍只存身份。

### 2. 素材库浏览与插入

1. 宿主通过 `leftPanelGroups` 在自己的左栏 slot 渲染素材库（默认仅 Canvas 模式）。
   面板容器已提供 12px 内边距与「分组名 / HOST」列头，宿主内容只填充容器内部，不再叠加
   外层留白或重复标题；配色、圆角与间距使用与设计器一致的令牌副本，避免宿主品牌色与
   设计器控件混排。
2. 点击插入：宿主调用 `insertHostResource`，传入 `materialType: 'base.image'` 与
   `dataSource: { type: 'host-resource', resourceType, resourceId, params: {}, binding: null }`。
3. 拖拽插入：宿主用固定 MIME `application/x-base-screen-host-resource` 写入严格 JSON；Engine 在 drop
   时重新解析并校验。
4. 插入提交为单次 Core transaction；新组件自动选中。
5. 设计器左栏只消费「公共素材 + 当前屏临时素材」；公共上传与删除在后台素材页，左栏只保留临时上传。

### 3. 替换已选图片

1. 宿主监听公开的 `base-screen-selection-change`，读取当前选中组件。
2. 选中组件是 `base.image` 时启用“替换”；宿主调用
   `replaceHostResource(componentId, intent)`，只 patch `dataSource`，保持组件几何、样式与层级。
3. 替换后派生数据源 id 不变，但 source 变化；`DataSourceRuntime` 以 source 为请求键的一部分，会自动
   取消旧请求并重新解析，不需要额外刷新调用。

### 4. 检查器选图

1. 设计器在数据面板现有五段之一渲染“选择素材”按钮（宿主通过 `hostResourceSelectionButton` 启用；
   物料还须同时声明 `host-resource` 能力与 `hostResourceSelection: true`，当前只有 `base.image`
   满足）。仅声明 `host-resource` 的读数、图表等物料不显示该入口。
2. 点击后派发 `base-screen-host-resource-selection-request`，携带 `target`（组件或画布背景）与
   `current`（none / url / host-resource / other）。
3. 宿主打开自己的选择器；用户确认后调用 `commitHostResourceSelection`，携带 `requestId` 与选择结果。
4. Engine 校验 pending 会话与代际、目标、Manifest 能力、资源类型与 URL 规则，然后提交一个 Core transaction：
   - 组件：`update-components` patch 只写 `dataSource`；目标组件必须没有 `dataValue` 键，
     因为命令不能删键，而契约禁止两种取值写法同时出现；
   - 画布背景：`update-canvas` patch `backgroundImage` / `backgroundImageFit`。
5. 失败关闭：request 过期、目标已删除、类型不匹配、资源类型未声明、URL 非法都返回稳定诊断，不写入
   文档；验证失败保留 pending，宿主可用同一 requestId 重试。

### 5. 渲染与失败

- `base.image` 只接受有界图片 URL（http/https、协议相对、`/`、`./`、`../`）；拒绝 `data:`、`blob:`、
  `javascript:`、`file:`。
- 空值 → `HOST_RESOURCE_INVALID`（未设置图片）；非法 URL → `HOST_RESOURCE_INVALID`（图片地址无效）；
  加载失败 → `HOST_RESOURCE_FAILED`（图片加载失败），显示 fail-closed 占位。
- 签名 URL 过期后由宿主触发 `refreshData(componentId)` 重新解析；Engine 不代理、不预取、不重试。

### 6. 画布背景

- 画布背景仍存 `canvas.backgroundImage` 的有界 URL（ADR-0077 的唯一例外）。
- 宿主素材库“设为背景”时，必须把素材解析成稳定 URL；不要写短期签名 URL。
- 检查器背景按钮与组件选图共用统一桥的 `canvas-background` 目标；`backgroundImageFit` 随提交更新。
- 未来若需要画布背景也存身份，另立 ADR，不在本轮扩契约。

### 7. 删除与下架

- 宿主负责引用扫描：已保存屏幕、草稿与（按策略）历史快照。
- 推荐软删除：素材标记不可用，`resolve` 失败，文档保留身份并显示占位；用户可替换后再硬删除。
- 硬删除被引用素材应被宿主拒绝，并展示引用数量/位置；Base Screen 不做引用计数。

## 在线物料：端到端

### 1. 构建与发布

1. 宿主管理员在宿主在线平台编写/生成物料代码（React / Vue / 原生 Web Component）。
2. 宿主构建为 ESM，生成 Manifest（`type` 稳定、`tagName` 带构建 token、无 URL/版本字段）与内容哈希。
3. 宿主走审核、完整性校验、发布/激活；构建产物与审核记录留在宿主，不进入 Screen Document。

### 2. 加载与注册

1. 宿主按内容哈希 cache-bust `import()` 新包；Base Screen 不参与网络请求。
2. 宿主调用 `createMaterialPackage({ id, materials }).define()`：在注册前完成 Manifest 解析、静态
   Manifest 一致性、重复 `type`/`tagName` 校验，并注册新的 Custom Element tag。
3. 宿主用全部激活物料重建完整 catalog；不把新旧 catalog 做增量拼接。
4. 宿主调用 `designer.refreshCatalog(catalog)`；Engine 预检通过后交换并重渲染。

### 3. 四类热更新

| 场景 | 宿主动作 | Base Screen 行为 |
| --- | --- | --- |
| 新增物料 | 加载新包、define 新 tag、重建 catalog | 新类型进入物料库，可插入 |
| 替换代码 | 新包用同 `type`、新 `tagName` + 新 constructor | 删除旧挂载元素，用新 constructor 重挂载该类型 |
| 更新 Manifest | 新包 + 兼容的新 Manifest | 校验现有组件；通过则更新 model/面板；constructor/tag 未变则不重挂载，换 tag 则随该类型重挂载 |
| 下架 | 先 `libraryVisible: false` 软退；确认无引用后移除 | 软退隐藏物料库但旧文档继续渲染；硬移除被引用则拒绝 |

### 4. 失败与回滚

- 预检失败：不改 catalog、不改文档/DOM/历史/数据源；返回诊断，宿主保留旧 catalog。
- 交换后渲染失败：恢复旧 catalog 并重渲染旧文档；宿主展示错误并要求重试或整页刷新。
- import/define 失败：宿主不调用 `refreshCatalog`，旧 catalog 继续工作。
- 后续打开含已移除类型的文档：Designer fail closed；Viewer skip 该组件并上报。
- 多实例：宿主逐个实例调用 `refreshCatalog`；基座不做跨实例广播。

### 5. 平台限制

- `customElements.define()` 不能覆盖同一 tag；代码替换必须用新 tag。旧定义保留在 registry，宿主限制
  每页成功热更次数（建议 32 次），达到上限后整页刷新。
- 不使用稳定 wrapper element 或第二渲染 ABI；renderer 仍然只 `new entry.constructor()`。
- 物料 `type` 是文档身份，跨构建稳定；`tagName` 是构建产物，可随热更新变化。

## 交互契约摘要

### 统一资源选择桥（ADR-0089）

```ts
requestHostResourceSelection(target: BaseScreenHostResourceSelectionTarget): boolean;
commitHostResourceSelection(
  commit: BaseScreenHostResourceSelectionCommit,
): ScreenParseResult<ScreenDocument>;
```

- 事件：`base-screen-host-resource-selection-request`。
- 目标：`canvas-background` 或 `component`。
- 选择：`url` 或 `host-resource`（canvas 只接受 `url`）。
- 守卫：requestId + pending kind + authoring generation、目标存在、类型匹配、Manifest 能力、
  资源类型声明、URL/凭证规则；请求携带实例与修订供宿主关联，提交不以其为条件。
- 提交：单事务；组件 patch 只写 `dataSource`，且只接受没有 `dataValue` 键的组件。

### Catalog 热刷新（ADR-0090）

```ts
refreshCatalog(catalog: BaseScreenMaterialCatalog):
  ScreenParseResult<BaseScreenMaterialCatalogRefreshResult>;
```

- 全有或全无；初始化后唯一 catalog 更新入口。
- 差异按 `type` 比较；Manifest 结构相等 + constructor/tagName/adapter 引用相同视为未变。
- implementation-changed types（constructor / tagName / adapter）重挂载；Manifest-only changed 只重算
  model/面板；未变类型保留 applied key，不重写 model。
- 被引用移除拒绝；推荐 `libraryVisible: false` 软退。
- 不新增诊断码，不新增文档版本字段。

## 安全与威胁模型摘要

- **信任边界**：在线物料是宿主管理员审核后的同 realm 受信代码；Shadow DOM、Manifest 校验与 catalog
  不是安全沙箱。终端租户自助创建需要独立威胁模型 ADR。
- **文档零凭证**：Screen Document 不写 URL、token、header、cookie、SQL、脚本、传输配置；组件图片只存
  host-resource 身份。
- **网络归宿主**：上传、签名、CDN、缓存、重试、长任务全部在宿主；Engine 只做有界 request/commit。
- **图片注入面**：只接受有界 URL；拒绝 `data:`/`blob:`/`javascript:`/`file:`；宿主对 SVG 消毒或栅格化。
- **在线包**：Manifest 不含 URL/来源/版本字段；包来源、完整性、签名、CSP/CORS 由宿主负责。
- **失败关闭**：非法选择、未声明资源类型、未授权物料、被移除物料、过期请求都失败关闭，不静默降级。

## 开放问题

1. 画布背景长期是否也改成资源身份？推荐本轮保持 URL 例外，未来单独 ADR。
2. 删除保护的“被引用”范围：发布屏 / 草稿 / 历史快照？推荐发布 + 草稿；历史快照只读保留。
3. 签名 URL TTL 与刷新：推荐宿主保证 TTL 覆盖会话，过期由宿主 `refreshData` 重解析。
4. 热更次数上限：推荐宿主自律 32 次/页；Engine 不强制。
5. Manifest 破坏性变更：推荐永久拒绝热更，宿主先迁移文档或发布新 type，不做自动迁移。
6. `events` 变更是否纳入热更校验？推荐纳入；实现成本过高时改为要求新 type。
7. Viewer 热刷新：本轮只设计 Designer；Viewer 的公开 `setCatalog` 作为后续切片。
8. 统一桥是否扩展到其他 `host-resource` 物料？形状已通用，首个实现只做图片入口。
9. OpenDesign 是否覆盖在线物料管理页？推荐先做素材库/选择器/背景流程；示例已扩展素材后台页 `#/assets`，在线物料管理页仍可作为后续切片。

## 实现切片

1. **宿主示例素材库（已完成）**：`examples/shared-backend` 新增 assets 模块、Prisma 模型、上传与
   内容服务；三端 `examples/*-host/src/screen/asset-library.ts` 与资源类型贡献；左栏分组、
   插入/替换/设为背景、统一选择器与删除保护；后端 e2e、根级示例测试与手工浏览器验收。
   browser harness 的独立案例仍可作为后续补充。
   **2026-10-26 扩展**：三端新增 `#/assets` 后台素材页；左栏改为只消费 + 临时上传（绑定当前大屏）；
   后端增加 `temporary/screenId/expiresAt`、保存续期、删屏与过期清理、临时内容 `no-store`；
   示例无鉴权，`screenId` 过滤只是应用层可见性。
2. **统一选择桥（已完成）**：engine selection pending/session、request event、commit 方法；替换画布背景
   专用协议；数据面板按钮；更新 `engine.api.md`、changeset、测试与 harness（canvas + image）。
3. **Catalog 热刷新（已完成）**：plugin-core diff 纯函数；engine `refreshCatalog`；renderer
   `validateCatalog` / `setCatalog`；更新 `renderer.api.md`、changeset；harness 覆盖新增/代码替换/
   Manifest 更新/下架/回滚。
4. **宿主示例在线物料管理（已完成）**：后端 `MaterialPackage` 模型 + CRUD/上下架/引用保护；
   三端共享「在线物料」面板，模板生成 ESM + Manifest，支持发布代码、仅更新清单、上下架、
   删除保护，并通过 `refreshCatalog` 热刷新；刷新页面后从后端重新加载。
5. **文档与宿主治理（已完成）**：更新 AGENTS.md、CONTEXT.md、`.base-screen/integration-capabilities.json`、
   示例 README 与宿主 Skill 的 build-token tag 规则、素材库边界。

每个切片的验收与验证命令写在各 ADR 的“实施切片/验证”小节；合并前按仓库规则运行
`pnpm test:scope --since <ref>`，影响包或公共契约时运行 `pnpm verify:m0`。

## 页面设计与 OpenDesign

- 页面视觉与交互稿交给 OpenDesign；本目录的
  [OpenDesign Brief](./host-asset-library-opendesign-brief.md) 是交接输入。
- 范围：宿主素材库左栏、图片选择器、画布背景流程；在线物料管理页可选。
- 后台素材页 `#/assets` 以现有数据源后台页的表格/筛选/空态为基线；brief 的 P1/T4 覆盖的是设计器左栏历史形态。
- 设计以 Base Screen 现有令牌与系统清单为基线，不新增设计系统；选择器是宿主页面，不依赖 Engine
  私有 Shadow DOM。
- OpenDesign 原型是中间产物；方向确认后实现必须落到仓库代码并验证，不以原型交付收尾。

## 验证

- 文档层：检查本文件与两份 ADR 的路径、术语与边界一致；所有引用的源码路径存在。
- 实现层（后续）：按各 ADR 的测试与 harness 清单验证；重点验证“文档只存身份”“未变类型不重挂载”
  “失败全有或全无”“被引用移除拒绝”。
- 页面层：OpenDesign 原型按 brief 的状态矩阵与评审清单验收；实现后对照定稿做浏览器级检查。

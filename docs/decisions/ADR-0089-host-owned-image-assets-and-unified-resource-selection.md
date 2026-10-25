# ADR-0089：宿主拥有图片资产与统一资源选择桥

> 状态：已接受  
> 日期：2026-10-25  
> 关联：ADR-0018（宿主意图、资产与图形 Blueprint）、ADR-0027（轻量基座与宿主处理）、
> ADR-0046（画布背景图请求/提交）、ADR-0062（宿主左侧分组）、ADR-0064（宿主资源 Authoring Intent）、
> ADR-0077（画布背景与颜色作者面）、ADR-0085（文本与图片物料作者面）。
> 这些历史 ADR 正文只存在于 git 历史（docs 树已退役），此处只引用编号与主题。

> 2026-10-25 评审通过，本 ADR 生效。实施按“实施切片”分批提交；公共 API、changeset 与验证随实现批次更新。
> 2026-10-25 引擎侧统一选择桥、catalog 刷新与宿主示例素材库（上传/列表/插入/替换/背景/删除保护）均已落地。

## 背景

Base Screen 没有资产领域模型，图片只有两条既有通道：

- `base.image` 的图片地址是**数据值**：`defaultData: ''`，`staticData` 为标量字符串，
  `dataCapabilities` 为 `['static', 'host-resource', 'variable']`；fit 是样式 `objectFit`。
  物料在渲染时对最终字符串做有界 URL 校验，非法或加载失败时 fail closed。
- 画布背景直接存有界展示 URL（`canvas.backgroundImage`），只经 `isBoundedScreenImageUrl` 校验后写入
  CSS `url()`（ADR-0077）。

宿主的资源能力已经存在：组件可以绑定 `host-resource` 数据源（只存 `resourceType` / `resourceId`），
宿主通过 `ScreenHostResourcePort.resolve` 解析成值；`insertHostResource` / `replaceHostResource` 是公开
作者入口，宿主资源目录通过 `leftPanelGroups` slot 挂载（ADR-0064）。但缺少一条从组件检查器打开宿主
素材选择器的公共通道——目前只有画布背景专用的 request/commit。

产品决策：图片走**宿主素材库 + 选图**，文档保存资源身份而不是签名 URL；同时需要在组件检查器里提供
「选择素材」入口。页面视觉与交互稿交给 OpenDesign，本 ADR 只固定交互契约、状态与边界。

## 决策

### 1. 能力归属

| 能力 | 宿主 | Base Screen |
| --- | --- | --- |
| 上传、存储、转码、缩略图、CDN、签名 URL | 拥有 | 不实现、不代理、不预取、不重试 |
| 素材列表、搜索、分页、权限、删除保护 | 拥有 | 不建立资产目录、Store 或网络客户端 |
| 素材库 UI | 拥有；通过 `leftPanelGroups` 提供 | 只提供命名 slot |
| 组件图片来源选择 | 打开自己的选择器 | 统一 request/commit 桥 + 失败关闭校验 |
| 文档中的图片来源 | 把 `resourceId` 解析成 URL | 只存 `host-resource` 身份 |
| 图片渲染与失败回退 | — | `base.image` 有界 URL 校验 + fail-closed 占位 |

Base Screen 不新增资产目录端口、资产 Store、素材搜索 API 或通用网络客户端。选择桥只是
**传输通道**：它传递一次请求和一次选择结果，不传递目录内容。

### 2. 文档形态

1. 组件图片默认存 `dataSource.host-resource`，只包含 `resourceType` / `resourceId`（以及 JSON-safe 的
   `params`），不存 URL、token、header、cookie 或 SQL。
2. `static` URL 继续保留给历史文档、没有身份库的宿主和外部图片；文档中不得保存签名/临时 URL。
3. 画布背景仍是 `canvas.backgroundImage` 的有界 URL，这是 ADR-0077 的**唯一例外**。宿主素材库
   「设为背景」时必须解析成稳定 URL；是否给画布增加身份字段留给未来 ADR，本轮明确不做。
4. `base.image` Manifest 不改：不增加 `src` prop，图片地址继续是数据值；fit 仍是样式。
5. `ScreenDocument` 规范契约零变化，不新增字段、不新增诊断码。

### 3. 统一资源选择桥

把画布背景专用的 request/commit 泛化为一个公共桥，供画布背景与组件图片共用；旧的画布专用事件、方法和
配置开关被**替换**，不并行保留。

```ts
export const BASE_SCREEN_HOST_RESOURCE_SELECTION_REQUEST_EVENT =
  'base-screen-host-resource-selection-request';

export type BaseScreenHostResourceSelectionTarget =
  | {
      readonly kind: 'canvas-background';
      readonly backgroundImageFit: ScreenCanvasBackgroundImageFit | null;
    }
  | {
      readonly kind: 'component';
      readonly componentId: string;
      readonly materialType: string;
    };

export type BaseScreenHostResourceSelectionCurrent =
  | { readonly kind: 'none' }
  | { readonly kind: 'url'; readonly url: string }
  | {
      readonly kind: 'host-resource';
      readonly resourceType: string;
      readonly resourceId: string;
    }
  | { readonly kind: 'other' }; // variable / dataset 等非直接图片值

export interface BaseScreenHostResourceSelectionRequest {
  readonly requestId: string;
  readonly instanceId: string;
  readonly documentRevision: string | null;
  readonly target: BaseScreenHostResourceSelectionTarget;
  readonly current: BaseScreenHostResourceSelectionCurrent;
}

export type BaseScreenHostResourceSelection =
  | { readonly kind: 'url'; readonly url: string }
  | {
      readonly kind: 'host-resource';
      readonly resourceType: string;
      readonly resourceId: string;
      readonly params?: Readonly<Record<string, ScreenHostResourceParameter>>;
    };

export interface BaseScreenHostResourceSelectionCommit {
  readonly requestId: string;
  readonly selection: BaseScreenHostResourceSelection;
  /** 仅 canvas-background 目标允许。 */
  readonly backgroundImageFit?: ScreenCanvasBackgroundImageFit;
}

// <base-screen-designer> 公共成员
requestHostResourceSelection(target: BaseScreenHostResourceSelectionTarget): boolean;
commitHostResourceSelection(
  commit: BaseScreenHostResourceSelectionCommit,
): ScreenParseResult<ScreenDocument>;
```

`requestHostResourceSelection` 在目标可用时建立 pending 会话并派发冒泡且 composed 的事件，返回是否已派发；
宿主监听后打开自己的选择器。`commitHostResourceSelection` 只接受与当前 pending 请求匹配的提交，
成功后返回新文档。

配置开关：`canvasBackgroundImageButton` 由 `hostResourceSelectionButton?: boolean` 取代。按钮落点：

- 画布属性面板：沿用现有背景图按钮位置。
- 组件检查器数据面板：在现有五个段（`value` / `source` / `host-link` / `preview` / `authoring`）内，
  当物料声明 `host-resource` 能力且宿主启用桥时显示「选择素材」；不新增段。若 OpenDesign 定稿建议
  调整位置，仍必须落在现有五段内。
- 首个实现只给 `base.image` 提供按钮；桥的形状是通用的，其他 `host-resource` 物料后续可复用，
  不新增第二种形状。

请求与提交的守卫（复用既有诊断码，不新增）：

- 请求与提交必须是 JSON-safe，序列化上限 8 KiB；`requestId` 长度 1..128。
- pending 会话 kind 为 `host-resource-selection`，记录 target 与 authoring generation；
  `unload()` 时作废；重复提交或代际过期失败关闭。请求同时携带 `instanceId` / `documentRevision`
  供宿主关联，但提交不以文档修订号为条件：选择只写新值，提交时重新校验目标仍存在且类型一致。
- 复用 `AUTHORING_REQUEST_INVALID`、`AUTHORING_EXPIRED`、`AUTHORING_COMPONENT_MISSING`、
  `AUTHORING_SOURCE_INVALID`、`AUTHORING_PAYLOAD_INVALID`、`AUTHORING_LIMIT_EXCEEDED`。
- `url` 变体必须通过 `isBoundedScreenImageUrl`；`canvas-background` 只接受该变体。
- `host-resource` 变体构造 `ScreenHostResourceDataSource` 后走 `parseScreenDataSource`，并复用
  host-resource authoring intent 的 URL / token / header 禁止规则（只作用于该变体）。
- `host-resource` 变体还要求：物料 Manifest 声明 `host-resource`；宿主提供 `resourcePort`；
  运行时贡献已声明该 `resourceType`。
- 组件目标存在、`materialType` 与当前组件一致；目标被锁定时沿用既有命令诊断。
- 组件目标要求组件**没有 `dataValue` 键**：`update-components` 只能合并 patch、不能删除键，
  而 canonical 契约禁止 `dataValue` 与 `dataSource` 同时出现（即使 `dataValue` 为 `null`）。
  新形态取值引用必须先经数据面板转换为 legacy `dataSource`；转为 URL 变体时物料还须声明
  `static` 能力。`host-resource` 物料不再提供转换入口时，该组件不显示「选择素材」。

提交必须是一个 Core transaction：

- `canvas-background`：`update-canvas`，复用 `buildCanvasBackgroundImagePatch`；`null` 清除背景并
  同时清除 fit。
- `component`：`update-components`，patch 只写
  `{ dataSource: { type: 'static', value: url } | { type: 'host-resource', ... } }`。
  `dataSource` 与 `dataValue` 互斥，因此该分支只接受没有 `dataValue` 键的组件。
- `host-resource` 改绑后，派生的组件级数据源 id 不变但 `source` 变化；`DataSourceRuntime` 的请求键
  包含 source，会自动取消旧请求并重取，不需要额外 `refreshData`。

### 4. 素材库主流程

宿主素材库是主入口，不需要新增基座公共 API：

- 点击插入：`insertHostResource({ materialType: 'base.image', dataSource: { type: 'host-resource', ... } })`。
- 替换选中图片：监听公开的 `base-screen-selection-change`，确认同型后调用
  `replaceHostResource(componentId, intent)`。
- 拖拽插入：使用固定 MIME `application/x-base-screen-host-resource`，宿主用
  `writeBaseScreenHostResourceDragData` 写入严格 JSON；Engine 在 drop 时重新解析并校验。
- 设为画布背景：宿主解析出稳定 URL 后调用 `setCanvasBackgroundImage`，或通过统一桥提交
  `canvas-background` 的 `url` 变体。

素材库的名称、搜索、分页、缩略图、权限与删除保护全部由宿主实现；Base Screen 不读取这些列表。

### 5. 宿主资源类型与生命周期

- 宿主声明一个图片资源类型（推荐 id `host_image`），`resolve` 返回标量 URL 字符串；`base.image` 的
  `binding` 为 `null`。未声明该类型时 renderer 以 `PLUGIN_CORE_CONTRIBUTION_UNKNOWN` 失败关闭。
- 宿主应在每次 `resolve` 时签发短期 URL；URL 必须满足有界规则（http/https、协议相对、`/`、`./`、
  `../`），拒绝 `data:`、`blob:`、`javascript:`、`file:`。
- URL 过期导致 `img.error` 时，`base.image` 显示 `HOST_RESOURCE_FAILED` 占位；宿主用
  `refreshData(componentId)` 重新解析。Engine 不代理、不预取、不重试。
- 删除保护由宿主拥有：宿主扫描已保存文档中的 `resourceType` / `resourceId` 引用；推荐软删除，
  `resolve` 返回 `HOST_RESOURCE_UNAVAILABLE`，文档保留 id 并 fail closed。
- 上传安全由宿主拥有：鉴权、MIME/尺寸限制、图片解码/转码；SVG 必须消毒或栅格化，避免脚本执行面。

### 6. 破坏性迁移

本轮为探索期破坏性公共 API 替换，不提供兼容层（参照 ADR-0064）：

- 删除 `BASE_SCREEN_CANVAS_BACKGROUND_IMAGE_REQUEST_EVENT`、`requestCanvasBackgroundImage()`、
  `commitCanvasBackgroundImage()` 与 `canvasBackgroundImageButton`。
- 新增统一事件、两个公共方法与 `hostResourceSelectionButton`。
- 同步更新 `engine/api` 报告、changeset、测试、browser harness 与示例；不保留旧协议别名。

## 后果

- `ScreenDocument` 与 `@base-screen/contracts` 零变化；不新增诊断码。
- `@base-screen/engine` 发生破坏性公共 API 变更；需要 API 报告与 changeset。
- 宿主需要实现上传、存储、列表、解析、权限、删除保护与素材库 UI；示例后端新增 assets 模块。
- 检查器选图入口与画布背景共用一套 request/commit，避免两套形状漂移。
- 页面视觉与交互稿由 OpenDesign 产出；实现以定稿为基线，最终必须落到仓库代码并验证。

## 被拒方案

- **基座内置资产目录/Store/网络客户端**：违反 ADR-0027 与 ADR-0064；会把宿主的存储、权限和业务
  目录拉进 Engine。
- **给 `base.image` 增加 `src` prop**：图片地址是数据值，不是物料属性；加 prop 会绕开数据能力、
  变量与 host-resource 的既有模型。
- **文档存签名 URL / `data:` / `blob:`**：URL 会过期，且扩大注入面；背景图是既有例外，不扩大。
- **图片专用 request/commit 与画布背景协议并行**：两套形状、两套守卫，容易漂移。
- **检查器直接持有素材列表**：桥只传 request/commit；目录、搜索与分页留在宿主。
- **为画布背景增加资源身份字段**：需要 canonical 契约变更，留给未来 ADR；本轮保持 URL 例外。

## 开放问题

1. 画布背景长期是否也改成资源身份？推荐本轮保持 URL 例外，未来单独 ADR。
2. 删除保护的“被引用”范围：已发布屏、草稿还是历史快照？推荐发布 + 草稿；历史快照只读保留。
3. 签名 URL 的 TTL 与刷新：推荐宿主保证 TTL 覆盖会话，过期由宿主 `refreshData` 重解析。
4. 统一桥是否扩展到其他 `host-resource` 物料（图表、表格）？形状已通用，首个实现只做图片入口。
5. 是否需要在检查器显示素材名称/尺寸等展示元数据？推荐宿主在选择器内展示，文档不存展示元数据。

## 实施切片

1. **宿主示例素材库（已完成）**：`examples/shared-backend` 新增 assets 模块、Prisma 模型、上传与
   内容服务；三端 `examples/*-host/src/screen/asset-library.ts` 与 `host_image` 资源类型贡献；
   左栏分组、插入/替换/设为背景、统一选择器与删除保护；后端 e2e、根级示例测试与手工浏览器验收已覆盖。
   browser harness 的独立 `host-image-asset` 案例仍可作为后续补充。
2. **统一选择桥（已完成）**：engine 新增 selection pending/session、request event、commit 方法；
   替换画布背景专用协议；数据面板按钮；更新 `engine.api.md`、changeset、测试与 harness（canvas + image）。
3. **文档与宿主治理**：接受本 ADR 后更新 AGENTS.md、CONTEXT.md、integration-capabilities 与宿主
   Skill 的素材库边界。

## 验证

- 单元测试：request/commit 守卫、URL 校验、`dataSource`/`dataValue` 互斥、host-resource 资源类型
  门控、单事务历史。
- 集成/harness：上传 → 列表 → 插入/替换 → 文档只含身份 → resolve 失败占位 → 删除被引用资产被拒。
- 浏览器级验证前先打开 `tooling/verification/browser-harness/cases.html` 的素材库案例。
- 交付前运行 `pnpm test:scope --since <ref>`；影响包/公共契约时运行 `pnpm verify:m0`。

## 确认记录

2026-10-25 用户评审通过 ADR-0089 与 ADR-0090。本 ADR 自即日接受；图片资产、统一选择桥与宿主职责按
上述决策执行，代码落地仍按“实施切片”分批进行。

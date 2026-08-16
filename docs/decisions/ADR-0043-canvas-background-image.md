# ADR-0043：ScreenCanvas 宿主背景图片

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0002](./ADR-0002-canonical-screen-document.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0040](./ADR-0040-material-manifest-cover.md)（URL 校验规则同形复用）、[ADR-0041](./ADR-0041-material-cover-adaptive-fit.md)、
> [ADR-0045](./ADR-0045-canvas-background-panel-editing.md)（部分取代本 ADR 非目标 1：属性面板背景图编辑）

## 1. 背景

ScreenDocument 的 `canvas` 目前只有 `width`、`height`、`backgroundColor`：画布背景只能是纯色。
大屏设计的常见需求是给整屏铺一张背景图（模板底图、场景氛围图、品牌背景），而图片资产与上传、存储、
鉴权按 ADR-0027 归宿主。宿主需要一个受控入口把背景图 URL 挂到画布上，并且该背景要随文档持久化、
在 Designer 画布与 Viewer 中一致呈现。

物料库封面（ADR-0040）已经建立了「宿主提供图片 URL、Base Screen 失败关闭校验、只写属性不 fetch/代理」
的范式；本 ADR 把同形规则引入 canonical document 的画布字段，作为文档级背景图。

## 2. 决策

1. `ScreenCanvas` 新增两个可选字段：`backgroundImage?: string`（宿主提供的背景图 URL）与
   `backgroundImageFit?: 'cover' | 'contain'`。缺省即未声明；`backgroundImageFit` 缺省时渲染按 `cover`
   处理（与 ADR-0040 封面默认一致）。两者都进入 canonical document 契约、历史与序列化，Designer 画布
   与 Viewer 共用同一渲染路径，随文档持久化。
2. 校验失败关闭（沿用 ADR-0040 决策 2 的 URL 规则，同形复用）：`backgroundImage` 存在时必须满足——
   非空字符串、1..2048 码点、无控制字符（C0/DEL/C1）、无空白、无原始反斜杠；且匹配 `http(s)://`、
   `//`（协议相对）、`/`（根相对）、`./`、`../`（点相对）前缀 + 首字符分类形式；拒绝 `data:`、
   `javascript:`、`blob:`、`file:` 等其他 scheme、裸相对路径与边界形式。非法值使文档解析失败
   （`DOCUMENT_FIELD_INVALID`，路径 `canvas.backgroundImage`），不剥离、不默认、不静默修复。
   `backgroundImageFit` 仅接受 `'cover' | 'contain'` 枚举。未知字段拒绝语义不变（fail-closed 保持）。
3. `update-canvas` 命令的 canvas patch 支持新字段；patch 中值为 `null` 表示删除该字段（canvas 全部字段
   均不可空，null 无歧义），删除后文档等同未声明，历史/脏标记/变更事件与既有编辑一致。
4. Renderer 在 root 元素渲染背景：存在 `backgroundImage` 时设置 `background-image: url("<校验后 URL>")`
   （CSS 值转义，禁止 innerHTML/任意注入）、`background-size` 按 fit（缺省 `cover`）、
   `background-position: center`、`background-repeat: no-repeat`；不存在时清除这些样式。背景图叠加在
   `backgroundColor` 之上，`backgroundColor` 语义不变。Designer 画布是 renderer 的 root，自动同显。
5. 宿主公开 API：`BaseScreenDesignerElement.setCanvasBackgroundImage(backgroundImage: string | null,
   fit?: 'cover' | 'contain'): ScreenParseResult<ScreenDocument>`。实现为 session 事务（`update-canvas`），
   校验失败关闭、失败零副作用；`null` 清除背景；成功走既有 dirty/history/`base-screen-change` 通道。
   宿主也可直接在加载的文档中携带 `canvas.backgroundImage`（替换文档时同样失败关闭）。
6. Base Screen 只把校验后的 URL 写入 CSS `url()`，不 fetch、不预取、不重试、不代理、不进入缓存策略；
   图片加载失败只影响画布背景呈现（浏览器原生行为），不改变文档、目录状态或任何状态机。
7. 不新增依赖、不新增 package、不改动 Material Manifest/catalog/plugin 边界。

## 3. 非目标

- Designer 属性面板为画布背景图增加编辑控件（已由 [ADR-0045](./ADR-0045-canvas-background-panel-editing.md)
  部分取代：面板编辑经同一事务/校验通道落地）。
- Engine 提供图片上传、转码、缩略图、代理、缓存或失败重试（ADR-0027：归宿主）。
- 支持 data URI、任意 HTML/SVG/组件/函数/Promise 或宿主服务对象作为背景。
- 改变 `backgroundColor` 语义、`update-canvas` 其他字段语义或组件契约。

## 4. 结果

- 宿主可以在加载/编辑/运行时给画布设置或清除背景图，随文档持久化，Designer 与 Viewer 一致呈现；
  未声明背景图的既有文档与宿主零改造，行为与现状完全一致。
- 图片 URL 受失败关闭校验保护，CSS 赋值处转义，不引入网络、代理或协议注入面。
- 公共边界变更为 additive 的文档字段与宿主方法，由专项 Spec、聚焦测试与真实 browser harness 验收。

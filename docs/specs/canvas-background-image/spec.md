# Canvas Background Image Spec

> 状态：生效中（2026-08-16）
> 依据：[ADR-0043](../../decisions/ADR-0043-canvas-background-image.md)
> 生效前置：ADR-0043 已接受；本 Spec 为维护期内允许变更 ScreenDocument `canvas` 字段的增量

## 1. 目标

让宿主能够给画布添加背景图片：`ScreenCanvas` 新增可选 `backgroundImage`（URL）与 `backgroundImageFit`
（`cover`/`contain`），随文档持久化，Designer 画布与 Viewer 经同一渲染路径一致呈现；宿主经
`BaseScreenDesignerElement.setCanvasBackgroundImage` 公开 API 设置/清除，URL 失败关闭校验、CSS 赋值转义、
零 fetch/代理；未声明背景图的既有文档与宿主零改造。

## 2. Requirements

### R1：ScreenCanvas 背景图字段与失败关闭校验

- `ScreenCanvas` 新增可选字段 `backgroundImage?: string` 与 `backgroundImageFit?: 'cover' | 'contain'`；
  contracts 导出 `ScreenCanvasBackgroundImageFit = 'cover' | 'contain'` 类型。
- 缺省即未声明；`backgroundImageFit` 缺省时渲染按 `cover`。
- `backgroundImage` 存在时必须满足：非空字符串；1..2048 码点；无控制字符（C0/DEL/C1）；无空白；
  无原始反斜杠；且匹配以下形式之一（前缀 + 首字符分类，不做完整 URL 语义解析）：
  - `http(s)://` 或 `//` 开头，紧随其后至少一个非空白/非 `/`/非 `?`/非 `#`/非反斜杠的 authority 首字符；
  - `/`、`./` 或 `../` 开头，紧随其后至少一个非空白/非 `/`/非反斜杠的路径首字符。
  其他 scheme（含 `data:`、`javascript:`、`blob:`、`file:`）与裸相对路径（如 `a.png`）拒绝。
- 非法值使文档解析失败（`DOCUMENT_FIELD_INVALID`，路径 `canvas.backgroundImage`），不剥离、不默认、
  不静默修复；`backgroundImageFit` 仅接受枚举两值；未知字段（含 canvas 上的其他未知键）拒绝语义不变。
- JSON Schema 生成器输出两个可选字段（`backgroundImage`：string、minLength 1、maxLength 2048；
  `backgroundImageFit`：enum）；黄金产物 `screen-document.schema.json` 重新生成并提交。

### R2：`update-canvas` 扩展与 null 删除语义

- core `applyScreenDocumentCommand` 的 `update-canvas` patch 白名单增加 `backgroundImage`、
  `backgroundImageFit`。
- patch 中值为 `null` 表示删除该字段（canvas 字段均不可空，无歧义）：null 值不进入最终文档，
  删除后文档等同未声明；其余字段语义不变。
- 非法值（非法 URL、非法 fit）经 canonical 解析失败关闭：事务失败、零副作用（文档/历史/渲染/脏标记
  不变）。
- 空 patch 或与现状相等的 patch 返回 success 且不产生变更。

### R3：Renderer/Designer 画布背景渲染

- renderer `render()` 设置 root 元素背景：存在 `backgroundImage` 时设置 `background-image: url(...)`
  （CSS 值转义：`\` 与 `"` 转义，禁止 innerHTML 拼接）、`background-size` 按
  `backgroundImageFit`（缺省 `cover`）、`background-position: center`、`background-repeat: no-repeat`；
  不存在时清除这四个样式。
- `backgroundColor` 语义不变（背景图叠加在色值之上）；Designer 画布是 renderer 的 root，与 Viewer
  同一渲染路径一致呈现；预览浮层同路径。
- 只写 CSS 属性，不 fetch、不预取、不重试、不代理、不缓存策略；图片加载失败只影响画布背景呈现，
  不改变文档、目录状态或任何状态机。

### R4：宿主公开 API

- `BaseScreenDesignerElement.setCanvasBackgroundImage(backgroundImage: string | null,
  fit?: ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>`：
  - 经 session 事务（`update-canvas`）提交；成功走既有 dirty/history/`base-screen-change` 通道。
  - `null` 清除背景（同时清除 fit）；设置图片未传 `fit` 时保留既有 `fit`（无则渲染按 `cover`）。
  - 未连接/无文档时失败（既有 lifecycle 失败语义）；非法 URL/fit 失败关闭、零副作用。
- 宿主也可在加载的文档中携带 `canvas.backgroundImage`：`replaceDocument`/`importDocument`/项目加载
  走同一 canonical 校验，非法值失败关闭。

## 3. 非目标

- Designer 属性面板为画布背景图增加编辑控件（本期宿主经公开 API 或文档驱动）。
- 图片上传、转码、缩略图生成、代理、缓存或失败重试（宿主职责，ADR-0027）。
- 支持 data URI、任意 HTML/SVG/组件/函数/Promise 或宿主服务对象作为背景。
- 改变 `backgroundColor` 语义、`update-canvas` 其他字段语义或组件/Manifest/catalog 契约。
- 新增依赖或 package。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部勾选；测试矩阵与当前实现一致。
- 聚焦测试（contracts 解析/序列化/golden schema、core 命令、renderer 样式、engine 宿主 API）、
  engine lint/typecheck/test 与 `pnpm verify:m0` 全部通过；基线 README、Spec/ADR 索引与 usage.md
  已登记。

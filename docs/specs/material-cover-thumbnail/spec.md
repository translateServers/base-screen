# Material Cover Thumbnail Spec

> 状态：生效中（2026-08-16）
> 依据：[ADR-0040](../../decisions/ADR-0040-material-manifest-cover.md)
> 生效前置：ADR-0040 已接受；本 Spec 为维护期内首个允许变更 Material Manifest 公共字段的增量

## 1. 目标

为 Material Manifest 增加可选宿主封面字段 `cover`，使物料库卡片能展示物料作者或宿主提供的真实封面图；
保持确定性分类图标/色相作为占位与失败回退，缩略图区几何恒定（无抖动），catalog 身份、ScreenDocument、
Renderer/Viewer 与宿主加载边界不变。

## 2. Requirements

### R1：Manifest `cover` 字段与失败关闭校验

- Manifest 可选字段 `cover: string` 进入 `BaseScreenMaterialManifest` 类型与解析白名单（`MANIFEST_FIELDS`）。
- 缺省即未声明（manifest 可无 `cover`，行为与既有版本一致）。
- 存在时必须满足：非空字符串；1..2048 字符（码点）；无控制字符（C0/DEL/C1）；无空白；无原始反斜杠；
  且匹配以下形式之一（前缀 + 首字符分类，不做完整 URL 语义解析）：
  - `http(s)://` 或 `//` 开头，紧随其后至少一个非空白/非 `/`/非 `?`/非 `#`/非反斜杠的 authority 首字符
    （如 `https://x/y.png`、`//cdn/x.png`；拒绝 `https://`、`https:///x`、`http://?x`、`//`、`///x`）；
  - `/`、`./` 或 `../` 开头，紧随其后至少一个非空白/非 `/`/非反斜杠的路径首字符
    （如 `/assets/x.png`、`./x.png`、`../x.png`；拒绝裸 `/` 与 `./`）。
  其他 scheme（含 `data:`、`javascript:`、`blob:`、`file:`）与裸相对路径（如 `a.png`）拒绝。
- 非法值使 `parseBaseScreenMaterialManifest` 失败（`PLUGIN_CORE_MANIFEST_FIELD_INVALID`，路径 `cover`），
  不剥离、不默认、不静默修复；未知字段拒绝（`PLUGIN_CORE_MANIFEST_UNKNOWN_FIELD`）语义不变。
- catalog 克隆（`createBaseScreenMaterialCatalog`）保留 `cover` 并保持深冻结。

### R2：物料库卡片封面渲染与回退

- `createMaterialCard` 在缩略图区内、占位图标之后追加 `<img class="material-cover">`：`src` 为校验后的
  `cover`、`alt=""`（装饰性，卡片可访问名称仍由 `aria-label` 提供）、`draggable="false"`、
  `loading="lazy"`、`decoding="async"`。
- 图片加载完成（`load`）后设置 `data-material-cover-loaded`，封面以 opacity 过渡显现；占位图标同步淡出
  （opacity 过渡，几何不变）。
- 图片加载失败（`error`）时移除该 `<img>`，恢复既有确定性占位图标与色相背景。
- 缩略图区（16:10 aspect、固定尺寸）在加载前/加载后/失败回退之间几何恒定；不出现布局位移、跳动或滚动条
  变化（无抖动规约）。
- 未声明 `cover` 的物料卡片 DOM 与既有版本完全一致（无 `<img>`）。

### R3：纯展示投影边界

- `cover` 只进入 Designer 物料库卡片展示；不进入 ScreenDocument、历史、导出物、Renderer 或 Viewer。
- 不改变 catalog 不可变性、`libraryVisible` 语义、宿主分组投影、目录状态机（`materialLibraryState`）、
  宿主动作事件或卡片可用性（草稿/不可用标记）。
- Base Screen 只把校验后的 URL 写入 `img.src`（属性赋值），不 fetch、不预取、不重试、不代理、不缓存策略；
  图片加载失败不触发联网、不影响目录状态。
- 官方物料包不强制提供 `cover`；既有物料与宿主零改造。

### R4：安全与可访问性

- URL 以属性赋值写入 `img.src`，禁止 innerHTML 拼接或任意协议注入；解析层 scheme 白名单失败关闭。
- 封面图片为装饰性内容：`img` 无 `alt` 文本且缩略图容器 `aria-hidden`，卡片焦点名称与拖拽行为不变
  （`draggable="false"` 防止原生图片拖拽与卡片拖拽冲突）。
- 深浅主题下封面为图片本体，不依赖 Token；占位/回退仍遵守既有主题 Token 与 forced-colors 约束。

## 3. 非目标

- `cover` 进入 ScreenDocument/Renderer/Viewer/导出物/历史。
- 图片上传、转码、缩略图生成、代理、缓存或失败重试（宿主职责，ADR-0027）。
- 支持 data URI、任意 HTML/SVG/组件/函数/Promise 或宿主服务对象作为封面。
- 改变分类图标/色相派生规则、物料库状态机、宿主动作或宿主分组投影。
- 新增依赖、package 或 ScreenDocument schema 变更。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部勾选；测试矩阵与当前实现一致。
- 聚焦测试（plugin-core manifest、engine 物料库 DOM）、engine lint/typecheck/test 与
  `pnpm verify:m0` 全部通过；基线 README、Spec/ADR 索引与 usage.md 已登记。

# ADR-0040：Material Manifest 宿主封面字段

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0021](./ADR-0021-material-library-visibility.md)、[ADR-0031](./ADR-0031-material-library-host-state.md)、[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)、[ADR-0034](./ADR-0034-designer-material-library-visual-hierarchy.md)

## 1. 背景

Designer 左侧物料库卡片当前只有确定性生成的占位缩略图：分类图标（关键词规则）加分类色相（FNV-1a 哈希），
不进入任何契约（ADR-0032 决策 2、ADR-0034）。物料作者无法为物料提供真实视觉封面，宿主也无法按业务场景
（如品牌物料、截图预览、数据大屏模板外观）注入封面图，物料库的扫描识别只能依赖文字名称。

ADR-0032 明确"Manifest 没有缩略图字段且不为此扩展"（保持 ADR-0031 的 Manifest 稳定边界）。本 ADR 在
维护期内做出方向变化：物料库需要真实封面提升识别效率，且封面只作为物料库展示投影，不改变 catalog
身份、ScreenDocument、渲染或宿主加载边界，因此选择以最小、JSON-safe、失败关闭的 Manifest 字段承载，
并保持确定性占位与回退不变。

## 2. 决策

1. Material Manifest 新增可选字段 `cover: string`，语义为「宿主或物料作者提供的封面图 URL」。它只用于
   Designer 物料库卡片的缩略图展示，不参与 catalog 身份、数据绑定、事件、历史、导出或渲染。
2. 校验失败关闭：`cover` 缺省即未声明（与 `libraryVisible` 同形）；存在时必须满足——非空字符串、长度
   1..2048（码点）、无控制字符（C0/DEL/C1：`\u0000-\u001f`、`\u007f`、`\u0080-\u009f`）、无空白、无原始
   反斜杠；且必须匹配以下形式之一（只做前缀+首字符分类，不做完整 URL 语义解析）：
   - `http(s)://` 或 `//`（协议相对）开头，且紧随其后至少一个非空白、非 `/`、非 `?`、非 `#`、非反斜杠的
     authority 首字符（如 `https://x/y.png`、`//cdn/x.png`；拒绝 `https://`、`https:///x`、`http://?x`、
     `//`、`///x`）；
   - `/`（根相对）或 `./`、`../`（点相对）开头，且紧随其后至少一个非空白、非 `/`、非反斜杠的路径首字符
     （如 `/assets/x.png`、`./x.png`、`../x.png`；拒绝裸 `/` 与 `./`）。
   拒绝 `data:`、`javascript:`、`blob:`、`file:` 等其他 scheme、裸相对路径（如 `a.png`）与上述边界外值，
   避免 manifest 膨胀与协议注入。非法值使 manifest 解析失败（沿用 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`），
   不剥离、不默认、不静默修复。
3. Designer 物料库卡片在固定缩略图区（16:10 aspect，几何恒定）内渲染 `<img>`：`object-fit: cover`、
   `loading="lazy"`、`decoding="async"`、`draggable="false"`，`alt=""` 装饰性（卡片可访问名称仍由
   `aria-label` 提供）。确定性分类图标与色相保持为占位层：图片加载完成后以 opacity 过渡显现，加载失败
   时移除图片、恢复占位图标。任何情况下缩略图区几何不变（无抖动规约）；新增过渡遵守 ADR-0034 决策 4 的
   `prefers-reduced-motion` 移除要求。
4. Base Screen 只把校验后的宿主 URL 写入 `img.src`（属性赋值，非 innerHTML），不 fetch、不预取、不重试、
   不代理、不进入缓存策略。图片加载失败只影响该卡片的展示回退，不改变 `materialLibraryState`、目录状态机、
   宿主动作事件或卡片可用性。
5. 封面是纯展示投影：不进入 ScreenDocument、历史、导出物、Renderer 或 Viewer；不改变 catalog 的不可变性、
   `libraryVisible` 语义、宿主分组投影或既有 `data-*` 契约。
6. 部分取代 ADR-0032 决策 2 的「Manifest 没有缩略图字段且不为此扩展」结论（范围仅限封面 URL 字段），
   并部分取代 ADR-0034 决策 3 的「不得新增图片请求」约束（范围仅限物料库卡片封面图，且限定为宿主声明的
   校验后 URL，无预取/重试/代理）。ADR-0032/0034 其余决策与非目标不变；官方物料不强制提供封面，缺省行为
   与既有版本完全一致。
7. 不新增依赖、不新增 package；`contracts` 的 ScreenDocument schema 不变（manifest 不进文档）。

## 3. 非目标

- 封面进入 ScreenDocument、Renderer、Viewer、导出物或历史。
- 支持任意 HTML/SVG/组件/函数/Promise 或宿主服务对象作为封面；支持 data URI 或超大图片。
- Engine 提供图片上传、转码、缩略图生成、代理、缓存或失败重试（ADR-0027：归宿主）。
- 改变分类图标/色相派生规则、物料库状态机、宿主动作或宿主分组投影。

## 4. 结果

- 物料作者与宿主可以为一个物料提供真实封面，物料库从「文字+抽象图标」升级为「真实预览+文字」，扫描效率
  提升，而 catalog、文档与宿主边界保持稳定。
- 未声明 `cover` 的既有物料与宿主零改造；加载失败自动回退既有确定性缩略图，无抖动、无重试。
- Manifest 字段白名单、校验、卡片 DOM、可访问性与验证门禁由专项 Spec 保护。

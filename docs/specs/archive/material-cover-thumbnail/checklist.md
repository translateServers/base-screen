# Material Cover Thumbnail Checklist

> 状态：已完成（2026-08-16）

## Manifest 字段与校验（R1）

- [x] `BaseScreenMaterialManifest` 类型含可选 `cover: string`；`MANIFEST_FIELDS` 白名单与必填排除集已更新。
- [x] 缺省未声明时 manifest 解析通过且 `cover` 为 undefined；未知字段拒绝语义不变。
- [x] 合法值：`https://cdn/x.png`、`http://x/y.png`、`/assets/x.png`、`./x.png`、`../x.png`、`//cdn/x.png`、
      query/hash 形式与恰好 2048 码点全部通过。
- [x] 非法值：非字符串（null/数字/布尔/对象/数组）、0 长度、>2048、含空白、C0/DEL/C1 控制字符、反斜杠、
      `data:`/`javascript:`/`blob:`/`file:`/`ftp:` 前缀、裸相对路径与边界形式（裸 `/`、`./`、`//`、`///x`、
      `https://`、`https:///x`、`http://?x`）全部以 `PLUGIN_CORE_MANIFEST_FIELD_INVALID`（路径 `cover`）拒绝。
- [x] catalog 克隆保留 `cover` 且 manifest 保持深冻结（与输入脱离）。

## 卡片渲染与回退（R2）

- [x] 声明 `cover` 的卡片：缩略图区内 DOM 顺序为 `[占位 svg, <img class="material-cover">]`，`src` 正确、
      `alt=""`、`draggable="false"`、`loading="lazy"`、`decoding="async"`；占位图标仍在（回退层）。
- [x] `load` 后图片与缩略图容器都置 `data-material-cover-loaded`（opacity 过渡显现、占位淡出，无几何变化）。
- [x] `error` 后 `<img>` 被移除，占位图标与色相背景恢复。
- [x] 未声明 `cover` 的卡片 DOM 与既有版本一致（无 `<img>`，图标/色相派生不变）。
- [x] 真实浏览器（verify:browser 封面探针）：封面加载后 opacity=1、object-fit=cover、缩略图几何与无封面
      卡片一致、占位 svg 保留、reduced-motion 下新增过渡零时长（CSS 门禁）。

## 纯展示投影边界（R3）

- [x] `cover` 不进入 ScreenDocument、历史、导出物、Renderer 或 Viewer；catalog 不可变性、
      `libraryVisible`、宿主分组、`materialLibraryState`、宿主动作与卡片可用性语义不变（回归通过）。
- [x] 图片仅经 `img.src` 属性加载，无 fetch/预取/重试/代理；加载失败不影响目录状态机。
- [x] 官方物料包未强制提供 `cover`；既有物料与宿主零改造（harness 主 designer 物料库未增删物料）。

## 安全与可访问性（R4）

- [x] URL 以属性赋值写入 `img.src`，无 innerHTML 拼接；scheme 白名单失败关闭（含 C1 控制字符与反斜杠）。
- [x] 封面装饰性（`alt=""` + 缩略图 `aria-hidden`）；卡片 `aria-label`、焦点与拖拽行为不变；
      `draggable="false"` 防止原生图片拖拽。
- [x] 深浅主题与 forced-colors 下占位/回退仍由既有 Token 驱动，封面为图片本体。

## 质量门禁

- [x] plugin-core 与 engine 聚焦测试通过（54 + 5）；engine lint/typecheck/test（425）通过。
- [x] `pnpm verify:m0` 全量通过。
- [x] `pnpm verify:browser` 通过（含封面探针断言）。
- [x] 基线 README、docs/specs/README.md、docs/decisions/README.md、usage.md 与 designer-left-panel
      Spec/ADR-0032/0034 互注均已登记。

# Material Cover Thumbnail Test Matrix

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

| Req | Case | 位置 | 状态 |
| --- | --- | --- | --- |
| R1 | 合法 `https://`/`http://` cover 解析通过且值保留 | `packages/plugin-core/tests/plugin-core.test.ts` | ✅ |
| R1 | 合法根相对 `/assets/x.png`、点相对 `./x.png`/`../x.png`、协议相对 `//cdn/x.png`、带 query/hash、恰好 2048 码点通过 | 同上 | ✅ |
| R1 | 非字符串（null/数字/布尔/对象/数组）、空串、>2048、含空白、C0/C1 控制字符、反斜杠拒绝（路径 `cover`） | 同上 | ✅ |
| R1 | scheme 拒绝：`data:`/`javascript:`/`blob:`/`file:`/`ftp:`；裸相对路径 `a.png`；边界形式：裸 `/`、`./`、`//`、`///x`、`https://`、`https:///x`、`http://?x` | 同上 | ✅ |
| R1 | 缺省未声明解析通过且 `cover` undefined；未知字段（`coverUrl`）拒绝语义不变 | 同上 | ✅ |
| R1 | catalog 克隆保留 `cover`、与输入脱离且 manifest 深冻结 | `packages/plugin-core/tests/plugin-core.test.ts` | ✅ |
| R2 | 无 cover 卡片：仅占位 `svg` 子节点，无 `<img>`，缩略图 `aria-hidden` | `packages/engine/tests/browser/dom/designer-material-library-dom.test.ts` | ✅ |
| R2 | 有 cover 卡片：DOM 顺序 `[svg, img]`，img 的 src/alt/draggable/loading/decoding 正确 | 同上 | ✅ |
| R2 | img `load` → 图片与缩略图容器均置 `data-material-cover-loaded` | 同上 | ✅ |
| R2 | img `error` → img 移除、占位 `svg` 保留 | 同上 | ✅ |
| R2 | 同一网格中有/无 cover 物料互不影响 | 同上 | ✅ |
| R2 | 真实浏览器：封面探针实例（托管包 catalog + `/cover.svg`）加载后 opacity=1、object-fit=cover、占位 svg 保留、缩略图几何与无封面卡片一致；reduced-motion 零时长由 CSS 门禁覆盖 | `scripts/verify-browser-harness.mjs` `assertCoverThumbnail` | ✅ |
| R3 | cover 不进 ScreenDocument/Renderer/Viewer（无对应契约变更；catalog/manifest 其余字段语义断言保持） | 既有 plugin-core/catalog 测试回归 | ✅ |
| R4 | URL 以属性赋值写入 src（DOM 测试断言 img.src 而非 innerHTML）；无 innerHTML 注入；`aria-hidden` 与 `draggable="false"` | `packages/engine/tests/browser/dom/designer-material-library-dom.test.ts` | ✅ |
| 门禁 | plugin-core/engine lint/typecheck/test（54 + 425） | `pnpm --filter @base-screen/plugin-core lint`、`pnpm --filter @base-screen/engine lint` 等 | ✅ |
| 门禁 | `pnpm verify:m0` 全量 | 仓库根 | ✅ |
| 门禁 | `pnpm verify:browser`（含封面断言） | 仓库根 | ✅ |

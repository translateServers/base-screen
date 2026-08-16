# Material Cover Thumbnail Tasks

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0040 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md）、ADR 索引
      （docs/decisions/README.md）与基线 README 能力行；ADR-0032/0034 顶部互注 ADR-0040 部分取代；
      designer-left-panel Spec 非目标第 4 条修订并互注本 Spec（R1-R4 文档门禁）。
- [x] Task 2：plugin-core 契约与解析：`BaseScreenMaterialManifest` 增加可选 `cover: string`；
      `MANIFEST_FIELDS` 白名单加入 `cover`（含必填排除集）；新增失败关闭的 `validateCover`（长度/
      控制字符 C0/DEL/C1/空白/反斜杠/scheme 白名单与边界形式）（R1）。
- [x] Task 3：plugin-core 测试：合法 http(s)/根相对/点相对/协议相对/query-hash/恰好 2048 码点通过且
      保留；非字符串、超长、含空白、C0/C1 控制字符、反斜杠、`data:`/`javascript:`/`blob:`/`file:`/
      `ftp:`、裸相对路径与边界形式（裸 `/`、`./`、`//`、`///x`、`https://`、`https:///x`、`http://?x`）
      拒绝；未知字段拒绝与 catalog 深冻结保留 cover 语义不变（R1）。
- [x] Task 4：engine 物料库卡片渲染：`designer-material-library-dom.ts` 的卡片构建在声明 `cover` 时追加
      `<img class="material-cover">`（src/alt/draggable/loading/decoding），load 在图片与缩略图容器置
      `data-material-cover-loaded`，error 移除图片恢复占位图标；未声明时 DOM 与既有版本一致（R2、R4）。
- [x] Task 5：engine 样式：`.material-cover` 绝对铺满缩略图区、`object-fit: cover`、opacity 过渡显现、
      `.material-thumb[data-material-cover-loaded] svg` 占位淡出；reduced-motion 块纳入新增过渡；
      加载前/后/回退几何恒定（R2 无抖动）。
- [x] Task 6：engine 测试：新增物料库 DOM 测试（FakeElement 风格，innerHTML 解析出 svg 子节点）覆盖——
      无 cover 仅占位 svg、有 cover 的 `[svg, img]` DOM 顺序与 img 属性、load 双标记、error 移除图片
      恢复图标、同网格互不影响、缩略图 aria-hidden；既有 workspace/分组测试保持通过（R2、R4）。
- [x] Task 7：文档同步：usage.md 11.2 节登记 `cover` 字段、校验边界与回退语义；browser-harness 增加
      独立 cover 探针实例（托管包 catalog + `/cover.svg`）与 `assertCoverThumbnail` Playwright 断言
      （R1-R3）。
- [x] Task 8：质量门禁：engine lint/typecheck/test（425 通过）、plugin-core lint/typecheck/test
      （54 通过）、`pnpm verify:m0` 与 `pnpm verify:browser` 全部通过；测试矩阵与实现一致（R1-R4）。

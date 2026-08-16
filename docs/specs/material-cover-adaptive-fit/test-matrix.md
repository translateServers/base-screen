# Material Cover Adaptive Fit Test Matrix

> 状态：已完成（2026-08-16，`pnpm verify:fast` 与 `pnpm verify:browser` 全绿）

| Req | Case | 位置 | 状态 |
| --- | --- | --- | --- |
| R1 | 320×200（与容器 1.625:1 一致）@117×72 → cover | `packages/engine/tests/browser/dom/designer-material-library-dom.test.ts` `materialCoverFit` | ✅ |
| R1 | 1920×1080（照片类，偏差 9%）@117×72 → cover | 同上 | ✅ |
| R1 | 605×534（偏差 30%，未超阈值）@117×72 → cover | 同上 | ✅ |
| R1 | 50×50（放大 2.34×）@117×72 → contain | 同上 | ✅ |
| R1 | 71×17（放大 4.24×）@117×72 → contain | 同上 | ✅ |
| R1 | 32×32（放大 3.66×）@117×72 → contain | 同上 | ✅ |
| R1 | 1080×1080（方形，偏差 38%）@117×72 → contain | 同上 | ✅ |
| R1 | 1920×120（16:1 横幅，偏差 885%）@117×72 → contain | 同上 | ✅ |
| R1 | 1×1（放大 117×）@117×72 → contain | 同上 | ✅ |
| R1 | 尺寸 0 / 非法（NaN/Infinity/负值）→ cover 安全缺省 | 同上 | ✅ |
| R2 | `load` 后 contain 决策：缩略图容器置 `data-material-cover-fit="contain"`；cover 决策不写标记 | 同上 | ✅ |
| R2 | `load` 后 loaded 双标记与 ADR-0040 一致；`error` 移除 img、恢复占位 | 同上（既有断言回归） | ✅ |
| R2 | 真实浏览器：窄条封面（200×24）加载后 `data-material-cover-fit="contain"`、计算样式 `object-fit: contain`、完整可见；正常封面（320×200）保持 `object-fit: cover`；缩略图几何与无封面卡片一致 | `scripts/verify-browser-harness.mjs` `assertCoverThumbnail` | ✅ |
| R3 | `cover` 字段校验/manifest/catalog 回归不变；官方物料与既有探针封面行为不变 | 既有 plugin-core/engine 测试回归 | ✅ |
| R3 | 无新增网络请求（封面仅经 `img.src` 属性加载） | verify:browser 探针回归 | ✅ |
| 门禁 | engine lint/typecheck/test（含 12 个物料库 DOM 测试） | `pnpm --filter @base-screen/engine lint` 等 | ✅ |
| 门禁 | `pnpm verify:fast` 全量 | 仓库根 | ✅ |
| 门禁 | `pnpm verify:browser`（含自适应断言） | 仓库根 | ✅ |

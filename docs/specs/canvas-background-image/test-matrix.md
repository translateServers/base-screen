# Canvas Background Image Test Matrix

> 状态：已完成（2026-08-16，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿，含 R5/R6 增量）

| Req | Case | 位置 | 状态 |
| --- | --- | --- | --- |
| R1 | 合法 `https://`/`http://` 背景图 URL 解析通过且值保留 | `packages/contracts/tests/document/document.test.ts` | ✅ |
| R1 | 合法根相对 `/assets/x.png`、点相对 `./x.png`/`../x.png`、协议相对 `//cdn/x.png`、带 query/hash、恰好 2048 码点通过 | 同上 | ✅ |
| R1 | 非字符串（null/数字/布尔/对象/数组）、空串、>2048、含空白、C0/C1 控制字符、反斜杠拒绝（路径 `canvas.backgroundImage`） | 同上 | ✅ |
| R1 | scheme 拒绝：`data:`/`javascript:`/`blob:`/`file:`/`ftp:`；裸相对路径 `a.png`；边界形式：裸 `/`、`./`、`//`、`///x`、`https://`、`https:///x`、`http://?x` | 同上 | ✅ |
| R1 | 缺省未声明解析通过且字段 undefined；未知字段拒绝语义不变；fit 枚举拒绝其他值 | 同上 | ✅ |
| R1 | 序列化往返保留 `backgroundImage`/`backgroundImageFit` | `packages/contracts/tests/document/serialize.test.ts` | ✅ |
| R1 | JSON Schema 输出可选 `backgroundImage`（string/minLength 1/maxLength 2048）与 `backgroundImageFit`（enum）；黄金产物一致 | `packages/contracts/tests/document/json-schema.test.ts` + golden 文件 | ✅ |
| R2 | `update-canvas` patch 含 `backgroundImage`/`backgroundImageFit` 成功更新 | `packages/core/tests/commands/apply.test.ts` | ✅ |
| R2 | 非法 URL/fit patch 失败且文档/历史不变（零副作用） | 同上 | ✅ |
| R2 | patch 值 `null` 删除字段、null 不进文档；空/相等 patch no-op；未知字段拒绝 | 同上 | ✅ |
| R3 | render 后 root 背景四样式（image/size/position/repeat）正确；fit 缺省 cover、`contain` 映射 | `packages/renderer/tests/renderer.test.ts` | ✅ |
| R3 | 无背景图文档清除四个背景样式；`backgroundColor` 不变；CSS 值转义（`\`、`"`）；非法文档失败关闭 | 同上 | ✅ |
| R4 | `setCanvasBackgroundImage` 事务形状（update-canvas patch 正确）；null 清除同时清 fit；未传 fit 保留既有 fit | `packages/engine/tests/browser/controllers/designer-runtime-config.test.ts` | ✅ |
| R4 | 无文档失败（lifecycle 语义）；公开 API 类型断言 | `packages/engine/tests/public-api.test.ts` | ✅ |
| R4 | session 集成：设置成功触发 dirty/history/`base-screen-change`；非法值零副作用；null 清除 | `packages/engine/tests/common/session/designer-session.test.ts` | ✅ |
| R4 | 替换/导入携带 `backgroundImage` 文档失败关闭 | 既有 document 解析回归（document.test.ts） | ✅ |
| R3/R4 | 真实浏览器：`pnpm verify:browser` 回归通过（本增量不新增探针——harness 脚本由并行 ADR-0042 会话占用；背景渲染由聚焦测试覆盖） | `scripts/verify-browser-harness.mjs` 回归 | ✅ |
| 门禁 | contracts（141）/core（121）/renderer（23）/engine（442）聚焦测试 + engine lint/typecheck/test（含预先存在的 panel 测试 `vi.fn` 类型错误修复） | `pnpm --filter @base-screen/engine lint` 等 | ✅ |
| 门禁 | `pnpm verify:m0` 全量 | 仓库根 | ✅ |
| 门禁 | `pnpm verify:browser`（回归） | 仓库根 | ✅ |
| R5 | 画布区渲染：canvas 输入列表含 `backgroundImage`；`backgroundImageFit` 下拉存在且无图禁用、未声明显示 cover；有图时 URL 值与 fit 值正确 | `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts` | ✅ |
| R5 | URL 输入提交 `update-canvas` patch；清空输入提交 null 删除（同时清 fit）；fit 变更提交枚举 | 同上 | ✅ |
| R5 | 非法 URL 经事务失败关闭：诊断走既有面板通道、零副作用；非法 fit 值构建层拒绝（不执行事务） | 同上 | ✅ |
| R5 | 面板入口与 API 语义一致：session 集成（dirty/history/变更事件）回归 | `packages/engine/tests/common/session/designer-session.test.ts` 回归 | ✅ |
| 门禁 | engine lint/typecheck/test（448）+ `pnpm verify:m0` + `pnpm verify:browser` | 仓库根 | ✅ |
| R6 | 选择按钮渲染：背景图片输入旁存在 `data-canvas-background-image-action` 按钮（tagName/文案） | `packages/engine/tests/browser/controllers/designer-panel-controller.test.ts` | ✅ |
| R6 | 点击调用宿主回调（面板 wiring）；`requestCanvasBackgroundImage` 无文档 false、commit 无会话 `AUTHORING_REQUEST_INVALID` | 同上 + `designer-runtime-config.test.ts` | ✅ |
| R6 | 守卫矩阵（ok/过期 EXPIRED/缺失与他类会话 REQUEST_INVALID）；patch（带 fit/无 fit/null 清 fit）；请求体 current null 语义 | `packages/engine/tests/canvas-background-image.test.ts` | ✅ |
| R6 | 事件常量与 `BaseScreenCanvasBackgroundImageRequest` 类型、request/commit 方法签名导出断言 | `packages/engine/tests/public-api.test.ts` | ✅ |
| R6 | 未接入宿主零副作用（按钮仅派发事件） | panel 测试回归 | ✅ |
| 门禁 | engine lint/typecheck/test（457）+ `pnpm verify:m0` + `pnpm verify:browser`（R1-R6） | 仓库根 | ✅ |

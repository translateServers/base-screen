# Canvas Background Image Checklist

> 状态：已完成（2026-08-16）

## 契约与校验（R1）

- [x] `ScreenCanvas` 类型含可选 `backgroundImage?: string` 与 `backgroundImageFit?: 'cover' | 'contain'`；
      `ScreenCanvasBackgroundImageFit` 已导出；`canvasSchema` 与 `CANVAS_FIELDS` 白名单已更新。
- [x] 缺省未声明时文档解析通过且字段为 undefined；未知字段拒绝语义不变。
- [x] 合法值：`https://cdn/x.png`、`http://x/y.png`、`/assets/x.png`、`./x.png`、`../x.png`、
      `//cdn/x.png`、query/hash 形式与恰好 2048 码点全部通过。
- [x] 非法值：非字符串（null/数字/布尔/对象/数组）、0 长度、>2048、含空白、C0/DEL/C1 控制字符、
      反斜杠、`data:`/`javascript:`/`blob:`/`file:`/`ftp:` 前缀、裸相对路径与边界形式（裸 `/`、`./`、
      `//`、`///x`、`https://`、`https:///x`、`http://?x`）全部以 `DOCUMENT_FIELD_INVALID`
      （路径 `canvas.backgroundImage`）拒绝。
- [x] `backgroundImageFit` 仅接受 `cover`/`contain`；其他值拒绝。
- [x] 序列化往返保留 `backgroundImage`/`backgroundImageFit`。
- [x] JSON Schema 生成器输出两个可选字段（maxLength 2048 / enum）；黄金产物已再生成并提交。

## update-canvas 扩展（R2）

- [x] core `CANVAS_FIELDS` 包含 `backgroundImage` 与 `backgroundImageFit`；`ScreenCanvasPatch` 类型
      已导出。
- [x] patch 值 `null` 删除对应字段，null 不进入最终文档；删除后文档等同未声明。
- [x] 非法 URL/fit 使事务失败且零副作用（文档/历史/渲染不变）。
- [x] 空 patch 或与现状相等的 patch 为 no-op success；未知 patch 字段拒绝。

## 渲染（R3）

- [x] 存在 `backgroundImage`：root 设置 `background-image: url(...)`（`\` 与 `"` 已转义）、
      `background-size` 按 fit（缺省 `cover`）、`background-position: center`、`background-repeat:
      no-repeat`。
- [x] 无 `backgroundImage`：四个背景样式被清除；`backgroundColor` 语义不变。
- [x] Designer 画布（renderer root）与 Viewer 同一渲染路径；预览浮层同路径。
- [x] 只写 CSS 属性，无 fetch/预取/重试/代理；无 innerHTML 拼接。

## 宿主公开 API（R4）

- [x] `BaseScreenDesignerElement.setCanvasBackgroundImage(backgroundImage: string | null, fit?:
      ScreenCanvasBackgroundImageFit): ScreenParseResult<ScreenDocument>` 已实现并导出类型。
- [x] 设置成功走 session 事务：文档更新、dirty/history/`base-screen-change` 通道生效。
- [x] `null` 清除背景并同时清除 fit；设置未传 `fit` 保留既有 fit。
- [x] 无文档/未连接时失败（既有 lifecycle 语义）；非法 URL/fit 失败关闭零副作用。
- [x] 替换/导入携带 `backgroundImage` 的文档同样失败关闭。

## 质量门禁

- [x] contracts（141）/core（121）/renderer（23）/engine（442）聚焦测试通过；engine lint/typecheck/test
      通过（含预先存在的 panel 测试 `vi.fn` 类型错误修复）。
- [x] `pnpm verify:m0` 全量通过。
- [x] `pnpm verify:browser` 通过（回归；本增量不新增探针——harness 脚本由并行 ADR-0042 会话占用，
      背景渲染由聚焦测试覆盖）。
- [x] 基线 README、docs/specs/README.md、docs/decisions/README.md 与 usage.md 均已登记。

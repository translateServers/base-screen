# Designer Host Preview Handler Checklist

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 契约与配置（R1、R2）

- [x] `configure()` 接受函数 `previewHandler`，getter 返回同一回调；非函数导致配置失败且零副作用。
- [x] 预览操作可用性放宽为「直接文档模式或已配置处理器」。

## 预览行为（R3、R4）

- [x] 处理器返回 `true` 时 `togglePreview()` 成功且不打开内置浮层。
- [x] 处理器返回 `false` 或抛异常时回退到内置预览浮层；未配置处理器时项目模式语义不变。
- [x] 直接文档模式内置浮层、`previewProject`、Viewer/Renderer/ScreenDocument/SDK 导出不变。

## 质量与交付（R5）

- [x] 聚焦单元测试覆盖配置校验、getter、接管成功与回退（`designer-preview-operations.test.ts`、`designer-runtime-config.test.ts`）。
- [x] 真实 browser harness 验证项目模式预览按钮可用且触发宿主回调（宿主侧验证：预览按钮可用、点击打开 viewer draft 页并写入 sessionStorage）。
- [x] `pnpm verify:m0` 通过，能力基线与使用文档已同步（`docs/usage.md` 7.2 宿主预览接管）。

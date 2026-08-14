# Designer Host Preview Handler Spec

> 状态：生效中
> 日期：2026-08-14
> 依据：[ADR-0038](../../decisions/ADR-0038-designer-host-preview-handler.md)

## 1. 目标

让宿主通过声明的 `previewHandler` 配置接管项目模式预览，与直接文档模式的内置预览浮层共存。
宿主不再依赖 vendored engine minified bundle 的手工补丁，升级 engine 不丢预览能力。

## 2. Requirements

### R1：声明式预览处理器配置

`BaseScreenDesignerConfiguration` SHALL 新增可选 `previewHandler?: (document: ScreenDocument) =>
boolean`。`configure()` SHALL 校验其为函数（非函数导致配置失败且零副作用），`BaseScreenDesignerElement`
SHALL 暴露同名只读 getter。处理器为实例内回调，不进入 ScreenDocument、不持久化。

### R2：预览操作可用性放宽

预览操作 SHALL 在「直接文档模式」或「已配置 previewHandler」时可用：可用条件 SHALL 为
`getDocument() !== undefined && (getProject() === undefined || hasPreviewHandler())`。

### R3：togglePreview 接管与回退

`togglePreview()` SHALL 在文档存在时优先调用 `previewHandler`（传入当前编辑文档）。返回 `true`
视为宿主已接管、结果为成功且不打开内置浮层；返回 `false` 或抛异常 SHALL 回退到引擎内置预览
浮层（`#previewController.toggle()`）。未配置 handler 的项目模式 SHALL 保持既有失败语义。

### R4：兼容性与边界

直接文档模式的内置浮层、`previewProject`、`ScreenProjectPreviewPort`、Viewer、Renderer、
Material Manifest、ScreenDocument 与 SDK 导出 SHALL 不变。预览路由、鉴权、草稿存储与窗口打开
归宿主，Engine 不新增网络、存储或窗口管理职责。

### R5：质量与集成

新增能力 SHALL 由聚焦单元测试（configure 校验、getter、接管成功、回退）覆盖；真实 browser
harness 验证项目模式预览按钮可用且点击触发宿主回调。`pnpm verify:m0` SHALL 通过。

## 3. 非目标

- Engine 内实现宿主预览页、草稿存储、鉴权、路由或窗口管理。
- 改变 Viewer、Renderer、Material Manifest、ScreenDocument 或 SDK 导出。
- 预览处理器状态持久化或跨实例共享。
- 放行视窗原生手势（滚轮平移/缩放、右键菜单等）。

## 4. 完成定义

- `tasks.md` 和 `checklist.md` 的所有适用项完成，测试矩阵与实现一致。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR、Spec 索引、能力基线与使用文档反映当前公共边界。

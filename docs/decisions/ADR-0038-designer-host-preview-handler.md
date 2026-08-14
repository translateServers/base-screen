# ADR-0038：Designer 宿主预览处理器

> 状态：已接受
> 日期：2026-08-14
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0032](./ADR-0032-designer-left-panel-refactor.md)

## 1. 背景

Designer 的预览能力目前只在「直接文档模式」（`project === undefined`）下可用：`togglePreview()`
在项目模式直接返回「Project preview requires a host preview capability.」，预览操作也只在
`getProject() === undefined` 时可用。发布路由、预览页、访问控制和实时草稿展示都属于宿主
（ADR-0027），因此项目模式下「点预览打开宿主预览页」这一能力应由宿主提供。

宿主（XJ Data Hub）已经实现并依赖该能力：它把当前编辑文档（含未保存修改）写入 sessionStorage，
新标签页打开 viewer 草稿页。但其实现依赖的 `previewHandler` 钩子此前只以手工补丁形式存在于
宿主 vendored engine 的 minified dist 中，从未进入 Base Screen 源码。任何 engine 重建都会静默
丢失该能力。本 ADR 将该钩子正式上收为公共配置，避免宿主依赖私有补丁。

## 2. 决策

1. `BaseScreenDesignerConfiguration` SHALL 新增可选 `previewHandler?: (document: ScreenDocument) =>
   boolean`。`configure()` SHALL 按 RB3「validate before mutate」校验其为函数，非法值导致配置失败
   且零副作用；`BaseScreenDesignerElement` SHALL 暴露同名只读 getter。
2. 预览操作 SHALL 在「直接文档模式」或「已配置 previewHandler」时可用：可用条件从
   `getDocument() !== undefined && getProject() === undefined` 放宽为
   `getDocument() !== undefined && (getProject() === undefined || hasPreviewHandler())`。
3. `togglePreview()` SHALL 在文档存在时优先调用 `previewHandler`（传入当前编辑文档）。返回 `true`
   表示宿主已接管，视为成功并不再打开引擎内置预览；返回 `false` 或抛异常则回退到引擎内置
   预览浮层（`#previewController.toggle()`）。未配置 handler 的项目模式保持既有失败语义不变。
4. `previewHandler` 为实例内只读回调：不进入 ScreenDocument、不持久化、不新增状态字段或网络
   职责。预览路由、鉴权、草稿存储与窗口打开全部归宿主。
5. 其余预览语义（直接文档模式的内置浮层、`previewProject`、`ScreenProjectPreviewPort`）不变。

## 3. 非目标

- 不在 Engine 内实现宿主预览页、草稿存储、鉴权、路由或窗口管理。
- 不改变 Viewer、Renderer、Material Manifest、ScreenDocument 或 SDK 导出。
- 不把预览处理器状态持久化或跨实例共享。
- 不放行视窗原生手势（滚轮平移/缩放、右键菜单等）——设计态编辑手势策略不变。

## 4. 结果

- 宿主通过声明的 `previewHandler` 配置接管项目模式预览，与直接文档模式的内置预览共存，
  关闭时行为与现状完全一致。
- 宿主不再依赖 vendored engine minified bundle 的手工补丁，升级 engine 不丢预览能力。
- 公共边界变更仅为 additive 的配置字段，由专项 Spec、聚焦测试与真实 browser harness 验收。

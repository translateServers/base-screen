# ADR-0039：Designer 顶栏项目标题修复

> 状态：已接受
> 日期：2026-08-14
> 关联：[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)

## 1. 背景

Designer 顶栏的 `.designer-project-name` 只在 workspace 静态模板中初始化为「未命名大屏」，
`renderProjectStatus()` 仅更新状态栏文案与 revision，从不把已加载项目的 `name` 写回该元素。
因此项目模式下顶栏始终显示「未命名大屏」，与宿主实际加载的大屏名称不符。

该缺陷曾以手工补丁形式存在于宿主 vendored engine dist，从未进入 Base Screen 源码；本 ADR
将其上收为内建修复，公共契约零变化。

## 2. 决策

1. `renderProjectStatus()` SHALL 同步把 `project?.name` 写入 `.designer-project-name`，无项目或
   名称为空时回退 `DESIGNER_UI_TEXT.unnamedProject`。
2. 文案沿用既有 `unnamedProject`，不新增 UI 文案、Token、data-* 契约或公共 API。
3. 该更新仅在既有 `renderControls()` → `renderProjectStatus()` 渲染路径内，不引入额外 DOM 重建、
   尺寸变化或异步依赖，符合无抖动约束。

## 3. 非目标

- 不改变顶栏布局、保存状态徽标、状态栏或菜单行为。
- 不新增项目重命名入口（宿主职责）。
- 不修改 ScreenDocument、Material Manifest、Renderer、Viewer 或 SDK 导出。

## 4. 结果

- 项目模式顶栏显示宿主加载的大屏名称，与状态栏/保存徽标一致。
- 公共契约零变化；修复由聚焦测试与真实 browser harness 覆盖。

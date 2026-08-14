# Designer Topbar Project Title Spec

> 状态：生效中
> 日期：2026-08-14
> 依据：[ADR-0039](../../decisions/ADR-0039-designer-topbar-project-title.md)

## 1. 目标

让项目模式顶栏的 `.designer-project-name` 显示宿主加载的大屏名称，与状态栏和保存徽标一致。
公共契约零变化。

## 2. Requirements

### R1：顶栏标题回写

`renderProjectStatus()` SHALL 把 `project?.name` 写入 `.designer-project-name`，无项目或名称为空时
回退 `DESIGNER_UI_TEXT.unnamedProject`。

### R2：稳定与无抖动

该更新 SHALL 仅在既有 `renderControls()` → `renderProjectStatus()` 渲染路径内完成，不新增 DOM
重建、尺寸变化、异步依赖或 Token/data-* 契约。

### R3：质量

修复 SHALL 由聚焦单元测试与真实 browser harness 覆盖（项目模式标题为加载名称，直接文档模式
保持「未命名大屏」）。`pnpm verify:m0` SHALL 通过。

## 3. 非目标

- 不改变顶栏布局、保存状态徽标、状态栏或菜单行为。
- 不新增项目重命名入口（宿主职责）。
- 不修改 ScreenDocument、Material Manifest、Renderer、Viewer 或 SDK 导出。

## 4. 完成定义

- `tasks.md` 和 `checklist.md` 的所有适用项完成。
- 聚焦测试与 `pnpm verify:m0` 通过。
- ADR、Spec 索引与能力基线反映当前状态。

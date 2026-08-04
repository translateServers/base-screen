# Nebula Designer Parity Provenance

> 状态：已记录
> 最近更新：2026-08-04
> 定位：记录 Base Screen Designer 视觉与行为兼容规格所参考的 Nebula 版本、路径和 no-copy 边界

## 目标文件

- `docs/specs/designer-authoring-project-lifecycle/spec.md`
- `docs/specs/designer-authoring-project-lifecycle/tasks.md`
- `docs/specs/designer-authoring-project-lifecycle/checklist.md`
- 本 provenance 记录

本记录当前只覆盖文档层的行为/视觉研究。未来实现文件若直接衍生外部代码、CSS、配置或资产，必须
逐文件新增 provenance 和授权结论；不能用本记录替代。

## 来源仓库与 Commit

- Repository：`C:\worker\nebula`
- Commit：`6e84235897e37af1651f8a84bd5d03aa496c2e35`
- Reference date：2026-08-04

## 来源路径

仅用于观察产品行为、区域尺寸、交互流程和能力边界：

- `docs/specs/screen-editor/README.md`
- `docs/architecture/screen-editor-architecture.md`
- `packages/screen-editor-core/src/components/screen-editor-workbench.tsx`
- `packages/screen-editor-core/src/components/editor-toolbar.tsx`
- `packages/screen-editor-core/src/components/screen-canvas.tsx`
- `packages/screen-editor-core/src/components/layer-panel.tsx`
- `packages/screen-editor-core/src/components/property-panel.tsx`
- `packages/screen-editor-core/src/stores/editor-store.ts`
- `packages/screen-editor-core/src/hooks/shortcuts-registry.ts`
- `packages/screen-editor-core/src/blueprint/sheet/blueprint-sheet.tsx`
- `apps/web/src/styles/index.css`
- `apps/web/src/features/screen/components/screen-preview-canvas.tsx`
- `docs/decisions/ADR-0001-screen-sdk-static-runtime-boundary.md`

## 版权所有者授权

用户明确要求 Base Screen 尽可能复现 Nebula Designer 的样式和功能，这构成产品兼容方向授权，
不构成复制源码或资产的版权许可。参考仓库在审计时没有可确认的 `LICENSE`、`NOTICE` 或 `COPYING`，
且部分 package 标记为 `UNLICENSED`。因此不能把 Nebula 源码、JSX、CSS、配置、SVG、字体、截图、
测试或其他资产复制到 Base Screen 的 MIT 发布产物。

## 修改范围

- 通过源码只读审计记录可观察的工作台区域、尺寸、状态和用户流程。
- 将这些观察转写为独立的 Base Screen requirements、task 和 acceptance checklist。
- 根据 Base Screen 十二包边界、framework-neutral DOM、canonical document 和 host port 约束重新设计。
- 对 Nebula host-specific 能力做排除或 capability-gated 降级，不复制其应用集成。
- 未来实现使用 Base Screen 自有命名、DOM、CSS custom properties、图标、测试 fixture 和 screenshots。

## 许可与 Attribution 结论

- 当前没有复制或分发 Nebula 源码、样式文件、配置或资产。
- 行为兼容、尺寸测量和 independently authored API/测试不声明 Nebula 源码授权。
- Nebula screenshot 只能作为本地、非提交审计输入；仓库只提交 Base Screen 自有 golden。
- 若未来需要直接复用任何文件或片段，必须先取得明确授权，再新增文件级 provenance、修改说明和
  attribution 结论；授权未完成时不得进入代码或 tarball。

## 已知参考偏差

规格不会复制审计中发现的 Nebula 缺陷或文档漂移，包括未保存变量、禁用但不可达的 Blueprint
命令、未挂载模板、不可见 smart-guide 控制和快捷键描述不一致。Base Screen parity 以明确 Spec 与
自动化验收为准，不以缺陷逐像素复刻为目标。

## 复核

- 复核日期：2026-08-04
- 结论：允许 behavior/visual compatibility research；不允许 source/style/asset copy。

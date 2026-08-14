# Designer Panel Collapse Fixes Spec

> 状态：生效中
> 日期：2026-08-14
> 依据：[ADR-0037](../../decisions/ADR-0037-designer-panel-collapse-fixes.md)

## 1. 目标

修复左右面板折叠的三类缺陷：折叠箭头不旋转/不可见、拖宽后折叠失效（折叠不收敛 48px、展开不
恢复拖拽宽度）、折叠轨 UI（按钮压扁、tooltip 语义错误）。保持既有 data-* 契约、宽度上下限、
无抖动与主题 Token 约束，公共契约零变化。

## 2. Requirements

### R1：面板宽度状态归控制器

`DesignerWorkbenchController` SHALL 持有左/右面板宽度（未拖拽为 undefined），
`renderLayout()` 统一写回 `.designer` 内联变量：

- 折叠态写 `48px`；展开且拖拽过写回拖拽宽度；展开且从未拖拽移除内联变量（保留宿主 CSS 默认，
  宿主样式表自定义默认宽度不被覆盖）；
- 折叠/展开往返 SHALL 在任何宽度状态下都收敛（折叠=48px、展开=拖拽宽度或默认）。

### R2：折叠态拖拽分隔条自动展开（带阈值）

面板处于折叠态时拖拽分隔条 SHALL 先展开面板再应用拖拽宽度，拖拽过程有连续反馈；展开 SHALL
以未钳制的目标宽度越过 `48 + 24px` 阈值为条件（参考 VSCode）：阈值内保持折叠且不写宽度，
避免微小移动误展开。

### R3：折叠轨 UI

- 折叠态 rail/properties SHALL 关闭 scrollbar-gutter 占用；
- 折叠态面板标题与计数徽标 SHALL `display: none`（不占 flex 槽位）；
- 折叠按钮折叠态 SHALL `flex: none` 防压扁，按钮与箭头始终可见（宽度不小于
  `--designer-control-height` 的合理可见值）；
- 左右折叠按钮箭头 SHALL 折叠态 `rotate(180deg)`（左：‹→›，右：›→‹），过渡沿用
  `--designer-motion`；
- 折叠/展开 SHALL 切换按钮 title/aria-label（收起↔展开语义），文案集中于
  `designer-ui-text.ts`。

### R4：质量与兼容

无公共契约/依赖/宿主边界变化；既有 data-* 契约、宽度上下限（左 200-480、右 220-520）、
无抖动（几何只由状态切换驱动）与主题 Token 约束保持。单元测试、真实浏览器 harness 断言与
`pnpm verify:m0` SHALL 全部通过。

## 3. 非目标

- 面板宽度持久化；折叠动画重设计；workbench mode 行为变更。
- 修改 ScreenDocument、宿主状态 schema 或 SDK 导出。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部完成，测试矩阵与实现一致。
- 聚焦测试（engine workbench/样式）、真实浏览器 harness（左右折叠往返、箭头旋转、拖宽折叠）
  与 `pnpm verify:m0` 通过。

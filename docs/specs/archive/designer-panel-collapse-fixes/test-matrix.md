# Designer Panel Collapse Fixes Test Matrix

> 状态：已完成（2026-08-14，与实现一致）
> 映射：Requirement -> 测试位置 -> 断言要点

| R# | 测试位置 | 断言要点 |
| --- | --- | --- |
| R1 | `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts` | 拖宽（onPointerMove）后折叠：`--left-panel-width` 内联变量=48px、dataset.leftCollapsed=true；展开：变量=拖拽宽度；未拖拽折叠再展开：变量被移除（removeProperty 调用） |
| R2 | `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts` | 折叠态 pointerdown 分隔条：阈值内拖拽（宽度 58 < 48+24）保持折叠且宽度变量不变；越过阈值（宽度 300）展开并应用宽度（左右两侧同断言） |
| R2 | `scripts/verify-browser-harness.mjs`（真实浏览器） | 折叠后真实鼠标拖拽：宽度 58 仍折叠 48px；拖到 380 展开并应用；完成后拖回 CSS 默认宽度（不硬编码默认值，读取计算变量） |
| R3 | `packages/engine/tests/browser/styles/designer-style.test.ts` + harness | CSS 含折叠态 scrollbar-gutter 关闭、panel-title/count display:none、collapse flex:none、左右箭头 rotate(180deg)；浏览器中断言折叠按钮宽度≥28px 且箭头 transform 为 180° 旋转 |
| R3 | `packages/engine/tests/browser/controllers/designer-workbench-controller.test.ts` | 折叠后折叠按钮 title/aria-label=「展开物料面板/展开属性面板」，展开后恢复「收起…」 |
| R4 | `scripts/verify-browser-harness.mjs`（真实浏览器） | 左/右面板：拖宽 → 折叠 rail/properties=48px → 展开恢复拖拽宽度 → 拖回默认宽度恢复 280/288；箭头旋转；无几何跳动回归 |
| R4 | `pnpm verify:m0` | 全绿；无公共 API/契约变化 |

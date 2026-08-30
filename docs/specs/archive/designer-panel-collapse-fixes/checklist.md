# Designer Panel Collapse Fixes Checklist

> 状态：已完成（2026-08-14）

- [x] 面板宽度由控制器持有；renderLayout 折叠写 48px、展开恢复拖拽宽度、未拖拽移除内联变量。
- [x] 折叠态拖拽分隔条自动展开并应用宽度，拖拽有连续反馈。
- [x] 折叠态拖拽展开带阈值（48+24px，参考 VSCode）：阈值内保持折叠且不写宽度，避免误展开。
- [x] 折叠态 rail/properties 关闭 scrollbar-gutter；标题/计数 display:none。
- [x] 折叠按钮 flex:none 防压扁；左右箭头折叠态 rotate(180deg)，过渡不抖动。
- [x] 折叠/展开切换 title/aria-label（收起↔展开），文案入 designer-ui-text.ts。
- [x] 未拖拽折叠再展开后宿主 CSS 默认宽度恢复，宿主自定义默认不被覆盖。
- [x] 无公共契约/依赖/宿主边界变化；既有 data-* 契约与宽度上下限保持。
- [x] 单元测试、verify-browser-harness、`pnpm verify:m0` 全绿；测试矩阵与实现一致。

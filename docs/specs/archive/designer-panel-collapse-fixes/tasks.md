# Designer Panel Collapse Fixes Tasks

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

- [x] Task 1：冻结 ADR-0037 与 Spec 四件套，登记 ADR/Spec 索引（R1-R4）。
- [x] Task 2：控制器宽度状态：`#leftPanelWidth`/`#rightPanelWidth`（undefined=未拖拽），
      `renderLayout` 统一写回内联变量（折叠 48px / 展开拖拽宽度 / 未拖拽移除）（R1）。
- [x] Task 3：折叠态拖拽分隔条自动展开再调整宽度（R2）。
- [x] Task 4：折叠轨 CSS：scrollbar-gutter 关闭、标题/计数 display:none、折叠按钮 flex:none、
      左右箭头 rotate(180deg)（R3）。
- [x] Task 5：文案与语义：designer-ui-text 新增「展开物料面板/展开属性面板」，控制器切换
      title/aria-label（R3）。
- [x] Task 6：单元测试：拖宽后折叠/展开往返、折叠态拖拽展开、未拖拽折叠移除内联变量、
      tooltip/aria 切换、fixture 补齐 removeProperty 与折叠控件（R1-R3、R4）。
- [x] Task 7：样式测试与 harness：样式规则断言；真实浏览器左右面板拖宽→折叠 48px→展开恢复、
      箭头旋转与按钮可见性（R3、R4）。
- [x] Task 8：质量门禁与 Spec 勾选：engine typecheck/test、`pnpm format`、`pnpm verify:browser`、
      `pnpm verify:m0`（R4）。
- [x] Task 9：折叠态拖拽展开阈值（参考 VSCode）：以未钳制目标宽度判定 48+24px，阈值内保持
      折叠不写宽度；单测覆盖阈值内/越过阈值（左右），harness 真实鼠标覆盖阈值拖拽与默认宽度
      恢复（R2、R4）。

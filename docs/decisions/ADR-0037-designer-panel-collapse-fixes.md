# ADR-0037：Designer 面板折叠修复

> 状态：已接受
> 日期：2026-08-14
> 关联：[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)、[ADR-0024](./ADR-0024-designer-public-style-tokens.md)
> 部分取代：无。修复折叠/拖宽交互缺陷，公共契约零变化

## 1. 背景

左右面板的折叠存在三处缺陷：

1. **箭头不旋转**：折叠态图标轨里折叠按钮的箭头没有可感知的旋转。右面板完全缺少旋转规则；
   左面板虽有规则，但折叠轨中按钮被 flex 布局压扁到约 2px 宽（`scrollbar-gutter: stable`
   占用 11px + 隐藏的物料计数徽标 `min-width: 20px` 仍占 flex 槽位 + gap），箭头实际不可见。
2. **拖宽后折叠异常**：`resizePanel` 把拖拽宽度写成 `.designer` 元素上的内联
   `--left-panel-width`/`--right-panel-width`。内联自定义属性优先级高于样式表中
   `[data-left-collapsed="true"] { --left-panel-width: 48px }` 的覆盖规则，导致用户拖宽面板后
   点击折叠，面板保持拖拽宽度、内容隐藏（测得 380px 而非 48px）；再次展开也无法恢复拖拽宽度
   语义（折叠时宽度变量被覆盖丢失）。
3. **折叠态 UI**：折叠轨中折叠按钮的 tooltip/aria-label 仍为「收起物料面板」，语义错误；
   面板标题/计数以 `width:0 + opacity:0` 隐藏但仍占据 flex 槽位。

## 2. 决策

1. 面板宽度 SHALL 由 `DesignerWorkbenchController` 持有（`#leftPanelWidth`/`#rightPanelWidth`，
   未拖拽时为 `undefined`），`renderLayout()` 统一把有效宽度写回 `.designer` 内联变量：
   - 折叠态：写入 `48px`（与 CSS 折叠变量一致）；
   - 展开态且拖拽过：写回最近一次拖拽宽度；
   - 展开态且从未拖拽：移除内联变量，保留宿主 CSS 默认（`--left-panel-width: 280px` 等），
     宿主样式表自定义默认宽度不被覆盖。
2. 折叠态拖拽分隔条 SHALL 视为「先展开再调整宽度」：拖拽过程自动展开面板并应用拖拽宽度，
   避免「拖了没反馈、内容仍隐藏」的异常。展开需越过阈值（参考 VSCode）：以未钳制的目标宽度
   判定，往外拖到超过 `48 + 24px` 才展开；阈值内保持折叠且不写宽度，避免微小移动误展开。
3. 折叠轨 UI SHALL：
   - 折叠态关闭 `scrollbar-gutter` 占用（rail/properties），把完整宽度还给内容；
   - 面板标题与计数徽标折叠态 `display: none`（不再占据 flex 槽位）；
   - 折叠按钮折叠态 `flex: none` 防压扁；
   - 左右面板折叠按钮箭头折叠态 `rotate(180deg)`（展开指向收起方向，收起后反向指向展开）；
   - 折叠/展开时切换按钮 title/aria-label（「收起物料面板」↔「展开物料面板」、
     「收起属性面板」↔「展开属性面板」，文案入 `designer-ui-text.ts`）。
4. 无公共契约、依赖、宿主边界变化；不改变面板宽度上下限与既有 data-* 契约。

## 3. 非目标

- 面板宽度持久化（宿主存储边界）。
- 折叠动画/手势重设计（保留既有原子切换与无抖动约束）。
- 修改 workbench mode（菜单/全屏）行为。

## 4. 结果

- 折叠在任何宽度状态下都收敛到 48px 图标轨；展开恢复拖拽宽度；未拖拽时宿主 CSS 默认保持。
- 折叠轨按钮与箭头始终可见且方向正确，tooltip 语义随状态切换。
- 修复由专项 Spec 的单元测试与真实浏览器 harness 覆盖，`pnpm verify:m0` 全绿。

# Designer 事件系统测试矩阵

> 状态：完成
> 依据：[spec.md](./spec.md)

| Requirement | Task | 必要证据 |
| --- | --- | --- |
| R1 键盘黑名单 | 2 | `designer-event-policy.test.ts` 黑名单三态（全目标/非可编辑/快速查找/未命中补位）；`designer-event-system.test.ts` capture 全吞；`verify-browser-harness.mjs` `assertEventSystemGuards`（设计器内 Ctrl+S/W/R 拦截、宿主焦点零影响） |
| R2 命令通道 | 1、2 | `designer-key-chords.test.ts` 增强 chord 规范化（修饰键归一/IME/AltGr）；`designer-event-policy.test.ts` repeat 分类；operation `repeatable` 接线（delete/nudge）；仲裁顺序回归（既有快捷键、Space、tablist） |
| R3 手势抑制 | 3 | `designer-gesture-controller.test.ts` `active` 全退出路径（pointerup/pointercancel/lostpointercapture）；`designer-event-system.test.ts` 手势全吞；index.ts contextmenu 手势抑制 |
| R4 指针管控 | 4 | `designer-viewport-controller.test.ts` wheel 三语义（垂直/水平/缩放、deltaMode、阻断页面滚动）+ 空格 hover 解耦（激活/editable 保护/移出解除）；router selectstart/gesture 路由；`designer-gesture-controller.test.ts` 中键 mousedown 阻止；`designer-event-system.test.ts` window keydown 归属过滤；browser 实测（body 焦点 + hover 空格拖拽平移、视窗外空格宿主滚动不受影响）；workbench.css `touch-action: none`；contextmenu 全表面 |
| R5 窗口守卫 | 5 | `designer-event-system.test.ts`（自有拖拽拦截/宿主拖拽零干预/文件拖入阻止/window blur 复位/监听注销）；`designer-surface-router.test.ts` 剪贴板路由；browser `assertEventSystemGuards` 拖拽隔离与多实例 |
| R6 边界预期 | 6 | [event-boundaries.md](./event-boundaries.md)：不可阻止键、平台差异矩阵、iframe 隔离、beforeunload 宿主契约 |
| R7 质量 | 1-6 | test matrix reverse mapping；engine 全量测试（175 例）；`check-engine-import`（events 叶子子层）；boundary；`pnpm verify:m0` 通过 |

新增 case 必须在名称或相邻注释中标记 R1-R7。任何 case rename、move 或 delete 必须同步本矩阵。

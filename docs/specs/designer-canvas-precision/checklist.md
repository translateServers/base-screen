# Designer Canvas Precision 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

## 移动与历史

- [x] 单选和多选移动在手势期间只修改对应 Material 根元素的 CSS `translate`。
- [x] preview 不写 document、Renderer model 或 history，完成时只提交一次 absolute position transaction。
- [x] 取消、lost capture、blur、replace、unload、disconnect 和工具切换清理所有 translate 与 snap overlay；拖拽确认前离开 canvas 的 pending pointer 也由 viewport 兜底结束。

## 吸附与坐标

- [x] 选区 bounds 的 left/center/right 和 top/middle/bottom 都可匹配候选并产生统一 delta。
- [x] 画布、用户 guide、可见组件及旋转组件 visual bounds 均按既定优先级参与吸附。
- [x] 智能参考线候选按绝对距离统一竞争（同轴取最近命中）。
- [x] 已吸附目标在捕获阈值（5px）内保持、超出即释放（×1.0 无额外释放带），同锚点继续跟随；吸附会话按轴独立、随手势边界建立与清除。
- [x] 吸附锚点与选中框视觉轮廓基于同一选区几何，吸附预览线中心与选中框边缘重合（无视觉偏移）。
- [x] 移动预览按渲染阈值（1px）每轴输出最近一条对齐线（Moveable snapRenderInfo 语义）：吸附（5px）与渲染分离，接近阶段无线、贴合时出现线。
- [x] 已精确重合的组件边或中心可保持吸附，但不显示贯穿画布的 x/y 吸附线；只有非零位置修正才显示对应辅助线。
- [x] 参考线以对齐坐标定位并 CSS 居中，任意线宽中心与对齐坐标精确重合（参考 Moveable/Nebula 居中语义）。
- [x] 参考线层渲染在所有组件之上（覆盖层 z-index 由文档组件数派生、高于组件 painter order），不被组件遮挡；由 `assertCanvasPrecision` 的 elementFromPoint 探测校验。
- [x] 背景网格仅作视觉辅助；pointer、移动、缩放、旋转和创建均不从网格生成候选或坐标取整。
- [x] 无组件、画布或用户参考线命中时，point 与 selection 路径保持原始坐标，候选缓存和预览不保留网格分支。
- [x] 组件进入实际移动拖拽后，选区的左/中/右和上/中/下对齐轨道显示相邻组件间的蓝色虚线测量段与红色整数标签。
- [x] 未越过点击阈值、pointer completion 或 cancellation 时不显示或立即清理；hidden 组件与网格均不参与。
- [x] 间距标注纯属覆盖层，不写 document/history，也不改变吸附候选、缓存或坐标。
- [x] 间距标注仅覆盖与选区存在有效正交投影重叠的组件；只共享边或角时不显示伪间距。
- [x] 吸附参考线以蓝色系渲染、吸附目标线以更粗高亮指示（Moveable #4af 语义）。
- [x] 被移动组件不作为自己的候选；hidden 被排除，locked 仅作为候选且不可获得 mutation 权限。
- [x] 手势会话内吸附候选集合只收集一次（按排除集合区分缓存），会话结束或候选变化时失效。
- [x] pointer 与 guide 坐标换算复用统一 helper，并在非零 pan/10%–500% zoom 下保持确定性。

## 质量

- [x] R1–R4 有当前 unit/DOM/browser 测试映射和反向标注。
- [x] provenance、Engine format、lint、typecheck、test、build 与 `pnpm verify:m0` 通过。
